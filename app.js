import { firebaseConfig, GOOGLE_CLIENT_ID } from "./firebase-config.js";
import { SECTIONS, MOIS_LOUES, compute, defaultInputs, normalizeInputs } from "./calc.js";
import { parseSheet } from "./import-xlsx.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, doc, addDoc, updateDoc, deleteDoc, collection, onSnapshot,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Mode démo (?demo dans l'URL) : pas de connexion, données en mémoire uniquement. Sert à tester
// l'interface sans compte ; rien n'est écrit dans Firestore.
const DEMO = new URLSearchParams(window.location.search).has("demo");

// ---- State ----
let currentUser = null;
let store = null;
let simulations = [];       // [{ id, nom, inputs, updatedAt }]
let loaded = false;         // premier chargement reçu
let current = null;         // simulation ouverte : { id | null, nom, inputs } (brouillon)
let saved = null;           // dernière version enregistrée de la simulation ouverte (pour "Annuler")

// ---- DOM ----
const $ = (sel) => document.querySelector(sel);
const loginScreen = $("#login-screen");
const deniedScreen = $("#denied-screen");
const appShell = $("#app-shell");
const googleButtonContainer = $("#google-signin-button");
const logoutBtn = $("#logout-btn");
const deniedLogoutBtn = $("#denied-logout-btn");
const userLabel = $("#user-label");
const emailLinkForm = $("#email-link-form");
const emailLinkInput = $("#email-link-input");
const emailLinkStatus = $("#email-link-status");
const listView = $("#list-view");
const editView = $("#edit-view");
const simsTbody = $("#sims-tbody");
const simsCount = $("#sims-count");
const simsEmpty = $("#sims-empty");
const importInput = $("#import-input");
const importStatus = $("#import-status");
const simNom = $("#sim-nom");
const simForm = $("#sim-form");
const resultsBox = $("#results");
const saveBtn = $("#save-btn");
const revertBtn = $("#revert-btn");
const duplicateBtn = $("#duplicate-btn");
const deleteBtn = $("#delete-btn");
const saveStatus = $("#save-status");

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

