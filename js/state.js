// state.js
// Estado global + carga/guardar en localStorage

window.appState = window.appState || {};

// ==========================
// KEYS
// ==========================
const PROYECTO_CACHE_KEY = "presupuestos2n_proyecto";
const PRESUPUESTO_CACHE_KEY = "presupuestos2n_presupuesto";
const TARIFA_CACHE_KEY = "presupuestos2n_tarifa";

// ==========================
// AUTH / USER (NUEVO)
// ==========================
appState.user = appState.user || null; // { uid, email, role, capabilities, active }
appState.authReady = appState.authReady || false;

// ==========================
// ESTADO INICIAL
// ==========================
appState.proyecto = appState.proyecto || {
  filas: [],
  archivoNombre: null,
  fechaImportacion: null,
  seccion: null,
  titulo: null,
};

appState.presupuesto = appState.presupuesto || {
  lineas: [],
  totales: {},
  nombreProyecto: "",
  cliente: "",
  fechaPresupuesto: null,
};

appState.tarifas = appState.tarifas || {
  data: null,
  lastLoaded: null,
};

// ==========================
// CARGA DESDE LOCALSTORAGE
// ==========================

(function loadProyecto() {
  try {
    const cached = localStorage.getItem(PROYECTO_CACHE_KEY);
    if (!cached) return;

    const data = JSON.parse(cached);

    if (data && Array.isArray(data.filas) && data.filas.length > 0) {
      // SOLO cargamos si realmente hay datos válidos
      appState.proyecto = data;
      console.log("%cProyecto restaurado desde cache", "color:#2563eb;");
    }
  } catch (e) {
    console.warn("Error cargando proyecto desde cache:", e);
  }
})();

(function loadPresupuesto() {
  try {
    const cached = localStorage.getItem(PRESUPUESTO_CACHE_KEY);
    if (!cached) return;

    const data = JSON.parse(cached);

    if (data && Array.isArray(data.lineas) && data.lineas.length > 0) {
      appState.presupuesto = data;
      console.log("%cPresupuesto restaurado desde cache", "color:#2563eb;");
    }
  } catch (e) {
    console.warn("Error cargando presupuesto desde cache:", e);
  }
})();

console.log("%cState inicializado (state.js)", "color:#10b981; font-weight:600;");
