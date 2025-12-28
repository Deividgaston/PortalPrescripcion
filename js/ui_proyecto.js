// js/ui_proyecto.js
// Pantalla de PROYECTO: importar Excel (incl. Project Designer) y guardar en appState + localStorage

window.appState = window.appState || {};
appState.proyecto = appState.proyecto || {
  filas: [],
  archivoNombre: null,
  fechaImportacion: null,
};
// Preview temporal para el modal
appState.proyectoPreview = null;

function getAppContent() {
  return document.getElementById("appContent");
}

// ====================
// RENDER PRINCIPAL
// ====================

function renderProyectoView() {
  const container = getAppContent();
  if (!container) return;

  container.innerHTML = `
    <div class="proyecto-layout">

      <!-- Card de importación -->
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Proyecto</div>
            <div class="card-subtitle">
              Importa el archivo de proyecto (Project Designer 2N o Excel propio) con las referencias y cantidades.
            </div>
          </div>
          <span class="chip">Paso 1 de 3</span>
        </div>

        <div class="card-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Archivo de proyecto (Excel o CSV)</label>
              <p style="font-size:0.78rem; color:#6b7280; margin-bottom:0.45rem;">
                Para el <strong>Project Designer 2N</strong> se leerán automáticamente:
                <em>Sección</em>, <em>Título</em>, <em>Nombre del producto</em>, 
                <em>Número de pedido</em> (referencia) y <em>Cantidad</em>.
              </p>

              <input id="proyectoFileInput" type="file" accept=".xlsx,.xls,.csv" />

              <button id="btnProcesarProyecto" class="btn btn-primary mt-3">
                Procesar proyecto
              </button>

              <!-- NUEVO: Importar presupuesto desde Excel -->
              <div class="form-group mt-4" style="border-top:1px solid #e5e7eb; padding-top:0.75rem;">
                <label>Importar presupuesto existente</label>
                <p style="font-size:0.78rem; color:#6b7280; margin-top:0.25rem;">
                  Usa el Excel exportado desde la página de <strong>Presupuesto</strong> para reconstruir la oferta en esta app.
                </p>
                <button id="btnImportarPresu" type="button" class="btn btn-secondary btn-sm mt-1">
                  Importar presupuesto (Excel)
                </button>
                <input id="presuImportFile" type="file" accept=".xlsx,.xls" style="display:none;" />
              </div>
            </div>
          </div>

          <div id="proyectoMensaje" class="alert alert-info mt-3" style="display:none;"></div>
        </div>
      </div>

      <!-- Card de estado -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Estado del proyecto</div>
        </div>
        <div class="card-body" id="proyectoEstado">
          Todavía no se ha importado ningún proyecto.
        </div>
      </div>

    </div>

    <!-- Modal de confirmación importación -->
    <div id="proyectoConfirmOverlay" class="modal-overlay">
      <div class="modal-card">
        <div class="modal-title">Importar proyecto</div>
        <div id="proyectoConfirmText" class="modal-text">
          <!-- Se rellena por JS -->
        </div>
        <div class="modal-actions">
          <button id="btnProyectoCancelar" class="btn btn-secondary btn-sm">
            Cancelar
          </button>
          <button id="btnProyectoConfirmar" class="btn btn-primary btn-sm">
            Importar y generar presupuesto
          </button>
        </div>
      </div>
    </div>
  `;

  // Eventos
  const btnProcesar = document.getElementById("btnProcesarProyecto");
  if (btnProcesar) {
    btnProcesar.addEventListener("click", onProcesarProyectoClick);
  }

  // NUEVO: listeners para importar presupuesto desde Excel
  const btnImportarPresu = document.getElementById("btnImportarPresu");
  const inputPresuFile = document.getElementById("presuImportFile");
  if (btnImportarPresu && inputPresuFile) {
    btnImportarPresu.addEventListener("click", () => {
      inputPresuFile.value = "";
      inputPresuFile.click();
    });

    inputPresuFile.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        importarPresupuestoDesdeExcel(file);
      }
    });
  }

  const overlay = document.getElementById("proyectoConfirmOverlay");
  const btnCancelar = document.getElementById("btnProyectoCancelar");
  const btnConfirmar = document.getElementById("btnProyectoConfirmar");

  if (overlay && btnCancelar && btnConfirmar) {
    btnCancelar.addEventListener("click", () => {
      appState.proyectoPreview = null;
      overlay.style.display = "none";
    });

    btnConfirmar.addEventListener("click", () => {
      confirmarImportacionProyecto();
    });
  }

  // Si hay proyecto en localStorage, cargarlo
  cargarProyectoDesdeCache();
  actualizarEstadoProyecto();
}

