// js/ui_presupuesto.js
// Generación del presupuesto a partir de los datos del proyecto y la tarifa

window.appState = window.appState || {};
appState.presupuesto = appState.presupuesto || {
  lineas: [],
  resumen: {},
  notas: "",
  sectionNotes: {},    // notas por sección
  extraSections: [],   // secciones manuales añadidas desde la UI
  sectionOrder: [],    // orden de secciones para drag & drop
  incluirIVA: true,
};

appState.tarifasCache = appState.tarifasCache || null; // cache de tarifas en memoria
appState.presupuestoFiltroRef = appState.presupuestoFiltroRef || "";
appState.presupuestoLineaEditIndex =
  typeof appState.presupuestoLineaEditIndex === "number"
    ? appState.presupuestoLineaEditIndex
    : null;

// === Clave para guardar en localStorage ===
const PRESUPUESTO_STORAGE_KEY = "presupuestos2n_presupuesto_v1";

// Datos de la empresa para el presupuesto (puedes cambiarlos aquí)
const COMPANY_INFO = {
  nombre: "2N TELEKOMUNIKACE a.s.",
  direccion: "Modřanská 621/143, 143 01 Praha 4, CZ",
  nif: "CZ26183960",
  telefono: "660204003",
  email: "gaston@2n.com",
};

console.log(
  "%cUI Presupuesto · versión EXPORT-EXCEL-PDF · IVA TEXT · EDIT-LINE · PERSIST · SF CSV",
  "color:#22c55e; font-weight:bold;"
);

// ===============================================
// Helpers de persistencia en localStorage
// ===============================================
function normalizarPresupuesto(obj) {
  const base = {
    lineas: [],
    resumen: {},
    notas: "",
    sectionNotes: {},
    extraSections: [],
    sectionOrder: [],
    incluirIVA: true,
    nombre: "",
    cliente: "",
    fecha: "",
  };
  if (!obj || typeof obj !== "object") return base;
  return Object.assign(base, obj);
}

