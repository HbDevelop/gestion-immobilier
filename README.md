# Gestion Immobilier 🏠

Application privée de gestion immobilière. Squelette de départ : connexion,
accès restreint et une liste de biens synchronisée en temps réel.

Live à [hbdevelop.github.io/gestion-immobilier](https://hbdevelop.github.io/gestion-immobilier/).

## Structure

- `index.html` / `style.css` — la page
- `app.js` — logique (auth, temps réel Firestore, rendu)
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

- Collection `biens` : un bien = nom, adresse, date de création, auteur.

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