const euros = (n) => (n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const euros2 = (n) => (n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const pct = (n) => ((n || 0) * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
const dateFr = (d) => (d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const signClass = (n) => (n > 0.005 ? "positive" : n < -0.005 ? "negative" : "");

// ---- Stockage : Firestore (normal) ou mémoire (démo) ----
function firestoreStore(onChange, onDenied) {
  const col = collection(db, "simulations");
  const unsub = onSnapshot(query(col, orderBy("updatedAt", "desc")), (snap) => {
    onChange(snap.docs.map((d) => {
      const data = d.data({ serverTimestamps: "estimate" });
      return { id: d.id, nom: data.nom || "Sans nom", inputs: normalizeInputs(data.inputs), updatedAt: data.updatedAt?.toDate?.() || null };
    }));
  }, onDenied);
  return {
    stop: unsub,
    async create(nom, inputs) {
      const ref = await addDoc(col, { nom, inputs, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return ref.id;
    },
    update: (id, nom, inputs) => updateDoc(doc(db, "simulations", id), { nom, inputs, updatedAt: serverTimestamp() }),
    remove: (id) => deleteDoc(doc(db, "simulations", id))
  };
}

function memoryStore(onChange) {
  let rows = [];
  let seq = 0;
  const emit = () => onChange([...rows].sort((a, b) => b.updatedAt - a.updatedAt).map((r) => ({ ...r, inputs: { ...r.inputs } })));
  setTimeout(emit, 0);
  return {
    stop() {},
    async create(nom, inputs) {
      const id = "demo-" + ++seq;
      rows.push({ id, nom, inputs: { ...inputs }, updatedAt: new Date() });
      emit();
      return id;
    },
    async update(id, nom, inputs) {
      rows = rows.map((r) => (r.id === id ? { ...r, nom, inputs: { ...inputs }, updatedAt: new Date() } : r));
      emit();
    },
    async remove(id) {
      rows = rows.filter((r) => r.id !== id);
      emit();
    }
  };
}

// Exemple fictif chargé en mode démo uniquement.
const DEMO_EXEMPLE = {
  prix: 100000, notairePct: 8, travaux: 20000, ameublement: 5000, fraisDossier: 1000,
  tauxCredit: 3, tauxAssurance: 0.3, dureeAnnees: 20, copropriete: 1200, electricite: 600,
  assurancePNO: 150, comptable: 300, taxeFonciere: 900, internet: 360, assuranceMRH: 200,
  chambres: 3, loyerParChambre: 500
};

// ---- Auth : Google Identity Services ----
// On utilise Google Identity Services (le bouton "Sign in with Google" de Google) plutôt que
// signInWithPopup/signInWithRedirect de Firebase : ces derniers dépendent d'une iframe tierce
// sur le domaine firebaseapp.com que les navigateurs modernes bloquent de plus en plus.
function handleGoogleCredential(response) {
  const credential = GoogleAuthProvider.credential(response.credential);
  signInWithCredential(auth, credential).catch((e) => {
    alert("Connexion impossible : " + e.message);
  });
}

function initGoogleSignIn() {
  if (!window.google?.accounts?.id) {
    setTimeout(initGoogleSignIn, 100);
    return;
  }
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
  google.accounts.id.renderButton(googleButtonContainer, {
    theme: "outline", size: "large", text: "signin_with", locale: "fr", width: 280
  });
}

// ---- Auth : lien email (fallback pour les comptes non-Google) ----
const actionCodeSettings = {
  url: window.location.href.split("#")[0].split("?")[0],
  handleCodeInApp: true
};

emailLinkForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = emailLinkInput.value.trim().toLowerCase();
  // Pas de vérification de la liste des emails autorisés ici : cette liste ne vit que
  // côté serveur (règles Firestore), jamais dans le JS servi au navigateur.
  try {
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    window.localStorage.setItem("emailForSignIn", email);
    emailLinkStatus.textContent = "Lien envoyé ! Vérifie ta boîte mail (et les spams).";
  } catch (err) {
    emailLinkStatus.textContent = "Erreur : " + err.message;
  }
});

async function completeEmailLinkSignInIfNeeded() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return;
  let email = window.localStorage.getItem("emailForSignIn");
  if (!email) email = window.prompt("Confirme ton email pour terminer la connexion :");
  try {
    await signInWithEmailLink(auth, email, window.location.href);
    window.localStorage.removeItem("emailForSignIn");
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (err) {
    alert("Connexion impossible : " + err.message);
  }
}

logoutBtn.addEventListener("click", () => {
  if (DEMO) { window.location.href = window.location.pathname; return; }
  if (isDirty() && !confirm("Des modifications ne sont pas enregistrées. Se déconnecter quand même ?")) return;
  signOut(auth);
});
deniedLogoutBtn.addEventListener("click", () => signOut(auth));

function stopStore() {
  if (store) { store.stop(); store = null; }
  simulations = [];
  loaded = false;
}

if (DEMO) {
  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  $("#demo-banner").classList.remove("hidden");
  userLabel.textContent = "Démo";
  logoutBtn.textContent = "Quitter la démo";
  store = memoryStore(onSimulations);
  store.create("Exemple (fictif)", normalizeInputs(DEMO_EXEMPLE));
  route();
} else {
  initGoogleSignIn();
  completeEmailLinkSignInIfNeeded();

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    loginScreen.classList.add("hidden");
    deniedScreen.classList.add("hidden");
    appShell.classList.add("hidden");
    stopStore();

    if (!user) {
      loginScreen.classList.remove("hidden");
      return;
    }
    userLabel.textContent = user.email;
    // Il n'existe pas de liste d'emails autorisés côté client : on tente simplement de lire
    // les données, et si les règles Firestore refusent (permission-denied), c'est qu'on n'a
    // pas accès. C'est la seule source de vérité sur qui a le droit d'entrer.
    store = firestoreStore(onSimulations, () => {
      stopStore();
      appShell.classList.add("hidden");
      deniedScreen.classList.remove("hidden");
      $("#denied-email").textContent = user.email;
    });
  });
}

function onSimulations(rows) {
  appShell.classList.remove("hidden");
  deniedScreen.classList.add("hidden");
  simulations = rows;
  loaded = true;
  // Si la simulation ouverte a changé ailleurs (autre appareil) et qu'on n'a rien modifié ici,
  // on suit la nouvelle version ; sinon on garde le brouillon en cours.
  if (current?.id) {
    const fresh = simulations.find((s) => s.id === current.id);
    if (fresh && !isDirty()) { openDraft(fresh); }
    else if (fresh) { saved = { nom: fresh.nom, inputs: fresh.inputs }; }
  }
  route();
}

// ---- Navigation : #/ = liste, #/sim/<id> = fiche, #/nouvelle = brouillon non enregistré ----
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", (e) => { if (isDirty()) e.preventDefault(); });

function go(hash) {
  if (window.location.hash !== hash) window.location.hash = hash;
  else route();
}

function route() {
  if (!store) return;
  const hash = window.location.hash;
  const m = /^#\/sim\/(.+)$/.exec(hash);
  if (m) {
    const sim = simulations.find((s) => s.id === m[1]);
    if (!sim) {
      // Pas encore chargée (premier snapshot) ou supprimée.
      if (loaded) go("#/");
      return;
    }
    if (current?.id !== sim.id) openDraft(sim);
    showEdit();
  } else if (hash === "#/nouvelle" && current && !current.id) {
    showEdit();
  } else {
    current = null;
    saved = null;
    showList();
  }
}

function confirmLeave() {
  return !isDirty() || confirm("Des modifications ne sont pas enregistrées. Les abandonner ?");
}

// ---- Liste ----
function showList() {
  editView.classList.add("hidden");
  listView.classList.remove("hidden");
  simsCount.textContent = simulations.length + (simulations.length > 1 ? " simulations" : " simulation");
  simsEmpty.classList.toggle("hidden", simulations.length > 0);
  simsTbody.innerHTML = simulations.map((s) => {
    const r = compute(s.inputs);
    return `
      <tr data-id="${escapeHtml(s.id)}">
        <td class="sim-name">${escapeHtml(s.nom)}</td>
        <td class="num">${euros(r.prixTotal)}</td>
        <td class="num">${euros2(r.mensualite)}</td>
        <td class="num ${signClass(r.cashflow[12])}">${euros2(r.cashflow[12])}</td>
        <td class="num">${pct(r.rentaBrute)}</td>
        <td class="num">${pct(r.rentaNette)}</td>
        <td class="muted">${dateFr(s.updatedAt)}</td>
      </tr>`;
  }).join("");
}

simsTbody.addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (tr) go("#/sim/" + tr.dataset.id);
});

