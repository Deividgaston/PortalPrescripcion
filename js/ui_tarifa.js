// js/ui_tarifa.js
// Pantalla TARIFA 2N: importar Excel de tarifa y cargarla en Firestore

import { subirTarifaAFirestore, getTarifas, vaciarTarifaEnFirestore } from "./firebase_tarifa.js";

window.appState = window.appState || {};
appState.tarifaUpload = appState.tarifaUpload || {
  productos: null,
  total: 0,
};

function renderTarifaView() {
  const container = document.getElementById("appContent");
  if (!container) return;

  container.innerHTML = `
    <div class="tarifa-layout">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Tarifa 2N</div>
            <div class="card-subtitle">
              Importa la tarifa oficial de 2N (Excel) para que el sistema pueda calcular los PVP de los presupuestos.
            </div>
          </div>
        </div>

        <div class="card-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Archivo de tarifa (Excel)</label>
              <p style="font-size:0.78rem; color:#6b7280; margin-bottom:0.45rem;">
                El archivo debe incluir al menos una columna con la <strong>referencia</strong> (2N SKU / Ordering Number)
                y una columna con el <strong>precio</strong> (MSRP, LIST PRICE, PVP, etc.).
                El programa detecta automáticamente la fila de cabeceras aunque haya filas vacías o títulos encima.
              </p>
              <input id="tarifaFileInput" type="file" accept=".xlsx,.xls,.csv" />

              <div class="form-row mt-3" style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                <button id="btnLeerTarifa" class="btn btn-secondary">
                  1 · Leer archivo y preparar tarifa
                </button>
                <button id="btnSubirTarifa" class="btn btn-primary" disabled>
                  2 · Cargar tarifa en Firebase
                </button>
                <button id="btnVaciarTarifa" class="btn btn-danger">
                  Vaciar tarifa en Firebase
                </button>
              </div>

              <p style="font-size:0.75rem; color:#b91c1c; margin-top:0.5rem;">
                ⚠️ “Vaciar” borra TODOS los documentos en <strong>/tarifas/v1/productos</strong>.
              </p>
            </div>
          </div>

          <div id="tarifaMensaje" class="alert alert-info mt-3" style="display:none;"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Estado de la tarifa</div>
        </div>
        <div class="card-body" id="tarifaEstado">
          Cargando información de la tarifa...
        </div>
      </div>
    </div>
  `;

  const btnLeer = document.getElementById("btnLeerTarifa");
  const btnSubir = document.getElementById("btnSubirTarifa");
  const btnVaciar = document.getElementById("btnVaciarTarifa");

  if (btnLeer) btnLeer.addEventListener("click", onLeerTarifaClick);
  if (btnSubir) btnSubir.addEventListener("click", onSubirTarifaClick);
  if (btnVaciar) btnVaciar.addEventListener("click", onVaciarTarifaClick);

  actualizarEstadoTarifaFirebase();
}

// =============================
// LECTURA DEL EXCEL DE TARIFA
// =============================

