import { firebaseConfig, GOOGLE_CLIENT_ID } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, doc, addDoc, deleteDoc, collection, onSnapshot,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---- State ----
let currentUser = null;
let biens = [];
let unsubBiens = null;

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
const bienForm = $("#bien-form");
const biensList = $("#biens-list");
const biensCount = $("#biens-count");

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

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
initGoogleSignIn();

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
completeEmailLinkSignInIfNeeded();

logoutBtn.addEventListener("click", () => signOut(auth));
deniedLogoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  loginScreen.classList.add("hidden");
  deniedScreen.classList.add("hidden");
  appShell.classList.add("hidden");
  if (unsubBiens) { unsubBiens(); unsubBiens = null; }

  if (!user) {
    loginScreen.classList.remove("hidden");
    return;
  }
  userLabel.textContent = user.email;
  startListeners(user);
});

// ---- Firestore listeners (temps réel) ----
// Il n'existe pas de liste d'emails autorisés côté client : on tente simplement de lire
// les données, et si les règles Firestore refusent (permission-denied), c'est qu'on n'a
// pas accès. C'est la seule source de vérité sur qui a le droit d'entrer.
function startListeners(user) {
  const denyAccess = () => {
    if (unsubBiens) { unsubBiens(); unsubBiens = null; }
    appShell.classList.add("hidden");
    deniedScreen.classList.remove("hidden");
    $("#denied-email").textContent = user.email;
  };

  const q = query(collection(db, "biens"), orderBy("createdAt", "desc"));
  unsubBiens = onSnapshot(q, (snap) => {
    appShell.classList.remove("hidden");
    deniedScreen.classList.add("hidden");
    biens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }, denyAccess);
}

// ---- Actions ----
bienForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await addDoc(collection(db, "biens"), {
    nom: $("#f-nom").value.trim(),
    adresse: $("#f-adresse").value.trim(),
    createdAt: serverTimestamp(),
    createdBy: currentUser.email
  });
  bienForm.reset();
});

biensList.addEventListener("click", async (e) => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;
  if (!confirm("Supprimer ce bien ?")) return;
  await deleteDoc(doc(db, "biens", btn.dataset.id));
});

// ---- Rendu ----
function renderAll() {
  biensCount.textContent = biens.length + (biens.length > 1 ? " biens" : " bien");
  if (biens.length === 0) {
    biensList.innerHTML = `<p class="empty">Aucun bien pour l'instant.</p>`;
    return;
  }
  biensList.innerHTML = biens.map((b) => `
    <div class="bien-item">
      <div>
        <div class="bien-nom">${escapeHtml(b.nom)}</div>
        <div class="bien-adresse">${escapeHtml(b.adresse)}</div>
      </div>
      <button class="delete-btn" data-id="${b.id}" title="Supprimer">🗑</button>
    </div>
  `).join("");
}