$("#new-sim-btn").addEventListener("click", () => {
  startNewDraft("Nouvelle simulation", defaultInputs());
});

function startNewDraft(nom, inputs) {
  current = { id: null, nom, inputs: { ...inputs } };
  saved = null;
  renderForm();
  go("#/nouvelle");
}

// ---- Import Excel ----
let sheetJsPromise = null;
function loadSheetJs() {
  sheetJsPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { sheetJsPromise = null; reject(new Error("bibliothèque Excel indisponible")); };
    document.head.appendChild(s);
  });
  return sheetJsPromise;
}

importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  importInput.value = "";
  if (!file) return;
  importStatus.textContent = "Lecture du fichier…";
  try {
    const XLSX = await loadSheetJs();
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: true });
    const { inputs, trouves } = parseSheet(wb.Sheets[wb.SheetNames[0]]);
    if (trouves.length === 0) {
      importStatus.textContent = "Aucun poste reconnu dans ce fichier.";
      return;
    }
    importStatus.textContent = "";
    startNewDraft(file.name.replace(/\.[^.]+$/, ""), inputs);
    saveStatus.textContent = `${trouves.length} postes importés — vérifie puis enregistre.`;
  } catch (err) {
    importStatus.textContent = "Import impossible : " + err.message;
  }
});

// ---- Fiche d'une simulation ----
function openDraft(sim) {
  current = { id: sim.id, nom: sim.nom, inputs: { ...sim.inputs } };
  saved = { nom: sim.nom, inputs: { ...sim.inputs } };
  renderForm();
}

function isDirty() {
  if (!current) return false;
  if (!saved) return true; // brouillon jamais enregistré
  return current.nom !== saved.nom || Object.keys(current.inputs).some((k) => current.inputs[k] !== saved.inputs[k]);
}

function showEdit() {
  listView.classList.add("hidden");
  editView.classList.remove("hidden");
  updateEditState();
}

function renderForm() {
  simNom.value = current.nom;
  simForm.innerHTML = SECTIONS.map((sec) => `
    <fieldset class="card form-section">
      <legend>${escapeHtml(sec.titre)}</legend>
      <div class="fields">
        ${sec.champs.map((c) => `
          <label class="field">
            <span class="field-label">${escapeHtml(c.label)}</span>
            <span class="field-input">
              <input type="number" inputmode="decimal" step="${c.step ?? "any"}" min="0"
                     name="${c.id}" value="${current.inputs[c.id] ?? ""}" />
              ${c.unite ? `<span class="unit">${escapeHtml(c.unite)}</span>` : ""}
            </span>
            ${c.id === "notairePct" ? `<span class="computed" data-computed="fraisNotaire"></span>` : ""}
          </label>`).join("")}
      </div>
    </fieldset>`).join("");
  saveStatus.textContent = "";
  renderResults();
}

