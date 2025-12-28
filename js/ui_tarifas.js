// js/ui_tarifas.js
// Pantalla de TIPOS DE TARIFA: descuentos no lineales por grupo (A/B/C/D)
// Firestore solo guarda la lógica de descuentos; el formato viene de plantillas Excel base.
// Los precios siempre salen de la tarifa PVP en Firestore (tarifas/v1/productos).

window.appState = window.appState || {};
appState.tarifasTipos = appState.tarifasTipos || {};
appState.tarifasTiposLoaded = appState.tarifasTiposLoaded || false;
appState.tarifasTipoSeleccionadoId =
  appState.tarifasTipoSeleccionadoId || null;

// ======================================================
// 0) TARIFAS OFICIALES BLOQUEADAS (NO EDIT / NO DELETE)
// ======================================================

const TARIFAS_BLOQUEADAS = ["ES_PVP", "ES_SUBD", "ES_BBD", "EN_SUBD", "EN_VAD"];

function esTarifaBloqueada(tipo) {
  const id = String(tipo?.id || "").trim();
  return TARIFAS_BLOQUEADAS.includes(id);
}

// ======================================================
// 1) CONFIGURACIÓN DE PLANTILLAS BASE (solo en código)
// ======================================================

const BASE_PLANTILLAS =
  "https://raw.githubusercontent.com/Deividgaston/Documentacion2N/main/plantillas/";

// Plantillas base oficiales (formato), NO lógica de descuentos.
// Cada template define solo el layout y qué columna es cada nivel de precio.
const TARIFA_TEMPLATES = {
  ES_PVP: {
    id: "ES_PVP",
    descripcion: "PVP Público ES",
    url: BASE_PLANTILLAS + "2N%20pricelist%202026_01%20ES%20EUR%20PVP.xlsx",
    hoja: "Price List",
    columnasPrecio: {
      msrp: 3, // única columna de precio
    },
  },

  ES_SUBD: {
    id: "ES_SUBD",
    descripcion: "Formato oficial ES SubD",
    url: BASE_PLANTILLAS + "2N%20pricelist%202026_01%20ES%20EUR%20SubD.xlsx",
    hoja: "Price List",
    columnasPrecio: {
      subd: 3,
      rp2: 4,
      rp1: 5,
      msrp: 6,
    },
  },

  ES_BBD: {
    id: "ES_BBD",
    descripcion: "Formato oficial ES BBD",
    url: BASE_PLANTILLAS + "2N%20pricelist%202026_01%20ES%20EUR%20BBD.xlsx",
    hoja: "Price List",
    columnasPrecio: {
      nfrDist: 3,
      nfrRes: 4,
      dist: 5,
      rp2: 6,
      rp1: 7,
      msrp: 8,
    },
  },

  EN_SUBD: {
    id: "EN_SUBD",
    descripcion: "Formato oficial EN SubD",
    url: BASE_PLANTILLAS + "2N%20pricelist%202026_01%20EN%20EUR%20SubD.xlsx",
    hoja: "Price List",
    columnasPrecio: {
      subd: 3,
      rp2: 4,
      rp1: 5,
      msrp: 6,
    },
  },

  EN_VAD: {
    id: "EN_VAD",
    descripcion: "Formato oficial EN VAD",
    url: BASE_PLANTILLAS + "2N%20pricelist%202026_01%20EN%20EUR%20VAD.xlsx",
    hoja: "Price List",
    columnasPrecio: {
      nfrDist: 3,
      nfrRes: 4,
      dist: 5,
      rp2: 6,
      rp1: 7,
      msrp: 8,
    },
  },
};

// ======================================================
// 2) GRUPOS A/B/C/D Y CAMPOS DE DESCUENTO
// ======================================================

// Campos de descuento que soporta el sistema.
// Se guardan como decimales (0.36, 0.28, etc.) en Firestore.
const DISCOUNT_FIELDS = [
  "nfrDist",
  "nfrRes",
  "dist",
  "vad", // <-- NUEVO: VAD MSRP (si no existe, se usará dist como fallback en export)
  "subd",
  "rp2",
  "rp1",
];

// Identificadores de grupo lógicos
const GRUPOS_IDS = ["GRUPO_A", "GRUPO_B", "GRUPO_C", "GRUPO_D"];

const GRUPOS_LABELS = {
  GRUPO_A: "Grupo A · Main units + licencias",
  GRUPO_B: "Grupo B · Accesorios",
  GRUPO_C: "Grupo C · Fortis / Indoor / clásicos",
  GRUPO_D: "Grupo D · My2N / repuestos",
};

// Paleta de color suave por grupo (para las celdas de precio en el Excel)
const GROUP_COLORS = {
  GRUPO_A: "FFF7ED", // naranja muy claro
  GRUPO_B: "ECFEFF", // cian muy claro
  GRUPO_C: "EEF2FF", // índigo muy claro
  GRUPO_D: "F9FAFB", // gris casi blanco
};

// Clasificación aproximada por descripción (tarifa base Firestore)
// Lo usamos para decidir a qué grupo pertenece un SKU.
const GROUP_PATTERNS = {
  GRUPO_D: [
    "my2n",
    "subscription",
    "suscripción",
    "spare part",
    "spare parts",
    "repuesto",
    "repuestos",
  ],
  GRUPO_C: [
    "fortis",
    "indoor view",
    "indoor touch",
    "indoor compact",
    "indoor talk",
    "indoor clip",
    "ip one",
    "ip uni",
    "ip base",
    "ip vario",
    "sip audio",
  ],
  GRUPO_B: [
    "accessory",
    "accessories",
    "accesorio",
    "accesorios",
    "installation accessory",
    "installation accessories",
    "power supply",
    "fuente de alimentación",
    "psu",
    "mounting frame",
    "mounting accessories",
    "flush box",
    "backplate",
    "frame",
  ],
  // GRUPO_A: resto
};

function clasificarGrupoPorDescripcion(descripcionRaw) {
  const desc = (descripcionRaw || "").toString().toLowerCase();
  if (!desc) return "GRUPO_A";

  for (const gid of ["GRUPO_D", "GRUPO_C", "GRUPO_B"]) {
    const patterns = GROUP_PATTERNS[gid] || [];
    if (patterns.some((p) => desc.includes(p))) return gid;
  }
  return "GRUPO_A";
}

// ======================================================
// 3) TIPOS DE TARIFA POR DEFECTO (semilla en Firestore)
// ======================================================

