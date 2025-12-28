// js/firebase.js
// Configuración real de Firebase

const firebaseConfig = {
  apiKey: "AIzaSyDzVSSaP2wNJenJov-5S9PsYWWUp-HITz0",
  authDomain: "n-presupuestos.firebaseapp.com",
  projectId: "n-presupuestos",
  storageBucket: "n-presupuestos.firebasestorage.app",
  messagingSenderId: "380694582040",
  appId: "1:380694582040:web:d88b2298eecf4f15eec46d",
};

// Inicializar Firebase (solo una vez)
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Referencias globales
const app = firebase.app();
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ✅ Export global para el resto de módulos (muchos esperan window.db / window.auth / window.storage)
window.app = app;
window.auth = auth;
window.db = db;
window.storage = storage;

// (Opcional) Ajustes de Firestore
// db.settings({ ignoreUndefinedProperties: true });

console.log("%cFirebase inicializado correctamente", "color:#16a34a; font-weight:600;");