function savePresupuestoToStorage() {
  try {
    const data = normalizarPresupuesto(appState.presupuesto);
    localStorage.setItem(PRESUPUESTO_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[Presupuesto] Error guardando en localStorage", e);
  }
}

function loadPresupuestoFromStorage() {
  try {
    const raw = localStorage.getItem(PRESUPUESTO_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return;
    appState.presupuesto = normalizarPresupuesto(data);
    console.log("%cPresupuesto cargado desde localStorage", "color:#22c55e;");
  } catch (e) {
    console.warn("[Presupuesto] Error leyendo de localStorage", e);
  }
}

// ===============================================
// Render de la vista de PRESUPUESTO
// ===============================================
function renderPresupuestoView() {
  // Si no hay nada en memoria, intenta cargar desde localStorage
  if (
    !appState.presupuesto ||
    (!appState.presupuesto.lineas ||
      !Array.isArray(appState.presupuesto.lineas))
  ) {
    loadPresupuestoFromStorage();
  }

  const container = document.getElementById("appContent");
  if (!container) return;

  container.innerHTML = `
    <div class="presupuesto-layout">

      <!-- COLUMNA IZQUIERDA -->
      <div class="presupuesto-left-column">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Datos del presupuesto</div>
              <div class="card-subtitle">
                Revisa los datos del proyecto, añade notas y genera el presupuesto.
              </div>
            </div>
            <span class="badge-step">Paso 2 de 3</span>
          </div>

          <div class="card-body">
            <div class="form-grid">

              <div class="form-group">
                <label>Nombre del proyecto</label>
                <input id="presuNombre" type="text" />
              </div>

              <div class="form-group">
                <label>Cliente (opcional)</label>
                <input id="presuCliente" type="text" />
              </div>

              <div class="form-group">
                <label>Fecha presupuesto</label>
                <input id="presuFecha" type="date" />
              </div>

              <div class="form-group">
                <label>Descuento global (%)</label>
                <input id="presuDto" type="number" min="0" max="90" value="0" />
              </div>
            </div>

            <div class="form-group mt-3">
              <label>Notas del presupuesto</label>
              <textarea id="presuNotas" rows="3"></textarea>
              <p style="font-size:0.78rem; color:#6b7280; margin-top:0.25rem;">
                Observaciones generales del suministro, exclusiones, requisitos, etc.
              </p>
            </div>

            <button id="btnGenerarPresupuesto" class="btn btn-primary w-full mt-3">
              Generar / Recalcular presupuesto
            </button>

            <div id="presuMsg" class="alert alert-success mt-3" style="display:none;">
              Presupuesto generado correctamente
            </div>
          </div>
        </div>

        <!-- RESUMEN -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Resumen económico</div>
          </div>
          <div class="card-body" id="presuResumen">
            No se ha generado todavía el presupuesto.
          </div>
        </div>
      </div>

      <!-- COLUMNA DERECHA -->
      <div class="presupuesto-right-column">
        <div class="card">
          <div class="card-header" style="display:flex; align-items:center; justify-content:space-between; gap:1rem;">
            <div class="card-title">
              Líneas del presupuesto
              <span id="presuLineCount" style="font-size:0.8rem; color:#6b7280; font-weight:400;">
                0 líneas cargadas desde el proyecto
              </span>
            </div>
            <div class="presu-header-actions" style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem;">
              <span>Filtro ref:</span>
              <input id="presuFiltroRef" type="text" class="input" style="width:130px;" />
              <button id="btnAddLinea" class="btn btn-secondary">Añadir línea</button>
              <button id="btnAddSection" class="btn btn-secondary">Añadir sección</button>
            </div>
          </div>

          <div class="card-body" id="presuDetalle">
            No hay líneas de presupuesto generadas.
          </div>
        </div>
      </div>

    </div>

    <!-- MODAL LÍNEA (Añadir / Editar) -->
    <div id="presuLineaOverlay" class="modal-overlay" style="display:none;">
      <div class="modal-card">
        <div class="modal-title" id="presuLineaModalTitle">Añadir línea al presupuesto</div>
        
        <div class="modal-text">
          <div class="form-group">
            <label>Sección</label>
            <input id="lineaSeccion" type="text" placeholder="Ej: CONTROL DE ACCESOS" />
          </div>

          <div class="form-group">
            <label>Título (opcional)</label>
            <input id="lineaTitulo" type="text" placeholder="Ej: Cerraduras electrónicas" />
          </div>

          <div class="form-group">
            <label>Referencia (opcional)</label>
            <div style="display:flex; gap:0.5rem;">
              <input id="lineaRef" type="text" style="flex:1;" placeholder="Ej: 9155101" />
              <button id="btnLineaBuscarRef" class="btn btn-secondary btn-sm">Buscar ref</button>
            </div>
            <p style="font-size:0.75rem; color:#6b7280; margin-top:0.25rem;">
              Si la referencia existe en la tarifa, se rellenarán automáticamente la descripción y el PVP.
            </p>
          </div>

          <div class="form-group">
            <label>Descripción</label>
            <textarea id="lineaDesc" rows="2" placeholder="Descripción del producto"></textarea>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label>Cantidad</label>
              <input id="lineaCantidad" type="number" min="1" value="1" />
            </div>
            <div class="form-group">
              <label>PVP unidad (€)</label>
              <input id="lineaPvp" type="number" min="0" step="0.01" value="0" />
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button id="btnLineaEliminar" class="btn btn-secondary btn-sm" style="display:none; margin-right:auto;">
            Eliminar línea
          </button>
          <button id="btnLineaCancelar" class="btn btn-secondary btn-sm">Cancelar</button>
          <button id="btnLineaGuardar" class="btn btn-primary btn-sm">Añadir línea</button>
        </div>
      </div>
    </div>
  `;

  // ==== LISTENERS ====
  const btnGenerar = document.getElementById("btnGenerarPresupuesto");
  if (btnGenerar) btnGenerar.addEventListener("click", generarPresupuesto);

  const btnAddSection = document.getElementById("btnAddSection");
  if (btnAddSection) btnAddSection.addEventListener("click", onAddManualSection);

  const btnAddLinea = document.getElementById("btnAddLinea");
  if (btnAddLinea) btnAddLinea.addEventListener("click", () => abrirModalLinea());

  // Filtro ref
  const filtroRefInput = document.getElementById("presuFiltroRef");
  if (filtroRefInput) {
    filtroRefInput.value = appState.presupuestoFiltroRef || "";
    filtroRefInput.addEventListener("input", () => {
      appState.presupuestoFiltroRef = filtroRefInput.value.trim().toLowerCase();
      const p = appState.presupuesto || {};
      if (p.lineas && p.lineas.length && p.resumen) {
        renderResultados(p.lineas, p.resumen.totalBruto, p.resumen.totalNeto, p.resumen.dto);
      }
    });
  }

  // Modal
  const overlay = document.getElementById("presuLineaOverlay");
  const btnCancelarLinea = document.getElementById("btnLineaCancelar");
  const btnGuardarLinea = document.getElementById("btnLineaGuardar");
  const btnBuscarRef = document.getElementById("btnLineaBuscarRef");
  const btnEliminarLinea = document.getElementById("btnLineaEliminar");

  if (btnCancelarLinea && overlay) {
    btnCancelarLinea.addEventListener("click", () => {
      appState.presupuestoLineaEditIndex = null;
      overlay.style.display = "none";
    });
  }

  if (btnGuardarLinea && overlay) {
    btnGuardarLinea.addEventListener("click", guardarLineaManual);
  }

  if (btnBuscarRef) {
    btnBuscarRef.addEventListener("click", autofillLineaDesdeTarifa);
  }

  if (btnEliminarLinea && overlay) {
    btnEliminarLinea.addEventListener("click", eliminarLineaManual);
  }

  precargarDatosProyecto();
  bindPresupuestoMetaInputs(); // <<< NUEVO: sincroniza nombre/cliente/fecha/notas al escribir

  // Si ya había un presupuesto en memoria, pintar directamente
  const presu = appState.presupuesto || {};
  if (presu.lineas && presu.lineas.length && presu.resumen) {
    renderResultados(
      presu.lineas,
      presu.resumen.totalBruto || 0,
      presu.resumen.totalNeto || 0,
      presu.resumen.dto || 0
    );
  }
}

// ===============================================
// Modal línea manual (añadir / editar)
// ===============================================
function abrirModalLinea(seccionPredefinida = null, indexEditar = null) {
  const overlay = document.getElementById("presuLineaOverlay");
  if (!overlay) return;

  const tituloEl = document.getElementById("presuLineaModalTitle");
  const btnGuardar = document.getElementById("btnLineaGuardar");
  const btnEliminar = document.getElementById("btnLineaEliminar");

  const presu = appState.presupuesto || {};
  const ult = presu.lineas && presu.lineas.length
    ? presu.lineas[presu.lineas.length - 1]
    : null;

  appState.presupuestoLineaEditIndex =
    typeof indexEditar === "number" ? indexEditar : null;

  if (appState.presupuestoLineaEditIndex !== null) {
    // MODO EDITAR
    const idx = appState.presupuestoLineaEditIndex;
    const linea = (presu.lineas || [])[idx];

    if (tituloEl) tituloEl.textContent = "Editar línea de presupuesto";
    if (btnGuardar) btnGuardar.textContent = "Guardar cambios";
    if (btnEliminar) btnEliminar.style.display = "inline-flex";

    document.getElementById("lineaSeccion").value = linea?.seccion || "";
    document.getElementById("lineaTitulo").value = linea?.titulo || "";
    document.getElementById("lineaRef").value = linea?.ref || "";
    document.getElementById("lineaDesc").value = linea?.descripcion || "";
    document.getElementById("lineaCantidad").value = linea?.cantidad || 1;
    document.getElementById("lineaPvp").value = linea?.pvp || 0;
  } else {
    // MODO AÑADIR
    if (tituloEl) tituloEl.textContent = "Añadir línea al presupuesto";
    if (btnGuardar) btnGuardar.textContent = "Añadir línea";
    if (btnEliminar) btnEliminar.style.display = "none";

    document.getElementById("lineaSeccion").value =
      seccionPredefinida || ult?.seccion || "";
    document.getElementById("lineaTitulo").value = ult?.titulo || "";
    document.getElementById("lineaRef").value = "";
    document.getElementById("lineaDesc").value = "";
    document.getElementById("lineaCantidad").value = "1";
    document.getElementById("lineaPvp").value = "0";
  }

  overlay.style.display = "flex";
}

// ===============================================
// Buscar producto en tarifa desde modal
// ===============================================
async function autofillLineaDesdeTarifa() {
  const refInput = document.getElementById("lineaRef");
  const descInput = document.getElementById("lineaDesc");
  const pvpInput = document.getElementById("lineaPvp");
  if (!refInput) return;

  const ref = refInput.value.trim();
  if (!ref) return;

  const producto = await buscarProductoEnTarifa(ref);
  if (!producto) {
    alert("No se ha encontrado esta referencia en la tarifa.");
    return;
  }

  if (producto.descripcion && !descInput.value) {
    descInput.value = producto.descripcion;
  }
  pvpInput.value = (Number(producto.pvp) || 0).toFixed(2);
}

// ===============================================
// Guardar línea manual (añadir o editar)
// ===============================================
async function guardarLineaManual() {
  const overlay = document.getElementById("presuLineaOverlay");

  const seccion =
    (document.getElementById("lineaSeccion").value || "").trim() ||
    "Sección manual";
  const titulo =
    (document.getElementById("lineaTitulo").value || "").trim();
  const refRaw =
    (document.getElementById("lineaRef").value || "").trim();
  const desc =
    (document.getElementById("lineaDesc").value || "").trim();
  const cantidad =
    Number(document.getElementById("lineaCantidad").value) || 0;
  const pvpVal =
    Number(document.getElementById("lineaPvp").value) || 0;

  if (!cantidad) {
    alert("La cantidad es obligatoria.");
    return;
  }

  let pvp = pvpVal;
  let descripcion = desc;

  if (!pvp && refRaw) {
    const prod = await buscarProductoEnTarifa(refRaw);
    if (prod) {
      pvp = Number(prod.pvp) || 0;
      if (!descripcion && prod.descripcion) descripcion = prod.descripcion;
    }
  }

  const ref = refRaw ? refRaw.replace(/\s+/g, "") : "-";
  const subtotal = pvp * cantidad;

  const presu = appState.presupuesto || { lineas: [], resumen: {} };
  presu.lineas = presu.lineas || [];

  const idxEdit = appState.presupuestoLineaEditIndex;

  if (typeof idxEdit === "number" && presu.lineas[idxEdit]) {
    // EDITAR
    const l = presu.lineas[idxEdit];
    l.ref = ref;
    l.descripcion = descripcion || refRaw || "Línea sin referencia";
    l.cantidad = cantidad;
    l.pvp = pvp;
    l.subtotal = subtotal;
    l.seccion = seccion;
    l.titulo = titulo;
  } else {
    // AÑADIR
    presu.lineas.push({
      ref,
      descripcion: descripcion || refRaw || "Línea sin referencia",
      cantidad,
      pvp,
      subtotal,
      seccion,
      titulo,
    });
  }

  appState.presupuestoLineaEditIndex = null;

  // Actualizar orden de secciones
  presu.sectionOrder = presu.sectionOrder || [];
  if (!presu.sectionOrder.includes(seccion)) {
    presu.sectionOrder.push(seccion);
  }

  // Recalcular resumen
  const dto = Number(document.getElementById("presuDto").value) || 0;
  let totalBruto = 0;

  presu.lineas.forEach((l) => {
    totalBruto += l.subtotal || l.pvp * l.cantidad || 0;
  });
  const factorDto = dto > 0 ? 1 - dto / 100 : 1;

  presu.resumen = {
    totalBruto,
    dto,
    totalNeto: totalBruto * factorDto,
  };

  appState.presupuesto = presu;
  savePresupuestoToStorage();

  renderResultados(
    presu.lineas,
    presu.resumen.totalBruto,
    presu.resumen.totalNeto,
    presu.resumen.dto
  );

  if (overlay) overlay.style.display = "none";
}

// ===============================================
// Eliminar línea desde el modal
// ===============================================
function eliminarLineaManual() {
  const overlay = document.getElementById("presuLineaOverlay");
  const presu = appState.presupuesto || {};
  presu.lineas = presu.lineas || [];

  const idx = appState.presupuestoLineaEditIndex;
  if (typeof idx !== "number" || !presu.lineas[idx]) {
    appState.presupuestoLineaEditIndex = null;
    if (overlay) overlay.style.display = "none";
    return;
  }

  if (!confirm("¿Seguro que deseas eliminar esta línea del presupuesto?")) {
    return;
  }

  presu.lineas.splice(idx, 1);
  appState.presupuestoLineaEditIndex = null;

  const dto = Number(document.getElementById("presuDto").value) || 0;
  let totalBruto = 0;
  presu.lineas.forEach((l) => {
    totalBruto += l.subtotal || l.pvp * l.cantidad || 0;
  });
  const factorDto = dto > 0 ? 1 - dto / 100 : 1;
  presu.resumen = {
    totalBruto,
    dto,
    totalNeto: totalBruto * factorDto,
  };

  appState.presupuesto = presu;
  savePresupuestoToStorage();

  renderResultados(
    presu.lineas,
    presu.resumen.totalBruto,
    presu.resumen.totalNeto,
    presu.resumen.dto
  );

  if (overlay) overlay.style.display = "none";
}

// ===============================================
// Precargar datos del proyecto
// ===============================================
function precargarDatosProyecto() {
  const p = appState.proyecto || {};
  const presu = normalizarPresupuesto(appState.presupuesto);

  document.getElementById("presuNombre").value =
    p.nombre || presu.nombre || "Proyecto sin nombre";
  document.getElementById("presuCliente").value =
    p.cliente || presu.cliente || "";
  document.getElementById("presuFecha").value =
    p.fecha || presu.fecha || new Date().toISOString().split("T")[0];
  document.getElementById("presuDto").value =
    presu.resumen?.dto || p.dto || 0;

  document.getElementById("presuNotas").value =
    presu.notas || p.notas || "Se requiere switch PoE para alimentación de equipos.";

  // Actualizar appState con posibles valores del proyecto
  appState.presupuesto = Object.assign(presu, {
    nombre: document.getElementById("presuNombre").value || "",
    cliente: document.getElementById("presuCliente").value || "",
    fecha: document.getElementById("presuFecha").value || "",
    notas: document.getElementById("presuNotas").value || "",
  });
}

// ===============================================
// Sincronizar nombre/cliente/fecha/notas al escribir
// ===============================================
function bindPresupuestoMetaInputs() { // <<< NUEVO
  const nombreEl = document.getElementById("presuNombre");
  const clienteEl = document.getElementById("presuCliente");
  const fechaEl = document.getElementById("presuFecha");
  const notasEl = document.getElementById("presuNotas");

  function sync() {
    const p = normalizarPresupuesto(appState.presupuesto);
    if (nombreEl) p.nombre = nombreEl.value || "";
    if (clienteEl) p.cliente = clienteEl.value || "";
    if (fechaEl) p.fecha = fechaEl.value || "";
    if (notasEl) p.notas = notasEl.value || "";
    appState.presupuesto = p;
    savePresupuestoToStorage();
  }

  if (nombreEl) nombreEl.addEventListener("input", sync);
  if (clienteEl) clienteEl.addEventListener("input", sync);
  if (fechaEl) fechaEl.addEventListener("change", sync);
  if (notasEl) notasEl.addEventListener("input", sync);

  sync(); // guarda el estado inicial coherente
}

// ===============================================
// Cargar tarifa desde Firestore con caché
// ===============================================
async function cargarTarifasDesdeFirestore() {
  if (appState.tarifasCache) {
    console.log("%cTarifa · desde caché", "color:#22c55e;");
    return appState.tarifasCache;
  }

  const db = firebase.firestore();
  const snap = await db
    .collection("tarifas")
    .doc("v1")
    .collection("productos")
    .get();

  const result = {};
  snap.forEach((d) => {
    const obj = d.data();
    const pvp = Number(obj.pvp) || 0;
    if (!pvp) return;

    result[d.id] = {
      pvp,
      descripcion:
        obj.descripcion || obj.desc || obj.nombre || obj.titulo || "",
    };
  });

  appState.tarifasCache = result;

  console.log(
    "%cTarifa cargada · " + Object.keys(result).length + " referencias",
    "color:#3b82f6;"
  );

  return result;
}

// ===============================================
// Helpers de referencia (NO truncar)  <<< FIX
// ===============================================
function normalizarRefKeep(refRaw) {
  return String(refRaw || "").trim().replace(/\s+/g, "");
}

function buildRefCandidates(refClean) {
  const c = [];
  if (refClean) c.push(refClean);

  // SOLO para buscar en tarifa (sin alterar lo que guardas/exportas)
  if (/^\d+$/.test(refClean)) {
    if (refClean.length === 7) {
      c.push(refClean + "0", refClean + "00");
    } else if (refClean.length === 8) {
      c.push(refClean.slice(0, 7));
    }
  }

  return [...new Set(c)];
}

// ===============================================
// Buscar referencia en tarifa  <<< FIX
// ===============================================
async function buscarProductoEnTarifa(refRaw) {
  const tarifas = await cargarTarifasDesdeFirestore();
  if (!tarifas) return null;

  const refClean = normalizarRefKeep(refRaw);
  if (!refClean) return null;

  const candidatos = buildRefCandidates(refClean);

  for (const c of candidatos) {
    if (tarifas[c]) return tarifas[c];
  }

  return null;
}

// ===============================================
// Generación del presupuesto completo desde PROYECTO
// ===============================================
async function generarPresupuesto() {
  const msg = document.getElementById("presuMsg");
  if (msg) msg.style.display = "none";

  const tarifas = await cargarTarifasDesdeFirestore();

  const proyecto = appState.proyecto || {};
  const lineasProyecto =
    (proyecto.lineas && proyecto.lineas.length
      ? proyecto.lineas
      : proyecto.filas) || [];

  console.log(
    "[Presupuesto] tarifas cargadas (reales):",
    Object.keys(tarifas).length
  );
  console.log("[Presupuesto] líneas de proyecto:", lineasProyecto.length);

  let lineasPresupuesto = [];
  let totalBruto = 0;

  for (const item of lineasProyecto) {
    if (!item) continue;

    const refCampo =
      item.ref ||
      item.referencia ||
      item.numeroPedido ||
      item["numero de pedido"] ||
      item["Número de pedido"] ||
      item.orderingNumber ||
      item["Ordering Number"];

    if (!refCampo) {
      console.warn("⚠ Línea sin referencia válida:", item);
      continue;
    }

    // <<< FIX: NO truncar nunca la referencia guardada/exportada
    const refOriginal = String(refCampo || "").trim();
    const ref = normalizarRefKeep(refOriginal);
    const candidatosUnicos = buildRefCandidates(ref);

    const cantidad =
      Number(item.cantidad) ||
      Number(item.qty) ||
      Number(item["Cantidad"]) ||
      Number(item["cantidad"]) ||
      1;

    if (!cantidad || cantidad <= 0) {
      console.warn("⚠ Cantidad inválida:", item);
      continue;
    }

    let pvp = 0;
    let descTarifa = "";

    for (const key of candidatosUnicos) {
      const prod = tarifas[key];
      if (prod && prod.pvp) {
        pvp = Number(prod.pvp) || 0;
        descTarifa = prod.descripcion || "";
        if (pvp) break;
      }
    }

    if (!pvp) {
      console.warn("⚠ Línea sin precio en tarifa", {
        refOriginal,
        refNormalizada: ref,
        candidatos: candidatosUnicos,
        cantidad,
        desc:
          item.descripcion ||
          item["Nombre del producto"] ||
          item.nombreProducto ||
          item.titulo,
      });
      continue;
    }

    const subtotal = pvp * cantidad;
    totalBruto += subtotal;

    const seccion =
      item.seccion ||
      item.section ||
      item.apartado ||
      item.grupo ||
      item["Sección"] ||
      item["SECCION"] ||
      item["Grupo"] ||
      item["Apartado"] ||
      "";

    const titulo =
      item.titulo ||
      item.title ||
      item.subseccion ||
      item["Título"] ||
      item["TITULO"] ||
      item.descripcionTitulo ||
      "";

    const descripcion =
      item.descripcion ||
      item["Nombre del producto"] ||
      item.nombreProducto ||
      item.titulo ||
      descTarifa ||
      "";

    lineasPresupuesto.push({
      ref, // <<< FIX: ref completa
      descripcion,
      cantidad,
      pvp,
      subtotal,
      seccion,
      titulo,
    });
  }

  const dto = Number(document.getElementById("presuDto").value) || 0;
  const factorDto = dto > 0 ? 1 - dto / 100 : 1;
  const totalNeto = totalBruto * factorDto;

  const notas = document.getElementById("presuNotas").value || "";

  const prevSectionNotes = appState.presupuesto.sectionNotes || {};
  const prevExtraSections = appState.presupuesto.extraSections || [];
  const incluirIVA =
    appState.presupuesto &&
    typeof appState.presupuesto.incluirIVA === "boolean"
      ? appState.presupuesto.incluirIVA
      : true;

  // Orden de secciones según aparecen
  const sectionOrder = [];
  lineasPresupuesto.forEach((l) => {
    const sec =
      l.seccion ||
      l.section ||
      l.apartado ||
      l.grupo ||
      l["Sección"] ||
      l["SECCION"] ||
      l["Grupo"] ||
      l["Apartado"] ||
      l.titulo ||
      l.title ||
      "Sin sección";
    if (!sectionOrder.includes(sec)) sectionOrder.push(sec);
  });

  appState.presupuesto = {
    lineas: lineasPresupuesto,
    resumen: {
      totalBruto,
      dto,
      totalNeto,
    },
    notas,
    nombre: document.getElementById("presuNombre").value || "",
    cliente: document.getElementById("presuCliente").value || "",
    fecha: document.getElementById("presuFecha").value || "",
    sectionNotes: prevSectionNotes,
    extraSections: prevExtraSections,
    sectionOrder,
    incluirIVA,
  };

  savePresupuestoToStorage();

  renderResultados(lineasPresupuesto, totalBruto, totalNeto, dto);

  if (msg) {
    msg.textContent = `Presupuesto generado: ${lineasPresupuesto.length} líneas con precio.`;
    msg.style.display = "flex";
  }
}

// ===============================================
// Añadir sección manual (solo notas / bloque)
// ===============================================
function onAddManualSection() {
  const nombre = prompt("Nombre de la nueva sección:");
  if (!nombre) return;

  const titulo = prompt("Título dentro de la sección (opcional):") || "";

  const presu = appState.presupuesto || {};
  presu.extraSections = presu.extraSections || [];

  presu.extraSections.push({
    id: Date.now().toString(),
    seccion: nombre,
    titulo,
    nota: "",
  });

  presu.sectionOrder = presu.sectionOrder || [];
  if (!presu.sectionOrder.includes(nombre)) {
    presu.sectionOrder.push(nombre);
  }

  appState.presupuesto = presu;
  savePresupuestoToStorage();

  if (presu.lineas && presu.resumen) {
    renderResultados(
      presu.lineas,
      presu.resumen.totalBruto || 0,
      presu.resumen.totalNeto || 0,
      presu.resumen.dto || 0
    );
  }
}

// ===============================================
// Pintar resultados en pantalla (detalle + resumen)
// ===============================================
function renderResultados(lineas, totalBruto, totalNeto, dto) {
  const detalle = document.getElementById("presuDetalle");
  const resumen = document.getElementById("presuResumen");
  const presu = appState.presupuesto || {};
  const sectionNotes = presu.sectionNotes || {};
  const extraSections = presu.extraSections || [];
  presu.sectionOrder = presu.sectionOrder || [];

  if (!detalle || !resumen) return;

  // Filtro actual
  const filtro = (appState.presupuestoFiltroRef || "").toLowerCase();

  const lineasFiltradas = filtro
    ? lineas.filter((l) => {
        const ref = String(l.ref || "").toLowerCase();
        const desc = String(l.descripcion || "").toLowerCase();
        const sec = String(l.seccion || "").toLowerCase();
        const tit = String(l.titulo || "").toLowerCase();
        return (
          ref.includes(filtro) ||
          desc.includes(filtro) ||
          sec.includes(filtro) ||
          tit.includes(filtro)
        );
      })
    : lineas;

  // Contador en cabecera
  const countLabel = document.getElementById("presuLineCount");
  if (countLabel) {
    countLabel.textContent = `${
      lineasFiltradas ? lineasFiltradas.length : 0
    } líneas cargadas desde el proyecto`;
  }

  if (!lineasFiltradas || lineasFiltradas.length === 0) {
    detalle.textContent = "No hay líneas de presupuesto generadas.";
    resumen.textContent = "No se ha generado todavía el presupuesto.";
    return;
  }

  // Agrupar por sección, guardando índice global de cada línea
  const seccionesMap = {};
  const todas = presu.lineas || [];

  lineasFiltradas.forEach((l) => {
    const sec =
      l.seccion ||
      l.section ||
      l.apartado ||
      l.grupo ||
      l["Sección"] ||
      l["SECCION"] ||
      l["Grupo"] ||
      l["Apartado"] ||
      l.titulo ||
      l.title ||
      "Sin sección";

    const idxGlobal = todas.indexOf(l);
    if (!seccionesMap[sec]) seccionesMap[sec] = [];
    seccionesMap[sec].push({ line: l, index: idxGlobal });
  });

  // Asegurar que todas las secciones están en el orden
  Object.keys(seccionesMap).forEach((sec) => {
    if (!presu.sectionOrder.includes(sec)) {
      presu.sectionOrder.push(sec);
    }
  });

  let htmlDetalle = `
    <table class="table">
      <thead>
        <tr>
          <th style="width:48px;">OK</th>
          <th>Ref.</th>
          <th>Sección</th>
          <th>Descripción</th>
          <th style="width:70px;">Ud.</th>
          <th style="width:90px;">PVP</th>
          <th style="width:110px;">Importe</th>
        </tr>
      </thead>
      <tbody>
  `;

  // Pintar secciones según sectionOrder
  presu.sectionOrder.forEach((sec) => {
    const lineasSec = seccionesMap[sec];
    if (!lineasSec || !lineasSec.length) return;

    let currentTitle = null;

    // Fila de sección (drag & drop)
    htmlDetalle += `
      <tr class="presu-section-row" data-section="${sec}" draggable="true">
        <td colspan="7"
          style="
            background:#eef2ff;
            font-weight:600;
            text-transform:uppercase;
            cursor:move;
            padding:6px 8px;
          ">
          <span style="margin-right:0.5rem;">↕</span>${sec}
        </td>
      </tr>
      <tr>
        <td colspan="7">
          <textarea
            class="section-note"
            data-section="${sec}"
            rows="2"
            style="width:100%; font-size:0.78rem; resize:vertical;"
            placeholder="Notas de la sección (opcional)"
          >${sectionNotes[sec] || ""}</textarea>
        </td>
      </tr>
    `;

    lineasSec.forEach((item) => {
      const l = item.line;
      const lineIndex = item.index;

      const tit =
        l.titulo ||
        l.title ||
        l.subseccion ||
        l["Título"] ||
        l["TITULO"] ||
        "";

      if (tit && tit !== currentTitle) {
        currentTitle = tit;
        htmlDetalle += `
          <tr>
            <td colspan="7" style="background:#f3f4f6; font-weight:500;">
              ${tit}
            </td>
          </tr>
        `;
      }

      const importe = l.subtotal || l.pvp * l.cantidad || 0;

      htmlDetalle += `
        <tr>
          <td>
            <input type="checkbox" class="presu-line-check" checked />
          </td>
          <td>
            <button
              type="button"
              class="presu-ref-link"
              data-line-index="${lineIndex}"
              style="all:unset; cursor:pointer; color:#2563eb; text-decoration:underline; font-size:0.85rem;">
              ${l.ref}
            </button>
          </td>
          <td>${sec}</td>
          <td>${l.descripcion}</td>
          <td>${l.cantidad}</td>
          <td>${l.pvp.toFixed(2)} €</td>
          <td>${importe.toFixed(2)} €</td>
        </tr>
      `;
    });
  });

  htmlDetalle += `
      </tbody>
    </table>
  `;

  // Secciones extra (solo notas)
  if (extraSections.length) {
    htmlDetalle += `
      <div style="border-top:1px solid #e5e7eb; margin-top:1rem; padding-top:1rem;">
        <div style="font-size:0.85rem; color:#6b7280; margin-bottom:0.5rem;">
          Secciones adicionales
        </div>
    `;

    extraSections.forEach((sec) => {
      htmlDetalle += `
        <div class="section-block" style="margin-bottom:1rem;">
          <div style="font-weight:600; font-size:0.9rem; margin-bottom:0.25rem;">
            ${sec.seccion}
          </div>
          ${
            sec.titulo
              ? `<div style="background:#f3f4f6; padding:0.25rem 0.5rem; font-size:0.8rem; margin-bottom:0.25rem;">
                  ${sec.titulo}
                 </div>`
              : ""
          }
          <div class="form-group">
            <label style="font-size:0.8rem; color:#6b7280;">Notas de la sección</label>
            <textarea class="section-note-extra" data-id="${sec.id}" rows="2"
              style="width:100%;">${sec.nota || ""}</textarea>
          </div>
        </div>
      `;
    });

    htmlDetalle += `</div>`;
  }

  detalle.innerHTML = htmlDetalle;

  // Sincronizar notas de sección
  const currentSectionNotes = (appState.presupuesto.sectionNotes = sectionNotes);

  detalle.querySelectorAll(".section-note").forEach((ta) => {
    ta.addEventListener("input", (e) => {
      const sec = e.target.dataset.section;
      currentSectionNotes[sec] = e.target.value;
      savePresupuestoToStorage();
    });
  });

  detalle.querySelectorAll(".section-note-extra").forEach((ta) => {
    ta.addEventListener("input", (e) => {
      const id = e.target.dataset.id;
      const p2 = appState.presupuesto || {};
      p2.extraSections = p2.extraSections || [];
      const found = p2.extraSections.find((s) => s.id === id);
      if (found) found.nota = e.target.value;
      savePresupuestoToStorage();
    });
  });

  // Drag & drop secciones
  inicializarDragSecciones();

  // Click en referencia -> editar línea
  detalle.querySelectorAll(".presu-ref-link").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.currentTarget.dataset.lineIndex);
      if (Number.isNaN(idx)) return;
      abrirModalLinea(null, idx);
    });
  });

  // Escuchar cambios en checkboxes para recalcular resumen
  detalle.querySelectorAll(".presu-line-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      recalcularResumenDesdeSeleccion(lineasFiltradas, dto);
    });
  });

  // Cálculo inicial
  recalcularResumenDesdeSeleccion(lineasFiltradas, dto);
}