// ====================
// MANEJO DE IMPORTACIÓN
// ====================

async function onProcesarProyectoClick() {
  const fileInput = document.getElementById("proyectoFileInput");
  const msg = document.getElementById("proyectoMensaje");

  if (msg) {
    msg.style.display = "none";
    msg.textContent = "";
  }

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    if (msg) {
      msg.className = "alert alert-error mt-3";
      msg.textContent = "Selecciona un archivo antes de procesar.";
      msg.style.display = "flex";
    }
    return;
  }

  const file = fileInput.files[0];

  try {
    const resultado = await leerProyectoDesdeExcel(file);
    const filas = resultado.filas;
    const seccion = resultado.seccion;
    const titulo = resultado.titulo;

    if (!filas || filas.length === 0) {
      if (msg) {
        msg.className = "alert alert-error mt-3";
        msg.textContent =
          "No se han encontrado filas válidas. Revisa que existan referencias y cantidades.";
        msg.style.display = "flex";
      }
      return;
    }

    // Guardamos una preview temporal en memoria
    appState.proyectoPreview = {
      filas,
      archivoNombre: file.name,
      fechaImportacion: new Date().toISOString(),
      seccion,
      titulo,
    };

    // Mostramos el modal de confirmación
    mostrarModalConfirmacionProyecto(filas.length, file.name, seccion, titulo);
  } catch (err) {
    console.error("Error procesando proyecto:", err);
    if (msg) {
      msg.className = "alert alert-error mt-3";
      msg.textContent =
        "Se ha producido un error al leer el archivo. Revisa que el formato sea correcto.";
      msg.style.display = "flex";
    }
  }
}

// NUEVO ===============================
// Importar presupuesto desde Excel (exportado en página Presupuesto)
// Reconstruye appState.presupuesto y salta a la vista de Presupuesto
// ====================================
async function importarPresupuestoDesdeExcel(file) {
  const msg = document.getElementById("proyectoMensaje");
  if (msg) {
    msg.className = "alert alert-info mt-3";
    msg.textContent = "Importando presupuesto desde Excel...";
    msg.style.display = "flex";
  }

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(data), { type: "array" });

    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];

    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: ""
    });

    let nombreProyecto = "";
    let cliente = "";
    let fecha = "";
    let notas = "";

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const c0 = String(row[0] || "").trim();
      const c1 = row[1];

      if (!nombreProyecto && c0 === "Proyecto") {
        nombreProyecto = String(c1 || "").trim();
      } else if (!cliente && c0 === "Cliente") {
        cliente = String(c1 || "").trim();
      } else if (!fecha && c0 === "Fecha") {
        if (c1 instanceof Date) {
          fecha = c1.toISOString().split("T")[0];
        } else if (typeof c1 === "number") {
          try {
            const d = XLSX.SSF.parse_date_code(c1);
            if (d) {
              const dd = new Date(d.y, (d.m || 1) - 1, d.d || 1);
              fecha = dd.toISOString().split("T")[0];
            }
          } catch (e) {
            // ignorar
          }
        } else if (typeof c1 === "string" && c1.trim()) {
          const s = c1.trim();
          fecha = s.substring(0, 10);
        }
      } else if (!notas && c0 === "Observaciones generales") {
        const siguiente = rows[i + 1] || [];
        notas = String(siguiente[0] || "").trim();
      }
    }

    if (!fecha) {
      fecha = new Date().toISOString().split("T")[0];
    }

    // Buscar cabeceras de la tabla de líneas
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const c0 = String(r[0] || "").trim();
      const c1 = String(r[1] || "").trim();
      if (c0 === "Sección" && c1 === "Título") {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      throw new Error("No se ha encontrado la tabla de líneas (cabeceras 'Sección' / 'Título').");
    }

    const lineas = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const c0 = String(r[0] || "").trim();

      if (!c0) {
        const next0 = String((rows[i + 1] || [])[0] || "").trim();
        if (next0.startsWith("Subtotal")) {
          break;
        }
        continue;
      }

      if (c0.startsWith("Subtotal") || c0 === "Subtotal (base imponible)") {
        break;
      }
      if (c0 === "Información fiscal" || c0 === "Validez de la oferta") {
        break;
      }

      const seccion = c0;
      const titulo = String(r[1] || "").trim();
      const ref = String(r[2] || "").trim();
      const desc = String(r[3] || "").trim();
      const cantidad = Number(r[4] || 0) || 0;
      const pvp = Number(r[5] || 0) || 0;
      const importe = Number(r[6] || 0) || pvp * cantidad;

      if (!ref && !desc) continue;
      if (!cantidad) continue;

      lineas.push({
        seccion,
        titulo,
        ref,
        descripcion: desc,
        cantidad,
        pvp,
        subtotal: importe
      });
    }

    if (!lineas.length) {
      throw new Error("No se han encontrado líneas de oferta en el Excel.");
    }

    let totalBruto = 0;
    lineas.forEach((l) => {
      totalBruto += l.subtotal || l.pvp * l.cantidad || 0;
    });

    const dto = 0;
    const totalNeto = totalBruto;

    const sectionOrder = [];
    lineas.forEach((l) => {
      const sec = l.seccion || "Sin sección";
      if (!sectionOrder.includes(sec)) {
        sectionOrder.push(sec);
      }
    });

    const presupuestoReconstruido = {
      lineas,
      resumen: {
        totalBruto,
        dto,
        totalNeto
      },
      notas,
      nombre: nombreProyecto || "Proyecto sin nombre",
      cliente,
      fecha,
      sectionNotes: {},
      extraSections: [],
      sectionOrder,
      incluirIVA: true
    };

    appState.presupuesto = presupuestoReconstruido;
    try {
      if (typeof savePresupuestoToStorage === "function") {
        savePresupuestoToStorage();
      }
    } catch (e) {
      // ignorar
    }

    if (msg) {
      msg.className = "alert alert-success mt-3";
      msg.textContent =
        "Presupuesto importado correctamente desde Excel. Abriendo la página de Presupuesto.";
      msg.style.display = "flex";
    }

    if (typeof selectView === "function") {
      selectView("presupuesto");
    } else if (typeof renderPresupuestoView === "function") {
      renderPresupuestoView();
    }
  } catch (err) {
    console.error("Error importando presupuesto desde Excel:", err);
    if (msg) {
      msg.className = "alert alert-error mt-3";
      msg.textContent =
        "No se ha podido leer el Excel de presupuesto. Asegúrate de usar el archivo exportado desde la página de Presupuesto.";
      msg.style.display = "flex";
    }
  }
}