async function onLeerTarifaClick() {
  const fileInput = document.getElementById("tarifaFileInput");
  const msg = document.getElementById("tarifaMensaje");
  const btnSubir = document.getElementById("btnSubirTarifa");

  if (msg) {
    msg.style.display = "none";
    msg.textContent = "";
  }

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    if (msg) {
      msg.className = "alert alert-error mt-3";
      msg.textContent = "Selecciona un archivo de tarifa antes de continuar.";
      msg.style.display = "flex";
    }
    return;
  }

  const file = fileInput.files[0];

  try {
    if (msg) {
      msg.className = "alert alert-info mt-3";
      msg.textContent = "Leyendo archivo de tarifa...";
      msg.style.display = "flex";
    }

    const { productosMap, meta } = await leerTarifaDesdeExcel(file);

    const totalRefs = Object.keys(productosMap).length;
    appState.tarifaUpload = { productos: productosMap, total: totalRefs };

    if (totalRefs === 0) {
      if (msg) {
        msg.className = "alert alert-warning mt-3";
        msg.textContent =
          "No se han encontrado referencias con precio. Revisa las cabeceras del archivo.";
        msg.style.display = "flex";
      }
      if (btnSubir) btnSubir.disabled = true;
      console.warn("Tarifa · No se encontraron productos. Meta:", meta);
      return;
    }

    if (msg) {
      msg.className = "alert alert-success mt-3";
      msg.innerHTML = `
        Archivo leído correctamente: <strong>${totalRefs}</strong> referencias con PVP.<br/>
        <span style="font-size:0.78rem; color:#6b7280;">
          Fila cabeceras: <strong>${meta.headerRowIndex + 1}</strong> ·
          Columna referencia: <strong>${meta.refHeader}</strong> ·
          Columna precio: <strong>${meta.priceHeader}</strong> ·
          Columna nombre: <strong>${meta.descHeader || "N/D"}</strong>
        </span>
      `;
      msg.style.display = "flex";
    }

    if (btnSubir) btnSubir.disabled = false;
    console.log(
      `%cTarifa · Archivo preparado con ${totalRefs} referencias`,
      "color:#22c55e;"
    );
    console.log("Meta detección cabeceras:", meta);
  } catch (error) {
    console.error("Error leyendo la tarifa desde Excel:", error);
    if (msg) {
      msg.className = "alert alert-error mt-3";
      msg.textContent =
        "Se ha producido un error al leer el archivo de tarifa. Revisa el formato.";
      msg.style.display = "flex";
    }
    if (btnSubir) btnSubir.disabled = true;
  }
}

