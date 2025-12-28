// js/ui_shell.js
// Shell de la app: navegación superior + logout + selección de vistas
// + AUTH GATE + roles/permisos + invitaciones (invites/{emailId})

window.appState = window.appState || {};

// ==========================
// CONFIG
// ==========================
const SUPERADMIN_EMAIL = "gastonortigosa@gmail.com";

// ==========================
// Helpers
// ==========================
function _normalizeViewKey(viewKey) {
  if (viewKey === "docs") return "documentacion";
  if (viewKey === "docs-gestion") return "docGestion";
  return viewKey;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function inviteIdFromEmail(email) {
  return normalizeEmail(email).replace(/[^\w.-]+/g, "_");
}

function _dedupeNavLinks() {
  // Evita pestañas duplicadas si en el HTML hay links repetidos (p.ej. "Usuarios" en dos sitios)
  const seen = new Set();
  document.querySelectorAll(".top-nav-link[data-view]").forEach((el) => {
    const raw = el.getAttribute("data-view");
    const key = _normalizeViewKey(raw);
    if (!key) return;

    if (seen.has(key)) {
      el.style.display = "none";
    } else {
      seen.add(key);
    }
  });
}

// ==========================
// Roles -> capabilities (DUAL: legacy + v2)
// ==========================
function buildCapabilitiesForRole(role) {
  const r = String(role || "").toUpperCase();

  // Legacy (lo que ya tienes)
  const legacy = {
    views: {
      proyecto: false,
      presupuesto: false,
      simulador: false,
      tarifa: false,
      tarifas: false,
      documentacion: false,
      prescripcion: false,
      diagramas: false, // ✅ NUEVO (por defecto NO)
      docGestion: false,
      usuarios: false,
    },
    features: {
      tarifasWrite: false, // add/edit/delete tarifas
      docExportTecnico: false, // export técnico
      docModo: "none", // "none" | "commercial" | "technical"
      prescTemplatesWrite: false, // plantillas prescripción
      prescExtraRefsWrite: false, // refs extra prescripción
    },
  };

  // Nuevo esquema (lo pactado)
  const v2 = {
    pages: {
      proyecto: false,
      presupuesto: false,
      simulador: false,
      tarifa: false,
      tarifas: "none", // "view" | "none"
      documentacion: "none", // "commercial" | "technical" | "none"
      prescripcion: "none", // "view" | "none"
      diagramas: false, // ✅ NUEVO (por defecto NO)
      docGestion: false,
      usuarios: false,
    },
    documentacion: {
      exportTecnico: false,
    },
    prescripcion: {
      templates: "readOnly", // "readOnly" | "full"
      extraRefs: "readOnly", // "readOnly" | "full"
    },
  };

  function allowView(k) {
    legacy.views[k] = true;
    // pages mapping
    if (k === "tarifas") v2.pages.tarifas = "view";
    else if (k === "documentacion") v2.pages.documentacion = "commercial"; // default, se ajusta por rol
    else if (k === "prescripcion") v2.pages.prescripcion = "view";
    else if (k === "docGestion") v2.pages.docGestion = true;
    else if (k === "usuarios") v2.pages.usuarios = true;
    else v2.pages[k] = true; // incluye diagramas si se llamase
  }

  if (r === "SUPER_ADMIN") {
    Object.keys(legacy.views).forEach((k) => allowView(k));
    legacy.features.tarifasWrite = true;
    legacy.features.docExportTecnico = true;
    legacy.features.docModo = "technical";
    legacy.features.prescTemplatesWrite = true;
    legacy.features.prescExtraRefsWrite = true;

    v2.pages.tarifas = "view";
    v2.pages.documentacion = "technical";
    v2.documentacion.exportTecnico = true;
    v2.prescripcion.templates = "full";
    v2.prescripcion.extraRefs = "full";

    // ✅ Diagrama: permitido para SUPER_ADMIN
    legacy.views.diagramas = true;
    v2.pages.diagramas = true;

    return { ...legacy, ...v2 };
  }

  if (r === "ACCOUNT_MANAGER") {
    allowView("proyecto");
    allowView("presupuesto");
    allowView("simulador");
    allowView("tarifa");
    allowView("tarifas");
    allowView("documentacion");
    allowView("docGestion");

    legacy.features.tarifasWrite = false; // solo consultar/imprimir
    legacy.features.docExportTecnico = false;
    legacy.features.docModo = "commercial";

    v2.pages.documentacion = "commercial";
    v2.documentacion.exportTecnico = false;
    v2.prescripcion.templates = "readOnly";
    v2.prescripcion.extraRefs = "readOnly";

    // ✅ diagramas: NO por rol (solo si tú lo activas)
    legacy.views.diagramas = false;
    v2.pages.diagramas = false;

    return { ...legacy, ...v2 };
  }

  if (r === "PRESCRIPTOR") {
    allowView("proyecto");
    allowView("presupuesto");
    allowView("simulador");
    allowView("tarifa");
    allowView("tarifas");
    allowView("documentacion");
    allowView("docGestion");

    legacy.features.tarifasWrite = false;
    legacy.features.docExportTecnico = true;
    legacy.features.docModo = "technical";

    v2.pages.documentacion = "technical";
    v2.documentacion.exportTecnico = true;
    v2.prescripcion.templates = "full";
    v2.prescripcion.extraRefs = "full";

    legacy.views.diagramas = false;
    v2.pages.diagramas = false;

    return { ...legacy, ...v2 };
  }

  if (r === "SUPER_PRESCRIPTOR") {
    allowView("proyecto");
    allowView("presupuesto");
    allowView("simulador");
    allowView("tarifa");
    allowView("tarifas");
    allowView("documentacion");
    allowView("prescripcion");
    allowView("docGestion");

    legacy.features.tarifasWrite = false;
    legacy.features.docExportTecnico = true;
    legacy.features.docModo = "technical";
    legacy.features.prescTemplatesWrite = false; // read-only
    legacy.features.prescExtraRefsWrite = false; // read-only

    v2.pages.documentacion = "technical";
    v2.documentacion.exportTecnico = true;
    v2.pages.prescripcion = "view";
    v2.prescripcion.templates = "readOnly";
    v2.prescripcion.extraRefs = "readOnly";

    legacy.views.diagramas = false;
    v2.pages.diagramas = false;

    return { ...legacy, ...v2 };
  }

  if (r === "DOC_MANAGER") {
    allowView("docGestion");
    allowView("documentacion");

    legacy.features.docModo = "technical";

    v2.pages.documentacion = "technical";
    v2.documentacion.exportTecnico = false;
    v2.prescripcion.templates = "readOnly";
    v2.prescripcion.extraRefs = "readOnly";

    legacy.views.diagramas = false;
    v2.pages.diagramas = false;

    return { ...legacy, ...v2 };
  }

  return { ...legacy, ...v2 };
}

// Normaliza capabilities existentes (si vienen legacy-only o v2-only)
function normalizeCapabilities(caps, role) {
  const r = String(role || "").toUpperCase();
  const base = buildCapabilitiesForRole(r);
  const out = { ...(caps || {}) };

  // Asegurar legacy/v2 (crear si no existen)
  if (!out.views) out.views = base.views;
  if (!out.features) out.features = base.features;
  if (!out.pages) out.pages = base.pages;
  if (!out.documentacion) out.documentacion = base.documentacion;
  if (!out.prescripcion) out.prescripcion = base.prescripcion;

  // ✅ CAMBIO MÍNIMO CLAVE:
  // Completar claves nuevas aunque ya existan (p.ej. diagramas)
  out.views = { ...(base.views || {}), ...(out.views || {}) };
  out.features = { ...(base.features || {}), ...(out.features || {}) };
  out.pages = { ...(base.pages || {}), ...(out.pages || {}) };
  out.documentacion = { ...(base.documentacion || {}), ...(out.documentacion || {}) };
  out.prescripcion = { ...(base.prescripcion || {}), ...(out.prescripcion || {}) };

  // Si solo hay legacy, derivar pages mínimos
  if (caps && caps.views && (!caps.pages || typeof caps.pages !== "object")) {
    const pages = { ...(out.pages || {}) };
    Object.keys(caps.views).forEach((k) => {
      const allowed = !!caps.views[k];
      if (k === "tarifas") pages.tarifas = allowed ? "view" : "none";
      else if (k === "documentacion")
        pages.documentacion = allowed
          ? out.features?.docModo === "technical"
            ? "technical"
            : "commercial"
          : "none";
      else if (k === "prescripcion") pages.prescripcion = allowed ? "view" : "none";
      else pages[k] = allowed; // incluye diagramas
    });
    out.pages = { ...(base.pages || {}), ...pages };

    out.documentacion = out.documentacion || {};
    out.documentacion.exportTecnico = !!out.features?.docExportTecnico;

    out.prescripcion = out.prescripcion || {};
    out.prescripcion.templates = out.features?.prescTemplatesWrite ? "full" : "readOnly";
    out.prescripcion.extraRefs = out.features?.prescExtraRefsWrite ? "full" : "readOnly";
  }

  return out;
}

function isViewAllowed(viewKey) {
  const caps = appState?.user?.capabilities;
  if (!caps) return false;

  const v = _normalizeViewKey(viewKey);

  if (caps.pages && typeof caps.pages === "object") {
    const val = caps.pages[v];
    if (val === undefined || val === null) return false;
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val !== "none";
    return !!val;
  }

  if (caps.views && typeof caps.views === "object") {
    return !!caps.views[v];
  }

  return false;
}

function getFirstAllowedView() {
  const order = [
    "proyecto",
    "presupuesto",
    "simulador",
    "tarifa",
    "tarifas",
    "documentacion",
    "prescripcion",
    "diagramas", // ✅ NUEVO
    "docGestion",
    "usuarios",
  ];
  for (const v of order) if (isViewAllowed(v)) return v;
  return null;
}

// ==========================
// Firestore: cargar/crear user profile (con invitación)
// ==========================
async function ensureAndLoadUserProfile(firebaseUser) {
  const uid = firebaseUser.uid;
  const email = normalizeEmail(firebaseUser.email);

  if (!email) return null;

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();

  // EXISTE USER
  if (userSnap.exists) {
    const data = userSnap.data() || {};
    let role = String(data.role || "").toUpperCase();
    const active = data.active !== false;

    // Superadmin único por email
    if (role === "SUPER_ADMIN" && email !== SUPERADMIN_EMAIL) return null;

    if (!role) role = email === SUPERADMIN_EMAIL ? "SUPER_ADMIN" : "ACCOUNT_MANAGER";

    const capabilities = normalizeCapabilities(data.capabilities || null, role);

    try {
      await userRef.set(
        {
          email,
          role,
          capabilities,
          active,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (_) {}

    return { uid, email, role, capabilities, active };
  }

  // NO EXISTE USER: superadmin
  if (email === SUPERADMIN_EMAIL) {
    const role = "SUPER_ADMIN";
    const capabilities = normalizeCapabilities(null, role);

    await userRef.set(
      {
        uid,
        email,
        role,
        capabilities,
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { uid, email, role, capabilities, active: true };
  }

  // Invitación
  const invId = inviteIdFromEmail(email);
  const invRef = db.collection("invites").doc(invId);
  const invSnap = await invRef.get();

  if (!invSnap.exists) return null;

  const inv = invSnap.data() || {};
  const status = String(inv.status || "pending").toLowerCase();
  const invEmail = normalizeEmail(inv.email);

  if (invEmail && invEmail !== email) return null;
  if (status !== "pending") return null;

  const nowMs = Date.now();
  const exp = inv.expiresAt?.toDate ? inv.expiresAt.toDate().getTime() : null;
  if (!exp || exp < nowMs) {
    try {
      await invRef.set(
        {
          status: "expired",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (_) {}
    return null;
  }

  const role = String(inv.role || "ACCOUNT_MANAGER").toUpperCase();
  const capabilities = normalizeCapabilities(inv.capabilities || null, role);

  await userRef.set(
    {
      uid,
      email,
      role,
      capabilities,
      active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdFromInvite: invId,
    },
    { merge: true }
  );

  try {
    await invRef.set(
      {
        status: "used",
        usedAt: firebase.firestore.FieldValue.serverTimestamp(),
        usedByUid: uid,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (_) {}

  return { uid, email, role, capabilities, active: true };
}

// ==========================
// UI: aplicar visibilidad de pestañas
// ==========================
function applyNavVisibility() {
  const links = document.querySelectorAll(".top-nav-link[data-view]");
  links.forEach((a) => {
    const vRaw = a.getAttribute("data-view");
    if (!vRaw) return;

    const viewKey = _normalizeViewKey(vRaw);

    if (!appState.user) {
      a.style.display = "none";
      return;
    }

    a.style.display = isViewAllowed(viewKey) ? "" : "none";
  });

  _dedupeNavLinks();
}

// Fallback legacy
function selectView(viewName) {
  if (viewName === "proyecto" && typeof renderProyectoView === "function") {
    renderProyectoView();
  } else if (viewName === "presupuesto" && typeof renderPresupuestoView === "function") {
    renderPresupuestoView();
  } else if (viewName === "tarifa" && typeof renderTarifaView === "function") {
    renderTarifaView();
  } else if (viewName === "tarifas" && typeof renderTarifasView === "function") {
    renderTarifasView();
  } else if (viewName === "docs" && typeof renderDocumentacionView === "function") {
    renderDocumentacionView();
  } else if (viewName === "simulador" && typeof renderSimuladorView === "function") {
    renderSimuladorView();
  }

  document.querySelectorAll(".top-nav-link").forEach((el) => el.classList.remove("active"));
  const activeTab = document.querySelector(`.top-nav-link[data-view="${viewName}"]`);
  if (activeTab) activeTab.classList.add("active");
}

// API única: main.js puede llamar applyShellPermissions(caps)
function applyShellPermissions(capabilities = {}) {
  document.querySelectorAll(".top-nav-link[data-view]").forEach((el) => {
    const raw = el.dataset.view;
    const view = _normalizeViewKey(raw);

    let allowed = null;

    if (capabilities.pages && typeof capabilities.pages === "object") {
      allowed = capabilities.pages[view];
      if (typeof allowed === "string") allowed = allowed !== "none";
      else allowed = !!allowed;
    } else if (capabilities.views && typeof capabilities.views === "object") {
      allowed = !!capabilities.views[view];
    } else {
      allowed = false;
    }

    el.style.display = allowed ? "" : "none";
  });

  _dedupeNavLinks();
}
window.applyShellPermissions = applyShellPermissions;

// ==========================
// Inicializar shell (se llama tras login correcto)
// ==========================
function initShellUI() {
  const loginPage = document.getElementById("loginPage");
  const appShell = document.getElementById("appShell");
  const btnLogout = document.getElementById("btnLogout");

  if (!loginPage || !appShell) {
    console.error("Faltan loginPage o appShell en el HTML.");
    return;
  }

  loginPage.style.display = "none";
  appShell.style.display = "flex";

  // Badge usuario
  const userBadge = document.getElementById("userBadge");
  if (userBadge && appState.user?.email) {
    userBadge.textContent = `${appState.user.email} · ${appState.user.role || ""}`.trim();
  }

  // Logout
  if (btnLogout && !appState._logoutInited) {
    appState._logoutInited = true;
    btnLogout.addEventListener("click", async () => {
      try {
        // Reset de vista: nuevo inicio debe empezar en "proyecto"
        try {
          if (window.sessionStorage) window.sessionStorage.removeItem("presup2n_currentView");
        } catch (_) {}
        try {
          if (window.localStorage) window.localStorage.removeItem("presup2n_currentView");
          if (window.localStorage) window.localStorage.removeItem("presupuestos2n_last_view");
        } catch (_) {}

        appState.currentView = "proyecto";
        appState.pendingView = "proyecto";

        await auth.signOut();
      } catch (e) {
        console.error("Error al cerrar sesión:", e);
      }
    });
  }

  // Preferimos aplicar permisos con la función pública (v2/legacy)
  if (appState.user?.capabilities && typeof window.applyShellPermissions === "function") {
    window.applyShellPermissions(appState.user.capabilities);
  } else {
    applyNavVisibility();
  }
}

// ==========================
// AUTH GATE
// ==========================
function initAuthGate() {
  const loginPage = document.getElementById("loginPage");
  const appShell = document.getElementById("appShell");
  const loginError = document.getElementById("loginError");

  if (!loginPage || !appShell) return;

  loginPage.style.display = "flex";
  appShell.style.display = "none";

  if (typeof initLoginUI === "function") initLoginUI();

  function showLoginError(msg) {
    if (!loginError) return;
    loginError.textContent = msg;
    loginError.style.display = "flex";
  }

  auth.onAuthStateChanged(async (user) => {
    try {
      if (!user) {
        appState.user = null;
        appState.authReady = true;
        applyNavVisibility();
        loginPage.style.display = "flex";
        appShell.style.display = "none";
        return;
      }

      const profile = await ensureAndLoadUserProfile(user);

      if (!profile) {
        try {
          await auth.signOut();
        } catch (_) {}

        appState.user = null;
        appState.authReady = true;
        applyNavVisibility();
        loginPage.style.display = "flex";
        appShell.style.display = "none";
        showLoginError("Acceso no autorizado o invitación caducada/no existente.");
        return;
      }

      if (profile.active === false) {
        try {
          await auth.signOut();
        } catch (_) {}

        appState.user = null;
        appState.authReady = true;
        applyNavVisibility();
        loginPage.style.display = "flex";
        appShell.style.display = "none";
        showLoginError("Usuario desactivado.");
        return;
      }

      appState.user = profile;
      appState.authReady = true;

      initShellUI();

      // Si la vista actual no está permitida, saltar a la primera permitida
      const current = _normalizeViewKey(appState.currentView || "proyecto");
      if (typeof window.setCurrentView === "function") {
        if (!isViewAllowed(current)) {
          const fallback = getFirstAllowedView() || "proyecto";
          window.setCurrentView(fallback);
        }
      }
    } catch (e) {
      console.error("AuthGate error:", e);
      try {
        await auth.signOut();
      } catch (_) {}

      appState.user = null;
      appState.authReady = true;
      applyNavVisibility();
      loginPage.style.display = "flex";
      appShell.style.display = "none";
      showLoginError("Error de autenticación.");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initAuthGate();
});

console.log("%cUI Shell inicializada (ui_shell.js)", "color:#4f46e5; font-weight:600;");
