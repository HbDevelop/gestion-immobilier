// Import d'un classeur "Appartement N.xlsx" vers les champs d'une simulation.
// On repère chaque poste par son LIBELLÉ (colonne de gauche) et on lit la valeur dans la cellule
// juste à droite, pour ne pas dépendre de positions de cellules exactes.
// Module pur : reçoit une feuille au format SheetJS ({ "A1": { v, f }, ... }), testable avec Node.

import { normalizeInputs } from "./calc.js";

const LIBELLES = {
  "prix du bien": "prix",
  "frais d'agence": "fraisAgence",
  "travaux": "travaux",
  "ameublement": "ameublement",
  "ammeublement": "ameublement",
  "decoratrice": "decoratrice",
  "apport": "apport",
  "frais de dossier": "fraisDossier",
  "frais de garantie": "fraisGarantie",
  "copropriete": "copropriete",
  "electricite": "electricite",
  "eau": "eau",
  "gaz": "gaz",
  "assurance pno": "assurancePNO",
  "comptable": "comptable",
  "taxe fonciere": "taxeFonciere",
  "gestion agence immobiliere": "gestionAgence",
  "garantie loyer impayes": "gli",
  "garantie loyers impayes": "gli",
  "internet": "internet",
  "femme de menage": "menage",
  "assurance mrh": "assuranceMRH",
  "netflix": "netflix",
  "chambres": "chambres",
  "loyer par chambre cc": "loyerParChambre"
};

const normaliser = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();

function decoderAdresse(adr) {
  const m = /^([A-Z]+)(\d+)$/.exec(adr);
  if (!m) return null;
  const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return { col, row: Number(m[2]) };
}

function encoderAdresse(col, row) {
  let s = "";
  for (let c = col; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s + row;
}

const nombre = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number(String(v ?? "").replace(",", ".")));

export function parseSheet(sheet) {
  const brut = {};
  const trouves = [];
  let celluleCredit = null;
  let celluleNotaire = null;

  for (const adr of Object.keys(sheet)) {
    const cell = sheet[adr];
    if (adr.startsWith("!") || typeof cell?.v !== "string") continue;
    const pos = decoderAdresse(adr);
    if (!pos) continue;
    const voisine = sheet[encoderAdresse(pos.col + 1, pos.row)];
    const libelle = normaliser(cell.v);

    if (libelle === "frais de notaire") { celluleNotaire = voisine; continue; }
    if (libelle === "credit") { celluleCredit = voisine; continue; }
    const champ = LIBELLES[libelle];
    if (!champ || !voisine || voisine.v === undefined || voisine.v === "") continue;
    const v = nombre(voisine.v);
    if (Number.isFinite(v)) { brut[champ] = v; trouves.push(champ); }
  }

  // Frais de notaire : un pourcentage du prix, lu dans la formule "(7.5/100)*C6" ou déduit.
  if (celluleNotaire) {
    const m = /\(?\s*([\d.,]+)\s*\/\s*100\s*\)?\s*\*/.exec(celluleNotaire.f || "");
    if (m) brut.notairePct = nombre(m[1]);
    else if (brut.prix > 0 && Number.isFinite(nombre(celluleNotaire.v))) brut.notairePct = (nombre(celluleNotaire.v) / brut.prix) * 100;
    if (brut.notairePct !== undefined) trouves.push("notairePct");
  }

  // Crédit : taux, assurance et durée lus dans la formule "-PMT((1.45%+0.36%)/12, 25*12, ...)".
  if (celluleCredit?.f) {
    const m = /PMT\(\s*\(?\s*([\d.,]+)\s*%\s*(?:\+\s*([\d.,]+)\s*%)?\s*\)?\s*\/\s*12\s*,\s*([\d.,]+)\s*(\*\s*12)?/i.exec(celluleCredit.f);
    if (m) {
      brut.tauxCredit = nombre(m[1]);
      brut.tauxAssurance = m[2] ? nombre(m[2]) : 0;
      brut.dureeAnnees = m[4] ? nombre(m[3]) : nombre(m[3]) / 12;
      trouves.push("tauxCredit", "tauxAssurance", "dureeAnnees");
    }
  }

  return { inputs: normalizeInputs(brut), trouves };
}