const DEFAULT_TIPOS_TARIFA = {
  ES_PVP: {
    id: "ES_PVP",
    nombre: "PVP Público ES",
    idioma: "ES",
    moneda: "EUR",
    templateId: "ES_PVP",
    grupos: {
      GRUPO_A: {},
      GRUPO_B: {},
      GRUPO_C: {},
      GRUPO_D: {},
    },
    activo: true,
    orden: 10,
  },

  ES_SUBD: {
    id: "ES_SUBD",
    nombre: "Subdistribuidor ES",
    idioma: "ES",
    moneda: "EUR",
    templateId: "ES_SUBD",
    grupos: {
      GRUPO_A: { subd: 0.36, rp2: 0.28, rp1: 0.1 },
      GRUPO_B: { subd: 0.235, rp2: 0.15, rp1: 0.05 },
      GRUPO_C: { subd: 0.335, rp2: 0.26, rp1: 0.1 },
      GRUPO_D: { subd: 0.19, rp2: 0.1, rp1: 0.1 },
    },
    activo: true,
    orden: 20,
  },

  ES_BBD: {
    id: "ES_BBD",
    nombre: "Broadline Distributor ES (BBD)",
    idioma: "ES",
    moneda: "EUR",
    templateId: "ES_BBD",
    grupos: {
      GRUPO_A: {
        nfrDist: 0.55,
        nfrRes: 0.5,
        dist: 0.39,
        rp2: 0.28,
        rp1: 0.1,
      },
      GRUPO_B: {
        nfrDist: 0.55,
        nfrRes: 0.5,
        dist: 0.25,
        rp2: 0.15,
        rp1: 0.05,
      },
      GRUPO_C: {
        nfrDist: 0.55,
        nfrRes: 0.5,
        dist: 0.35,
        rp2: 0.26,
        rp1: 0.1,
      },
      GRUPO_D: { nfrDist: 0, nfrRes: 0, dist: 0.2, rp2: 0.1, rp1: 0.1 },
    },
    activo: true,
    orden: 30,
  },

  EN_SUBD: {
    id: "EN_SUBD",
    nombre: "Subdistributor EN",
    idioma: "EN",
    moneda: "EUR",
    templateId: "EN_SUBD",
    grupos: {
      GRUPO_A: { subd: 0.36, rp2: 0.28, rp1: 0.1 },
      GRUPO_B: { subd: 0.235, rp2: 0.15, rp1: 0.05 },
      GRUPO_C: { subd: 0.335, rp2: 0.26, rp1: 0.1 },
      GRUPO_D: { subd: 0.19, rp2: 0.1, rp1: 0.1 },
    },
    activo: true,
    orden: 40,
  },

  EN_VAD: {
    id: "EN_VAD",
    nombre: "VAD EN",
    idioma: "EN",
    moneda: "EUR",
    templateId: "EN_VAD",
    grupos: {
      GRUPO_A: {
        nfrDist: 0.55,
        nfrRes: 0.5,
        dist: 0.42,
        rp2: 0.28,
        rp1: 0.1,
      },
      GRUPO_B: {
        nfrDist: 0.55,
        nfrRes: 0.5,
        dist: 0.28,
        rp2: 0.15,
        rp1: 0.05,
      },
      GRUPO_C: {
        nfrDist: 0.55,
        nfrRes: 0.5,
        dist: 0.38,
        rp2: 0.26,
        rp1: 0.1,
      },
      GRUPO_D: { nfrDist: 0, nfrRes: 0, dist: 0.2, rp2: 0.1, rp1: 0.1 },
    },
    activo: true,
    orden: 50,
  },
};

// Asegura que un objeto grupos tiene las 4 claves y solo campos permitidos
function normalizarGrupos(gruposRaw) {
  const grupos = gruposRaw && typeof gruposRaw === "object" ? gruposRaw : {};
  const result = {};
  GRUPOS_IDS.forEach((gid) => {
    const g = grupos[gid] && typeof grupos[gid] === "object" ? grupos[gid] : {};
    const limpio = {};
    DISCOUNT_FIELDS.forEach((f) => {
      const val = Number(g[f]);
      if (!isNaN(val) && val > 0) limpio[f] = val;
    });
    result[gid] = limpio;
  });
  return result;
}

// ======================================================
// 4) HELPERS FIRESTORE (tarifas_tipos)
// ======================================================

async function loadTarifasTiposFromFirestore() {
  if (appState.tarifasTiposLoaded) return appState.tarifasTipos;

  const db = firebase.firestore();
  const colRef = db.collection("tarifas_tipos");

  try {
    const snap = await colRef.get();
    const result = {};

    if (snap.empty) {
      const batch = db.batch();
      Object.values(DEFAULT_TIPOS_TARIFA).forEach((tipo) => {
        batch.set(colRef.doc(tipo.id), tipo, { merge: true });
        result[tipo.id] = {
          ...tipo,
          grupos: normalizarGrupos(tipo.grupos),
        };
      });
      await batch.commit();
    } else {
      snap.forEach((d) => {
        const data = d.data() || {};
        const id = data.id || d.id;
        const def = DEFAULT_TIPOS_TARIFA[id] || {};
        const merged = { ...def, ...data, id };
        merged.grupos = normalizarGrupos(merged.grupos);
        result[id] = merged;
      });

      Object.entries(DEFAULT_TIPOS_TARIFA).forEach(([id, def]) => {
        if (!result[id]) {
          result[id] = { ...def, grupos: normalizarGrupos(def.grupos) };
        }
      });
    }

    appState.tarifasTipos = result;
    appState.tarifasTiposLoaded = true;

    if (!appState.tarifasTipoSeleccionadoId) {
      const ids = Object.values(result)
        .sort((a, b) => (a.orden || 0) - (b.orden || 0))
        .map((t) => t.id);
      appState.tarifasTipoSeleccionadoId = ids[0] || null;
    }

    return result;
  } catch (err) {
    console.warn(
      "[Tarifas] No se ha podido leer Firestore, usando DEFAULT_TIPOS_TARIFA solo en memoria:",
      err
    );
    const fallback = {};
    Object.entries(DEFAULT_TIPOS_TARIFA).forEach(([id, def]) => {
      fallback[id] = { ...def, grupos: normalizarGrupos(def.grupos) };
    });
    appState.tarifasTipos = fallback;
    appState.tarifasTiposLoaded = true;

    if (!appState.tarifasTipoSeleccionadoId) {
      const ids = Object.values(fallback)
        .sort((a, b) => (a.orden || 0) - (b.orden || 0))
        .map((t) => t.id);
      appState.tarifasTipoSeleccionadoId = ids[0] || null;
    }

    return appState.tarifasTipos;
  }
}

async function guardarTarifaTipoEnFirestore(tipo) {
  if (!tipo || !tipo.id) return;
  const tipoGuardar = { ...tipo, grupos: normalizarGrupos(tipo.grupos) };

  try {
    const db = firebase.firestore();
    await db
      .collection("tarifas_tipos")
      .doc(tipoGuardar.id)
      .set(tipoGuardar, { merge: true });
    appState.tarifasTipos[tipoGuardar.id] = tipoGuardar;
  } catch (e) {
    console.warn(
      "[Tarifas] No se pudo guardar en Firestore, pero se mantiene en memoria:",
      e
    );
    appState.tarifasTipos[tipoGuardar.id] = tipoGuardar;
  }
}

