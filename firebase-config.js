// Config du projet Firebase "gestion-immobilier" (console.firebase.google.com).
// Ces clés sont publiques par design (elles identifient juste le projet, elles n'autorisent rien
// en elles-mêmes) : la vraie sécurité vient des règles Firestore (voir firestore.rules et le
// README) qui limitent la lecture/écriture aux comptes autorisés.
//
// Volontairement, la liste des emails autorisés ne vit pas dans ce fichier : c'est un module
// JS servi tel quel à n'importe quel visiteur du site, donc tout ce qu'il contient est public.
// app.js ne fait jamais de vérification d'autorisation côté client — il tente juste de lire
// les données et laisse les règles Firestore (côté serveur, jamais téléchargeables) décider.
export const firebaseConfig = {
  apiKey: "AIzaSyBcKKFoN3OzSG-oMElTT-txg6mxbccU34g",
  authDomain: "gestion-immobilier-91f5e.firebaseapp.com",
  projectId: "gestion-immobilier-91f5e",
  storageBucket: "gestion-immobilier-91f5e.firebasestorage.app",
  messagingSenderId: "267647140848",
  appId: "1:267647140848:web:aa70a00548d3ed798d1335"
};

// ID client OAuth Web du provider Google (Firebase Auth > Sign-in method > Google >
// Configuration du SDK Web). Utilisé par Google Identity Services pour la connexion :
// on évite ainsi le relais par iframe tierce de Firebase, souvent bloqué par les
// navigateurs qui restreignent le stockage/cookies tiers.
export const GOOGLE_CLIENT_ID = "267647140848-9v0at3sqfnvkv1j85n2ejchhnn2i9an5.apps.googleusercontent.com";
