// js/ui_login.js
// Lógica de la pantalla de login (solo email+password)

function initLoginUI() {
  const loginPage = document.getElementById("loginPage");
  const appShell = document.getElementById("appShell");
  const emailInput = document.getElementById("loginEmail");
  const passInput = document.getElementById("loginPass");
  const btnLogin = document.getElementById("btnLogin");
  const btnLoginGoogle = document.getElementById("btnLoginGoogle");
  const loginError = document.getElementById("loginError");

  if (!loginPage || !appShell) {
    console.error("Error: faltan elementos del login en HTML.");
    return;
  }

  // Estado inicial: login visible
  loginPage.style.display = "flex";
  appShell.style.display = "none";

  // Ocultar Google si existe en DOM
  if (btnLoginGoogle) btnLoginGoogle.style.display = "none";

  function mostrarError(msg) {
    if (!loginError) return;
    loginError.textContent = msg;
    loginError.style.display = "flex";
  }

  function limpiarError() {
    if (!loginError) return;
    loginError.textContent = "";
    loginError.style.display = "none";
  }

  // ============================================
  // LOGIN EMAIL + PASSWORD
  // ============================================
  async function manejarLogin() {
    limpiarError();

    const email = emailInput.value.trim();
    const pass = passInput.value.trim();

    if (!email || !pass) {
      mostrarError("Introduce email y contraseña.");
      return;
    }

    if (typeof auth === "undefined") {
      mostrarError("Error interno: auth no inicializado.");
      return;
    }

    try {
      await auth.signInWithEmailAndPassword(email, pass);
      // onAuthStateChanged en ui_shell.js gestiona el resto
    } catch (err) {
      console.error("Error login email:", err);
      let msg = "No se ha podido iniciar sesión.";
      if (err.code === "auth/user-not-found") msg = "Usuario no encontrado.";
      if (err.code === "auth/wrong-password") msg = "Contraseña incorrecta.";
      if (err.code === "auth/invalid-email") msg = "Email no válido.";
      mostrarError(msg);
    }
  }

  // Eventos
  btnLogin.addEventListener("click", (e) => {
    e.preventDefault();
    manejarLogin();
  });

  // Enter para login rápido
  [emailInput, passInput].forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") manejarLogin();
    });
  });
}

console.log("%cUI Login cargada (solo email)", "color:#1d4fd8; font-weight:600;");
