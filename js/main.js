// js/main.js
// Router principal de vistas para Presupuestos 2N

window.appState = window.appState || {};
appState.currentView = appState.currentView || "proyecto";

const VIEW_STORAGE_KEY = "presup2n_currentView";

// ==============================
// Helpers storage
// ==============================

function _viewStorageGet(key) {
  try {
    const v = window.sessionStorage ? window.sessionStorage.getItem(key) : null;
    if (v !== null && v !== undefined) return v;
  } catch (_) {}
  try {
    const v2 = window.localStorage ? window.localStorage.getItem(key) : null;
    if (v2 !== null && v2 !== undefined) {
      try {
        if (window.sessionStorage) window.sessionStorage.setItem(key, v2);
        if (window.localStorage) window.localStorage.removeItem(key);
      } catch (_) {}
      return v2;
    }
  } catch (_) {}
  return null;
}

function _viewStorageSet(key, val) {
  try {
    if (window.sessionStorage) window.sessionStorage.setItem(key, val);
    else if (window.localStorage) window.localStorage.setItem(key, val);
  } catch (e) {
    try {
      if (window.localStorage) window.localStorage.setItem(key, val);
    } catch (_) {}
  }
}

// ==============================
// Helpers de router / UI
// ==============================

function _normalizeViewKey(viewKey) {
  if (viewKey === "docs") return "documentacion";
  if (viewKey === "docs-gestion") return "docGestion";
  return viewKey;
}

// ✅ NUEVO (cambio mínimo): compatibilidad con claves legacy en capabilities.pages
function _getCapsPageVal(pages, v) {
  if (!pages || typeof pages !== "object") return undefined;

  // clave “normal”
  let val = pages[v];

  if (val !== undefined && val !== null) return val;

  // fallbacks legacy
  if (v === "documentacion") {
    // a veces se guardó como "docs"
    val = pages.docs;
    if (val !== undefined && val !== null) return val;
    // por si alguien lo llamó "documentos"
    val = pages.documentos;
    if (val !== undefined && val !== null) return val;
  }

  if (v === "docGestion") {
    // distintas variantes vistas en proyectos
    val = pages["docs-gestion"];
    if (val !== undefined && val !== null) return val;

    val = pages.docsGestion;
    if (val !== undefined && val !== null) return val;

    val = pages.doc_gestion;
    if (val !== undefined && val !== null) return val;

    val = pages.docGestion;
    if (val !== undefined && val !== null) return val;
  }

  return undefined;
}