// ===============================================
// Drag & Drop de secciones (reordenar bloques)
// ===============================================
function inicializarDragSecciones() {
  const presu = appState.presupuesto || {};
  presu.sectionOrder = presu.sectionOrder || [];

  const rows = document.querySelectorAll(".presu-section-row");
  if (!rows.length) return;

  let dragSrcSection = null;

  rows.forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      dragSrcSection = row.dataset.section;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      row.classList.add("drag-over");
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });

    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const targetSection = row.dataset.section;
      if (!dragSrcSection || dragSrcSection === targetSection) return;

      const order = presu.sectionOrder || [];
      const srcIdx = order.indexOf(dragSrcSection);
      const tgtIdx = order.indexOf(targetSection);
      if (srcIdx === -1 || tgtIdx === -1) return;

      const [moved] = order.splice(srcIdx, 1);
      order.splice(tgtIdx, 0, moved);

      presu.sectionOrder = order;
      appState.presupuesto = presu;
      savePresupuestoToStorage();

      const p = appState.presupuesto;
      renderResultados(
        p.lineas,
        p.resumen.totalBruto || 0,
        p.resumen.totalNeto || 0,
        p.resumen.dto || 0
      );
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
    });
  });
}

// ===============================================
// Recalcular resumen económico según selección
// + botones de exportar
// ===============================================
function recalcularResumenDesdeSeleccion(lineasVisibles, dto) {
  const resumen = document.getElementById("presuResumen");
  const detalle = document.getElementById("presuDetalle");
  if (!resumen || !detalle) return;

  const checks = detalle.querySelectorAll(".presu-line-check");

  let totalBrutoSel = 0;
  let lineasSel = 0;

  lineasVisibles.forEach((l, idx) => {
    const cb = checks[idx];
    if (!cb || !cb.checked) return;
    const importe = l.subtotal || l.pvp * l.cantidad || 0;
    totalBrutoSel += importe;
    lineasSel += 1;
  });

  const presu = appState.presupuesto || {};
  const incluirIVA =
    typeof presu.incluirIVA === "boolean" ? presu.incluirIVA : true;

  const factorDto = dto > 0 ? 1 - dto / 100 : 1;
  const subtotal = totalBrutoSel * factorDto;
  const iva = incluirIVA ? subtotal * 0.21 : 0;
  const totalConIva = subtotal + iva;

  const textoIVAEstado = incluirIVA
    ? "Este presupuesto muestra el TOTAL con IVA (21%) incluido."
    : "Este presupuesto muestra el TOTAL sin IVA. El IVA se añadirá aparte en la factura.";

  const leyendaValidez =
    "Este presupuesto tiene una validez de 60 días desde la fecha de emisión, salvo indicación contraria por escrito.";

  resumen.innerHTML = `
    <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem; flex-wrap:wrap;">
      <button id="btnExportExcel" class="btn btn-secondary btn-sm">Exportar a Excel</button>
      <button id="btnExportPDF" class="btn btn-primary btn-sm">Exportar a PDF</button>
      <button id="btnExportSalesforce" class="btn btn-secondary btn-sm">Exportar Salesforce</button>
    </div>

    <div class="metric-card">
      <span class="metric-label">SUBTOTAL (base imponible)</span>
      <span class="metric-value">${subtotal.toFixed(2)} €</span>
    </div>

    <div class="metric-card">
      <span class="metric-label">IVA 21%</span>
      <span class="metric-value">${iva.toFixed(2)} €</span>
    </div>

    <div class="metric-card">
      <span class="metric-label">TOTAL</span>
      <span class="metric-value">${totalConIva.toFixed(2)} €</span>
    </div>

    <div class="form-group" style="margin-top:0.75rem; font-size:0.8rem;">
      <label style="display:flex; align-items:center; gap:0.35rem; cursor:pointer;">
        <input type="checkbox" id="presuIncluirIVA" ${
          incluirIVA ? "checked" : ""
        } />
        Incluir IVA (21%) en el total mostrado
      </label>
      <p style="margin-top:0.25rem; color:#4b5563;">
        <strong>${textoIVAEstado}</strong>
      </p>
    </div>

    <p style="font-size:0.8rem; color:#6b7280; margin-top:0.5rem;">
      Líneas seleccionadas: <strong>${lineasSel}</strong><br/>
      Total bruto sin descuento (seleccionadas): <strong>${totalBrutoSel.toFixed(
        2
      )} €</strong> ·
      Descuento global aplicado: <strong>${dto}%</strong>
    </p>

    <p style="font-size:0.8rem; color:#4b5563; margin-top:0.5rem;">
      ${leyendaValidez}
    </p>
  `;

  // Checkbox IVA -> actualizar estado y recalcular
  const chkIVA = document.getElementById("presuIncluirIVA");
  if (chkIVA) {
    chkIVA.addEventListener("change", (e) => {
      const presu2 = appState.presupuesto || {};
      presu2.incluirIVA = !!e.target.checked;
      appState.presupuesto = presu2;
      savePresupuestoToStorage();
      recalcularResumenDesdeSeleccion(lineasVisibles, dto);
    });
  }

  // Botones exportar
  const btnExcel = document.getElementById("btnExportExcel");
  const btnPDF = document.getElementById("btnExportPDF");
  const btnSF = document.getElementById("btnExportSalesforce");
  if (btnExcel) btnExcel.addEventListener("click", exportarPresupuestoExcel);
  if (btnPDF) btnPDF.addEventListener("click", exportarPresupuestoPDF);
  if (btnSF) btnSF.addEventListener("click", exportarPresupuestoSalesforce);
}

