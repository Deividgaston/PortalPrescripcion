
// ==========================================
// app.js
// Control general de la app (auth + shell)
// SIN firebaseConfig (ya está en firebase.js)
// ==========================================

window.appState = window.appState || {};

// Observador de autenticación
function initAuthWatcher() {
  if (!auth) {
    console.error("Firebase auth no está inicializado.");
    return;
  }

  auth.onAuthStateChanged((user) => {
    if (user) {
      mostrarApp(user);
    } else {
      mostrarLogin();
    }
  });
}

// Mostrar login (pantalla de acceso)
function mostrarLogin() {
  const loginPage = document.getElementById("loginPage");
  const appShell = document.getElementById("appShell");

  if (loginPage) loginPage.style.display = "flex";
  if (appShell) appShell.style.display = "none";

  // Inicializar lógica del login (botones, etc.)
  if (typeof initLoginUI === "function") {
    initLoginUI();
  }
}

// Mostrar la aplicación principal (shell + vistas)
function mostrarApp(user) {
  const loginPage = document.getElementById("loginPage");
  const appShell = document.getElementById("appShell");

  if (loginPage) loginPage.style.display = "none";
  if (appShell) appShell.style.display = "flex";

  const badge = document.getElementById("userBadge");
  if (badge && user && user.email) {
    // Limpiar nombre largo en badge si es necesario
    const shortName = user.email.split('@')[0];
    badge.textContent = shortName;
  }

  if (typeof initShellUI === "function") {
    initShellUI();
  }
}

// Cerrar sesión
async function cerrarSesion() {
  try {
    await auth.signOut();
  } catch (e) {
    console.error("Error al cerrar sesión:", e);
  }
}

// Lanzar el watcher al cargar la página
window.addEventListener("DOMContentLoaded", () => {
  initAuthWatcher();
});

console.log(
  "%cApp principal inicializada (v2026 Redesign)",
  "color:#4ade80; font-weight:600;"
);