function _isViewAllowedSafe(viewKey) {
  const v = _normalizeViewKey(viewKey);
  const caps = appState?.user?.capabilities;
  if (!caps) return false;

  if (caps.pages && typeof caps.pages === "object") {
    // ✅ aquí aplicamos compatibilidad legacy
    const val = _getCapsPageVal(caps.pages, v);

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

// ✅ NUEVO: oculta/enseña links del topbar según permisos reales
function _applyNavVisibility() {
  if (!appState.authReady) return;

  document.querySelectorAll(".top-nav-link[data-view]").forEach((link) => {
    const v = _normalizeViewKey(link.getAttribute("data-view"));
    const ok = _isViewAllowedSafe(v);
    link.style.display = ok ? "" : "none";
  });
}

// ==============================
// 🔐 VALIDACIÓN DE INVITACIÓN (m2)
// ==============================

async function validateInviteIfNeeded(user) {
  if (!user?.email) return;
  if (appState._inviteValidated) return;

  try {
    const email = String(user.email).trim().toLowerCase();
    const inviteId = email.replace(/[^a-z0-9]/g, "_");

    const db =
      window.db ||
      (window.firebase?.firestore ? window.firebase.firestore() : null);
    if (!db) return;

    const ref = db.collection("invites").doc(inviteId);
    const snap = await ref.get();

    // Si no hay invitación, no molestamos (usuario normal)
    if (!snap.exists) {
      appState._inviteValidated = true;
      return;
    }

    const inv = snap.data() || {};
    const now = Date.now();
    const expMs = inv.expiresAt?.toMillis ? inv.expiresAt.toMillis() : null;

    // ✅ Si ya fue aceptada, NO expulses al usuario en refresh
    if (inv.status === "accepted") {
      appState._inviteValidated = true;
      return;
    }

    // 🔒 Si está desactivada, o expirada (y aún pendiente), sí bloqueamos
    const isActive = inv.active !== false; // por defecto true si no existe
    const isExpired = expMs && expMs < now;

    if (!isActive) throw new Error("invite_disabled");
    if (inv.status !== "pending") throw new Error("invite_not_pending");
    if (isExpired) throw new Error("invite_expired");

    // ✅ Primera vez: la marcamos como aceptada
    await ref.set(
      { status: "accepted", acceptedAt: window.firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    appState._inviteValidated = true;
  } catch (e) {
    console.warn("[INVITE] inválida:", e);
    alert("Tu invitación no es válida o ha caducado.");
    window.firebase?.auth && window.firebase.auth().signOut();
  }
}


// ==============================
// Router principal
// ==============================

function setCurrentView(viewKey) {
  viewKey = _normalizeViewKey(viewKey);

  if (!appState.authReady) {
    appState.pendingView = viewKey;
    _viewStorageSet(VIEW_STORAGE_KEY, viewKey);
    return;
  }

  if (appState.pendingView) {
    viewKey = _normalizeViewKey(appState.pendingView);
    appState.pendingView = null;
  }

  // ✅ ocultar/enseñar menú según permisos actuales
  _applyNavVisibility();

  // 🔒 Refuerzo explícito para TARIFA
  if (viewKey === "tarifa" && !_isViewAllowedSafe("tarifa")) {
    viewKey = "proyecto";
  }

  if (!_isViewAllowedSafe(viewKey)) {
    const order = [
      "proyecto",
      "presupuesto",
      "simulador",
      "tarifa",
      "tarifas",
      "documentacion",
      "prescripcion",
      "diagramas",      // ✅ NUEVO
      "docGestion",
      "usuarios",
    ];
    const fallback = order.find((k) => _isViewAllowedSafe(k));
    if (!fallback) return;
    viewKey = fallback;
  }

  appState.currentView = viewKey;
  _viewStorageSet(VIEW_STORAGE_KEY, viewKey);

  document.querySelectorAll(".top-nav-link[data-view]").forEach((link) => {
    const v = _normalizeViewKey(link.getAttribute("data-view"));
    link.classList.toggle("active", v === viewKey);
  });

  updateViewSubtitle(viewKey);
  renderViewByKey(viewKey);
}

function updateViewSubtitle(viewKey) {
  const el = document.getElementById("currentViewSubtitle");
  if (!el) return;

  const map = {
    proyecto: "Importa y gestiona el proyecto base desde Excel / Project Designer.",
    presupuesto: "Edita el presupuesto a partir del proyecto importado.",
    simulador: "Simula tarifas y descuentos sobre el presupuesto actual.",
    tarifa: "Consulta la tarifa PVP de 2N y añade partidas al presupuesto.",
    tarifas: "Gestiona los tipos de tarifa y descuentos avanzados.",
    documentacion: "Genera la memoria de calidades y documentación del proyecto.",
    prescripcion: "Vista de prescripción: resumen inteligente de documentación.",
    diagramas: "Genera diagramas de red a partir del proyecto (IA) y exporta a DXF.", // ✅ NUEVO
    docGestion: "Gestiona la documentación subida.",
    usuarios: "Configuración de usuarios y permisos.",
  };

  el.textContent = map[viewKey] || "";
}

function callIfFn(fnName) {
  if (typeof window[fnName] === "function") {
    window[fnName]();
    return true;
  }
  return false;
}

function renderViewByKey(viewKey) {
  viewKey = _normalizeViewKey(viewKey);
  if (!appState.authReady) return;
  if (!_isViewAllowedSafe(viewKey)) return;

  switch (viewKey) {
    case "proyecto": callIfFn("renderProyectoView"); break;
    case "presupuesto": callIfFn("renderPresupuestoView"); break;
    case "simulador": callIfFn("renderSimuladorView"); break;
    case "tarifa":
      if (!callIfFn("renderTarifaView")) callIfFn("renderTarifa2NView");
      break;
    case "tarifas":
      if (!callIfFn("renderTarifasView")) callIfFn("renderTarifasTiposView");
      break;
    case "documentacion": callIfFn("renderDocumentacionView"); break;
    case "prescripcion": callIfFn("renderDocPrescripcionView"); break;

    case "diagramas": // ✅ NUEVO
      callIfFn("renderDiagramasView");
      break;

    case "docGestion": callIfFn("renderDocGestionView"); break;
    case "usuarios": callIfFn("renderAdminUsersView"); break;
    default: callIfFn("renderProyectoView");
  }
}

function initTopbarNavigation() {
  if (appState._mainNavInited) return;
  appState._mainNavInited = true;

  document.querySelectorAll(".top-nav-link[data-view]").forEach((link) => {
    link.addEventListener("click", (ev) => {
      ev.preventDefault();
      setCurrentView(link.getAttribute("data-view"));
    });
  });
}

// ==============================
// Boot
// ==============================

document.addEventListener("DOMContentLoaded", () => {
  initTopbarNavigation();

  let initialView = _viewStorageGet(VIEW_STORAGE_KEY) || appState.currentView || "proyecto";
  initialView = _normalizeViewKey(initialView);

  appState.pendingView = initialView;
  appState.currentView = initialView;

  const start = Date.now();
  const t = setInterval(async () => {
    if (appState.authReady) {
      clearInterval(t);
      await validateInviteIfNeeded();
      _applyNavVisibility(); // ✅ también al entrar
      setCurrentView(appState.pendingView || initialView);
    }
    if (Date.now() - start > 15000) clearInterval(t);
  }, 200);
});

window.setCurrentView = setCurrentView;
window.renderViewByKey = renderViewByKey;