// ===============================================
// EXPORTAR A EXCEL (XLSX) – con ExcelJS y estilos
// ===============================================
async function exportarPresupuestoExcel() {
  const presu = appState.presupuesto || {};
  if (!presu.lineas || !presu.lineas.length) {
    alert("No hay líneas de presupuesto para exportar.");
    return;
  }

  if (!window.ExcelJS || !window.saveAs) {
    alert(
      "No se ha podido cargar ExcelJS o FileSaver. Revisa que están incluidos como en la página de Tarifas."
    );
    return;
  }

  const fechaHoy = presu.fecha || new Date().toISOString().split("T")[0];
  const nombreProyecto = presu.nombre || "Proyecto sin nombre";
  const cliente = presu.cliente || "";

  const incluirIVA =
    typeof presu.incluirIVA === "boolean" ? presu.incluirIVA : true;
  const dto = presu.resumen?.dto || 0;

  // Totales sobre TODAS las líneas
  let totalBruto = 0;
  presu.lineas.forEach((l) => {
    totalBruto += l.subtotal || l.pvp * l.cantidad || 0;
  });
  const factorDto = dto > 0 ? 1 - dto / 100 : 1;
  const base = totalBruto * factorDto;
  const iva = incluirIVA ? base * 0.21 : 0;
  const total = base + iva;

  const textoIVAEstado = incluirIVA
    ? "Este presupuesto incluye IVA (21%) en el total indicado."
    : "Este presupuesto NO incluye IVA. El IVA se añadirá aparte según la legislación vigente.";

  const textoValidez =
    "Este presupuesto tiene una validez de 60 días desde la fecha de emisión, salvo indicación contraria por escrito.";

  // ====== NOTAS POR SECCIÓN (igual que en PDF/Excel antiguo) ======
  const sectionNotes = presu.sectionNotes || {};
  const extraSections = presu.extraSections || [];
  const sectionOrder = presu.sectionOrder || [];

  const notasSecciones = [];

  if (sectionOrder && sectionOrder.length) {
    sectionOrder.forEach((sec) => {
      const txt = (sectionNotes[sec] || "").trim();
      if (txt) {
        notasSecciones.push({ seccion: sec, nota: txt });
      }
    });
  }

  Object.keys(sectionNotes || {}).forEach((sec) => {
    if (sectionOrder && sectionOrder.includes && sectionOrder.includes(sec))
      return;
    const txt = (sectionNotes[sec] || "").trim();
    if (txt) {
      notasSecciones.push({ seccion: sec, nota: txt });
    }
  });

  (extraSections || []).forEach((sec) => {
    if (!sec) return;
    const txt = (sec.nota || "").trim();
    if (!txt) return;
    const titulo =
      sec.seccion ||
      sec.titulo ||
      sec.nombre ||
      (sec.id ? `Sección extra ${sec.id}` : "Sección extra");
    notasSecciones.push({ seccion: titulo, nota: txt });
  });

  // ====== AGRUPAR LÍNEAS POR SECCIÓN (como antes) ======
  const seccionesOrden = presu.sectionOrder || [];
  const mapSec = {};
  presu.lineas.forEach((l) => {
    const sec =
      l.seccion ||
      l.section ||
      l.apartado ||
      l.grupo ||
      l["Sección"] ||
      l["SECCION"] ||
      l["Grupo"] ||
      l["Apartado"] ||
      l.titulo ||
      l.title ||
      "Sin sección";
    if (!mapSec[sec]) mapSec[sec] = [];
    mapSec[sec].push(l);
  });

  // ==========================
  // CREAR LIBRO CON EXCELJS
  // ==========================
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Presupuesto 2N");

  // Colores / fuentes IGUAL que en Tarifas
  const COLOR_PRIMARY = "FF1BB1C7"; // azul 2N cabecera
  const COLOR_SECTION = "FFF3F4F6"; // gris suave para secciones
  const COLOR_TABLE_HEADER = "FFE5F3F7"; // cabecera tabla

  const fontHeaderBig = {
    name: "Aptos Narrow",
    size: 13,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  const fontHeader = {
    name: "Aptos Narrow",
    size: 11,
    bold: true,
    color: { argb: "FF000000" },
  };
  const fontSection = {
    name: "Aptos Narrow",
    size: 11,
    bold: true,
    color: { argb: "FF374151" },
  };
  const fontBody = {
    name: "Aptos Narrow",
    size: 10,
    color: { argb: "FF000000" },
  };
  const borderThin = {
    top: { style: "thin", color: { argb: "FFCCCCCC" } },
    left: { style: "thin", color: { argb: "FFCCCCCC" } },
    bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    right: { style: "thin", color: { argb: "FFCCCCCC" } },
  };

  // Anchos de columna (similar a la versión XLSX antigua)
  ws.columns = [
    { key: "c1", width: 18 }, // Sección / etiquetas
    { key: "c2", width: 28 }, // Título / valor
    { key: "c3", width: 14 }, // Ref
    { key: "c4", width: 50 }, // Descripción
    { key: "c5", width: 10 }, // Cantidad
    { key: "c6", width: 14 }, // PVP
    { key: "c7", width: 16 }, // Importe
  ];

  const emptyRow = () => ws.addRow([]);

  const addInfoRow = (label, value) => {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = fontHeader;
    r.getCell(2).font = fontBody;
    return r;
  };

  // ====== CABECERA PRINCIPAL ======
  const titleRow = ws.addRow([
    "PRESUPUESTO VIDEO PORTERO Y CONTROL DE ACCESOS",
  ]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 7);
  titleRow.font = fontHeaderBig;
  titleRow.alignment = { horizontal: "center", vertical: "middle" };
  titleRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR_PRIMARY },
  };

  emptyRow();

  addInfoRow("Empresa", COMPANY_INFO.nombre);
  addInfoRow("Dirección", COMPANY_INFO.direccion);
  addInfoRow("NIF", COMPANY_INFO.nif);
  addInfoRow("Teléfono", COMPANY_INFO.telefono);
  addInfoRow("Email", COMPANY_INFO.email);

  emptyRow();
  addInfoRow("Proyecto", nombreProyecto);
  addInfoRow("Cliente", cliente || "-");
  addInfoRow("Fecha", fechaHoy);

  emptyRow();

  const obsTitleRow = ws.addRow(["Observaciones generales"]);
  obsTitleRow.getCell(1).font = fontHeader;
  const obsRow = ws.addRow([
    presu.notas || "Se requiere switch PoE para alimentación de equipos.",
  ]);
  obsRow.getCell(1).font = fontBody;
  obsRow.getCell(1).alignment = { wrapText: true };

  // ====== NOTAS POR SECCIÓN (si existen) ======
  if (notasSecciones.length) {
    emptyRow();
    const notasTitle = ws.addRow(["NOTAS POR SECCIÓN"]);
    notasTitle.getCell(1).font = fontHeader;

    const notasHeader = ws.addRow(["Sección", "Nota"]);
    notasHeader.eachCell((cell) => {
      cell.font = fontHeader;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR_TABLE_HEADER },
      };
      cell.border = borderThin;
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    });

    notasSecciones.forEach((entry) => {
      const r = ws.addRow([entry.seccion, entry.nota]);
      r.font = fontBody;
      r.eachCell((cell) => {
        cell.border = borderThin;
        cell.alignment = { wrapText: true, vertical: "top" };
      });
    });
  }

  emptyRow();

  // ====== CABECERA TABLA DE LÍNEAS ======
  const headerTabla = ws.addRow([
    "Sección",
    "Título",
    "Referencia",
    "Descripción",
    "Cantidad",
    "PVP UD (€)",
    "Importe (€)",
  ]);
  headerTabla.eachCell((cell) => {
    cell.font = fontHeader;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR_TABLE_HEADER },
    };
    cell.border = borderThin;
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  });

  // ====== DETALLE POR SECCIÓN ======
  seccionesOrden.forEach((sec) => {
    const list = mapSec[sec];
    if (!list || !list.length) return;

    emptyRow();

    // Fila de sección
    const secRow = ws.addRow([sec.toUpperCase()]);
    ws.mergeCells(secRow.number, 1, secRow.number, 7);
    secRow.getCell(1).font = fontSection;
    secRow.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR_SECTION },
    };
    secRow.getCell(1).border = borderThin;
    secRow.getCell(1).alignment = {
      horizontal: "left",
      vertical: "middle",
    };

    let currentTitle = null;

    list.forEach((l) => {
      const tituloLinea =
        l.titulo ||
        l.title ||
        l.subseccion ||
        l["Título"] ||
        l["TITULO"] ||
        "";
      const importe = l.subtotal || l.pvp * l.cantidad || 0;

      // Fila de subtítulo si cambia
      if (tituloLinea && tituloLinea !== currentTitle) {
        currentTitle = tituloLinea;
        const tRow = ws.addRow([tituloLinea]);
        ws.mergeCells(tRow.number, 1, tRow.number, 7);
        tRow.getCell(1).font = fontHeader;
        tRow.getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF9FAFB" },
        };
        tRow.getCell(1).border = borderThin;
        tRow.getCell(1).alignment = {
          horizontal: "left",
          vertical: "middle",
        };
      }

      // Fila de detalle
      const r = ws.addRow([
        sec,
        tituloLinea,
        l.ref || "",
        l.descripcion || "",
        l.cantidad || 0,
        Number(l.pvp || 0),
        Number(importe),
      ]);

      r.font = fontBody;
      r.eachCell((cell, col) => {
        cell.border = borderThin;

        if (col === 5) {
          // Cantidad
          cell.numFmt = "#,##0";
          cell.alignment = { horizontal: "right", vertical: "top" };
        } else if (col === 6 || col === 7) {
          // PVP / Importe
          cell.numFmt = "#,##0.00";
          cell.alignment = { horizontal: "right", vertical: "top" };
        } else if (col === 4) {
          // Descripción
          cell.alignment = { wrapText: true, vertical: "top" };
        } else {
          cell.alignment = { horizontal: "left", vertical: "top" };
        }
      });
    });
  });

  // ====== TOTALES ======
  emptyRow();
  const subtotalRow = ws.addRow([
    "Subtotal (base imponible)",
    "",
    "",
    "",
    "",
    "",
    base,
  ]);
  const ivaRow = ws.addRow(["IVA 21%", "", "", "", "", "", iva]);
  const totalRow = ws.addRow(["TOTAL OFERTA", "", "", "", "", "", total]);

  [subtotalRow, ivaRow, totalRow].forEach((r) => {
    r.getCell(1).font = fontHeader;
    r.eachCell((cell, col) => {
      cell.border = borderThin;
      if (col === 7 && typeof cell.value === "number") {
        cell.numFmt = "#,##0.00";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      }
    });
  });
  totalRow.getCell(1).font = {
    ...fontHeader,
    bold: true,
  };

  emptyRow();
  const infoFiscalRow = ws.addRow(["Información fiscal", textoIVAEstado]);
  infoFiscalRow.getCell(1).font = fontHeader;
  const validezRow = ws.addRow(["Validez de la oferta", textoValidez]);
  validezRow.getCell(1).font = fontHeader;

  // ==========================
  // DESCARGAR ARCHIVO
  // ==========================
  const safeName = (nombreProyecto || "2N").replace(/[^a-zA-Z0-9_-]+/g, "_");
  const fileName =
    "Presupuesto_" + safeName + "_" + fechaHoy.replace(/-/g, "") + ".xlsx";

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, fileName);
}