simForm.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.name || !current) return;
  const v = el.value === "" ? 0 : Number(el.value);
  current.inputs[el.name] = Number.isFinite(v) ? v : 0;
  renderResults();
});

simNom.addEventListener("input", () => {
  if (!current) return;
  current.nom = simNom.value;
  updateEditState();
});

function renderResults() {
  const r = compute(current.inputs);
  const notaire = simForm.querySelector('[data-computed="fraisNotaire"]');
  if (notaire) notaire.textContent = "= " + euros2(r.fraisNotaire);

  const ligne = (label, valeur, cls = "") => `<div class="res-line ${cls}"><span>${label}</span><strong>${valeur}</strong></div>`;
  resultsBox.innerHTML = `
    <h2>Résultats</h2>
    <div class="res-group">
      ${ligne("Prix total du projet", euros2(r.prixTotal), "big")}
      ${ligne("Montant emprunté", euros2(r.montantEmprunte))}
      ${ligne("Mensualité du crédit", euros2(r.mensualite))}
      ${ligne("Crédit par an", euros2(r.creditAnnuel))}
      ${ligne("Coût total du crédit", euros2(r.coutTotalCredit))}
    </div>
    <div class="res-group">
      ${ligne("Loyers par mois", euros2(r.loyerMensuel))}
      ${ligne("Charges par an (hors crédit)", euros2(r.chargesHorsCredit))}
      ${ligne("Charges par an (avec crédit)", euros2(r.chargesAnnuelles))}
    </div>
    <div class="res-group">
      <h3>Cash-flow net mensuel</h3>
      ${MOIS_LOUES.map((m) => ligne(`Loué ${m} mois / an`, euros2(r.cashflow[m]), "cashflow " + signClass(r.cashflow[m]))).join("")}
    </div>
    <div class="res-group">
      <h3>Rentabilité</h3>
      ${ligne("Brute", pct(r.rentaBrute))}
      ${ligne("Nette (hors crédit, avant impôts)", pct(r.rentaNette))}
    </div>`;
  updateEditState();
}

function updateEditState() {
  const dirty = isDirty();
  saveBtn.disabled = !dirty;
  revertBtn.disabled = !dirty || !saved;
  duplicateBtn.disabled = !current?.id;
  deleteBtn.textContent = current?.id ? "Supprimer" : "Abandonner";
  if (dirty) saveStatus.textContent = saveStatus.textContent.includes("importés") ? saveStatus.textContent : "Modifications non enregistrées";
  else if (saveStatus.textContent === "Modifications non enregistrées") saveStatus.textContent = "";
}

saveBtn.addEventListener("click", async () => {
  if (!current) return;
  const nom = current.nom.trim() || "Sans nom";
  const inputs = normalizeInputs(current.inputs);
  saveBtn.disabled = true;
  saveStatus.textContent = "Enregistrement…";
  try {
    if (current.id) {
      await store.update(current.id, nom, inputs);
    } else {
      const id = await store.create(nom, inputs);
      current.id = id;
      window.history.replaceState(null, "", "#/sim/" + id);
    }
    current.nom = nom;
    simNom.value = nom;
    saved = { nom, inputs: { ...inputs } };
    saveStatus.textContent = "Enregistré";
    setTimeout(() => { if (saveStatus.textContent === "Enregistré") saveStatus.textContent = ""; }, 1500);
  } catch (err) {
    saveStatus.textContent = "Erreur : " + err.message;
  }
  updateEditState();
});

revertBtn.addEventListener("click", () => {
  if (!saved || !confirm("Revenir à la dernière version enregistrée ?")) return;
  current = { id: current.id, nom: saved.nom, inputs: { ...saved.inputs } };
  renderForm();
});

duplicateBtn.addEventListener("click", () => {
  if (!current?.id || !confirmLeave()) return;
  startNewDraft(current.nom + " (copie)", saved?.inputs || current.inputs);
});

deleteBtn.addEventListener("click", async () => {
  if (!current) return;
  if (!current.id) {
    if (confirmLeave()) { current = null; saved = null; go("#/"); }
    return;
  }
  if (!confirm(`Supprimer la simulation « ${current.nom} » ? Cette action est définitive.`)) return;
  const id = current.id;
  current = null;
  saved = null;
  await store.remove(id);
  go("#/");
});

$("#back-btn").addEventListener("click", () => {
  if (!confirmLeave()) return;
  current = null;
  saved = null;
  go("#/");
});