// Mostrar modal con nº de productos y datos básicos
function mostrarModalConfirmacionProyecto(numProductos, archivoNombre, seccion, titulo) {
  const overlay = document.getElementById("proyectoConfirmOverlay");
  const txt = document.getElementById("proyectoConfirmText");
  if (!overlay || !txt) return;

  const secTxt = seccion ? `<br/><strong>Sección:</strong> ${seccion}` : "";
  const titTxt = titulo ? `<br/><strong>Título:</strong> ${titulo}` : "";

  txt.innerHTML = `
    Se han detectado <strong>${numProductos}</strong> productos en el archivo
    <strong>${archivoNombre}</strong>.
    ${secTxt}
    ${titTxt}
    <br/><br/>
    ¿Quieres importar este proyecto y pasar directamente a la página de <strong>Presupuesto</strong>?
  `;

  overlay.style.display = "flex";
}

// Confirmar importación definitiva y pasar a Presupuesto
function confirmarImportacionProyecto() {
  const overlay = document.getElementById("proyectoConfirmOverlay");
  const msg = document.getElementById("proyectoMensaje");
  if (!appState.proyectoPreview) {
    if (overlay) overlay.style.display = "none";
    return;
  }

  const preview = appState.proyectoPreview;
  appState.proyecto = {
    filas: preview.filas,
    archivoNombre: preview.archivoNombre,
    fechaImportacion: preview.fechaImportacion,
    seccion: preview.seccion || null,
    titulo: preview.titulo || null,
  };
  appState.proyectoPreview = null;

  // Guardar en localStorage
  try {
    localStorage.setItem(PROYECTO_CACHE_KEY, JSON.stringify(appState.proyecto));
  } catch (e) {
    console.warn("No se pudo guardar el proyecto en localStorage:", e);
  }

  if (overlay) overlay.style.display = "none";

  if (msg) {
    msg.className = "alert alert-success mt-3";
    msg.textContent = `Proyecto importado correctamente: ${appState.proyecto.filas.length} líneas.`;
    msg.style.display = "flex";
  }

  actualizarEstadoProyecto();

  // Ir directamente a Presupuesto
  if (typeof selectView === "function") {
    selectView("presupuesto");
  }
}

// ====================
// LECTURA DE EXCEL
// ====================