async function borrarTarifaTipoEnFirestore(tipoId) {
  const id = String(tipoId || "").trim();
  if (!id) return;
  const tipo = appState.tarifasTipos?.[id];
  if (tipo && esTarifaBloqueada(tipo)) {
    alert("Esta tarifa es oficial y no se puede borrar.");
    return;
  }

  const ok = confirm("¿Borrar esta tarifa? Esta acción no se puede deshacer.");
  if (!ok) return;

  try {
    const db = firebase.firestore();
    await db.collection("tarifas_tipos").doc(id).delete();
    delete appState.tarifasTipos[id];

    if (appState.tarifasTipoSeleccionadoId === id) {
      appState.tarifasTipoSeleccionadoId = null;
      const ids = Object.values(appState.tarifasTipos || {})
        .sort((a, b) => (a.orden || 0) - (b.orden || 0))
        .map((t) => t.id);
      appState.tarifasTipoSeleccionadoId = ids[0] || null;
    }

    pintarListadoTiposTarifa();

    const det = document.getElementById("tarifasDetalle");
    if (det) {
      const sel = appState.tarifasTipoSeleccionadoId;
      if (sel && appState.tarifasTipos[sel]) mostrarFormularioTipoTarifa(appState.tarifasTipos[sel]);
      else det.innerHTML = "Selecciona un tipo en la lista.";
    }
  } catch (e) {
    console.error("[Tarifas] Error borrando tipo:", e);
    alert("Error borrando el tipo de tarifa. Revisa consola.");
  }
}

// ======================================================
// 5) TARIFA BASE (PVP) DESDE FIRESTORE
// ======================================================

// ✅ FIX ESTRICTO: leer RAW de /tarifas/v1/productos para NO perder campos con espacios (ej: "Ancho (mm)")
// (tu helper cargarTarifasDesdeFirestore() puede estar “limpiando”/filtrando campos y por eso salen vacíos)
async function cargarTarifasBaseRawDesdeFirestore(version = "v1") {
  const db = firebase.firestore();
  const col = db.collection("tarifas").doc(version).collection("productos");
  const snap = await col.get();

  const out = {};
  snap.forEach((doc) => {
    const data = doc.data() || {};
    const sku =
      String(
        data["2N SKU"] ??
          data.sku ??
          data.SKU ??
          data.referencia ??
          doc.id ??
          ""
      ).trim() || doc.id;

    out[sku] = { ...data, __docId: doc.id };
  });

  return out;
}

// ======================================================
// 5) TARIFA BASE (PVP) DESDE FIRESTORE (FULL DOCS + CACHE)
// ======================================================

async function getTarifasBase2N() {
  // ✅ Si hay cache, úsala SOLO si parece "completa"
  if (appState.tarifasCache) {
    const k0 = Object.keys(appState.tarifasCache)[0];
    const p0 = k0 ? appState.tarifasCache[k0] : null;

    // Heurística: si no hay ninguno de estos campos, es la cache "recortada"
    const looksFull =
      p0 &&
      (p0["Ancho (mm)"] !== undefined ||
        p0["Anchura (mm)"] !== undefined ||
        p0["EAN code"] !== undefined ||
        p0["HS code"] !== undefined ||
        p0["Página web"] !== undefined ||
        p0["Website"] !== undefined ||
        p0["Alto (mm)"] !== undefined ||
        p0["Altura (mm)"] !== undefined);

    if (looksFull) return appState.tarifasCache;
  }

  const db = firebase.firestore();

  try {
    const snap = await db
      .collection("tarifas")
      .doc("v1")
      .collection("productos")
      .get();

    const out = {};
    snap.forEach((d) => {
      const data = d.data() || {};
      const sku = String(data["2N SKU"] || data.sku || d.id || "").trim();
      if (!sku) return;

      const pvp =
        Number(
          data.pvp ??
            data.pvpEUR ??
            data["MSRP (EUR)"] ??
            data["MSRP(EUR)"] ??
            data.MSRP ??
            0
        ) || 0;

      out[sku] = { ...data, pvp };
    });

    appState.tarifasCache = out;
    return out;
  } catch (e) {
    console.warn("[Tarifas] Error leyendo tarifas/v1/productos:", e);
    if (typeof cargarTarifasDesdeFirestore === "function") {
      const legacy = await cargarTarifasDesdeFirestore();
      appState.tarifasCache = legacy || {};
      return appState.tarifasCache;
    }
    return {};
  }
}

// ======================================================
// 6) RENDER PANTALLA TARIFAS
// ======================================================

function renderTarifasView() {
  const container = document.getElementById("appContent");
  if (!container) return;

  container.innerHTML = `
    <div class="presupuesto-layout">

      <div class="presupuesto-left-column">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Tipos de tarifa</div>
              <div class="card-subtitle">
                Descuentos por grupo de producto (A/B/C/D) guardados en Firestore.
              </div>
            </div>
            <button id="btnNuevoTipoTarifa" class="btn btn-secondary btn-sm">Nuevo tipo</button>
          </div>
          <div class="card-body" id="tarifasLista">Cargando...</div>
        </div>
      </div>

      <div class="presupuesto-right-column">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Detalle del tipo</div>
          </div>
          <div class="card-body" id="tarifasDetalle">
            Selecciona un tipo en la lista.
          </div>
        </div>
      </div>

    </div>
  `;

  const btnNuevo = document.getElementById("btnNuevoTipoTarifa");
  const lista = document.getElementById("tarifasLista");

  if (btnNuevo) {
    btnNuevo.addEventListener("click", () => mostrarFormularioTipoTarifa(null));
  }

  loadTarifasTiposFromFirestore()
    .then(() => {
      pintarListadoTiposTarifa();
      const id = appState.tarifasTipoSeleccionadoId;
      if (id && appState.tarifasTipos[id]) {
        mostrarFormularioTipoTarifa(appState.tarifasTipos[id]);
      }
    })
    .catch((err) => {
      console.error("[Tarifas] Error cargando tipos:", err);
      if (lista) {
        lista.innerHTML = `
          <p style="font-size:0.85rem; color:#b91c1c;">
            Error cargando los tipos de tarifa.<br/>
            Detalle: ${err && err.message ? err.message : "desconocido"}
          </p>
        `;
      }
    });
}

// ======================================================
// 7) LISTADO TIPOS (con editar / borrar)
// ======================================================