function normalizarTextoPlano(h) {
  return String(h || "")
    .toLowerCase()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumeroEuro(value) {
  if (typeof value === "number") return value;
  let s = String(value || "").trim();
  if (!s) return 0;

  s = s.replace(/\s+/g, "");

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function esReferencia2N(val) {
  const s = String(val || "").trim();
  if (!s) return false;
  if (s.length < 4) return false;
  if (/[a-zA-Z]/.test(s) && !/\d/.test(s)) return false;
  return true;
}

function leerTarifaDesdeExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });

        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];

        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (!rows || rows.length === 0) {
          resolve({ productosMap: {}, meta: {} });
          return;
        }

        let headerRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const has2NSKU = row.some(
            (cell) => normalizarTextoPlano(cell) === "2n sku"
          );
          if (has2NSKU) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          console.warn(
            "No se encontró fila de cabeceras con '2N SKU'. Se usará la primera fila no vacía como cabecera."
          );
          headerRowIndex = rows.findIndex((r) =>
            r.some((c) => String(c).trim() !== "")
          );
          if (headerRowIndex === -1) {
            resolve({ productosMap: {}, meta: {} });
            return;
          }
        }

        const headerRow = rows[headerRowIndex];
        const headersNorm = headerRow.map((h) => normalizarTextoPlano(h));
        const findCol = (pred) => headersNorm.findIndex(pred);

        const colRef =
          headersNorm.findIndex((h) => h === "2n sku") !== -1
            ? headersNorm.findIndex((h) => h === "2n sku")
            : findCol(
                (h) =>
                  h.includes("sku") ||
                  h.includes("ordering number") ||
                  h.includes("numero de pedido") ||
                  h.includes("número de pedido") ||
                  h.includes("referencia")
              );

        const colName = findCol(
          (h) =>
            h.includes("nombre del producto") ||
            h === "nombre" ||
            h.includes("product name") ||
            h === "name"
        );

        const colMSRP = findCol(
          (h) =>
            h.includes("msrp") || h.includes("list price") || h.includes("pvp")
        );

        // columnas técnicas
        const colNota = findCol((h) => h === "nota" || h === "note");
        const colAncho = findCol(
          (h) =>
            h === "ancho (mm)" ||
            h === "anchura (mm)" ||
            h === "width (mm)" ||
            h === "width"
        );
        const colAlto = findCol(
          (h) =>
            h === "alto (mm)" ||
            h === "altura (mm)" ||
            h === "height (mm)" ||
            h === "height"
        );
        const colProf = findCol(
          (h) =>
            h === "profundidad (mm)" || h === "depth (mm)" || h === "depth"
        );
        const colPeso = findCol(
          (h) => h === "peso (kg)" || h === "weight (kg)" || h === "weight"
        );
        const colHS = findCol((h) => h === "hs code" || h === "hscode" || h === "hs");
        const colEAN = findCol((h) => h === "ean code" || h === "ean");
        const colWeb = findCol(
          (h) =>
            h === "página web" ||
            h === "pagina web" ||
            h === "website" ||
            h === "url"
        );
        const colEOL = findCol((h) => h === "eol");
        const colEOLReason = findCol(
          (h) =>
            h === "motivo de finalización de venta" ||
            h === "motivo finalización de venta" ||
            h === "end of sale reason" ||
            h.includes("end of sale")
        );

        if (colRef === -1 || colMSRP === -1) {
          console.warn("No se detectaron correctamente columna de referencia o precio.", { headerRow });
        }

        const productos = {};
        const safeStr = (v) => String(v ?? "").trim();
        const safeNumOrEmpty = (v) => {
          const n = parseNumeroEuro(v);
          return n > 0 ? n : "";
        };

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const rawRef = colRef !== -1 ? row[colRef] : "";
          const rawPrice = colMSRP !== -1 ? row[colMSRP] : "";
          const rawName = colName !== -1 ? row[colName] : "";

          if (!esReferencia2N(rawRef)) continue;

          const ref = String(rawRef).trim().replace(/\s+/g, "").toUpperCase();
          const pvp = parseNumeroEuro(rawPrice);
          if (!ref || !pvp || pvp <= 0) continue;

          const desc = String(rawName || "").trim();

          productos[ref] = {
            referencia: ref,
            pvp,
            descripcion: desc,

            "Nota": colNota !== -1 ? safeStr(row[colNota]) : "",
            "Ancho (mm)": colAncho !== -1 ? safeNumOrEmpty(row[colAncho]) : "",
            "Alto (mm)": colAlto !== -1 ? safeNumOrEmpty(row[colAlto]) : "",
            "Profundidad (mm)": colProf !== -1 ? safeNumOrEmpty(row[colProf]) : "",
            "Peso (kg)": colPeso !== -1 ? safeNumOrEmpty(row[colPeso]) : "",
            "HS code": colHS !== -1 ? safeStr(row[colHS]) : "",
            "EAN code": colEAN !== -1 ? safeStr(row[colEAN]) : "",
            "Página web": colWeb !== -1 ? safeStr(row[colWeb]) : "",
            "EOL": colEOL !== -1 ? safeStr(row[colEOL]) : "",
            "Motivo de finalización de venta":
              colEOLReason !== -1 ? safeStr(row[colEOLReason]) : "",

            rawRow: row,
          };
        }

        const meta = {
          headerRowIndex,
          refHeader: headerRow[colRef] || null,
          priceHeader: headerRow[colMSRP] || null,
          descHeader: colName !== -1 ? headerRow[colName] : null,
        };

        resolve({ productosMap: productos, meta });
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

// =============================
// SUBIDA DE TARIFA A FIRESTORE
// =============================

