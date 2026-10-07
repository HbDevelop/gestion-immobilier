// Tests du moteur de calcul (calc.js) et de l'import Excel (import-xlsx.js).
// Usage : node tests.mjs
// Les chiffres ci-dessous sont un cas de test fictif ; les mensualités attendues sont celles que
// donne la formule PMT d'Excel (recalculées indépendamment en Python).
import assert from "node:assert/strict";
import { compute, mensualitePret, normalizeInputs } from "./calc.js";
import { parseSheet } from "./import-xlsx.js";

const close = (actual, expected, eps = 0.01) =>
  assert.ok(Math.abs(actual - expected) < eps, `attendu ${expected}, obtenu ${actual}`);

// PMT Excel : =-PMT(4%/12, 240, 200000) = 1211.96
close(mensualitePret(0.04 / 12, 240, 200000), 1211.96);
close(mensualitePret(0, 120, 12000), 100);
assert.equal(mensualitePret(0.01, 120, 0), 0);

// Valeurs manquantes ou invalides -> valeurs par défaut
const n = normalizeInputs({ prix: "100000", travaux: "", chambres: "abc" });
assert.equal(n.prix, 100000);
assert.equal(n.travaux, 0);
assert.equal(n.chambres, 0);
assert.equal(n.notairePct, 7.5);

// Cas complet
const r = compute({
  prix: 100000, fraisAgence: 0, notairePct: 8, travaux: 20000, ameublement: 5000, decoratrice: 0,
  apport: 0, fraisDossier: 1000, fraisGarantie: 0, tauxCredit: 3, tauxAssurance: 0.3, dureeAnnees: 20,
  copropriete: 1200, electricite: 600, eau: 0, gaz: 0,
  assurancePNO: 150, comptable: 300, taxeFonciere: 900, gestionAgence: 0, gli: 0,
  internet: 360, menage: 0, assuranceMRH: 200, netflix: 0,
  chambres: 3, loyerParChambre: 500
});
close(r.fraisNotaire, 8000);
close(r.prixTotal, 133000);
close(r.montantEmprunte, 134000);
// =-PMT((3%+0.3%)/12, 20*12, 134000)*12
close(r.creditAnnuel, 9161.34);
close(r.chargesHorsCredit, 3710);
close(r.cashflow[12], (1500 * 12 - (r.creditAnnuel + 3710)) / 12);
close(r.cashflow[11], (1500 * 11 - (r.creditAnnuel + 3710)) / 12);
close(r.rentaBrute, 18000 / 133000, 1e-9);
close(r.rentaNette, (18000 - 3710) / 133000, 1e-9);

// L'apport réduit le montant emprunté, les frais de garantie l'augmentent
const r2 = compute({ prix: 100000, notairePct: 0, apport: 20000, fraisGarantie: 1500, tauxCredit: 2, dureeAnnees: 10 });
close(r2.montantEmprunte, 81500);

// Import : feuille au format SheetJS, même disposition que le classeur (libellé à gauche,
// valeur à droite), chiffres fictifs.
const feuille = {
  "!ref": "B4:F31",
  B6: { v: "Prix du bien" }, C6: { v: 100000, f: "100000" },
  B8: { v: "Frais de notaire" }, C8: { v: 8000, f: "(8/100)*C6" },
  B9: { v: "Travaux" }, C9: { v: 20000 },
  B10: { v: "Ammeublement" }, C10: { v: 5000 },
  B11: { v: "Décoratrice" }, C11: { v: 0 },
  B13: { v: "Frais de dossier" }, C13: { v: 1000 },
  B16: { v: "Crédit" }, C16: { v: 9161.34, f: "-PMT((3%+0.3%)/12, 20*12, (F5+C13))*12" },
  B17: { v: "Copropriété" }, C17: { v: 1200, f: "300*4" },
  B24: { v: "Taxe foncière" }, C24: { v: 900 },
  B26: { v: "Garantie loyer impayés" }, C26: { v: 250 },
  B28: { v: "Internet" }, C28: { v: 360, f: "30*12" },
  E8: { v: "Chambres" }, F8: { v: 3 },
  E9: { v: "Loyer par chambre CC" }, F9: { v: 500 },
  E13: { v: "Mensuel net 12 mois" }, F13: { v: 1, f: "..." }
};
const imp = parseSheet(feuille);
assert.equal(imp.inputs.prix, 100000);
assert.equal(imp.inputs.notairePct, 8);
assert.equal(imp.inputs.ameublement, 5000);
assert.equal(imp.inputs.tauxCredit, 3);
assert.equal(imp.inputs.tauxAssurance, 0.3);
assert.equal(imp.inputs.dureeAnnees, 20);
assert.equal(imp.inputs.copropriete, 1200);
assert.equal(imp.inputs.gli, 250);
assert.equal(imp.inputs.fraisGarantie, 0, "« Garantie loyer impayés » ne doit pas être pris pour « Frais de garantie »");
assert.equal(imp.inputs.chambres, 3);
assert.equal(imp.inputs.loyerParChambre, 500);
close(compute(imp.inputs).creditAnnuel, 9161.34);
assert.equal(parseSheet({ A1: { v: "rien à voir" } }).trouves.length, 0);

console.log("tests.mjs : tous les tests passent");