// ===============================================
// EXPORTAR A CSV SALESFORCE (SKU;Quantity;Discount)
// ===============================================
function exportarPresupuestoSalesforce() {
  const presu = appState.presupuesto || {};
  const lineas = presu.lineas || [];
  if (!lineas.length) {
    alert("No hay líneas de presupuesto para exportar.");
    return;
  }

  // Agregar por referencia
  const cantidadesPorSKU = {};
  const orden = [];

  lineas.forEach((l) => {
    const rawRef = (l.ref || "").toString().trim();
    const sku = rawRef.replace(/\s+/g, "");
    if (!sku || sku === "-") return; // saltar líneas sin referencia

    if (!(sku in cantidadesPorSKU)) {
      cantidadesPorSKU[sku] = 0;
      orden.push(sku);
    }
    const qty = Number(l.cantidad || 0) || 0;
    cantidadesPorSKU[sku] += qty;
  });

  if (!orden.length) {
    alert("No hay referencias válidas para exportar a Salesforce.");
    return;
  }

  // Construir CSV con ; como separador
  let csv = "SKU;Quantity;Discount\n";
  orden.forEach((sku) => {
    const qty = cantidadesPorSKU[sku];
    csv += `${sku};${qty};\n`;
  });

  const fechaHoy = presu.fecha || new Date().toISOString().split("T")[0];
  const nombreProyecto = presu.nombre || "Proyecto_sin_nombre";
  const fileName =
    "Salesforce_" +
    nombreProyecto.replace(/[^a-zA-Z0-9_-]+/g, "_") +
    "_" +
    fechaHoy.replace(/-/g, "") +
    ".csv";

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===============================================
// EXPORTAR A PDF (ventana nueva + print -> PDF)
// + NOTAS POR SECCIÓN
// ===============================================
function exportarPresupuestoPDF() {
  const presu = appState.presupuesto || {};
  if (!presu.lineas || !presu.lineas.length) {
    alert("No hay líneas de presupuesto para exportar.");
    return;
  }

  const fechaHoy = presu.fecha || new Date().toISOString().split("T")[0];
  const nombreProyecto = presu.nombre || "Proyecto sin nombre";
  const cliente = presu.cliente || "";

  const incluirIVA =
    typeof presu.incluirIVA === "boolean" ? presu.incluirIVA : true;
  const dto = presu.resumen?.dto || 0;

  // Totales sobre TODAS las líneas
  let totalBruto = 0;
  presu.lineas.forEach((l) => {
    totalBruto += l.subtotal || l.pvp * l.cantidad || 0;
  });
  const factorDto = dto > 0 ? 1 - dto / 100 : 1;
  const base = totalBruto * factorDto;
  const iva = incluirIVA ? base * 0.21 : 0;
  const total = base + iva;

  const textoIVAEstado = incluirIVA
    ? "Este presupuesto incluye IVA (21%) en el total indicado."
    : "Este presupuesto NO incluye IVA. El IVA se añadirá aparte según la legislación vigente.";

  const textoValidez =
    "Este presupuesto tiene una validez de 60 días desde la fecha de emisión, salvo indicación contraria por escrito.";

  const labelTotal = incluirIVA
    ? "Total oferta (IVA incluido)"
    : "Total oferta (sin IVA)";

  // Agrupar por sección respetando el orden del presupuesto
  const secciones = presu.sectionOrder || [];
  const mapSec = {};
  presu.lineas.forEach((l) => {
    const sec =
      l.seccion ||
      l.section ||
      l.apartado ||
      l.grupo ||
      l["Sección"] ||
      l["SECCION"] ||
      l["Grupo"] ||
      l["Apartado"] ||
      l.titulo ||
      l.title ||
      "Sin sección";
    if (!mapSec[sec]) mapSec[sec] = [];
    mapSec[sec].push(l);
  });

  // === NOTAS POR SECCIÓN (PÁGINA PRESUPUESTO) ===
  const sectionNotes = presu.sectionNotes || {};
  const extraSections = presu.extraSections || [];
  const sectionOrder = presu.sectionOrder || [];

  const notasSecciones = [];

  if (sectionOrder && sectionOrder.length) {
    sectionOrder.forEach((sec) => {
      const txt = (sectionNotes[sec] || "").trim();
      if (txt) {
        notasSecciones.push({ seccion: sec, nota: txt });
      }
    });
  }

  Object.keys(sectionNotes || {}).forEach((sec) => {
    if (sectionOrder && sectionOrder.includes && sectionOrder.includes(sec)) return;
    const txt = (sectionNotes[sec] || "").trim();
    if (txt) {
      notasSecciones.push({ seccion: sec, nota: txt });
    }
  });

  (extraSections || []).forEach((sec) => {
    if (!sec) return;
    const txt = (sec.nota || "").trim();
    if (!txt) return;
    const titulo =
      sec.seccion ||
      sec.titulo ||
      sec.nombre ||
      (sec.id ? `Sección extra ${sec.id}` : "Sección extra");
    notasSecciones.push({ seccion: titulo, nota: txt });
  });

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  const notasSeccionHtml = notasSecciones.length
    ? `<div class="notes" style="margin-top:4px;">
         <strong>Notas por sección:</strong>
         ${notasSecciones
           .map((entry) => {
             const contenido = escapeHtml(entry.nota).split("\n").join("<br/>");
             return `<p style="margin:4px 0;">
                       <strong>${escapeHtml(entry.seccion)}:</strong><br/>
                       ${contenido}
                     </p>`;
           })
           .join("")}
       </div>`
    : "";

  const win = window.open("", "_blank");
  if (!win) {
    alert("El navegador ha bloqueado la ventana emergente. Permite pop-ups para exportar a PDF.");
    return;
  }

  const estilos = `
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color:#111827; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      h2 { font-size: 15px; margin: 16px 0 8px; }
      .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1d4ed8; padding-bottom:12px; margin-bottom:18px; }
      .brand { font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#1d4ed8; font-weight:600; }
      .company-name { font-size:16px; font-weight:700; }
      .company-block, .client-block { font-size:11px; line-height:1.3; }
      .pill { padding:4px 10px; border-radius:999px; font-size:10px; background:#e0ecff; color:#1d4ed8; font-weight:500; }
      table { width:100%; border-collapse:collapse; margin-top:10px; font-size:11px; }
      th, td { border-bottom:1px solid #e5e7eb; padding:6px 4px; text-align:left; vertical-align:top; }
      th { background:#f3f4f6; font-weight:600; }
      .sec-row { background:#eef2ff; font-weight:600; text-transform:uppercase; }
      .title-row { background:#f9fafb; font-weight:500; }
      .totals { margin-top:16px; font-size:11px; width:280px; margin-left:auto; }
      .totals td { padding:4px 4px; }
      .totals tr:last-child td { font-weight:700; border-top:2px solid #1f2937; }
      .notes { margin-top:16px; font-size:11px; color:#4b5563; }
      .footer { margin-top:12px; font-size:9px; color:#6b7280; }
    </style>
  `;

  let html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Presupuesto 2N</title>
        ${estilos}
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">Presupuesto 2N</div>
            <div class="company-name">${COMPANY_INFO.nombre}</div>
            <div class="company-block">
              ${COMPANY_INFO.direccion}<br/>
              NIF: ${COMPANY_INFO.nif}<br/>
              Tel: ${COMPANY_INFO.telefono}<br/>
              Email: ${COMPANY_INFO.email}
            </div>
          </div>
          <div>
            <div class="pill">Documento de oferta</div>
            <div class="client-block" style="margin-top:8px;">
              <strong>Proyecto:</strong> ${escapeHtml(nombreProyecto)}<br/>
              <strong>Cliente:</strong> ${escapeHtml(cliente || "-")}<br/>
              <strong>Fecha:</strong> ${fechaHoy}
            </div>
          </div>
        </div>

        <h2>Detalle del suministro</h2>
        ${
          presu.notas
            ? `<div class="notes" style="font-size:11px; margin-top:0; margin-bottom:8px;">
                 <strong>Notas del proyecto:</strong><br/>
                 ${escapeHtml(presu.notas).split("\\n").join("<br/>")}
               </div>`
            : ""
        }
        ${notasSeccionHtml}

        <table>
          <thead>
            <tr>
              <th style="width:18%;">Sección</th>
              <th style="width:18%;">Título</th>
              <th style="width:12%;">Ref.</th>
              <th>Descripción</th>
              <th style="width:8%; text-align:right;">Ud.</th>
              <th style="width:12%; text-align:right;">PVP (€)</th>
              <th style="width:14%; text-align:right;">Importe (€)</th>
            </tr>
          </thead>
          <tbody>
  `;

  secciones.forEach((sec) => {
    const list = mapSec[sec];
    if (!list || !list.length) return;

    html += `
      <tr class="sec-row">
        <td colspan="7">${escapeHtml(sec)}</td>
      </tr>
    `;

    let currentTitle = null;
    list.forEach((l) => {
      const titulo =
        l.titulo ||
        l.title ||
        l.subseccion ||
        l["Título"] ||
        l["TITULO"] ||
        "";

      if (titulo && titulo !== currentTitle) {
        currentTitle = titulo;
        html += `
          <tr class="title-row">
            <td colspan="7">${escapeHtml(titulo)}</td>
          </tr>
        `;
      }

      const importe = l.subtotal || l.pvp * l.cantidad || 0;

      html += `
        <tr>
          <td>${escapeHtml(sec)}</td>
          <td>${escapeHtml(titulo || "")}</td>
          <td>${escapeHtml(l.ref || "")}</td>
          <td>${escapeHtml(l.descripcion || "")}</td>
          <td style="text-align:right;">${l.cantidad || 0}</td>
          <td style="text-align:right;">${(l.pvp || 0).toFixed(2)}</td>
          <td style="text-align:right;">${importe.toFixed(2)}</td>
        </tr>
      `;
    });
  });

  html += `
          </tbody>
        </table>

        <table class="totals">
          <tr>
            <td>Subtotal (base imponible)</td>
            <td style="text-align:right;">${base.toFixed(2)} €</td>
          </tr>
          <tr>
            <td>IVA 21%</td>
            <td style="text-align:right;">${iva.toFixed(2)} €</td>
          </tr>
          <tr>
            <td>${labelTotal}</td>
            <td style="text-align:right;">${total.toFixed(2)} €</td>
          </tr>
        </table>

        <div class="footer">
          ${textoValidez}<br/>
          ${textoIVAEstado}<br/>
          La presente oferta no incluye instalación, cableado ni obra civil salvo que se indique expresamente.
        </div>
      </body>
    </html>
  `;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

console.log("%cUI Presupuesto cargado (ui_presupuesto.js)", "color:#0284c7;");

// Exponer helpers globales para otras pantallas (Simulador, etc.)
window.renderPresupuestoView = renderPresupuestoView;
window.getPresupuestoActual = function () {
  return normalizarPresupuesto(appState.presupuesto);
};
window.setPresupuestoActual = function (nuevo) {
  if (!nuevo) return;
  appState.presupuesto = normalizarPresupuesto(nuevo);
  savePresupuestoToStorage();
};

// <<< NUEVO: helper global para que otras pantallas cojan siempre el nombre correcto
window.getNombreProyectoActual = function () {
  const presu =
    typeof window.getPresupuestoActual === "function"
      ? window.getPresupuestoActual()
      : normalizarPresupuesto(appState.presupuesto);

  if (presu && presu.nombre) return presu.nombre;

  const p = appState.proyecto || {};
  return p.nombre || "Proyecto sin nombre";
};
