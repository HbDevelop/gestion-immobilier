# Gestion Immobilier 🏠

Application privée de simulation d'achat immobilier locatif. Reprend les postes et les
formules d'un classeur Excel de simulation (« Appartement N.xlsx ») : prix total du projet,
crédit, charges, cash-flow net mensuel selon la vacance locative, rentabilité brute et nette.
Chaque simulation est enregistrée et peut être rouverte, modifiée, dupliquée ou supprimée.

Live à [hbdevelop.github.io/gestion-immobilier](https://hbdevelop.github.io/gestion-immobilier/).

## Structure

- `index.html` / `style.css` — la page
- `app.js` — logique (auth, temps réel Firestore, liste et fiche des simulations, import)
- `calc.js` — moteur de calcul pur (mêmes formules que le classeur), sans DOM ni Firebase
- `import-xlsx.js` — lecture d'un classeur `.xlsx` (via SheetJS, chargé à la demande) vers les
  champs d'une simulation, en repérant chaque poste par son libellé
- `tests.mjs` — tests du calcul et de l'import : `node tests.mjs`
- `firebase-config.js` — config publique du projet Firebase (aucun email dedans, voir Sécurité)
- `firestore.rules` — modèle des règles de sécurité Firestore. La liste réelle des emails
  autorisés n'est **pas** versionnée (repo public) : elle n'existe que dans la console Firebase

## Sécurité

L'app est servie publiquement sur GitHub Pages, mais les **données** ne le sont pas :

- Connexion via **Google Sign-In** (Firebase Authentication), ou par **lien email**
  (connexion sans mot de passe) pour les comptes non-Google.
- Les **règles de sécurité Firestore** (`firestore.rules`) n'autorisent la lecture/écriture
  qu'aux emails listés dedans. Toute autre personne connectée se voit refuser l'accès, même
  si elle trouve l'URL.
- La liste des emails autorisés **ne vit jamais côté client** : `app.js` tente juste de lire
  les données et laisse Firestore refuser si besoin.

Pour ajouter/retirer une personne autorisée :
1. Modifier la liste dans les règles Firestore et republier
   (console Firebase du projet → Firestore Database → Règles)
2. Si la structure des règles change, mettre à jour `firestore.rules` dans ce repo en gardant
   l'email en placeholder — aucune info perso ne doit être commitée

## Données

- Collection `simulations` : une simulation = `nom`, `inputs` (les montants saisis, voir
  `SECTIONS` dans `calc.js`), `createdAt`, `updatedAt`. Les résultats ne sont pas stockés : ils
  sont recalculés à l'affichage, donc une correction de formule s'applique à toutes les
  simulations existantes.
- Les classeurs Excel ne sont **jamais** commités (`.gitignore`) : ils contiennent des chiffres
  personnels. On les importe depuis l'app (bouton « Importer un fichier Excel »), ce qui crée
  une simulation à vérifier puis enregistrer.

## Calculs

Identiques au classeur, avec trois ajouts :

- **Rentabilité brute** = loyers annuels ÷ prix total du projet ; **nette** = (loyers annuels −
  charges hors crédit) ÷ prix total du projet (avant impôts).
- **Frais de garantie** ajoutés au montant emprunté (comme les frais de dossier).
- **Apport** déduit du montant emprunté (0 par défaut = financement à 100 % comme le classeur).

L'assurance emprunteur reste ajoutée au taux du crédit, comme dans le classeur.

## Mode démo

`?demo` à la fin de l'URL (ex. `http://localhost:8080/?demo`) : pas de connexion, données en
mémoire seulement (perdues au rechargement), avec un exemple fictif. Pratique pour tester
l'interface.

## Firebase

Projet `gestion-immobilier-91f5e` (formule Spark gratuite), Firestore en `eur3` (Europe).

- Authentication : Google + lien email activés ; `hbdevelop.github.io` dans les domaines autorisés
- Client OAuth Web (Google Cloud Console → Google Auth Platform → Clients) : origines
  `https://hbdevelop.github.io` et `http://localhost:8080` autorisées

## Développement local

Comme il s'agit de modules JS natifs (`type="module"`), il faut servir les
fichiers via un petit serveur HTTP (pas de `file://`) :

```bash
python -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Déploiement

GitHub Pages sert directement les fichiers statiques depuis la branche
`main`. Un `git push` suffit, le site se met à jour automatiquement.
