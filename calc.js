// Moteur de calcul d'une simulation d'achat locatif, transposé du classeur Excel
// "Appartement N.xlsx" (même postes, mêmes formules). Module pur, sans dépendance au DOM ni à
// Firebase : on le teste directement avec Node (voir calc.test.mjs).
//
// Toutes les charges sont des montants ANNUELS, comme dans le classeur.

// Description des champs saisis, regroupés par section comme dans le classeur.
// `def` = valeur par défaut d'une nouvelle simulation (taux usuels, montants vides).
export const SECTIONS = [
  {
    id: "achat", titre: "Achat", champs: [
      { id: "prix", label: "Prix du bien", unite: "€", def: 0 },
      { id: "fraisAgence", label: "Frais d'agence", unite: "€", def: 0 },
      { id: "notairePct", label: "Frais de notaire", unite: "% du prix", def: 7.5, step: 0.1 },
      { id: "travaux", label: "Travaux", unite: "€", def: 0 },
      { id: "ameublement", label: "Ameublement", unite: "€", def: 0 },
      { id: "decoratrice", label: "Décoratrice", unite: "€", def: 0 }
    ]
  },
  {
    id: "financement", titre: "Financement", champs: [
      { id: "apport", label: "Apport", unite: "€", def: 0 },
      { id: "fraisDossier", label: "Frais de dossier", unite: "€", def: 0 },
      { id: "fraisGarantie", label: "Frais de garantie", unite: "€", def: 0 },
      { id: "tauxCredit", label: "Taux du crédit", unite: "%/an", def: 0, step: 0.01 },
      { id: "tauxAssurance", label: "Taux assurance emprunteur", unite: "%/an", def: 0, step: 0.01 },
      { id: "dureeAnnees", label: "Durée du crédit", unite: "ans", def: 25, step: 1 }
    ]
  },
  {
    id: "charges", titre: "Charges (par an)", champs: [
      { id: "copropriete", label: "Copropriété", unite: "€/an", def: 0 },
      { id: "electricite", label: "Électricité", unite: "€/an", def: 0 },
      { id: "eau", label: "Eau", unite: "€/an", def: 0 },
      { id: "gaz", label: "Gaz", unite: "€/an", def: 0 }
    ]
  },
  {
    id: "admin", titre: "Frais administratifs (par an)", champs: [
      { id: "assurancePNO", label: "Assurance PNO", unite: "€/an", def: 0 },
      { id: "comptable", label: "Comptable", unite: "€/an", def: 0 },
      { id: "taxeFonciere", label: "Taxe foncière", unite: "€/an", def: 0 },
      { id: "gestionAgence", label: "Gestion agence immobilière", unite: "€/an", def: 0 },
      { id: "gli", label: "Garantie loyers impayés", unite: "€/an", def: 0 }
    ]
  },
  {
    id: "services", titre: "Services facultatifs (par an)", champs: [
      { id: "internet", label: "Internet", unite: "€/an", def: 0 },
      { id: "menage", label: "Femme de ménage", unite: "€/an", def: 0 },
      { id: "assuranceMRH", label: "Assurance MRH", unite: "€/an", def: 0 },
      { id: "netflix", label: "Netflix / abonnements", unite: "€/an", def: 0 }
    ]
  },
  {
    id: "location", titre: "Location", champs: [
      { id: "chambres", label: "Chambres", unite: "", def: 0, step: 1 },
      { id: "loyerParChambre", label: "Loyer par chambre CC", unite: "€/mois", def: 0 }
    ]
  }
];

export const CHAMPS = SECTIONS.flatMap((s) => s.champs);

// Postes de charges annuelles hors crédit (les sections Charges, Admin et Services).
const POSTES_CHARGES = SECTIONS
  .filter((s) => ["charges", "admin", "services"].includes(s.id))
  .flatMap((s) => s.champs.map((c) => c.id));

// Mois loués dans l'année pour lesquels on affiche le cash-flow (vacance locative).
export const MOIS_LOUES = [12, 11, 10];

export function defaultInputs() {
  return Object.fromEntries(CHAMPS.map((c) => [c.id, c.def]));
}

// Complète des données partielles (anciennes simulations, import) avec les valeurs par défaut
// et force tout en nombre.
export function normalizeInputs(raw = {}) {
  const out = defaultInputs();
  for (const c of CHAMPS) {
    const v = Number(raw[c.id]);
    if (raw[c.id] !== undefined && raw[c.id] !== "" && Number.isFinite(v)) out[c.id] = v;
  }
  return out;
}

// Équivalent de la fonction Excel PMT, renvoyé en positif : mensualité constante d'un prêt.
export function mensualitePret(tauxMensuel, nbMois, capital) {
  if (nbMois <= 0 || capital <= 0) return 0;
  if (tauxMensuel === 0) return capital / nbMois;
  return (capital * tauxMensuel) / (1 - Math.pow(1 + tauxMensuel, -nbMois));
}

export function compute(raw) {
  const i = normalizeInputs(raw);

  const fraisNotaire = (i.notairePct / 100) * i.prix;
  // = PRIX TOTAL DU PROJET du classeur
  const prixTotal = i.prix + i.fraisAgence + fraisNotaire + i.travaux + i.ameublement + i.decoratrice;

  // Comme le classeur, on emprunte le projet + les frais de dossier ; les frais de garantie
  // sont aussi financés, et l'apport vient en déduction (0 par défaut = financement à 100 %).
  const montantEmprunte = Math.max(0, prixTotal + i.fraisDossier + i.fraisGarantie - i.apport);
  // Comme le classeur, l'assurance emprunteur est ajoutée au taux du crédit.
  const tauxAnnuel = (i.tauxCredit + i.tauxAssurance) / 100;
  const nbMois = Math.round(i.dureeAnnees * 12);
  const mensualite = mensualitePret(tauxAnnuel / 12, nbMois, montantEmprunte);
  const creditAnnuel = mensualite * 12;
  const coutTotalCredit = mensualite * nbMois - montantEmprunte;

  const chargesHorsCredit = POSTES_CHARGES.reduce((s, id) => s + i[id], 0);
  const chargesAnnuelles = creditAnnuel + chargesHorsCredit;

  const loyerMensuel = i.chambres * i.loyerParChambre;
  const loyersAnnuels = loyerMensuel * 12;

  // = "Mensuel net N mois" du classeur : (loyers encaissés sur N mois - charges annuelles) / 12
  const cashflow = Object.fromEntries(
    MOIS_LOUES.map((m) => [m, (loyerMensuel * m - chargesAnnuelles) / 12])
  );

  const rentaBrute = prixTotal > 0 ? loyersAnnuels / prixTotal : 0;
  const rentaNette = prixTotal > 0 ? (loyersAnnuels - chargesHorsCredit) / prixTotal : 0;

  return {
    inputs: i,
    fraisNotaire, prixTotal,
    montantEmprunte, mensualite, creditAnnuel, coutTotalCredit,
    chargesHorsCredit, chargesAnnuelles,
    loyerMensuel, loyersAnnuels,
    cashflow, rentaBrute, rentaNette
  };
}