function pintarListadoTiposTarifa() {
  const lista = document.getElementById("tarifasLista");
  if (!lista) return;

  const tipos = Object.values(appState.tarifasTipos || {}).sort(
    (a, b) => (a.orden || 0) - (b.orden || 0)
  );

  if (!tipos.length) {
    lista.innerHTML = `
      <p style="font-size:0.85rem; color:#6b7280;">
        No hay tipos de tarifa configurados.
      </p>
    `;
    return;
  }

  lista.innerHTML = `
    <style>
      .btn-icon{
        border:0; background:transparent; cursor:pointer;
        padding:2px 6px; font-size:14px; line-height:1;
      }
      .btn-icon:disabled{ opacity:.35; cursor:not-allowed; }
      .btn-icon:hover{ filter: brightness(0.95); }
      .actions-cell{ white-space:nowrap; text-align:right; width:80px; }
    </style>

    <table class="table">
      <thead>
        <tr>
          <th></th>
          <th>Tarifa</th>
          <th>Plantilla base</th>
          <th class="actions-cell"></th>
        </tr>
      </thead>
      <tbody>
        ${tipos
          .map((t) => {
            const tpl = TARIFA_TEMPLATES[t.templateId] || {};
            const bloqueada = esTarifaBloqueada(t);
            return `
              <tr class="tarifa-row ${
                t.id === appState.tarifasTipoSeleccionadoId ? "row-selected" : ""
              }" data-id="${t.id}">
                <td><span class="status-dot ${
                  t.activo !== false ? "bg-green" : "bg-gray"
                }"></span></td>
                <td>
                  <div style="font-weight:500; display:flex; gap:8px; align-items:center;">
                    <span>${t.nombre}</span>
                    ${
                      bloqueada
                        ? `<span style="font-size:0.72rem;color:#9ca3af;border:1px solid #e5e7eb;padding:1px 6px;border-radius:999px;">OFICIAL</span>`
                        : ""
                    }
                  </div>
                  <div style="font-size:0.75rem; color:#6b7280;">
                    ${t.id} · Idioma: ${t.idioma || "-"} · ${t.moneda || "EUR"}
                  </div>
                </td>
                <td style="font-size:0.8rem; color:#4b5563;">
                  ${tpl.descripcion || t.templateId || "-"}
                </td>
                <td class="actions-cell">
                  <button class="btn-icon btn-edit" data-id="${t.id}" title="Editar">✏️</button>
                  ${
                    bloqueada
                      ? `<button class="btn-icon btn-delete" data-id="${t.id}" title="Borrar" disabled>🗑️</button>`
                      : `<button class="btn-icon btn-delete" data-id="${t.id}" title="Borrar">🗑️</button>`
                  }
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  lista.querySelectorAll(".tarifa-row").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.id;
      appState.tarifasTipoSeleccionadoId = id;
      pintarListadoTiposTarifa();
      mostrarFormularioTipoTarifa(appState.tarifasTipos[id]);
    });
  });

  lista.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      appState.tarifasTipoSeleccionadoId = id;
      pintarListadoTiposTarifa();
      mostrarFormularioTipoTarifa(appState.tarifasTipos[id]);
    });
  });

  lista.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      await borrarTarifaTipoEnFirestore(id);
    });
  });
}

// ======================================================
// 8) FORMULARIO DETALLE / EDICIÓN (VERSIÓN COMPACTA)
// ======================================================