// Devuelve: { filas: [...], seccion, titulo }
function leerProyectoDesdeExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });

        // Primera hoja
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];

        // Array crudo para detectar formato Project Designer
        const hojaArray = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: "",
        });

        const resultadoPD = intentarParsearProjectDesigner(hojaArray);
        if (resultadoPD) {
          resolve(resultadoPD);
          return;
        }

        // Si no es formato Project Designer, usamos el parser genérico (cabeceras normales)
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

        const filas = json
          .map((row) => {
            const ref =
              row["Referencia"] ||
              row["REF"] ||
              row["Ref"] ||
              row["Referencia 2N"] ||
              row["Referencia_2N"] ||
              row["Codigo"] ||
              row["Código"] ||
              row["Número de pedido"] ||
              row["Numero de pedido"] ||
              row["Número pedido"] ||
              "";

            const cant =
              row["Cantidad"] ||
              row["Cant"] ||
              row["QTY"] ||
              row["Qty"] ||
              row["Unidades"] ||
              row["Und"] ||
              "";

            const desc =
              row["Descripción"] ||
              row["Descripcion"] ||
              row["DESCRIPCION"] ||
              row["DESCRIPCIÓN"] ||
              row["Nombre producto"] ||
              row["Nombre del producto"] ||
              row["Producto"] ||
              "";

            const referencia = normalizarRef(ref);
            const cantidad = Number(cant) || 0;

            return {
              referencia,
              cantidad,
              descripcion: limpiarTexto(desc),
            };
          })
          .filter((r) => r.referencia && r.cantidad > 0);

        resolve({ filas, seccion: null, titulo: null });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = function (err) {
      reject(err);
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parser específico para Project Designer 2N.
 * Soporta varias secciones y sub-secciones (ej. Cerraduras + Accesorios + Recepción).
 *
 * - "titulo"  = grupo azul (ej. "Cerraduras electrónicas")
 * - "seccion" = bloque gris (ej. "CONTROL DE ACCESOS VIVIENDAS", "Accesorios", "Recepción")
 *
 * Si no existe título gris, se usa el azul como sección.
 */
function intentarParsearProjectDesigner(hojaArray) {
  if (!Array.isArray(hojaArray) || hojaArray.length === 0) return null;

  const limpiar = (t) => (t ?? "").toString().trim();

  const rowHasText = (row) =>
    Array.isArray(row) &&
    row.some((c) => (c ?? "").toString().trim() !== "");

  const firstText = (row) => {
    if (!Array.isArray(row)) return "";
    for (const c of row) {
      const s = (c ?? "").toString().trim();
      if (s) return s;
    }
    return "";
  };

  const filas = [];
  let idxNombre = -1;
  let idxRef = -1;
  let idxCant = -1;

  let currentMain = ""; // azul
  let currentSub = "";  // gris
  let firstMain = null;
  let firstSub = null;

  for (let i = 0; i < hojaArray.length; i++) {
    const row = hojaArray[i];
    if (!Array.isArray(row)) continue;

    const lowerRow = row.map((c) =>
      (c ?? "").toString().toLowerCase().trim()
    );

    const iNombre = lowerRow.findIndex((c) =>
      c.includes("nombre del producto")
    );
    const iRef = lowerRow.findIndex(
      (c) => c.includes("número de pedido") || c.includes("numero de pedido")
    );
    const iCant = lowerRow.findIndex((c) => c === "cantidad");

    // === Cabecera "Foto / Nombre del producto / Nº pedido / Cantidad" ===
    if (iNombre !== -1 && iRef !== -1 && iCant !== -1) {
      idxNombre = iNombre;
      idxRef = iRef;
      idxCant = iCant;

      // Buscamos hacia arriba:
      // j1 = última fila con texto  -> suele ser la gris (sub-sección)
      // j0 = la anterior con texto -> suele ser la azul (grupo)
      let j1 = -1;
      let j0 = -1;

      for (let j = i - 1; j >= 0; j--) {
        if (rowHasText(hojaArray[j])) {
          j1 = j;
          break;
        }
      }
      if (j1 !== -1) {
        for (let j = j1 - 1; j >= 0; j--) {
          if (rowHasText(hojaArray[j])) {
            j0 = j;
            break;
          }
        }
      }

      let sub = j1 !== -1 ? firstText(hojaArray[j1]) : "";
      let main = j0 !== -1 ? firstText(hojaArray[j0]) : "";

      // Si solo hay una fila de texto, úsala como main y sub
      if (!main && sub) {
        main = sub;
      }

      currentMain = limpiar(main || currentMain || "Grupo sin nombre");
      currentSub = limpiar(sub || currentMain || "Sección sin título");

      if (firstMain === null) {
        firstMain = currentMain;
        firstSub = currentSub;
      }

      continue; // siguiente fila, no es producto
    }

    // Hasta que no encontremos la primera cabecera, ignoramos filas
    if (idxNombre === -1) continue;

    const nombre = row[idxNombre];
    const refRaw = row[idxRef];
    const cantRaw = row[idxCant];

    const nombreTxt = limpiar(nombre);
    const refTxt = limpiar(refRaw);
    const cantTxt = limpiar(cantRaw);
    const firstTxtRow = firstText(row);

    // === Fila de título gris / azul sin productos ===
    // Tiene texto en alguna celda, pero no en nombre/ref/cantidad.
    if (firstTxtRow && !nombreTxt && !refTxt && !cantTxt) {
      const t = limpiar(firstTxtRow);
      const tl = t.toLowerCase();

      // CASO ESPECIAL: "Accesorios" o "Recepción" (solo banda azul, sin gris)
      if (tl === "accesorios" || tl === "recepción" || tl === "recepcion") {
        currentMain = t; // nueva sección principal
        currentSub = t;  // sin sub-sección propia, usamos la misma
        if (firstMain === null) {
          firstMain = currentMain;
          firstSub = currentSub;
        }
      } else {
        // Comportamiento normal: solo cambiamos la sub-sección gris
        currentSub = t;
      }
      continue;
    }

    // Fila completamente vacía
    if (!nombreTxt && !refTxt && !cantTxt) {
      continue;
    }

    // === Fila de producto ===
    const referencia = normalizarRef(refTxt);
    if (!referencia) continue;

    const cantidadNum = Number(
      (cantTxt || "0").toString().replace(",", ".")
    );
    if (!cantidadNum || cantidadNum <= 0) continue;

    filas.push({
      seccion: currentSub || currentMain, // bloque gris (o azul si no hay gris)
      titulo: currentMain,                // grupo azul
      descripcion: nombreTxt,
      referencia,
      cantidad: cantidadNum,
    });
  }

  if (!filas.length) return null;

  // Resumen global
  let seccionGlobal = firstMain || "";
  let tituloGlobal = firstSub || "";

  if (seccionGlobal && !tituloGlobal) {
    tituloGlobal = seccionGlobal;
  }

  return {
    filas,
    seccion: seccionGlobal,
    titulo: tituloGlobal,
  };
}

// ====================
// CACHE LOCAL
// ====================

function cargarProyectoDesdeCache() {
  try {
    const cached = localStorage.getItem(PROYECTO_CACHE_KEY);
    if (!cached) return;

    const data = JSON.parse(cached);
    if (!data || !Array.isArray(data.filas)) return;

    appState.proyecto = {
      filas: data.filas,
      archivoNombre: data.archivoNombre || null,
      fechaImportacion: data.fechaImportacion || null,
      seccion: data.seccion || null,
      titulo: data.titulo || null,
    };
  } catch (e) {
    console.warn("No se pudo cargar proyecto desde cache:", e);
  }
}

// ====================
// ESTADO VISUAL
// ====================

function actualizarEstadoProyecto() {
  const estado = document.getElementById("proyectoEstado");
  if (!estado) return;

  const proyecto = appState.proyecto;
  if (!proyecto || !proyecto.filas || proyecto.filas.length === 0) {
    estado.textContent = "Todavía no se ha importado ningún proyecto.";
    return;
  }

  const numFilas = proyecto.filas.length;
  const nombre = proyecto.archivoNombre || "Proyecto";
  const fecha = proyecto.fechaImportacion
    ? new Date(proyecto.fechaImportacion).toLocaleString("es-ES")
    : "N/D";

  const seccionTxt = proyecto.seccion
    ? `<br/>Sección: <strong>${proyecto.seccion}</strong>`
    : "";
  const tituloTxt = proyecto.titulo
    ? `<br/>Título: <strong>${proyecto.titulo}</strong>`
    : "";

  estado.innerHTML = `
    <div class="metric-card">
      <span class="metric-label">Proyecto importado</span>
      <span class="metric-value">${numFilas} líneas</span>
    </div>
    <p class="mt-2" style="font-size:0.82rem; color:#4b5563;">
      Archivo: <strong>${nombre}</strong><br/>
      Importado: ${fecha}
      ${seccionTxt}
      ${tituloTxt}
    </p>
  `;
}

console.log(
  "%cUI Proyecto cargada (ui_proyecto.js · Project Designer OK)",
  "color:#1d4fd8; font-weight:600;"
);