async function onSubirTarifaClick() {
  const msg = document.getElementById("tarifaMensaje");
  const btnSubir = document.getElementById("btnSubirTarifa");

  if (msg) {
    msg.style.display = "none";
    msg.textContent = "";
  }

  const productos = appState.tarifaUpload.productos;
  const total = appState.tarifaUpload.total || 0;

  if (!productos || total === 0) {
    if (msg) {
      msg.className = "alert alert-warning mt-3";
      msg.textContent = "Primero debes leer un archivo de tarifa válido (paso 1).";
      msg.style.display = "flex";
    }
    return;
  }

  if (btnSubir) btnSubir.disabled = true;

  try {
    if (msg) {
      msg.className = "alert alert-info mt-3";
      msg.textContent = `Subiendo ${total} referencias a Firebase...`;
      msg.style.display = "flex";
    }

    const subidos = await subirTarifaAFirestore(productos);

    if (msg) {
      msg.className = "alert alert-success mt-3";
      msg.textContent = `Tarifa actualizada correctamente: ${subidos} referencias subidas a Firebase.`;
      msg.style.display = "flex";
    }

    actualizarEstadoTarifaFirebase();
  } catch (error) {
    console.error("Error subiendo tarifa a Firestore:", error);
    if (msg) {
      msg.className = "alert alert-error mt-3";
      msg.textContent =
        "Se ha producido un error al subir la tarifa a Firebase. Revisa la consola para más detalles.";
      msg.style.display = "flex";
    }
  } finally {
    if (btnSubir) btnSubir.disabled = false;
  }
}

// =============================
// ✅ VACIAR TARIFA EN FIRESTORE
// =============================

async function onVaciarTarifaClick() {
  const msg = document.getElementById("tarifaMensaje");
  const btnVaciar = document.getElementById("btnVaciarTarifa");
  const btnSubir = document.getElementById("btnSubirTarifa");

  const ok = confirm(
    "Vas a BORRAR toda la tarifa en Firebase (/tarifas/v1/productos).\n\n¿Seguro?"
  );
  if (!ok) return;

  if (msg) {
    msg.className = "alert alert-warning mt-3";
    msg.textContent = "Vaciando tarifa en Firebase...";
    msg.style.display = "flex";
  }

  if (btnVaciar) btnVaciar.disabled = true;
  if (btnSubir) btnSubir.disabled = true;

  try {
    const borrados = await vaciarTarifaEnFirestore();

    // limpiar estado local
    appState.tarifaUpload = { productos: null, total: 0 };

    if (msg) {
      msg.className = "alert alert-success mt-3";
      msg.textContent = `Tarifa vaciada correctamente. Documentos borrados: ${borrados}.`;
      msg.style.display = "flex";
    }

    actualizarEstadoTarifaFirebase();
  } catch (e) {
    console.error("Error vaciando tarifa:", e);
    if (msg) {
      msg.className = "alert alert-error mt-3";
      msg.textContent =
        "Error al vaciar la tarifa. Revisa la consola (permisos/reglas).";
      msg.style.display = "flex";
    }
  } finally {
    if (btnVaciar) btnVaciar.disabled = false;
    if (btnSubir) btnSubir.disabled = false;
  }
}

// =============================
// ESTADO DE LA TARIFA ACTUAL
// =============================

async function actualizarEstadoTarifaFirebase() {
  const estado = document.getElementById("tarifaEstado");
  if (!estado) return;

  estado.textContent = "Cargando información de la tarifa...";

  try {
    const tarifas = await getTarifas();
    const totalRefs = Object.keys(tarifas || {}).length;

    if (!tarifas || totalRefs === 0) {
      estado.innerHTML = `
        <p style="font-size:0.9rem; color:#4b5563;">
          No hay referencias de tarifa cargadas en Firebase todavía.
        </p>
      `;
      return;
    }

    estado.innerHTML = `
      <div class="metric-card">
        <span class="metric-label">REFERENCIAS CON PVP</span>
        <span class="metric-value">${totalRefs}</span>
      </div>
      <p class="mt-2" style="font-size:0.82rem; color:#4b5563;">
        Estos precios se utilizan automáticamente al generar los presupuestos.
      </p>
    `;
  } catch (error) {
    console.error("Error obteniendo estado de tarifa:", error);
    estado.innerHTML = `
      <p style="font-size:0.9rem; color:#b91c1c;">
        No se ha podido cargar la información de la tarifa. Revisa la consola.
      </p>
    `;
  }
}

console.log(
  "%cUI Tarifa cargada (ui_tarifa.js)",
  "color:#4f46e5; font-weight:600;"
);

window.renderTarifaView = renderTarifaView;