function mostrarFormularioTipoTarifa(tipoOriginal) {
  const detalle = document.getElementById("tarifasDetalle");
  if (!detalle) return;

  const esNuevo = !tipoOriginal;

  const tipo = tipoOriginal || {
    id: "",
    nombre: "",
    idioma: "ES",
    moneda: "EUR",
    templateId: "ES_SUBD",
    grupos: normalizarGrupos(null),
    activo: true,
    orden: 100,
  };

  const bloqueada = !esNuevo && esTarifaBloqueada(tipo);

  const opcionesTemplate = Object.values(TARIFA_TEMPLATES)
    .map(
      (tpl) => `
      <option value="${tpl.id}" ${tpl.id === tipo.templateId ? "selected" : ""}>
        ${tpl.id} · ${tpl.descripcion}
      </option>
    `
    )
    .join("");

  const exportType = tarifaTipoFromId(tipo.id || tipo.templateId || "");
  const showBC3 = !esNuevo && exportType === "PVP"; // BC3 SOLO PVP

  detalle.innerHTML = `
    <style>
      .tarifas-detalle-compact .form-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.5rem 1rem;
      }
      @media (max-width: 960px) {
        .tarifas-detalle-compact .form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 720px) {
        .tarifas-detalle-compact .form-grid { grid-template-columns: minmax(0, 1fr); }
      }
      .tarifas-detalle-compact .form-group { margin-bottom: 0.35rem; }
      .tarifas-detalle-compact .small-hint { font-size: 0.7rem; color: #6b7280; margin-top: 0.15rem; }
      .tarifas-detalle-compact .table-wrapper-compact {
        max-height: 260px; overflow: auto; border-radius: 0.5rem; border: 1px solid #e5e7eb;
        background: #f9fafb; padding: 0.25rem;
      }
      .tarifas-detalle-compact table.table { margin-bottom: 0; }
      .locked-note{
        margin-top: 8px;
        font-size: 0.78rem;
        color: #9ca3af;
      }
    </style>

    <div class="tarifas-detalle-compact">

      ${
        bloqueada
          ? `<div class="locked-note">Tarifa oficial: puedes verla y exportarla, pero no modificarla.</div>`
          : ""
      }

      <div class="form-grid">

        <div class="form-group">
          <label>ID tipo (único)</label>
          <input id="tipoId" type="text" value="${tipo.id}" ${
    esNuevo ? "" : "readonly"
  } />
          <p class="small-hint">Ej: ES_SUBD, ES_BBD, TARIFA_INSTALADOR_15</p>
        </div>

        <div class="form-group">
          <label>Nombre visible</label>
          <input id="tipoNombre" type="text" value="${tipo.nombre}" ${
    bloqueada ? "disabled" : ""
  } style="${bloqueada ? "background:#f3f4f6;color:#9ca3af;" : ""}" />
        </div>

        <div class="form-group">
          <label>Idioma</label>
          <select id="tipoIdioma" ${bloqueada ? "disabled" : ""} style="${
    bloqueada ? "background:#f3f4f6;color:#9ca3af;" : ""
  }">
            <option value="ES" ${tipo.idioma === "ES" ? "selected" : ""}>ES</option>
            <option value="EN" ${tipo.idioma === "EN" ? "selected" : ""}>EN</option>
          </select>
        </div>

        <div class="form-group">
          <label>Moneda</label>
          <input id="tipoMoneda" type="text" value="${tipo.moneda || "EUR"}" ${
    bloqueada ? "disabled" : ""
  } style="${bloqueada ? "background:#f3f4f6;color:#9ca3af;" : ""}" />
        </div>

        <div class="form-group">
          <label>Plantilla base</label>
          <select id="tipoTemplateId" ${bloqueada ? "disabled" : ""} style="${
    bloqueada ? "background:#f3f4f6;color:#9ca3af;" : ""
  }">${opcionesTemplate}</select>
          <p class="small-hint">Solo define el formato (columnas NFR/Dist/VAD/SubD/RP2/RP1/MSRP).</p>
        </div>

        <div class="form-group">
          <label>Orden</label>
          <input id="tipoOrden" type="number" value="${tipo.orden || 100}" ${
    bloqueada ? "disabled" : ""
  } style="${bloqueada ? "background:#f3f4f6;color:#9ca3af;" : ""}" />
        </div>

        <div class="form-group">
          <label>Activo</label>
          <label style="display:flex; align-items:center; gap:0.35rem;">
            <input id="tipoActivo" type="checkbox" ${
              tipo.activo !== false ? "checked" : ""
            } ${bloqueada ? "disabled" : ""} />
            <span style="font-size:0.8rem; ${bloqueada ? "color:#9ca3af;" : ""}">Disponible para exportar</span>
          </label>
        </div>

      </div>

      <div style="margin-top:0.8rem;">
        <h4 style="font-size:0.8rem; font-weight:600; margin-bottom:0.25rem;">Descuentos por grupo</h4>
        <p class="small-hint">
          Valores en % sobre PVP. Se aplican por grupo (A/B/C/D) y nivel (NFR, Dist, VAD, SubD, RP2, RP1).
        </p>

        <div class="table-wrapper-compact">
          <table class="table" style="font-size:0.76rem; min-width:100%;">
            <thead>
              <tr>
                <th>Grupo</th>
                ${DISCOUNT_FIELDS.map(
                  (f) => `<th style="text-align:right;">${f}</th>`
                ).join("")}
              </tr>
            </thead>
            <tbody>
              ${GRUPOS_IDS.map((gid) => {
                const g = (tipo.grupos && tipo.grupos[gid]) || {};
                return `
                <tr data-gid="${gid}">
                  <td style="white-space:nowrap;">${GRUPOS_LABELS[gid] || gid}</td>
                  ${DISCOUNT_FIELDS.map((f) => {
                    const val = typeof g[f] === "number" ? g[f] * 100 : "";
                    const lockedStyle = bloqueada
                      ? "background:#f3f4f6;color:#9ca3af;"
                      : "";
                    return `
                      <td style="text-align:right;">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="90"
                          class="input input-xs input-dto-grupo"
                          data-gid="${gid}"
                          data-field="${f}"
                          value="${val !== "" ? val : ""}"
                          ${bloqueada ? "disabled" : ""}
                          style="max-width:60px; text-align:right; ${lockedStyle}"
                        />
                      </td>
                    `;
                  }).join("")}
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div style="margin-top:0.8rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
        <button id="btnGuardarTipoTarifa" class="btn btn-primary btn-sm" ${
          bloqueada ? "disabled" : ""
        }>Guardar</button>
        ${
          !esNuevo
            ? `
              <button id="btnExportarTipoTarifaExcel" class="btn btn-secondary btn-sm">Exportar Excel</button>
              <button id="btnExportarTipoTarifaPDF" class="btn btn-secondary btn-sm">Exportar PDF</button>
              ${
                showBC3
                  ? `<button id="btnExportarTipoTarifaBC3" class="btn btn-secondary btn-sm">Exportar BC3 (Presto)</button>`
                  : ""
              }
            `
            : ""
        }
      </div>

      <div id="tarifasDetalleMsg" class="alert mt-3" style="display:none;"></div>
    </div>
  `;

  const btnGuardar = document.getElementById("btnGuardarTipoTarifa");
  const btnExcel = document.getElementById("btnExportarTipoTarifaExcel");
  const btnPDF = document.getElementById("btnExportarTipoTarifaPDF");
  const btnBC3 = document.getElementById("btnExportarTipoTarifaBC3");

  if (btnGuardar) {
    btnGuardar.addEventListener("click", async () => {
      if (bloqueada) {
        mostrarMsgTarifaDetalle(
          "Esta tarifa es oficial y no se puede modificar.",
          true
        );
        return;
      }

      const id = (document.getElementById("tipoId").value || "").trim();
      const nombre = (document.getElementById("tipoNombre").value || "").trim();
      const idioma = document.getElementById("tipoIdioma").value || "ES";
      const moneda = (document.getElementById("tipoMoneda").value || "EUR").trim();
      const templateId =
        document.getElementById("tipoTemplateId").value || "ES_SUBD";
      const orden = Number(document.getElementById("tipoOrden").value) || 100;
      const activo = !!document.getElementById("tipoActivo").checked;

      if (!id) {
        mostrarMsgTarifaDetalle("El ID del tipo de tarifa es obligatorio.", true);
        return;
      }
      if (!nombre) {
        mostrarMsgTarifaDetalle("El nombre visible es obligatorio.", true);
        return;
      }

      const grupos = normalizarGrupos(tipo.grupos);
      document.querySelectorAll(".input-dto-grupo").forEach((input) => {
        const gid = input.dataset.gid;
        const field = input.dataset.field;
        const val = Number(input.value);
        if (!gid || !field) return;
        if (!grupos[gid]) grupos[gid] = {};
        if (!isNaN(val) && val > 0) grupos[gid][field] = val / 100;
        else delete grupos[gid][field];
      });

      const nuevoTipo = {
        ...(tipoOriginal || {}),
        id,
        nombre,
        idioma,
        moneda,
        templateId,
        grupos,
        activo,
        orden,
      };

      try {
        await guardarTarifaTipoEnFirestore(nuevoTipo);
        appState.tarifasTipos[id] = nuevoTipo;
        appState.tarifasTipoSeleccionadoId = id;
        pintarListadoTiposTarifa();
        mostrarFormularioTipoTarifa(nuevoTipo);
        mostrarMsgTarifaDetalle("Tipo de tarifa guardado correctamente.", false);
      } catch (e) {
        console.error("[Tarifas] Error guardando tipo:", e);
        mostrarMsgTarifaDetalle("Error guardando el tipo de tarifa.", true);
      }
    });
  }

  if (btnExcel && !esNuevo)
    btnExcel.addEventListener("click", () => exportarTarifaExcel(tipo.id));
  if (btnPDF && !esNuevo)
    btnPDF.addEventListener("click", () => exportarTarifaPDF(tipo.id));
  if (btnBC3 && !esNuevo) {
    btnBC3.addEventListener("click", () => {
      const t = appState.tarifasTipos[tipo.id];
      const tType = tarifaTipoFromId(t?.id || t?.templateId || "");
      if (tType !== "PVP") {
        alert("BC3 solo está disponible si has seleccionado una tarifa PVP.");
        return;
      }
      exportarTarifaBC3(tipo.id);
    });
  }
}

function mostrarMsgTarifaDetalle(texto, esError) {
  const msg = document.getElementById("tarifasDetalleMsg");
  if (!msg) return;
  msg.style.display = "flex";
  msg.textContent = texto;
  msg.className = "alert mt-3 " + (esError ? "alert-error" : "alert-success");
}

// ======================================================
// EXPORT (modelo único + columnas dinámicas + ES/EN + BC3 solo PVP)
// ======================================================

function tarifaTipoFromId(idOrTpl) {
  const s = String(idOrTpl || "").toUpperCase();
  if (s.includes("PVP")) return "PVP";
  if (s.includes("SUBD")) return "SUBD";
  if (s.includes("BBD")) return "BBD";
  if (s.includes("VAD")) return "VAD";
  return "PVP";
}

function tarifasGetExportSpec(tipo) {
  const t = tipo || {};
  const lang = String(t.idioma || "").toUpperCase() === "EN" ? "EN" : "ES";
  const exportType = tarifaTipoFromId(t.id || t.templateId || "");

  const L =
    lang === "EN"
      ? {
          sku: "2N SKU",
          name: "Name",

          // precios
          msrp: "MSRP (EUR)",
          vadMsrp: "VAD MSRP (EUR)",
          subd: "SubD price (EUR)",
          nfrDist: "NFR Distributor Price (EUR)",
          nfrRes: "NFR Reseller Price (EUR)",
          dist: "Distributor Price (EUR)",
          rp2: "RP2 (EUR)",
          rp1: "RP1 (EUR)",

          // resto (solo títulos)
          note: "Note",
          w: "Width (mm)",
          h: "Height (mm)",
          d: "Depth (mm)",
          weight: "Weight (kg)",
          hs: "HS code",
          ean: "EAN code",
          website: "Website",
          eol: "EOL",
          eolReason: "End of sale reason",
        }
      : {
          sku: "2N SKU",
          name: "Nombre",

          // precios
          msrp: "MSRP (EUR)",
          vadMsrp: "VAD MSRP (EUR)",
          subd: "Precio SubD (EUR)",
          nfrDist: "NFR Distribuidor (EUR)",
          nfrRes: "NFR Reseller (EUR)",
          dist: "Precio Distribuidor (EUR)",
          rp2: "RP2 (EUR)",
          rp1: "RP1 (EUR)",

          // resto
          note: "Nota",
          w: "Ancho (mm)",
          h: "Alto (mm)",
          d: "Profundidad (mm)",
          weight: "Peso (kg)",
          hs: "HS code",
          ean: "EAN code",
          website: "Página web",
          eol: "EOL",
          eolReason: "Motivo de finalización de venta",
        };

  const base = [
    { key: "sku", header: L.sku, width: 12 },
    { key: "name", header: L.name, width: 45 },
  ];

  let priceCols = [];
  if (exportType === "PVP") {
    priceCols = [{ key: "msrp", header: L.msrp, width: 14, isMoney: true }];
  } else if (exportType === "SUBD") {
    priceCols = [
      { key: "subd", header: L.subd, width: 14, isMoney: true },
      { key: "rp2", header: L.rp2, width: 16, isMoney: true },
      { key: "rp1", header: L.rp1, width: 16, isMoney: true },
      { key: "msrp", header: L.msrp, width: 14, isMoney: true },
    ];
  } else if (exportType === "BBD") {
    priceCols = [
      { key: "nfrDist", header: L.nfrDist, width: 18, isMoney: true },
      { key: "nfrRes", header: L.nfrRes, width: 18, isMoney: true },
      { key: "dist", header: L.dist, width: 16, isMoney: true },
      { key: "rp2", header: L.rp2, width: 16, isMoney: true },
      { key: "rp1", header: L.rp1, width: 16, isMoney: true },
      { key: "msrp", header: L.msrp, width: 14, isMoney: true },
    ];
  } else if (exportType === "VAD") {
    priceCols = [
      { key: "nfrDist", header: L.nfrDist, width: 18, isMoney: true },
      { key: "nfrRes", header: L.nfrRes, width: 18, isMoney: true },
      { key: "vadMsrp", header: L.vadMsrp, width: 16, isMoney: true },
      { key: "rp2", header: L.rp2, width: 16, isMoney: true },
      { key: "rp1", header: L.rp1, width: 16, isMoney: true },
    ];
  } else {
    priceCols = [{ key: "msrp", header: L.msrp, width: 14, isMoney: true }];
  }

  // Técnicos SIEMPRE (Excel/PDF), en TODAS las tarifas
  const tech = [
    { key: "note", header: L.note, width: 25 },
    { key: "w", header: L.w, width: 10 },
    { key: "h", header: L.h, width: 10 },
    { key: "d", header: L.d, width: 12 },
    { key: "weight", header: L.weight, width: 10 },
    { key: "hs", header: L.hs, width: 12 },
    { key: "ean", header: L.ean, width: 16 },
    { key: "website", header: L.website, width: 25 },
    { key: "eol", header: L.eol, width: 8 },
    { key: "eolReason", header: L.eolReason, width: 28 },
  ];

  return {
    exportType,
    lang,
    columns: [...base, ...priceCols, ...tech],
  };
}

async function buildTarifaExportModel(tipo) {
  const tarifasBase = await getTarifasBase2N();
  const grupos = normalizarGrupos(tipo.grupos);
  const spec = tarifasGetExportSpec(tipo);

  const productos = Object.entries(tarifasBase || {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  function familiaDesdeSKU(sku, prod) {
    const name = (prod.descripcion || prod.desc || prod.Nombre || prod.name || "")
      .toLowerCase();
    if (name.includes("access unit")) return "Access Unit";
    if (
      name.includes("intercom") ||
      name.includes("verso") ||
      name.includes("ip style")
    )
      return "Videoporteros";
    if (name.includes("fortis")) return "Fortis";
    if (name.includes("indoor")) return "Indoor Units";
    if (name.includes("my2n")) return "Licencias My2N";
    return "Otros";
  }

  function pickFirst(obj, keys, fallback = "") {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "")
        return obj[k];
    }
    return fallback;
  }

  const filas = [];
  let familiaActual = null;

  for (const [sku, prod] of productos) {
    const fam = familiaDesdeSKU(sku, prod);
    if (fam !== familiaActual) {
      filas.push({ __section: true, sectionTitle: fam });
      familiaActual = fam;
    }

    const pvp = Number(
      prod.pvp ?? prod.pvpEUR ?? prod["MSRP (EUR)"] ?? prod.MSRP ?? 0
    );
    const desc =
      prod.descripcion ||
      prod.desc ||
      prod.Nombre ||
      prod.name ||
      prod["Nombre"] ||
      "";

    const gid = clasificarGrupoPorDescripcion(desc);
    const dto = grupos[gid] || {};

    // Precios desde PVP + descuentos del grupo
    const subd = pvp * (1 - (dto.subd || 0));
    const rp2 = pvp * (1 - (dto.rp2 || 0));
    const rp1 = pvp * (1 - (dto.rp1 || 0));
    const dist = pvp * (1 - (dto.dist || 0));
    const nfrDist = pvp * (1 - (dto.nfrDist || 0));
    const nfrRes = pvp * (1 - (dto.nfrRes || 0));
    const vadDto = dto.vad !== undefined ? dto.vad : dto.dist;
    const vadMsrp = pvp * (1 - (vadDto || 0));

    // Técnicos: soportar keys EXACTAS Firestore (con espacios/unidades) + variantes
    const note = pickFirst(prod, ["Nota", "Note", "nota", "note"], "");
    const w = pickFirst(
      prod,
      [
        "Ancho (mm)",
        "Anchura (mm)",
        "Width (mm)",
        "ancho",
        "anchura",
        "width",
        "Width",
      ],
      ""
    );
    const h = pickFirst(
      prod,
      [
        "Alto (mm)",
        "Altura (mm)",
        "Height (mm)",
        "alto",
        "altura",
        "height",
        "Height",
      ],
      ""
    );
    const d = pickFirst(
      prod,
      ["Profundidad (mm)", "Depth (mm)", "profundidad", "depth", "Depth"],
      ""
    );
    const weight = pickFirst(
      prod,
      ["Peso (kg)", "Weight (kg)", "peso", "weight", "Weight"],
      ""
    );
    const hs = pickFirst(prod, ["HS code", "hs", "hsCode", "hs_code", "hscode"], "");
    const ean = pickFirst(prod, ["EAN code", "ean", "eanCode", "ean_code"], "");
    const website = pickFirst(
      prod,
      ["Página web", "Pagina web", "Website", "website", "url"],
      ""
    );

    const eol = pickFirst(prod, ["EOL", "eol", "endOfLife", "end_of_life"], "");
    const eolReason = pickFirst(
      prod,
      [
        "Motivo de finalización de venta",
        "Motivo finalización de venta",
        "End of sale reason",
        "endOfSaleReason",
        "end_of_sale_reason",
        "eolReason",
      ],
      ""
    );

    filas.push({
      sku,
      name: desc,

      // precios
      msrp: pvp,
      subd,
      nfrDist,
      nfrRes,
      dist,
      vadMsrp,
      rp2,
      rp1,

      // técnicos
      note,
      w,
      h,
      d,
      weight,
      hs,
      ean,
      website,
      eol,
      eolReason,

      __groupId: gid,
    });
  }

  const fileBase = (tipo.nombre || tipo.id || "Tarifa").replace(
    /[\\/:*?"<>|]+/g,
    "_"
  );
  const fileName = `${fileBase}_${spec.exportType}_${spec.lang}`;

  return { tipo, spec, filas, fileName };
}

function colLetter(n1) {
  let n = n1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ===============================================
// EXPORTAR EXCEL (ExcelJS) con columnas dinámicas
// ===============================================
async function exportarTarifaExcel(tipoId) {
  const tipo = appState.tarifasTipos[tipoId];
  if (!tipo) return alert("Tipo de tarifa no encontrado.");

  const tarifasBase = await getTarifasBase2N();
  if (!tarifasBase || !Object.keys(tarifasBase).length) {
    alert("No se han encontrado productos en la tarifa base. Revisa la colección 'tarifas'.");
    return;
  }

  // yield para no bloquear el navegador
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));

  // ✅ evita objetos raros en ExcelJS (Timestamp, etc.)
  const safeCell = (v) => {
    if (v === undefined || v === null) return "";
    if (typeof v === "number") return isFinite(v) ? v : "";
    if (typeof v === "string") return v;
    if (typeof v === "boolean") return v;
    // Firestore Timestamp suele tener toDate()
    if (v && typeof v.toDate === "function") return v.toDate().toISOString();
    try { return String(v); } catch { return ""; }
  };

  try {
    const model = await buildTarifaExportModel(tipo);
    const { spec, filas, fileName } = model;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Price List");

    const COLOR_HEADER = "FF1BB1C7";
    const COLOR_HEADER_LIGHT = "FFE5E7EB";
    const COLOR_SECTION = "FFF3F4F6";

    const fontHeaderBig = { name: "Aptos Narrow", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    const fontHeader = { name: "Aptos Narrow", size: 11, bold: true, color: { argb: "FF000000" } };
    const fontSection = { name: "Aptos Narrow", size: 11, bold: true, color: { argb: "FF374151" } };
    const fontBody = { name: "Aptos Narrow", size: 10, color: { argb: "FF000000" } };
    const borderThin = {
      top: { style: "thin", color: { argb: "FFCCCCCC" } },
      left: { style: "thin", color: { argb: "FFCCCCCC" } },
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
      right: { style: "thin", color: { argb: "FFCCCCCC" } },
    };

    const totalCols = spec.columns.length;
    const lastCol = colLetter(totalCols);

    ws.mergeCells(`A1:${lastCol}1`);
    ws.getCell("A1").value = "2N Price List";
    ws.getCell("A1").font = fontHeaderBig;
    ws.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
    ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER } };

    ws.addRow([]);

    const headerRow = ws.addRow(spec.columns.map((c) => c.header));
    headerRow.eachCell((cell) => {
      cell.font = fontHeader;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_LIGHT } };
      cell.border = borderThin;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    ws.columns = spec.columns.map((c) => ({ key: c.key, width: c.width || 12 }));

    // ✅ CHUNK: evita que el navegador se “muera”
    const CHUNK = 80;
    for (let i = 0; i < filas.length; i += CHUNK) {
      const slice = filas.slice(i, i + CHUNK);

      for (const item of slice) {
        if (item.__section) {
          const row = ws.addRow([safeCell(item.sectionTitle)]);
          row.font = fontSection;
          row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_SECTION } };
          ws.mergeCells(`A${row.number}:${lastCol}${row.number}`);
          continue;
        }

        const rowData = {};
        spec.columns.forEach((c) => {
          rowData[c.key] = safeCell(item[c.key]);
        });

        const row = ws.addRow(rowData);
        const gid = item.__groupId || "GRUPO_A";
        const groupColor = GROUP_COLORS[gid] || null;

        row.eachCell((cell, colIdx) => {
          cell.font = fontBody;
          cell.border = borderThin;

          const colSpec = spec.columns[colIdx - 1];
          const isMoney = !!colSpec?.isMoney;

          if (isMoney) {
            cell.numFmt = "#,##0.00";
            cell.alignment = { horizontal: "right" };
            if (groupColor) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: groupColor } };
            }
          } else {
            cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
          }
        });
      }

      await yieldUI();
    }

    const bufOut = await wb.xlsx.writeBuffer();
    const blob = new Blob([bufOut], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    if (typeof saveAs === "function") saveAs(blob, `${fileName}.xlsx`);
    else downloadBlobFallback(blob, `${fileName}.xlsx`);
  } catch (e) {
    console.error("[Tarifas] Error exportando Excel:", e);
    alert("Error al generar la tarifa en Excel. Revisa consola (stacktrace).");
  }
}

// ===============================================
// EXPORTAR PDF (print) con columnas dinámicas
// ===============================================
async function exportarTarifaPDF(tipoId) {
  const tipo = appState.tarifasTipos[tipoId];
  if (!tipo) {
    alert("Tipo de tarifa no encontrado.");
    return;
  }

  const tarifasBase = await getTarifasBase2N();
  if (!tarifasBase || !Object.keys(tarifasBase).length) {
    alert(
      "No se han encontrado productos en la tarifa base. Revisa la colección 'tarifas'."
    );
    return;
  }

  try {
    const model = await buildTarifaExportModel(tipo);
    const { spec, filas, fileName } = model;

    const thead = spec.columns
      .map(
        (c) =>
          `<th style="border:1px solid #ddd;padding:6px;text-align:left;white-space:nowrap;">${escapeHtmlLite(
            c.header
          )}</th>`
      )
      .join("");

    const rowsHtml = filas
      .map((r) => {
        if (r.__section) {
          return `<tr>
            <td colspan="${spec.columns.length}" style="border:1px solid #ddd;padding:6px;background:#f3f4f6;font-weight:700;">
              ${escapeHtmlLite(r.sectionTitle)}
            </td>
          </tr>`;
        }

        const tds = spec.columns
          .map((c) => {
            const v = r[c.key] ?? "";
            const isMoney = !!c.isMoney;
            const txt =
              isMoney && typeof v === "number" && isFinite(v)
                ? v.toFixed(2)
                : String(v ?? "");
            return `<td style="border:1px solid #ddd;padding:6px;vertical-align:top;${
              isMoney ? "text-align:right;white-space:nowrap;" : ""
            }">${escapeHtmlLite(txt)}</td>`;
          })
          .join("");

        return `<tr>${tds}</tr>`;
      })
      .join("");

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtmlLite(fileName)}</title>
        </head>
        <body>
          <h3 style="margin:0 0 10px 0;font-family:Arial,sans-serif;">${escapeHtmlLite(
            fileName
          )}</h3>
          <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:10px;">
            <thead><tr>${thead}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <script>window.onload=function(){window.print();};</script>
        </body>
      </html>
    `;

    const w = window.open("", "_blank");
    if (!w) throw new Error("Pop-up bloqueado para imprimir PDF.");
    w.document.open();
    w.document.write(html);
    w.document.close();
  } catch (e) {
    console.error("[Tarifas] Error exportando PDF:", e);
    alert("Error al generar el PDF.");
  }
}

// ======================================================
// BC3 (Presto 8.8) — Tarifa de precios
// OBRA (root) = nombre tarifa
// CAPÍTULO = "2N"
// ARTÍCULOS = recursos (materiales) con qty=1
// ======================================================

function tarifasBc3FieldSafe(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-")
    .replace(/\u00B7/g, "-")
    .replace(/\u20AC/g, " EUR")
    .replace(/\|/g, " / ")
    .replace(/\\/g, " / ")
    .replace(/[ \t]+/g, " ")
    .trim();
}


function downloadBc3File(content, filename) {
  const bytes = encodeCP850(content);
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  if (typeof saveAs === "function") {
    saveAs(blob, filename || "export.bc3");
    return;
  }
  downloadBlobFallback(blob, filename || "export.bc3");
}

async function exportarTarifaBC3(tipoId) {
  const tipo = appState.tarifasTipos[tipoId];
  if (!tipo) return alert("Tipo de tarifa no encontrado.");

  const tType = tarifaTipoFromId(tipo.id || tipo.templateId || "");
  if (tType !== "PVP") {
    alert("BC3 solo está disponible si has seleccionado una tarifa PVP.");
    return;
  }

  const tarifasBase = await getTarifasBase2N();
  if (!tarifasBase || !Object.keys(tarifasBase).length) {
    alert("No se han encontrado productos en la tarifa base. Revisa la colección 'tarifas'.");
    return;
  }

  try {
    const model = await buildTarifaExportModel(tipo);
    const { filas, fileName } = model;

    const NL = "\r\n";
    const clean = tarifasBc3FieldSafe;

    const num2 = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? String(n.toFixed(2)).replace(",", ".") : "0.00";
    };
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? String(n).replace(",", ".") : "0";
    };

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const prestoDate = `${dd}${mm}${yy}`;

    const ROOT = "0##";      // obra
    const CHAPTER = "2N#";   // capítulo (partida)
    const CH_REF = "2N";     // referencia en ~D sin '#'

    const used = new Set();
    const emitC = (code, unit, desc, price, type = 0) => {
      const c = clean(code);
      if (!c || used.has(c)) return;
      used.add(c);
      // Formato como en prescripción (con '|' final)
      return `~C|${c}|${clean(unit || "Ud")}|${clean(desc || "")}|${num2(price)}|${prestoDate}|${type}|`;
    };

    let out = "";
    out += `~V|SOFT S.A.|FIEBDC-3/2002|Presupuestos2N|1.0||OEM|` + NL;
    out += `~K|\\2\\2\\3\\2\\2\\2\\2\\EUR\\|0|` + NL;

    // OBRA = nombre de la tarifa (lo que pedías)
    const obraName = clean(tipo.nombre || tipo.id || "Tarifa");
    out += emitC(ROOT, "", obraName, 0, 0) + NL;

    // Capítulo "2N"
    out += emitC(CHAPTER, "Ud", "2N", 0, 0) + NL;

    // Root -> capítulo (en ~D se referencia SIN '#')
    out += `~D|${ROOT}|${CH_REF}\\1\\1\\|` + NL;

    // Artículos como recursos (materiales) + descomposición del capítulo
    const refs = [];
    for (const r of filas) {
      if (r.__section) continue;

      const code = clean(String(r.sku || "").trim());
      if (!code) continue;

      const desc = clean(String(r.name || "").replace(/\r?\n/g, " ").trim());
      const price = Number(r.msrp || 0); // PVP
      const p = Number.isFinite(price) ? price : 0;

      // Recurso tipo 3
      out += emitC(code, "ud", desc, p, 3) + NL;

      // En precios: qty=1
      refs.push(`${code}\\1\\${num(1)}\\`);
    }

    if (refs.length) {
      out += `~D|${CHAPTER}|${refs.join("")}|` + NL;
    }

    downloadBc3File(out, `${fileName}.bc3`);
  } catch (e) {
    console.error("[Tarifas] Error exportando BC3:", e);
    alert("Error al generar el BC3.");
  }
}



// -------------------- utils (mínimos) --------------------

function escapeHtmlLite(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadBlobFallback(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download.bin";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}



// CP850 (OEM) encoder básico (suficiente para ES habitual). No mapeado => '?'

function prescBc3FieldSafe(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-")
    .replace(/\u00B7/g, "-")
    .replace(/\u20AC/g, " EUR")
    .replace(/\|/g, " / ")
    .replace(/\\/g, " / ")
    .replace(/[ \t]+/g, " ")
    .trim();
}


// Field safe (usa una sola, la de tarifas)
function tarifasBc3FieldSafe(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-")
    .replace(/\u00B7/g, "-")
    .replace(/\u20AC/g, " EUR")
    .replace(/\|/g, " / ")
    .replace(/\\/g, " / ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// Encoder CP850 (amplio, tipo Prescripción)
function encodeCP850(str) {
  const s = String(str ?? "").normalize("NFC");
  const map = {
    "Ç": 128, "ü": 129, "é": 130, "â": 131, "ä": 132, "à": 133, "å": 134, "ç": 135,
    "ê": 136, "ë": 137, "è": 138, "ï": 139, "î": 140, "ì": 141, "Ä": 142, "Å": 143,
    "É": 144, "æ": 145, "Æ": 146, "ô": 147, "ö": 148, "ò": 149, "û": 150, "ù": 151,
    "ÿ": 152, "Ö": 153, "Ü": 154, "ø": 155, "£": 156, "Ø": 157, "×": 158, "ƒ": 159,
    "á": 160, "í": 161, "ó": 162, "ú": 163, "ñ": 164, "Ñ": 165, "ª": 166, "º": 167,
    "¿": 168, "®": 169, "¬": 170, "½": 171, "¼": 172, "¡": 173, "«": 174, "»": 175,
    "Á": 181, "Â": 182, "À": 183, "©": 184, "¦": 185, "Ã": 198, "Í": 214, "Ó": 224,
    "Ú": 233, "€": 213,
  };

  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (code <= 127) out[i] = code;
    else if (map[ch] !== undefined) out[i] = map[ch];
    else out[i] = 63; // '?'
  }
  return out;
}

console.log(
  "%c[UI Tarifas cargada · export Excel/PDF/BC3 dinámico]",
  "color:#0ea5e9;"
);

window.renderTarifasView = renderTarifasView;
