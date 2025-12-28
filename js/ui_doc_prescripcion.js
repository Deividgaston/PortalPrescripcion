// js/ui_doc_prescripcion.js
// ========================================================
// PRESCRIPCIÓN 2N (versión premium Notion B3)
// --------------------------------------------------------
// PARTE 1
// Estado global, helpers, modal genérico, Firestore/Auth,
// helpers de presupuesto y generación de secciones
// ========================================================

window.appState = window.appState || {};

appState.prescripcion = appState.prescripcion || {
  capitulos: [],             // [{ id, nombre, texto, lineas: [...] }]
  selectedCapituloId: null,
  plantillas: [],            // [{ id, nombre, texto }]
  plantillasLoaded: false,
  extraRefs: [],             // [{ id, codigo, descripcion, unidad, pvp }]
  extraRefsLoaded: false,
  exportLang: "es",           // "es" | "en" | "pt"
  plantillasSearchTerm: "",
  extraRefsSearchTerm: "",
  sectionsFromBudget: []
};

// ========================================================
// Helpers generales
// ========================================================

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Render mínimo del capítulo seleccionado
function renderPrescCapituloSelected() {
  if (typeof renderPrescCapituloContent === "function") {
    renderPrescCapituloContent();
  }
}

// ========================================================
// MODAL GENÉRICO
// ========================================================

function openPrescModal({ title, bodyHTML, onSave }) {
  const modal = document.getElementById("prescModal");
  if (!modal) {
    console.warn("[PRESCRIPCIÓN] Modal no encontrado");
    return;
  }

  const titleEl = document.getElementById("prescModalTitle");
  const bodyEl = document.getElementById("prescModalBody");
  const btnSave = document.getElementById("prescModalSave");
  const btnClose = document.getElementById("prescModalClose");
  const btnCancel = document.getElementById("prescModalCancel");

  if (titleEl) titleEl.textContent = title || "";
  if (bodyEl) bodyEl.innerHTML = bodyHTML || "";

  modal.style.display = "flex";

  const close = () => {
    modal.style.display = "none";
    if (btnSave) btnSave.onclick = null;
    if (btnClose) btnClose.onclick = null;
    if (btnCancel) btnCancel.onclick = null;
  };

  if (btnClose) btnClose.onclick = close;
  if (btnCancel) btnCancel.onclick = close;

  if (btnSave) {
    btnSave.onclick = async () => {
      try {
        if (typeof onSave === "function") {
          // ✅ onSave debe devolver true (cerrar) o false (no cerrar)
          const shouldClose = await onSave();
          if (shouldClose === false) return; // 👈 se queda abierto
        }
        close(); // ✅ solo cerramos si ha ido bien o no devolvió false
      } catch (e) {
        console.error("[PRESCRIPCIÓN] Error en modal:", e);
        alert("Error al guardar. Revisa la consola.");
        // 👈 NO cerramos para que puedas corregir
      }
    };
  }
}
function openPrescImportModal() {
  openPrescModal({
    title: "Importar prescripción",
    bodyHTML: `
      <div class="form-group">
        <label>Formato</label>
        <select id="prescImportType" class="form-control">
          <option value="excel">Excel (.xlsx)</option>
          <option value="bc3">BC3 (.bc3)</option>
        </select>
      </div>

      <div class="form-group">
        <label>Archivo</label>
        <input id="prescImportFile" type="file" class="form-control" accept=".xlsx,.bc3" />
      </div>

      <p class="text-muted" style="font-size:0.75rem;">
        ⚠️ La importación reemplazará la prescripción actual.
      </p>
    `,
    onSave: async () => {
  const type = document.getElementById("prescImportType")?.value;
  const file = document.getElementById("prescImportFile")?.files?.[0];

  if (!file) {
    alert("Selecciona un archivo.");
    return false; // ✅ no cerrar
  }

  if (!confirm("Esto reemplazará la prescripción actual. ¿Continuar?")) {
    return false; // ✅ no cerrar
  }

  if (type === "excel") {
    await window.importPrescFromExcel(file);

  } else {
    await window.importPrescFromBc3(file);

  }

  renderDocPrescripcionView();
  return true; // ✅ cerrar
}

  });
}
async function importPrescFromExcel(file) {
  const ok = await ensureExcelDepsLoaded();
  if (!ok || !window.ExcelJS) {
    alert("No se puede importar: falta ExcelJS.");
    return;
  }

  // Convierte cualquier tipo de value de ExcelJS a texto “plano”
  const cellToText = (v) => {
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    if (v instanceof Date) return v.toISOString().split("T")[0];

    // ExcelJS típicos:
    if (v.text != null) return String(v.text);
    if (v.richText && Array.isArray(v.richText)) return v.richText.map(x => x?.text || "").join("");
    if (v.result != null) return String(v.result);
    if (v.formula != null) return String(v.result ?? "");
    if (v.hyperlink != null) return String(v.text ?? v.hyperlink);

    try { return String(v); } catch { return ""; }
  };

  const cellToNum = (v) => {
    const t = cellToText(v).replace(",", ".").trim();
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  };

  try {
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const ws = wb.worksheets?.[0];
    if (!ws) throw new Error("Excel sin hojas.");

    const newCaps = [];
    let currentCap = null;

    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);

      const Araw = row.getCell(1).value;
      const Braw = row.getCell(2).value;
      const Craw = row.getCell(3).value;
      const Draw = row.getCell(4).value;
      const Eraw = row.getCell(5).value;
      const Fraw = row.getCell(6).value;
      const Graw = row.getCell(7).value;

   const A = cellToText(Araw).trim();
const B = cellToText(Braw).trim();
const C = cellToText(Craw).trim();
const D = cellToText(Draw).trim();

const restEmpty =
  !B && !C && !D &&
  cellToText(Eraw).trim() === "" &&
  cellToText(Fraw).trim() === "" &&
  cellToText(Graw).trim() === "";

const isEmptyRow = !A && restEmpty;   // ✅ AÑADIR ESTO

if (isEmptyRow) continue;

      // ⛔ CIERRE DE CAPÍTULO
const firstCell = cellToText(row.getCell(1).value).toLowerCase();

if (
  firstCell.includes("subtotal capítulo") ||
  firstCell.includes("subtotal capitulo") ||
  firstCell.includes("total prescripción") ||
  firstCell.includes("total prescripcion")
) {
  currentCap = null;
  continue;
}

      
     // ✅ Detectar CAPÍTULO: "2N.01 ..." en A (o si viene en B por merges)
const Aclean = A.replace(/\u00A0/g, " ").trim(); // NBSP -> espacio normal
const Bclean = B.replace(/\u00A0/g, " ").trim();

const capMatch =
  Aclean.match(/(?:^|\s)(2N\.\d{2})\s+(.*)$/i) ||
  Bclean.match(/(?:^|\s)(2N\.\d{2})\s+(.*)$/i);

if (capMatch) {
  const code = capMatch[1];                 // 2N.04
  const title = (capMatch[2] || "").trim() || "Capítulo";

  currentCap = {
    id: prescUid("cap"),
    nombre: title,
    texto: "",
    lineas: [],
    sourceSectionId: null,
    sourceSectionRawId: null,
    __importCode: code
  };

  newCaps.push(currentCap);
  continue;
}


    // ✅ Detectar TEXTO descriptivo del capítulo (mergeado: puede venir en A o en C/B)
//    Regla: si NO hay números (qty/price/amount) y hay texto en A/B/C/D,
//    lo tratamos como texto del capítulo (salvo headers/meta/subtotales).
if (currentCap) {
  const qtyTxt = cellToText(Eraw).trim();
  const priceTxt = cellToText(Fraw).trim();
  const amtTxt = cellToText(Graw).trim();

  const qtyN = cellToNum(Eraw);
  const priceN = cellToNum(Fraw);
  const amtN = cellToNum(Graw);

  // ✅ Solo consideramos que “hay números” si hay algo y NO es cero
  const hasNums =
    (qtyTxt !== "" && qtyN !== 0) ||
    (priceTxt !== "" && priceN !== 0) ||
    (amtTxt !== "" && amtN !== 0);

  // primer texto no vacío entre A,B,C,D
  const textCand = [A, B, C, D].find((x) => String(x || "").trim());
  if (!hasNums && textCand) {
    const t = String(textCand).trim();
    const lower = t.toLowerCase();

    const isChapterHeader = /(?:^|\s)2N\.\d{2}(?:\s|$)/i.test(t);
    const isLineCodeOnly = /^2N\.\d{2}\.\d{2}$/i.test(t);

    const isMeta =
      lower.startsWith("prescrip") ||
      lower === "proyecto" ||
      lower === "fecha" ||
      lower === "capítulo" ||
      lower === "chapter" ||
      lower === "codigo" ||
      lower === "código" ||
      lower === "descripcion" ||
      lower === "descripción" ||
      lower === "ud" ||
      lower === "cant" ||
      lower === "cant." ||
      lower === "precio" ||
      lower === "pvp" ||
      lower === "importe" ||
      lower.startsWith("subtotal") ||
      lower.startsWith("total");

    if (!isMeta && !isChapterHeader && !isLineCodeOnly) {
      currentCap.texto = currentCap.texto ? (currentCap.texto + "\n" + t) : t;
      continue;
    }
  }
}


      // ✅ Detectar LÍNEA (solo si hay código real o números de medición)
if (currentCap && (B || C)) {
  const qtyTxt = cellToText(Eraw).trim();
  const priceTxt = cellToText(Fraw).trim();
  const amtTxt = cellToText(Graw).trim();

  const qty = cellToNum(Eraw);
  const price = cellToNum(Fraw);
  const amount = amtTxt ? cellToNum(Graw) : (qty * price);

  const codeOk =
    /^2N\.\d{2}\.\d{2}$/i.test(B) ||
    /^2N\.\d{2}\.\d{2}\.\d{2}$/i.test(B); // por si algún Excel viene con 3 niveles

  const hasNumbers = (qtyTxt !== "" || priceTxt !== "" || amtTxt !== "") && (qty > 0 || price > 0 || amount > 0);
  const unitOk = !D || String(D).trim().length <= 6; // Ud, m, m², h, etc.

  // 👉 Si NO es línea y parece un párrafo (típico "Marca: ...", merges en B/C),
  // lo consideramos TEXTO del capítulo (no referencias)
  const looksParagraph =
    !codeOk &&
    !hasNumbers &&
    unitOk &&
    ((B && B.length > 25) || (C && C.length > 25));

  if (looksParagraph) {
    const paragraph = (B ? B : C).trim();
    if (paragraph) {
      currentCap.texto = currentCap.texto ? (currentCap.texto + "\n" + paragraph) : paragraph;
      continue;
    }
  }

  // ✅ Línea real: requiere código o números de medición
  if (B && C && unitOk && (codeOk || hasNumbers)) {
    currentCap.lineas.push({
      id: prescUid("line"),
      tipo: "import",
      codigo: B,
      descripcion: C,
      unidad: D || "Ud",
      cantidad: qty,
      pvp: price,
      importe: amount,
      extraRefId: null
    });
    continue;
  }
}

    }

    if (!newCaps.length) {
      console.warn("[PRESC][IMPORT] No chapters detected. Debug A1..A60:");
      for (let i = 1; i <= Math.min(60, ws.rowCount); i++) {
        const a = cellToText(ws.getRow(i).getCell(1).value);
        if (a) console.log("Row", i, "A:", a);
      }

      alert("No he encontrado capítulos en el Excel. (Mira consola: imprime filas A para debug)");
      return;
    }

    appState.prescripcion.capitulos = newCaps;
    appState.prescripcion.selectedCapituloId = newCaps[0]?.id || null;

    renderDocPrescripcionView();
  } catch (e) {
    console.error("[PRESCRIPCIÓN] importPrescFromExcel error:", e);
    alert("No se pudo importar el Excel. Revisa consola.");
  }
}
window.importPrescFromExcel = importPrescFromExcel;


// ========================================================
// IMPORT BC3 (FIEBDC-3) → capítulos + líneas + texto capítulo
// ========================================================

async function importPrescFromBc3(file) {
  try {
    const buf = await file.arrayBuffer();

    // BC3 suele venir en latin1/Windows-1252. Probamos latin1 y fallback utf-8.
    let text = "";
    try {
      text = new TextDecoder("latin1").decode(buf);
    } catch (_) {
      text = new TextDecoder("utf-8").decode(buf);
    }

    // Normaliza saltos y elimina nulls raros
    text = String(text || "").replace(/\u0000/g, "").replace(/\r\n/g, "\n");

    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    // --- helpers ---
    const parseNum = (v) => {
      const s = String(v ?? "").trim().replace(",", ".");
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };

    // BC3 usa | como separador. A veces el texto lleva |; no lo vamos a “reconstruir perfecto”
    // pero sí guardaremos el resto del campo como texto unido.
    const splitBC3 = (line) => line.split("|"); // simple y suficiente para la mayoría

    // --- almacenamiento temporal ---
    const concepts = new Map();   // code -> { code, unit, desc, price }
    const textsMap = new Map();   // code -> "texto..."
    const qtyMap = new Map();     // itemCode -> qty (si aparece en M o D)
    const chapterOrder = [];      // orden de capítulos detectados (según aparecen)

    // patrones (tu estándar)
    const isChapterCode = (code) => /^2N\.\d{2}$/i.test(code);
    const isLineCode = (code) => /^2N\.\d{2}\.\d{2}(?:\.\d{2})?$/i.test(code);

    const pushChapterOrder = (chCode) => {
      if (!chCode) return;
      if (!chapterOrder.includes(chCode)) chapterOrder.push(chCode);
    };

    // --- 1) parsear registros ---
    for (const raw of lines) {
      // Ejemplos típicos:
      // ~C|CODIGO|UD|DESCRIPCION|PRECIO|...
      // ~T|CODIGO|TEXTO...
      // ~M|PADRE|HIJO|CANTIDAD|...
      // ~D|PADRE|HIJO|FACTOR|...
      if (!raw.startsWith("~")) continue;

      const recType = raw.slice(0, 2); // "~C", "~T", "~M", "~D", etc.
      const parts = splitBC3(raw);

      if (recType === "~C") {
        // FIEBDC: ~C|code|unit|desc|price|...
        const code = (parts[1] || "").trim();
        const unit = (parts[2] || "").trim() || "Ud";
        const desc = (parts[3] || "").trim();
        const price = parseNum(parts[4]);

        if (code) {
          concepts.set(code, { code, unit, desc, price });

          // si es capítulo, guardamos orden
          if (isChapterCode(code)) pushChapterOrder(code);
        }
        continue;
      }

      if (recType === "~T") {
        // ~T|code|texto... (puede tener más pipes)
        const code = (parts[1] || "").trim();
        if (!code) continue;

        const t = parts.slice(2).join("|").trim();
        if (!t) continue;

        const prev = textsMap.get(code) || "";
        textsMap.set(code, prev ? (prev + "\n" + t) : t);

        if (isChapterCode(code)) pushChapterOrder(code);
        continue;
      }

      if (recType === "~M") {
        // Medición: ~M|padre|hijo|qty|...
        const parent = (parts[1] || "").trim();
        const child  = (parts[2] || "").trim();
        const qty    = parseNum(parts[3]);

        if (child && qty) qtyMap.set(child, qty);
        if (isChapterCode(parent)) pushChapterOrder(parent);
        continue;
      }

      if (recType === "~D") {
        // Descomposición: ~D|padre|hijo|factor|...
        const parent = (parts[1] || "").trim();
        const child  = (parts[2] || "").trim();
        const factor = parseNum(parts[3]);

        // Si no hay qty en M, a veces D trae factor útil como cantidad
        if (child && factor && !qtyMap.has(child)) qtyMap.set(child, factor);
        if (isChapterCode(parent)) pushChapterOrder(parent);
        continue;
      }
    }

    // --- 2) construir capítulos ---
    // Si no detectamos capítulos por ~C/~T, intentamos inferir por prefijo de líneas
    if (!chapterOrder.length) {
      for (const code of concepts.keys()) {
        if (isLineCode(code)) {
          const m = String(code).match(/^2N\.(\d{2})/i);
          if (m) pushChapterOrder(`2N.${m[1]}`);
        }
      }
    }

    const newCaps = [];
    for (const chCode of chapterOrder) {
      const chConcept = concepts.get(chCode);
      const chTitle = (chConcept?.desc || chCode).trim() || "Capítulo";

      const cap = {
        id: prescUid("cap"),
        nombre: chTitle,
        texto: (textsMap.get(chCode) || "").trim(), // ✅ TEXTO del capítulo
        lineas: [],
        sourceSectionId: null,
        sourceSectionRawId: null,
        __importCode: chCode
      };

      // líneas pertenecientes al capítulo: 2N.XX.YY...
      const prefix = chCode + ".";
      const lineCodes = [];
      for (const code of concepts.keys()) {
        if (isLineCode(code) && String(code).startsWith(prefix)) {
          lineCodes.push(code);
        }
      }

      // orden por código numérico
      lineCodes.sort((a, b) =>
        String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" })
      );

      for (const lc of lineCodes) {
        const c = concepts.get(lc);
        if (!c) continue;

        const qty = qtyMap.has(lc) ? safeNumber(qtyMap.get(lc)) : 0;
        const price = safeNumber(c.price);
        const amount = qty * price;

        cap.lineas.push({
          id: prescUid("line"),
          tipo: "import",
          codigo: lc,
          descripcion: c.desc || "",
          unidad: c.unit || "Ud",
          cantidad: qty,
          pvp: price,
          importe: amount,
          extraRefId: null
        });
      }

      newCaps.push(cap);
    }

    if (!newCaps.length) {
      console.warn("[PRESC][BC3] No chapters detected. First lines:", lines.slice(0, 30));
      alert("No he podido detectar capítulos en el BC3. Revisa consola (BC3 no estándar o sin ~C/~T).");
      return;
    }

    // --- 3) aplicar al estado ---
    appState.prescripcion.capitulos = newCaps;
    appState.prescripcion.selectedCapituloId = newCaps[0]?.id || null;

    renderDocPrescripcionView();
  } catch (e) {
    console.error("[PRESCRIPCIÓN] importPrescFromBc3 error:", e);
    alert("No se pudo importar el BC3. Revisa consola.");
  }
}

window.importPrescFromBc3 = importPrescFromBc3;

// ========================================================
// Helpers Firestore / Auth (compat v8 / compat)
// ========================================================

function getFirestorePresc() {
  try {
    if (typeof window.getFirestoreInstance === "function") {
      const db = window.getFirestoreInstance();
      if (db) return db;
    }
    if (window.db) return window.db;
    if (window.firebase?.firestore) return window.firebase.firestore();
  } catch (e) {
    console.warn("[PRESCRIPCIÓN] Firestore no disponible", e);
  }
  return null;
}

function getAuthPresc() {
  try {
    if (typeof window.getAuthInstance === "function") {
      const a = window.getAuthInstance();
      if (a) return a;
    }
    if (window.auth) return window.auth;
    if (window.firebase?.auth) return window.firebase.auth();
  } catch (_) {}
  return null;
}

// ========================================================
// UID actual (robusto)
// ========================================================

function getCurrentUidPresc() {
  const auth = getAuthPresc();
  if (auth?.currentUser?.uid) return auth.currentUser.uid;

  try {
    if (window.appState?.user?.uid) return window.appState.user.uid;
    if (window.appState?.auth?.uid) return window.appState.auth.uid;
  } catch (_) {}

  return null;
}

function getPrescCollectionRefFallback(subName) {
  const db = getFirestorePresc();
  if (!db || typeof db.collection !== "function") return null;

  // ✅ Prescripción: SIEMPRE global (raíz)
  if (subName === "prescripcion_plantillas" || subName === "prescripcion_referencias_extra") {
    return db.collection(subName);
  }

  // (Si en el futuro usas otros subName y quieres mantener “por usuario”, lo dejas aquí)
  const byUser = getUserSubcollectionRefPresc(subName);
  if (byUser) return byUser;

  return db.collection(subName);
}


// ========================================================
// Contenedor principal
// ========================================================

function getPrescripcionAppContent() {
  if (typeof window.getDocAppContent === "function") return window.getDocAppContent();
  if (typeof window.getAppContent === "function") return window.getAppContent();
  return document.getElementById("appContent");
}

// ========================================================
// Presupuesto actual (safe)
// ========================================================

function getPresupuestoActualSafe() {
  if (typeof window.getPresupuestoActual === "function") {
    try {
      return window.getPresupuestoActual();
    } catch (e) {
      console.error("[PRESCRIPCIÓN] Error presupuesto:", e);
    }
  }
  return null;
}

// ========================================================
// Generación de secciones desde presupuesto
// ========================================================

function buildPrescSectionsFromPresupuesto() {
  const presu = getPresupuestoActualSafe();
  if (!presu) {
    appState.prescripcion.sectionsFromBudget = [];
    return [];
  }

  const seccionesMap = presu.secciones || presu.sections || {};
  const lineas = presu.lineas || presu.lines || presu.lineItems || [];

  const bySection = {};

  lineas.forEach((l) => {
    const secId =
      l.seccionId ||
      l.sectionId ||
      l.seccion ||
      l.capituloId ||
      l.chapterId ||
      "SIN_SECCION";

    if (!bySection[secId]) {
      const def = seccionesMap[secId] || {};
      bySection[secId] = {
        id: "sec-" + String(secId),
        rawId: secId,
        nombre:
          def.nombre ||
          def.name ||
          def.titulo ||
          def.title ||
          (secId === "SIN_SECCION" ? "Sin sección" : String(secId)),
        refs: [],
        totalRefs: 0,
        totalImporte: 0
      };
    }

    const cantidad = safeNumber(l.cantidad ?? l.qty ?? l.unidades ?? 1);
    const pvp = safeNumber(l.pvp ?? l.precio ?? l.price);
    const unidad = l.unidad ?? l.ud ?? l.unit ?? "Ud";
    const importe = cantidad * pvp;

    bySection[secId].refs.push({
      codigo: l.codigo ?? l.ref ?? l.sku ?? "",
      descripcion:
        l.descripcion ??
        l.desc ??
        l.concepto ??
        l.nombre ??
        l.title ??
        "",
      unidad,
      cantidad,
      pvp,
      importe
    });

    bySection[secId].totalRefs += 1;
    bySection[secId].totalImporte += importe;
  });

  const arr = Object.values(bySection).sort((a, b) =>
    String(a.nombre).localeCompare(String(b.nombre), "es")
  );

  appState.prescripcion.sectionsFromBudget = arr;
  return arr;
}

function ensurePrescSectionsFromBudget() {
  if (!Array.isArray(appState.prescripcion.sectionsFromBudget) ||
      !appState.prescripcion.sectionsFromBudget.length) {
    return buildPrescSectionsFromPresupuesto();
  }
  return appState.prescripcion.sectionsFromBudget;
}

// ========================================================
// FIN PARTE 1
// ========================================================
// ========================================================
// PARTE 2
// Render principal de Prescripción + layout base
// ========================================================

function renderDocPrescripcionView() {
  const container = getPrescripcionAppContent();
  if (!container) return;

  // Asegurar datos base
  ensurePrescSectionsFromBudget();
  appState.prescripcion.plantillas = appState.prescripcion.plantillas || [];
  appState.prescripcion.extraRefs = appState.prescripcion.extraRefs || [];

  const currentLang = appState.prescripcion.exportLang || "es";

  container.innerHTML = `
    <div class="presc-root"
         style="display:flex; flex-direction:column; height:100%; overflow:hidden;">

      <!-- CABECERA -->
      <div class="card" style="margin-bottom:0.75rem;">
        <div class="card-header"
             style="display:flex; justify-content:space-between; align-items:center; gap:1rem;">
          <div>
            <div class="card-title">Prescripción técnica del proyecto</div>
            <div class="card-subtitle">
              Genera capítulos desde el presupuesto y completa con plantillas y referencias extra.
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:0.4rem; align-items:flex-end;">
            <div style="display:flex; gap:0.4rem; align-items:center;">
              <span style="font-size:0.75rem; color:#6b7280;">Idioma</span>
              <select id="prescExportLang"
                      class="form-control form-control-sm"
                      style="min-width:130px; font-size:0.75rem;">
                <option value="es" ${currentLang === "es" ? "selected" : ""}>Castellano</option>
                <option value="en" ${currentLang === "en" ? "selected" : ""}>English</option>
                <option value="pt" ${currentLang === "pt" ? "selected" : ""}>Português</option>
              </select>
            </div>

            <div style="display:flex; gap:0.4rem; flex-wrap:wrap; justify-content:flex-end;">
  <button id="prescReloadSectionsBtn" class="btn btn-outline btn-sm">🔄 Secciones</button>
  <button id="prescImportBtn" class="btn btn-sm btn-outline">⬆️ Importar</button>
  <button id="prescExportExcelBtn" class="btn btn-sm btn-outline">⬇️ Excel</button>
  <button id="prescExportPdfBtn" class="btn btn-sm btn-outline">⬇️ PDF</button>
  <button id="prescExportBc3Btn" class="btn btn-sm btn-outline">⬇️ BC3</button>
</div>


          </div>
        </div>
      </div>

       <!-- CUERPO PRINCIPAL (altura reducida ~50% para dar más espacio a la preview) -->
      <div class="presc-layout"
           style="
             flex:0 0 50%;
             display:grid;
             grid-template-columns:1fr 1.4fr 1.2fr;
             gap:0.75rem;
             overflow:hidden;
             min-height:0;
           ">

        <!-- COLUMNA 1: SECCIONES -->
        <div class="card" style="display:flex; flex-direction:column; overflow:hidden;">
          <div class="card-header">
            <div class="card-title">Secciones</div>
            <div class="card-subtitle">Arrastra para crear capítulos</div>
          </div>
          <div id="prescSectionsList"
               class="card-body"
               style="flex:1; overflow:auto; padding:0.75rem;">
          </div>
        </div>

        <!-- COLUMNA 2: CAPÍTULO -->
        <div class="card" style="display:flex; flex-direction:column; overflow:hidden;">
          <div class="card-header"
               style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
            <div>
              <div class="card-title">Capítulo</div>
              <div class="card-subtitle">Texto y referencias</div>
            </div>
            <div style="display:flex; gap:0.25rem;">
              <button id="prescCapNuevoBtn"
                      class="btn btn-xs btn-secondary"
                      title="Nuevo capítulo">＋</button>
              <button id="prescCapGuardarBtn"
                      class="btn btn-xs btn-secondary"
                      title="Guardar capítulo">💾</button>
            </div>
          </div>

          <div id="prescCapituloContent"
               class="card-body"
               style="flex:1; overflow:auto; min-height:0;">
          </div>
        </div>

        <!-- COLUMNA 3: PLANTILLAS / EXTRAS -->
        <div style="display:flex; flex-direction:column; gap:0.75rem; overflow:hidden; min-height:0;">

          <div class="card"
               style="flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden;">
            <div class="card-header">
              <div class="card-title">Plantillas</div>
              <div class="card-subtitle">Texto técnico reutilizable</div>
            </div>
            <div id="prescPlantillasList"
                 class="card-body"
                 style="flex:1; overflow:auto;">
            </div>
          </div>

          <div class="card"
               style="flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden;">
            <div class="card-header">
              <div class="card-title">Referencias extra</div>
              <div class="card-subtitle">Materiales y mano de obra</div>
            </div>
            <div id="prescExtraRefsList"
                 class="card-body"
                 style="flex:1; overflow:auto;">
            </div>
          </div>
        </div>
      </div>


           <!-- PREVIEW (más accesible) -->
      <div class="card" style="flex:1; min-height:0; margin-top:0.75rem; overflow:hidden;">
        <div class="card-header">
          <div class="card-title">Previsualización</div>
          <div class="card-subtitle">Resumen por capítulos</div>
        </div>
        <div id="prescPreview" class="card-body" style="overflow:auto; min-height:0;"></div>
      </div>
 </div>  <!-- ✅ ESTA LÍNEA FALTABA -->
  `;

  // =====================
  // HANDLERS CABECERA
  // =====================

  const langSelect = container.querySelector("#prescExportLang");
  if (langSelect) {
    langSelect.addEventListener("change", () => {
      appState.prescripcion.exportLang = langSelect.value || "es";
    });
  }

  container.querySelector("#prescReloadSectionsBtn")?.addEventListener("click", () => {
    buildPrescSectionsFromPresupuesto();
    renderDocPrescripcionView();
  });

  container.querySelector("#prescExportExcelBtn")?.addEventListener("click", () => {
    handlePrescExport("excel");
  });
  container.querySelector("#prescExportPdfBtn")?.addEventListener("click", () => {
    handlePrescExport("pdf");
  });
  container.querySelector("#prescExportBc3Btn")?.addEventListener("click", () => {
    handlePrescExport("bc3");
  });

  container.querySelector("#prescCapNuevoBtn")?.addEventListener("click", () => {
    createManualCapitulo();
    renderDocPrescripcionView();
  });
  container.querySelector("#prescImportBtn")?.addEventListener("click", () => {
  openPrescImportModal();
});

  container.querySelector("#prescCapGuardarBtn")?.addEventListener("click", () => {
  // Guardar = no crear capítulo nuevo
  // De momento solo refrescamos preview
  renderPrescPreview();
});


  // SUB-RENDERS
  renderPrescSectionsList();
  renderPrescCapituloContent();
  attachPrescDropZone();
  renderPrescPlantillasList();
  renderPrescExtraRefsList();
  renderPrescPreview();

  // ✅ Reintento 1 vez si todavía no había presupuesto en el primer render
  requestAnimationFrame(() => {
    const presu = getPresupuestoActualSafe();
    const empty = !appState.prescripcion.sectionsFromBudget?.length;
    if (presu && empty) {
      buildPrescSectionsFromPresupuesto();
      renderPrescSectionsList();
    }
  });
}


// ========================================================
// FIN PARTE 2
// ========================================================
// ========================================================
// PARTE 3
// Secciones del presupuesto (columna izquierda) + drag
// ========================================================

function renderPrescSectionsList() {
  const container = document.getElementById("prescSectionsList");
  if (!container) return;

  const sections = ensurePrescSectionsFromBudget();
  if (!sections || !sections.length) {
    container.innerHTML = `
      <p class="text-muted" style="padding:0.5rem; font-size:0.8rem;">
        No hay secciones en el presupuesto actual.
      </p>
    `;
    return;
  }

  container.innerHTML = sections
    .map((sec) => {
      const preview = (sec.refs || [])
        .slice(0, 3)
        .map((r) => `${escapeHtml(r.descripcion || "")} x${safeNumber(r.cantidad)}`)
        .join(" • ");

      return `
        <div class="presc-section-card"
             draggable="true"
             data-section-id="${escapeHtmlAttr(sec.id)}"
             title="Arrastra esta sección para crear o actualizar un capítulo">
          <div class="presc-section-title">${escapeHtml(sec.nombre || "")}</div>
          <div class="presc-section-preview">
            ${preview ? preview : "<i>Sin referencias</i>"}
          </div>
        </div>
      `;
    })
    .join("");

  attachPrescSectionsDragHandlers();
}

// ========================================================
// Estilos cards secciones (inyectado 1 vez)
// ========================================================
(function injectPrescSectionStyles() {
  if (document.getElementById("presc-section-styles")) return;

  const style = document.createElement("style");
  style.id = "presc-section-styles";
  style.innerHTML = `
    .presc-section-card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 0.75rem 1rem;
      margin-bottom: 0.75rem;
      background: #ffffff;
      cursor: grab;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      transition: all 0.15s ease;
      user-select: none;
    }
    .presc-section-card:hover {
      box-shadow: 0 2px 6px rgba(0,0,0,0.12);
      transform: translateY(-1px);
    }
    .presc-section-card:active {
      cursor: grabbing;
      transform: scale(0.98);
    }
    .presc-section-title {
      font-size: 0.95rem;
      font-weight: 650;
      margin-bottom: 0.35rem;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .presc-section-preview {
      font-size: 0.78rem;
      color: #6b7280;
      line-height: 1.25;
    }
  `;
  document.head.appendChild(style);
})();

// ========================================================
// Drag handlers secciones
// ========================================================
function attachPrescSectionsDragHandlers() {
  document
    .querySelectorAll(".presc-section-card[draggable='true']")
    .forEach((el) => {
      el.addEventListener("dragstart", (ev) => {
        const secId = el.getAttribute("data-section-id") || "";
        try {
          // Custom type (tu enfoque original)
          ev.dataTransfer.setData("text/presc-section-id", secId);
          // Fallback universal (Safari/Chrome): text/plain
          ev.dataTransfer.setData("text/plain", "presc-section-id:" + secId);
          ev.dataTransfer.effectAllowed = "copy";
        } catch (_) {}
        el.style.opacity = "0.6";
      });

      el.addEventListener("dragend", () => {
        el.style.opacity = "1";
      });
    });
}


// ========================================================
// FIN PARTE 3
// ========================================================
// ========================================================
// PARTE 4
// Drop de secciones → capítulos
// ========================================================
function attachPrescDropZone() {
  const dropZone = document.getElementById("prescCapituloContent");
  if (!dropZone) return;

  const canAccept = (dt) => {
    try {
      const types = Array.from(dt?.types || []);
      if (types.includes("text/presc-section-id")) return true;
      if (types.includes("text/presc-plantilla-id")) return true;
      if (types.includes("text/presc-extra-id")) return true;
      if (types.includes("text/plain")) return true; // fallback
    } catch (_) {}
    return false;
  };

  dropZone.addEventListener("dragover", (ev) => {
    if (!canAccept(ev.dataTransfer)) return;
    ev.preventDefault();
    dropZone.style.background = "#f9fafb";
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.style.background = "transparent";
  });

  dropZone.addEventListener("drop", (ev) => {
    ev.preventDefault();
    dropZone.style.background = "transparent";

    const dt = ev.dataTransfer;

    // 1) Sección (custom)
    let secId = "";
    try { secId = dt.getData("text/presc-section-id") || ""; } catch (_) {}
    if (secId) {
      handleSectionDrop(secId);
      renderPrescCapituloContent();
      renderPrescPreview();
      return;
    }

    // 2) Plantilla (custom)
    let tplId = "";
    try { tplId = dt.getData("text/presc-plantilla-id") || ""; } catch (_) {}
    if (tplId) {
      handlePlantillaDrop(tplId);
      renderPrescCapituloContent();
      renderPrescPreview();
      return;
    }

    // 3) Extra ref (custom)
    let extraId = "";
    try { extraId = dt.getData("text/presc-extra-id") || ""; } catch (_) {}
    if (extraId) {
      handleExtraRefDrop(extraId);
      renderPrescCapituloContent();
      renderPrescPreview();
      return;
    }

    // 4) Fallback universal: text/plain
    let plain = "";
    try { plain = dt.getData("text/plain") || ""; } catch (_) {}

    if (plain.startsWith("presc-section-id:")) {
      handleSectionDrop(plain.replace("presc-section-id:", ""));
      renderPrescCapituloContent();
      renderPrescPreview();
      return;
    }
    if (plain.startsWith("presc-plantilla-id:")) {
      handlePlantillaDrop(plain.replace("presc-plantilla-id:", ""));
      renderPrescCapituloContent();
      renderPrescPreview();
      return;
    }
    if (plain.startsWith("presc-extra-id:")) {
      handleExtraRefDrop(plain.replace("presc-extra-id:", ""));
      renderPrescCapituloContent();
      renderPrescPreview();
      return;
    }
  });
}


function handleSectionDrop(secId) {
  const sections = ensurePrescSectionsFromBudget();
  const sec = sections.find((s) => s.id === secId);
  if (!sec) {
    console.warn("[PRESCRIPCIÓN] Sección no encontrada:", secId);
    return;
  }

  ensurePrescCapitulosArray();

  // 1) Si ya existe un capítulo creado desde ESTA sección → lo seleccionamos
  const existingCap = (appState.prescripcion.capitulos || []).find((c) =>
    String(c.sourceSectionId || "") === String(sec.id || "") ||
    String(c.sourceSectionRawId || "") === String(sec.rawId || "")
  );

  if (existingCap) {
    appState.prescripcion.selectedCapituloId = existingCap.id;

    // Si el capítulo existente es el seleccionado, preguntamos overwrite/append
    // Si no lo era, lo seleccionamos y preguntamos igual (sin crear duplicados)
    askOverwriteOrAppend(sec, existingCap);
    return;
  }

  // 2) Si no existe capítulo vinculado, usamos el seleccionado si lo hay
  const capActual = getSelectedCapitulo();
  if (!capActual) {
    createChapterFromSection(sec);
    return;
  }

  askOverwriteOrAppend(sec, capActual);
}

function ensureCapExistsForDrop() {
  let cap = getSelectedCapitulo();
  if (cap) return cap;
  cap = createManualCapitulo();
  return cap;
}

function handlePlantillaDrop(tplId) {
  const cap = ensureCapExistsForDrop();
  const list = appState.prescripcion.plantillas || [];
  const tpl = list.find((p) => String(p.id) === String(tplId));
  if (!tpl) return;

  const incoming = String(tpl.texto || "");
  if (!incoming) return;

  // ✅ MARCA ORIGEN
  cap.__hasTemplateText = true;

  if (String(cap.texto || "").trim()) {
    const ok = confirm(
      "El capítulo ya tiene texto. ¿Quieres AÑADIR la plantilla al final?\n\nAceptar = Añadir\nCancelar = Sobrescribir"
    );
    cap.texto = ok ? (cap.texto + "\n\n" + incoming) : incoming;
  } else {
    cap.texto = incoming;
  }
}


function handleExtraRefDrop(extraId) {
  // Reutiliza tu función existente
  addExtraRefToCurrentCap(extraId);
}


function createChapterFromSection(sec) {
  const id = prescUid("cap");

  appState.prescripcion.capitulos.push({
    id,
    nombre: sec.nombre || "Capítulo",
    texto: "",
    lineas: cloneSectionRefs(sec),

    // ✅ vínculo sección→capítulo (clave para no duplicar)
    sourceSectionId: sec.id || null,       // "sec-XXX"
    sourceSectionRawId: sec.rawId || null  // id real del presupuesto
  });

  appState.prescripcion.selectedCapituloId = id;
}

// IDs robustos (evita colisiones con Date.now())
let __prescUidSeq = 0;
function prescUid(prefix = "id") {
  __prescUidSeq = (__prescUidSeq + 1) % 1e9;
  const rnd = Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now()}-${__prescUidSeq}-${rnd}`;
}

function cloneSectionRefs(sec) {
  return (sec.refs || []).map((r) => ({
    id: prescUid("line"),
    tipo: "budget",
    codigo: r.codigo || "",
    descripcion: r.descripcion || "",
    unidad: r.unidad ?? r.ud ?? r.unit ?? "Ud",
    cantidad: safeNumber(r.cantidad),
    pvp: safeNumber(r.pvp),
    importe: safeNumber(r.importe),
    extraRefId: null
  }));
}

// ========================================================
// Modal overwrite / append
// ========================================================

function askOverwriteOrAppend(sec, cap) {
  openPrescModal({
    title: "¿Cómo quieres aplicar la sección?",
    bodyHTML: `
      <p style="margin-bottom:0.75rem;">
        Sección <strong>${escapeHtml(sec.nombre)}</strong>
        sobre capítulo <strong>${escapeHtml(cap.nombre || "(sin título)")}</strong>
      </p>
      <label style="display:block; margin-bottom:0.35rem;">
        <input type="radio" name="prescSecAction" value="overwrite" checked>
        Sobrescribir capítulo
      </label>
      <label style="display:block;">
        <input type="radio" name="prescSecAction" value="append">
        Añadir referencias
      </label>
    `,
    onSave: () => {
      const action =
        document.querySelector("input[name='prescSecAction']:checked")?.value ||
        "overwrite";

      if (action === "overwrite") {
        overwriteChapterWithSection(cap, sec);
      } else {
        appendSectionToChapter(cap, sec);
      }
    }
  });
}

function overwriteChapterWithSection(cap, sec) {
  cap.nombre = sec.nombre || cap.nombre;
  cap.texto = "";
  cap.lineas = cloneSectionRefs(sec);

  // ✅ FIX
  appState.prescripcion.selectedCapituloId = cap.id;
  renderPrescCapituloContent();
}


function appendSectionToChapter(cap, sec) {
  const existing = cap.lineas || [];
  const incoming = cloneSectionRefs(sec);

  incoming.forEach((r) => {
    const dup = existing.find(
      (ex) =>
        ex.codigo === r.codigo &&
        ex.descripcion === r.descripcion &&
        ex.unidad === r.unidad &&
        safeNumber(ex.pvp) === safeNumber(r.pvp)
    );
    if (!dup) existing.push(r);
  });

  cap.lineas = existing;

  // ✅ FIX
  appState.prescripcion.selectedCapituloId = cap.id;
  renderPrescCapituloContent();
}

// ========================================================
// FIN PARTE 4
// ========================================================
// ========================================================
// PARTE 5
// Capítulos: helpers + render columna central
// ========================================================

function ensurePrescCapitulosArray() {
  if (!appState.prescripcion) appState.prescripcion = {};
  if (!Array.isArray(appState.prescripcion.capitulos)) {
    appState.prescripcion.capitulos = [];
  }
}

function getSelectedCapitulo() {
  ensurePrescCapitulosArray();
  const caps = appState.prescripcion.capitulos;
  if (!caps.length) return null;

  let selId = appState.prescripcion.selectedCapituloId;
  if (!selId) {
    selId = caps[0].id;
    appState.prescripcion.selectedCapituloId = selId;
  }

  return caps.find((c) => c.id === selId) || caps[0] || null;
}

function setSelectedCapitulo(id) {
  appState.prescripcion.selectedCapituloId = id || null;
}

// Crea capítulo manual (NO re-render aquí; lo hace el caller)
function createManualCapitulo() {
  ensurePrescCapitulosArray();

  const id = "manual-" + prescUid("cap");

  const nuevo = {
    id,
    nombre: "Capítulo manual",
    texto: "",
    lineas: []
  };

  appState.prescripcion.capitulos.push(nuevo);
  appState.prescripcion.selectedCapituloId = id;

  console.log("[PRESCRIPCIÓN] Capítulo manual creado:", nuevo);
  return nuevo;
}

function deleteCapituloById(capId) {
  ensurePrescCapitulosArray();
  const caps = appState.prescripcion.capitulos || [];
  const idx = caps.findIndex((c) => c.id === capId);
  if (idx === -1) {
    console.warn("[PRESCRIPCIÓN] No se encontró el capítulo a borrar:", capId);
    return false;
  }

  const ok = window.confirm("¿Seguro que quieres eliminar este capítulo de la prescripción?");
  if (!ok) return false;

  caps.splice(idx, 1);

  if (appState.prescripcion.selectedCapituloId === capId) {
    appState.prescripcion.selectedCapituloId = caps.length ? caps[0].id : null;
  }

  // limpieza estados UI opcionales
  if (appState.prescripcion.previewExpanded && appState.prescripcion.previewExpanded[capId]) {
    delete appState.prescripcion.previewExpanded[capId];
  }

  return true;
}

// ========================================================
// Render columna central (Capítulo seleccionado)
// ========================================================

function prescComputeImporte(linea) {
  const qty = safeNumber(linea?.cantidad);
  const pvp = safeNumber(linea?.pvp);
  return qty * pvp;
}

function prescNormalizeLine(linea) {
  if (!linea) return linea;
  if (linea.importe == null || !Number.isFinite(Number(linea.importe))) {
    linea.importe = prescComputeImporte(linea);
  } else {
    // si hay desajuste fuerte, preferimos coherencia qty*pvp
    const calc = prescComputeImporte(linea);
    const cur = safeNumber(linea.importe);
    if (Math.abs(calc - cur) > 0.01) linea.importe = calc;
  }
  return linea;
}

function renderPrescCapituloContent() {
  const container = document.getElementById("prescCapituloContent");
  if (!container) return;

  const cap = getSelectedCapitulo();

  if (!cap) {
    container.innerHTML = `
      <p class="text-muted" style="font-size:0.85rem;">
        Aún no hay capítulos creados. Puedes:
      </p>
      <ul class="text-muted" style="font-size:0.8rem; padding-left:1.2rem;">
        <li>Crear un capítulo manual con el botón <strong>"＋"</strong>.</li>
        <li>Arrastrar una sección del presupuesto a esta zona para generar un capítulo automáticamente.</li>
      </ul>
    `;
    return;
  }

  cap.lineas = Array.isArray(cap.lineas) ? cap.lineas : [];
  cap.lineas.forEach(prescNormalizeLine);

  const lineas = cap.lineas || [];

  let refsHTML = "";
  if (!lineas.length) {
    refsHTML = `
      <p class="text-muted" style="font-size:0.8rem;">
        Este capítulo no tiene referencias todavía. Arrastra una sección del presupuesto o añade referencias extra desde la derecha.
      </p>
    `;
  } else {
    refsHTML = `
      <div style="overflow:auto;">
        <table class="table table-compact" style="width:100%; font-size:0.8rem; border-collapse:collapse; min-width:720px;">
          <thead>
            <tr>
              <th style="text-align:left;">Código</th>
              <th style="text-align:left;">Descripción</th>
              <th style="text-align:center;">Ud</th>
              <th style="text-align:right;">Cant.</th>
              <th style="text-align:right;">PVP</th>
              <th style="text-align:right;">Importe</th>
              <th style="width:2.5rem;"></th>
            </tr>
          </thead>
          <tbody>
            ${lineas
              .map((l) => {
                const isExtra = l.tipo === "extra";
                const cod = escapeHtml(l.codigo || "");
                const desc = escapeHtml(l.descripcion || "");
                const unidad = escapeHtml(l.unidad || "Ud");
                const cant = safeNumber(l.cantidad);
                const pvp = safeNumber(l.pvp);
                const importe = prescComputeImporte(l);

                // mantenemos importe actualizado en estado
                l.importe = importe;

                return `
                  <tr data-presc-line-id="${escapeHtmlAttr(l.id)}">
                    <td>${cod}</td>
                    <td>${desc}</td>
                    <td style="text-align:center;">${unidad}</td>
                    <td style="text-align:right;">
                      ${
                        isExtra
                          ? `<input type="number" min="0" step="0.01"
                                   class="presc-line-qty-input"
                                   value="${cant}"
                                   style="width:4.8rem; text-align:right; font-size:0.78rem;" />`
                          : cant
                      }
                    </td>
                    <td style="text-align:right;">${pvp.toFixed(2)} €</td>
                    <td class="presc-line-imp" style="text-align:right;">${importe.toFixed(2)} €</td>
                    <td style="text-align:center;">
                      ${
                        isExtra
                          ? `<button type="button"
                                     class="btn btn-xs btn-outline presc-line-del-btn"
                                     title="Quitar referencia extra">
                               ✖
                             </button>`
                          : ""
                      }
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:0.75rem;">
      <div class="form-group">
        <label>Título del capítulo</label>
        <input id="prescCapTitulo"
               type="text"
               class="form-control"
               value="${escapeHtmlAttr(cap.nombre || "")}" />
      </div>

      <div class="form-group">
        <label>Texto descriptivo (mediciones)</label>
        <textarea id="prescCapTexto"
                  class="form-control"
                  style="width:100%; min-height:130px; resize:vertical;"
                  placeholder="Aquí puedes escribir o pegar el texto técnico de mediciones del capítulo...">${escapeHtml(cap.texto || "")}</textarea>
      </div>

      <div class="form-group">
        <label>Referencias del capítulo</label>
        ${refsHTML}
      </div>
    </div>
  `;

  // Título
  const tituloInput = container.querySelector("#prescCapTitulo");
  if (tituloInput) {
    tituloInput.addEventListener("input", (ev) => {
      cap.nombre = ev.target.value || "";
      // Si existe preview, refrescamos sólo preview para ver título al instante
      if (typeof renderPrescPreview === "function") renderPrescPreview();
    });
  }

  // Texto
  const textoArea = container.querySelector("#prescCapTexto");
  if (textoArea) {
    textoArea.addEventListener("input", (ev) => {
      cap.texto = ev.target.value || "";
      // Preview opcional
      if (typeof renderPrescPreview === "function") renderPrescPreview();
    });
  }

  // Qty + delete en líneas extra (sin render completo)
  container.querySelectorAll("tr[data-presc-line-id]").forEach((row) => {
    const lineId = row.getAttribute("data-presc-line-id");
    const linea = (cap.lineas || []).find((l) => String(l.id) === String(lineId));
    if (!linea) return;

    if (linea.tipo === "extra") {
      const qtyInput = row.querySelector(".presc-line-qty-input");
      const delBtn = row.querySelector(".presc-line-del-btn");
      const impCell = row.querySelector(".presc-line-imp");

      if (qtyInput) {
        qtyInput.addEventListener("input", () => {
          linea.cantidad = safeNumber(qtyInput.value);
          linea.importe = prescComputeImporte(linea);

          if (impCell) impCell.textContent = linea.importe.toFixed(2) + " €";

          // refrescar total/preview sin re-render completo si existe
          if (typeof renderPrescPreview === "function") renderPrescPreview();
        });
      }

      if (delBtn) {
        delBtn.addEventListener("click", () => {
          cap.lineas = (cap.lineas || []).filter((l) => l.id !== lineId);
          // Re-render solo panel central + preview
          renderPrescCapituloContent();
          if (typeof renderPrescPreview === "function") renderPrescPreview();
        });
      }
    }
  });
}

// ========================================================
// FIN PARTE 5
// ========================================================
// ========================================================
// PARTE 6
// Plantillas + Referencias extra (Firestore + render)
// ========================================================

// ========================================================
// Auth helper: asegurar UID antes de Firestore
// ========================================================

function ensurePrescUidReady(timeoutMs = 15000) {
  return new Promise((resolve) => {
    const uidNow = getCurrentUidPresc();
    if (uidNow) return resolve(uidNow);

    const auth = getAuthPresc();
    if (!auth || typeof auth.onAuthStateChanged !== "function") {
      return resolve(null);
    }

    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(getCurrentUidPresc());
    }, timeoutMs);

    auth.onAuthStateChanged((user) => {
      if (done) return;
      if (user?.uid) {
        done = true;
        clearTimeout(timer);
        resolve(user.uid);
      }
    });
  });
}

// ========================================================
// PLANTILLAS (Firestore)
// ========================================================

async function ensurePrescPlantillasLoaded() {
  await ensurePrescUidReady();
  if (appState.prescripcion.plantillasLoaded) return;

  appState.prescripcion.plantillas = appState.prescripcion.plantillas || [];

  const db = getFirestorePresc();
  if (!db) {
    appState.prescripcion.plantillasLoaded = true;
    return;
  }

  try {
    const ref = getPrescCollectionRefFallback("prescripcion_plantillas");
    if (!ref) throw new Error("No subcollection ref");

    const snap = await ref.get();
    const list = [];

    snap.forEach((doc) => {
      const d = doc.data() || {};
      list.push({
        id: doc.id,
        nombre: d.nombre || "(sin nombre)",
        texto: d.texto || ""
      });
    });

    appState.prescripcion.plantillas = list;
  } catch (e) {
    console.error("[PRESCRIPCIÓN] Error cargando plantillas:", e);
  } finally {
    appState.prescripcion.plantillasLoaded = true;
  }
}

async function createPrescPlantilla(nombre, texto) {
  await ensurePrescUidReady();
  nombre = (nombre || "").trim();
  texto = texto || "";
  if (!nombre) return alert("La plantilla necesita un nombre.");

  const local = {
    id: "local-" + Date.now(),
    nombre,
    texto
  };

  appState.prescripcion.plantillas.unshift(local);

  const db = getFirestorePresc();
  const ref = getPrescCollectionRefFallback("prescripcion_plantillas");
  if (!db || !ref) return;

  try {
    const doc = await ref.add({
      nombre,
      texto,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    local.id = doc.id;
  } catch (e) {
    console.error("[PRESCRIPCIÓN] Error creando plantilla:", e);
  }
}

async function updatePrescPlantilla(id, nombre, texto) {
  await ensurePrescUidReady();
  const list = appState.prescripcion.plantillas || [];
  const idx = list.findIndex((p) => p.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], nombre, texto };
  }

  const ref = getPrescCollectionRefFallback("prescripcion_plantillas");
  if (!ref) return;

  try {
    await ref.doc(id).update({ nombre, texto, updatedAt: Date.now() });
  } catch (e) {
    console.error("[PRESCRIPCIÓN] Error actualizando plantilla:", e);
  }
}

async function deletePrescPlantilla(id) {
  await ensurePrescUidReady();
  if (!confirm("¿Eliminar esta plantilla?")) return;

  appState.prescripcion.plantillas =
    (appState.prescripcion.plantillas || []).filter((p) => p.id !== id);

  const ref = getPrescCollectionRefFallback("prescripcion_plantillas");
  if (!ref) return;

  try {
    await ref.doc(id).delete();
  } catch (e) {
    console.error("[PRESCRIPCIÓN] Error borrando plantilla:", e);
  }
}

// ========================================================
// RENDER PLANTILLAS (fix bug buscador 1 carácter)
// ========================================================

async function renderPrescPlantillasList() {
  const container = document.getElementById("prescPlantillasList");
  if (!container) return;

  await ensurePrescPlantillasLoaded();

  const list = appState.prescripcion.plantillas || [];
  const term = (appState.prescripcion.plantillasSearchTerm || "").toLowerCase();

  const filtered = list.filter((p) =>
    !term ||
    (p.nombre + " " + p.texto).toLowerCase().includes(term)
  );

  container.innerHTML = `
    <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem;">
      <input id="prescPlantillasSearch"
             class="form-control form-control-sm"
             placeholder="Buscar plantilla..."
             value="${escapeHtmlAttr(appState.prescripcion.plantillasSearchTerm || "")}">
      <button id="prescNewPlantillaBtn" class="btn btn-xs btn-secondary">＋</button>
    </div>
    ${filtered.map(p => `
      <div class="presc-plantilla-item" draggable="true" data-id="${escapeHtmlAttr(p.id)}">
        <div style="font-weight:600;">📄 ${escapeHtml(p.nombre)}</div>
        <div style="font-size:0.75rem; color:#6b7280;">
          ${(p.texto || "").slice(0, 140)}${p.texto.length > 140 ? "…" : ""}
        </div>
        <div style="margin-top:0.25rem; text-align:right;">
          <button class="btn btn-xs" data-apply="${escapeHtmlAttr(p.id)}">➕</button>
          <button class="btn btn-xs btn-outline" data-edit="${escapeHtmlAttr(p.id)}">✏️</button>
          <button class="btn btn-xs" data-del="${escapeHtmlAttr(p.id)}">🗑️</button>
        </div>
      </div>
    `).join("")}
  `;

  const search = container.querySelector("#prescPlantillasSearch");
  if (search) {
    search.addEventListener("input", (e) => {
      appState.prescripcion.plantillasSearchTerm = e.target.value || "";
      requestAnimationFrame(renderPrescPlantillasList);
    });
  }

  container.querySelector("#prescNewPlantillaBtn")?.addEventListener("click", () => {
    openPrescModal({
      title: "Nueva plantilla",
      bodyHTML: `
        <input id="tplNombre" class="form-control" placeholder="Nombre">
        <textarea id="tplTexto" class="form-control" rows="6"></textarea>
      `,
      onSave: async () => {
        await createPrescPlantilla(
          document.getElementById("tplNombre").value,
          document.getElementById("tplTexto").value
        );
        renderPrescPlantillasList();
      }
    });
  });

  container.querySelectorAll("[data-apply]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cap = getSelectedCapitulo();
      if (!cap) return;
      const tpl = list.find(p => p.id === btn.dataset.apply);
      if (!tpl) return;
      cap.texto = tpl.texto;
      renderPrescCapituloContent();
    });
  });

  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tpl = list.find(p => p.id === btn.dataset.edit);
      if (!tpl) return;
      openPrescModal({
        title: "Editar plantilla",
        bodyHTML: `
          <input id="tplNombre" class="form-control" value="${escapeHtmlAttr(tpl.nombre)}">
          <textarea id="tplTexto" class="form-control" rows="6">${escapeHtml(tpl.texto)}</textarea>
        `,
        onSave: async () => {
          await updatePrescPlantilla(
            tpl.id,
            document.getElementById("tplNombre").value,
            document.getElementById("tplTexto").value
          );
          renderPrescPlantillasList();
        }
      });
    });
  });

  container.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deletePrescPlantilla(btn.dataset.del);
      renderPrescPlantillasList();
    });
  });
    // Drag & drop de plantillas hacia capítulo
  container.querySelectorAll(".presc-plantilla-item[draggable='true']").forEach((el) => {
    el.addEventListener("dragstart", (ev) => {
      const id = el.getAttribute("data-id") || "";
      try {
        ev.dataTransfer.setData("text/presc-plantilla-id", id);
        ev.dataTransfer.setData("text/plain", "presc-plantilla-id:" + id);
        ev.dataTransfer.effectAllowed = "copy";
      } catch (_) {}
      el.style.opacity = "0.6";
    });
    el.addEventListener("dragend", () => {
      el.style.opacity = "1";
    });
  });

}

// ========================================================
// REFERENCIAS EXTRA (Firestore + render)
// ========================================================

async function ensureExtraRefsLoaded() {
  await ensurePrescUidReady();
  if (appState.prescripcion.extraRefsLoaded) return;

  appState.prescripcion.extraRefs = appState.prescripcion.extraRefs || [];

  const ref = getPrescCollectionRefFallback("prescripcion_referencias_extra");
  if (!ref) {
    appState.prescripcion.extraRefsLoaded = true;
    return;
  }

  try {
    const snap = await ref.get();
    const list = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      list.push({
        id: doc.id,
        codigo: d.codigo || "",
        descripcion: d.descripcion || "",
        unidad: d.unidad || "Ud",
        pvp: safeNumber(d.pvp)
      });
    });
    appState.prescripcion.extraRefs = list;
  } catch (e) {
    console.error("[PRESCRIPCIÓN] Error refs extra:", e);
  } finally {
    appState.prescripcion.extraRefsLoaded = true;
  }
}

// El render completo de refs extra sigue en PARTE 7
// ========================================================
// FIN PARTE 6
// ========================================================
// ========================================================
// PARTE 7
// Referencias extra: CRUD + render + buscador + estilos
// ========================================================

// ========================================================
// CRUD REFERENCIAS EXTRA
// ========================================================

async function createExtraRef(codigo, descripcion, unidad, pvp) {
  await ensurePrescUidReady();

  codigo = (codigo || "").trim();
  descripcion = (descripcion || "").trim();
  unidad = (unidad || "Ud").trim() || "Ud";
  pvp = safeNumber(pvp);

  if (!codigo && !descripcion) {
    alert("La referencia necesita al menos código o descripción.");
    return;
  }

  const local = {
    id: "local-" + Date.now(),
    codigo,
    descripcion,
    unidad,
    pvp
  };

  appState.prescripcion.extraRefs = appState.prescripcion.extraRefs || [];
  appState.prescripcion.extraRefs.unshift(local);

  const ref = getPrescCollectionRefFallback("prescripcion_referencias_extra");
  if (!ref) return;

  try {
    const doc = await ref.add({
      codigo,
      descripcion,
      unidad,
      pvp,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    local.id = doc.id;
  } catch (e) {
    console.error("[PRESCRIPCIÓN] Error creando ref extra:", e);
  }
}

async function updateExtraRef(id, codigo, descripcion, unidad, pvp) {
  await ensurePrescUidReady();

  if (!id) return;

  codigo = (codigo || "").trim();
  descripcion = (descripcion || "").trim();
  unidad = (unidad || "Ud").trim() || "Ud";
  pvp = safeNumber(pvp);

  const list = appState.prescripcion.extraRefs || [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], codigo, descripcion, unidad, pvp };
  }

  const ref = getPrescCollectionRefFallback("prescripcion_referencias_extra");
  if (!ref) return;

  try {
    await ref.doc(id).update({
      codigo,
      descripcion,
      unidad,
      pvp,
      updatedAt: Date.now()
    });
  } catch (e) {
    console.error("[PRESCRIPCIÓN] Error actualizando ref extra:", e);
  }
}

async function deleteExtraRef(id) {
  await ensurePrescUidReady();
  if (!id) return;

  const ok = confirm("¿Seguro que quieres borrar esta referencia extra?");
  if (!ok) return;

  appState.prescripcion.extraRefs =
    (appState.prescripcion.extraRefs || []).filter((r) => r.id !== id);

  const ref = getPrescCollectionRefFallback("prescripcion_referencias_extra");
  if (!ref) return;

  try {
    await ref.doc(id).delete();
  } catch (e) {
    console.error("[PRESCRIPCIÓN] Error borrando ref extra:", e);
  }
}

async function duplicateExtraRef(id) {
  const list = appState.prescripcion.extraRefs || [];
  const r = list.find((x) => x.id === id);
  if (!r) return;

  const nuevoCodigo = r.codigo ? r.codigo + "_COPY" : "";
  await createExtraRef(nuevoCodigo, r.descripcion, r.unidad, r.pvp);
}

function addExtraRefToCurrentCap(extraId) {
  const cap = getSelectedCapitulo();
  if (!cap) {
    alert("Selecciona o crea un capítulo primero.");
    return;
  }

  const list = appState.prescripcion.extraRefs || [];
  const r = list.find((x) => x.id === extraId);
  if (!r) return;

  cap.lineas = cap.lineas || [];
  cap.lineas.push({
    id: "extra-" + extraId + "-" + Date.now(),
    tipo: "extra",
    codigo: r.codigo || "",
    descripcion: r.descripcion || "",
    unidad: r.unidad || "Ud",
    cantidad: 1,
    pvp: safeNumber(r.pvp),
    importe: safeNumber(r.pvp) * 1,
    extraRefId: extraId
  });
}

// ========================================================
// RENDER REFERENCIAS EXTRA (buscador sin bug “1 carácter”)
// ========================================================

async function renderPrescExtraRefsList() {
  const container = document.getElementById("prescExtraRefsList");
  if (!container) return;

  await ensureExtraRefsLoaded();

  const refs = appState.prescripcion.extraRefs || [];
  const term = (appState.prescripcion.extraRefsSearchTerm || "").toLowerCase();

  const filtered = refs.filter((r) => {
    if (!term) return true;
    const base = ((r.codigo || "") + " " + (r.descripcion || "")).toLowerCase();
    return base.includes(term);
  });

  container.innerHTML = `
    <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem; align-items:center;">
      <input id="prescExtraRefsSearch"
             class="form-control form-control-sm"
             placeholder="Buscar referencia..."
             value="${escapeHtmlAttr(appState.prescripcion.extraRefsSearchTerm || "")}">
      <button id="prescNewExtraRefBtn" class="btn btn-xs btn-secondary" title="Nueva referencia extra">➕</button>
    </div>

    ${
      filtered.length
        ? filtered
            .map((r) => {
              const cod = r.codigo || "";
              const desc = r.descripcion || "";
              const unidad = r.unidad || "Ud";
              const pvp = safeNumber(r.pvp).toFixed(2);

              return `
                <div class="presc-extra-item" draggable="true" data-id="${escapeHtmlAttr(r.id)}">

                  <div class="presc-extra-main">
                    <div class="presc-extra-line1">
                      <span class="presc-extra-code">${escapeHtml(cod)}</span>
                      <span class="presc-extra-price">${pvp} € / ${escapeHtml(unidad)}</span>
                    </div>
                    <div class="presc-extra-desc">${desc ? escapeHtml(desc) : "<i>(sin descripción)</i>"}</div>
                  </div>

                  <div class="presc-extra-actions">
                    <button class="btn btn-xs" data-add="${escapeHtmlAttr(r.id)}">➕ Añadir</button>
                    <button class="btn btn-xs btn-outline" data-dup="${escapeHtmlAttr(r.id)}">⧉</button>
                    <button class="btn btn-xs btn-outline" data-edit="${escapeHtmlAttr(r.id)}">✏️</button>
                    <button class="btn btn-xs" data-del="${escapeHtmlAttr(r.id)}">🗑️</button>
                  </div>
                </div>
              `;
            })
            .join("")
        : `<p class="text-muted" style="font-size:0.8rem;">No hay referencias que coincidan con la búsqueda.</p>`
    }
  `;

  // Buscador (evita bug de 1 carácter: re-render por RAF)
  const search = container.querySelector("#prescExtraRefsSearch");
  if (search) {
    search.addEventListener("input", (e) => {
      appState.prescripcion.extraRefsSearchTerm = e.target.value || "";
      requestAnimationFrame(renderPrescExtraRefsList);
    });
  }

  // Nueva referencia
  container.querySelector("#prescNewExtraRefBtn")?.addEventListener("click", () => {
    openPrescModal({
      title: "Nueva referencia extra",
      bodyHTML: `
        <div class="form-group">
          <label>Código</label>
          <input id="extCodigo" type="text" class="form-control" />
        </div>
        <div class="form-group">
          <label>Descripción</label>
          <textarea id="extDesc" rows="3" class="form-control"></textarea>
        </div>
        <div class="form-group">
          <label>Unidad</label>
          <select id="extUnidad" class="form-control">
            <option value="Ud">Ud</option>
            <option value="m">m</option>
            <option value="m²">m²</option>
            <option value="h">h</option>
            <option value="m³">m³</option>
            <option value="kg">kg</option>
          </select>
        </div>
        <div class="form-group">
          <label>PVP</label>
          <input id="extPvp" type="number" class="form-control" value="0" />
        </div>
      `,
      onSave: async () => {
        const codigo = document.getElementById("extCodigo")?.value || "";
        const desc = document.getElementById("extDesc")?.value || "";
        const unidad = document.getElementById("extUnidad")?.value || "Ud";
        const pvp = document.getElementById("extPvp")?.value || 0;
        await createExtraRef(codigo, desc, unidad, pvp);
        renderPrescExtraRefsList();
      }
    });
  });

  // Añadir al capítulo
  container.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addExtraRefToCurrentCap(btn.dataset.add);
      renderPrescCapituloContent();
      renderPrescPreview();
    });
  });

  // Duplicar
  container.querySelectorAll("[data-dup]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await duplicateExtraRef(btn.dataset.dup);
      renderPrescExtraRefsList();
    });
  });

  // Editar
  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.edit;
      const list = appState.prescripcion.extraRefs || [];
      const r = list.find((x) => x.id === id);
      if (!r) return;

      openPrescModal({
        title: "Editar referencia extra",
        bodyHTML: `
          <div class="form-group">
            <label>Código</label>
            <input id="extCodigo" type="text" class="form-control" value="${escapeHtmlAttr(r.codigo || "")}" />
          </div>
          <div class="form-group">
            <label>Descripción</label>
            <textarea id="extDesc" rows="3" class="form-control">${escapeHtml(r.descripcion || "")}</textarea>
          </div>
          <div class="form-group">
            <label>Unidad</label>
            <select id="extUnidad" class="form-control">
              <option value="Ud" ${r.unidad === "Ud" ? "selected" : ""}>Ud</option>
              <option value="m" ${r.unidad === "m" ? "selected" : ""}>m</option>
              <option value="m²" ${r.unidad === "m²" ? "selected" : ""}>m²</option>
              <option value="h" ${r.unidad === "h" ? "selected" : ""}>h</option>
              <option value="m³" ${r.unidad === "m³" ? "selected" : ""}>m³</option>
              <option value="kg" ${r.unidad === "kg" ? "selected" : ""}>kg</option>
            </select>
          </div>
          <div class="form-group">
            <label>PVP</label>
            <input id="extPvp" type="number" class="form-control" value="${safeNumber(r.pvp)}" />
          </div>
        `,
        onSave: async () => {
          const codigo = document.getElementById("extCodigo")?.value || "";
          const desc = document.getElementById("extDesc")?.value || "";
          const unidad = document.getElementById("extUnidad")?.value || "Ud";
          const pvp = document.getElementById("extPvp")?.value || 0;
          await updateExtraRef(id, codigo, desc, unidad, pvp);
          renderPrescExtraRefsList();
          renderPrescCapituloContent();
          renderPrescPreview();
        }
      });
    });
  });

  // Borrar
  container.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteExtraRef(btn.dataset.del);
      renderPrescExtraRefsList();
      renderPrescCapituloContent();
      renderPrescPreview();
    });
  });
    // Drag & drop de referencias extra hacia capítulo
  container.querySelectorAll(".presc-extra-item[draggable='true']").forEach((el) => {
    el.addEventListener("dragstart", (ev) => {
      const id = el.getAttribute("data-id") || "";
      try {
        ev.dataTransfer.setData("text/presc-extra-id", id);
        ev.dataTransfer.setData("text/plain", "presc-extra-id:" + id);
        ev.dataTransfer.effectAllowed = "copy";
      } catch (_) {}
      el.style.opacity = "0.6";
    });
    el.addEventListener("dragend", () => {
      el.style.opacity = "1";
    });
  });

}

// ========================================================
// ESTILOS refs extra (solo si no existen)
// ========================================================

(function injectPrescExtraStyles() {
  if (document.getElementById("presc-extra-styles")) return;

  const style = document.createElement("style");
  style.id = "presc-extra-styles";
  style.innerHTML = `
    .presc-extra-item {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 0.6rem 0.75rem;
      margin-bottom: 0.55rem;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      font-size: 0.78rem;
    }
    .presc-extra-line1 {
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin-bottom:0.15rem;
      gap:0.5rem;
    }
    .presc-extra-code {
      font-weight: 700;
      color: #111827;
      max-width: 55%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .presc-extra-price {
      font-weight: 600;
      color: #111827;
      white-space: nowrap;
    }
    .presc-extra-desc {
      color: #6b7280;
      font-size: 0.76rem;
      line-height: 1.25;
    }
    .presc-extra-actions {
      display:flex;
      justify-content:flex-end;
      gap:0.25rem;
      flex-wrap:wrap;
      margin-top:0.35rem;
    }
  `;
  document.head.appendChild(style);
})();

// ========================================================
// FIN PARTE 7
// ========================================================
// ========================================================
// PARTE 8
// PREVISUALIZACIÓN (compacta, clara, funcional)
// ========================================================
(function injectPrescPrevStyles() {
  if (document.getElementById("presc-prev-styles")) return;
  const s = document.createElement("style");
  s.id = "presc-prev-styles";
  s.textContent = `
    .presc-prev-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;            /* 👈 clave para que no “explote” el spacing */
      font-size: 12px;
    }
    .presc-prev-table th,
    .presc-prev-table td {
      padding: 6px 8px;               /* 👈 aire */
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }
    .presc-prev-table th {
      font-weight: 700;
      color: #111827;
      background: #f9fafb;
    }
    .presc-prev-table td.code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .presc-prev-table td.desc {
      white-space: normal;            /* 👈 permite wrap */
      word-break: break-word;
    }
    .presc-prev-table td.num {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .presc-prev-table td.center {
      text-align: center;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(s);
})();

function renderPrescPreview() {
  const container = document.getElementById("prescPreview");
  if (!container) return;

  ensurePrescCapitulosArray();
  const caps = appState.prescripcion.capitulos || [];

  // ✅ Orden REAL según el presupuesto (sectionsFromBudget)
  const sections = ensurePrescSectionsFromBudget() || [];

  // mapa: id/rawId sección -> posición
  const secIndex = new Map();
  sections.forEach((s, i) => {
    if (s?.id) secIndex.set(String(s.id), i);
    if (s?.rawId != null) secIndex.set(String(s.rawId), i);
  });

  const capsSorted = [...caps].sort((a, b) => {
    // Manuales al final
    const aIsManual = String(a?.id || "").startsWith("manual-") || !a?.sourceSectionId;
    const bIsManual = String(b?.id || "").startsWith("manual-") || !b?.sourceSectionId;
    if (aIsManual !== bIsManual) return aIsManual ? 1 : -1;

    // Orden por posición de la sección del presupuesto
    const ai =
      secIndex.get(String(a?.sourceSectionId || "")) ??
      secIndex.get(String(a?.sourceSectionRawId || "")) ??
      999999;

    const bi =
      secIndex.get(String(b?.sourceSectionId || "")) ??
      secIndex.get(String(b?.sourceSectionRawId || "")) ??
      999999;

    if (ai !== bi) return ai - bi;

    // Fallback estable: alfabético ES
    return String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", { sensitivity: "base" });
  });



  if (!caps.length) {
    container.innerHTML = `
      <p class="text-muted" style="font-size:0.8rem;">
        No hay capítulos todavía.
      </p>
    `;
    return;
  }

  // estado expandido por capítulo
  appState.prescripcion.previewExpanded =
    appState.prescripcion.previewExpanded || {};

  let totalGlobal = 0;

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:0.5rem;">
      ${capsSorted.map((cap) => {
        const subtotal = (cap.lineas || []).reduce((acc, l) => {
          const imp = l.importe != null
            ? safeNumber(l.importe)
            : safeNumber(l.cantidad) * safeNumber(l.pvp);
          return acc + imp;
        }, 0);

        totalGlobal += subtotal;

        const expanded = !!appState.prescripcion.previewExpanded[cap.id];

        return `
          <div class="presc-prev-card"
               style="border:1px solid #e5e7eb; border-radius:10px; background:#fff;">

            <!-- CABECERA CAPÍTULO -->
            <div class="presc-prev-head"
                 data-cap-id="${escapeHtmlAttr(cap.id)}"
                 title="Doble click para desplegar"
                 style="
                   display:flex;
                   justify-content:space-between;
                   align-items:center;
                   padding:0.45rem 0.65rem;
                   cursor:pointer;
                   font-size:0.8rem;
                   font-weight:600;
                   user-select:none;
                   gap:0.5rem;
                 ">

              <div style="display:flex; align-items:center; gap:0.45rem; overflow:hidden; min-width:0;">
                <span style="font-size:0.8rem; opacity:0.75;">${expanded ? "▾" : "▸"}</span>
                <div style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
                  ${escapeHtml(cap.nombre || "Capítulo")}
                </div>
              </div>

              <div style="display:flex; align-items:center; gap:0.35rem; flex-shrink:0;">
                <div style="font-size:0.78rem; font-weight:700;">
                  ${subtotal.toFixed(2)} €
                </div>

                <!-- Acciones -->
                <button type="button"
                        class="btn btn-xs btn-outline presc-prev-edit"
                        data-edit-cap="${escapeHtmlAttr(cap.id)}"
                        title="Editar capítulo"
                        style="padding:0.15rem 0.35rem; line-height:1;">
                  ✏️
                </button>
                <button type="button"
                        class="btn btn-xs presc-prev-del"
                        data-del-cap="${escapeHtmlAttr(cap.id)}"
                        title="Eliminar capítulo"
                        style="padding:0.15rem 0.35rem; line-height:1;">
                  🗑️
                </button>
              </div>
            </div>

                        <!-- DETALLE -->
            <div class="presc-prev-body"
                 style="
                   display:${expanded ? "block" : "none"};
                   border-top:1px solid #e5e7eb;
                   padding:0.35rem 0.65rem;
                   font-size:0.75rem;
                   max-height:220px;
                   overflow:auto;
                 ">
              ${
                cap.lineas && cap.lineas.length
                  ? `
                    <table class="presc-prev-table">
                      <colgroup>
                        <col style="width:110px">
                        <col>
                        <col style="width:55px">
                        <col style="width:75px">
                        <col style="width:95px">
                        <col style="width:110px">
                      </colgroup>
                      <thead>
                        <tr>
                          <th style="text-align:left;">Código</th>
                          <th style="text-align:left;">Descripción</th>
                          <th style="text-align:center;">Ud</th>
                          <th style="text-align:right;">Cant.</th>
                          <th style="text-align:right;">Precio</th>
                          <th style="text-align:right;">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${(() => {
                          const sortedLines = [...(cap.lineas || [])].sort((a, b) => {
                            const ac = String(a?.codigo || "");
                            const bc = String(b?.codigo || "");

                            const c = ac.localeCompare(bc, "es", {
                              numeric: true,
                              sensitivity: "base"
                            });
                            if (c !== 0) return c;

                            return String(a?.descripcion || "")
                              .localeCompare(String(b?.descripcion || ""), "es", {
                                sensitivity: "base"
                              });
                          });

                          return sortedLines.map((l) => {
                            const qty = safeNumber(l.cantidad);
                            const pvp = safeNumber(l.pvp);
                            const imp = safeNumber(l.importe != null ? l.importe : qty * pvp);
                            const unit = (l.unidad ?? l.ud ?? l.unit ?? "Ud");

                            return `
                              <tr>
                                <td class="code">${escapeHtml(l.codigo || "")}</td>
                                <td class="desc">${escapeHtml(l.descripcion || "")}</td>
                                <td class="center">${escapeHtml(unit)}</td>
                                <td class="num">${qty}</td>
                                <td class="num">${pvp.toFixed(2)} €</td>
                                <td class="num">${imp.toFixed(2)} €</td>
                              </tr>
                            `;
                          }).join("");
                        })()}
                      </tbody>
                    </table>
                  `
                  : `<div class="text-muted">Sin referencias.</div>`
              }
            </div>

          </div>
        `;
      }).join("")}

      <!-- TOTAL GLOBAL -->
      <div style="
        display:flex;
        justify-content:flex-end;
        font-weight:700;
        font-size:0.85rem;
        padding-top:0.25rem;">
        Total: ${totalGlobal.toFixed(2)} €
      </div>
    </div>
  `;

  // 1) click/dblclick en cabecera
  container.querySelectorAll(".presc-prev-head").forEach((head) => {
    const capId = head.dataset.capId;

    head.addEventListener("dblclick", () => {
      appState.prescripcion.previewExpanded[capId] =
        !appState.prescripcion.previewExpanded[capId];
      renderPrescPreview();
    });

    head.addEventListener("click", () => {
      appState.prescripcion.selectedCapituloId = capId;
      renderPrescCapituloContent();
    });
  });

  // 2) EDITAR capítulo (no dispara click/expand)
  container.querySelectorAll(".presc-prev-edit").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const capId = btn.dataset.editCap;
      const cap = (appState.prescripcion.capitulos || []).find(c => c.id === capId);
      if (!cap) return;

      openPrescModal({
        title: "Editar capítulo",
        bodyHTML: `
          <div class="form-group">
            <label>Título</label>
            <input id="prescEditCapTitle" class="form-control" value="${escapeHtmlAttr(cap.nombre || "")}">
          </div>
          <div class="form-group">
            <label>Texto (mediciones)</label>
            <textarea id="prescEditCapText" class="form-control" rows="6">${escapeHtml(cap.texto || "")}</textarea>
          </div>
        `,
        onSave: async () => {
          const newTitle = document.getElementById("prescEditCapTitle")?.value || "";
          const newText  = document.getElementById("prescEditCapText")?.value || "";
          cap.nombre = newTitle;
          cap.texto = newText;

          appState.prescripcion.selectedCapituloId = capId;
          renderPrescCapituloContent();
          renderPrescPreview();
        }
      });
    });
  });

  // 3) ELIMINAR capítulo (no dispara click/expand)
  container.querySelectorAll(".presc-prev-del").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const capId = btn.dataset.delCap;
      const ok = deleteCapituloById(capId);
      if (!ok) return;

      renderPrescCapituloContent();
      renderPrescPreview();
    });
  });
}

// ========================================================
// FIN PARTE 8
// ========================================================
// ========================================================
// PARTE 9
// EXPORTACIÓN + IDIOMA + GEMINI (modelo limpio)
// ========================================================

const PRESC_EXPORT_LABELS = {
  es: {
    chapter: "Capítulo",
    code: "Código",
    description: "Descripción",
    unit: "Ud",
    qty: "Cant.",
    price: "PVP",
    amount: "Importe",
    subtotal: "Subtotal capítulo",
    total: "Total prescripción",
    title: "Prescripción técnica del proyecto",
  },
  en: {
    chapter: "Chapter",
    code: "Code",
    description: "Description",
    unit: "Unit",
    qty: "Qty",
    price: "Price",
    amount: "Amount",
    subtotal: "Chapter subtotal",
    total: "Specification total",
    title: "Project technical specification",
  },
  pt: {
    chapter: "Capítulo",
    code: "Código",
    description: "Descrição",
    unit: "Unid",
    qty: "Qtd.",
    price: "PVP",
    amount: "Montante",
    subtotal: "Subtotal capítulo",
    total: "Total da especificação",
    title: "Especificação técnica do projeto",
  }
};
// ========================================================
// CÓDIGOS AUTOMÁTICOS DE MEDICIÓN (ESTÁNDAR)
// Capítulo: 2N.01
// Partida : 2N.01.01
// ========================================================

function prescAutoChapterCode2N(capIndex) {
  const xx = String(capIndex + 1).padStart(2, "0");
  return `2N.${xx}`;
}

function prescAutoLineCode2N(capIndex, lineIndex) {
  const xx = String(capIndex + 1).padStart(2, "0");
  const yy = String(lineIndex + 1).padStart(2, "0");
  return `2N.${xx}.${yy}`;
}

// ========================================================
// MODELO DE EXPORTACIÓN (NEUTRO, SIN FORMATO)
// ========================================================

async function buildPrescExportModel(lang) {
  ensurePrescCapitulosArray();
  const language = lang || appState.prescripcion.exportLang || "es";

  const model = {
    lang: language,
    labels: PRESC_EXPORT_LABELS[language] || PRESC_EXPORT_LABELS.es,
    chapters: [],
    total: 0
  };

  // ✅ Orden REAL según el presupuesto (igual que preview)
  const sections = ensurePrescSectionsFromBudget() || [];
  const secIndex = new Map();
  sections.forEach((s, i) => {
    if (s?.id) secIndex.set(String(s.id), i);
    if (s?.rawId != null) secIndex.set(String(s.rawId), i);
  });

  const caps = appState.prescripcion.capitulos || [];
  const capsSorted = [...caps].sort((a, b) => {
    const aIsManual = String(a?.id || "").startsWith("manual-") || !a?.sourceSectionId;
    const bIsManual = String(b?.id || "").startsWith("manual-") || !b?.sourceSectionId;
    if (aIsManual !== bIsManual) return aIsManual ? 1 : -1;

    const ai =
      secIndex.get(String(a?.sourceSectionId || "")) ??
      secIndex.get(String(a?.sourceSectionRawId || "")) ??
      999999;

    const bi =
      secIndex.get(String(b?.sourceSectionId || "")) ??
      secIndex.get(String(b?.sourceSectionRawId || "")) ??
      999999;

    if (ai !== bi) return ai - bi;

    return String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", { sensitivity: "base" });
  });

  // ✅ AQUÍ estaba el bug: necesitamos capIndex
  capsSorted.forEach((cap, capIndex) => {
    let subtotal = 0;

    const chapterCode = prescAutoChapterCode2N(capIndex);

    const lines = (cap.lineas || []).map((l, lineIndex) => {
      const qty = safeNumber(l.cantidad);
      const pvp = safeNumber(l.pvp);
      const imp = l.importe != null ? safeNumber(l.importe) : qty * pvp;

      subtotal += imp;

      return {
        code: prescAutoLineCode2N(capIndex, lineIndex),
        description: l.descripcion || "",
        unit: l.unidad || "Ud",
        qty,
        price: pvp,
        amount: imp
      };
    });

    model.chapters.push({
      code: chapterCode,
      title: cap.nombre || "",
      text: cap.texto || "",
      lines,
      subtotal
    });

    model.total += subtotal;
  });

  return model;
}



// ========================================================
// TRADUCCIÓN GEMINI (SIN ROMPER FORMATO)
// ========================================================
// ===============================
// Gemini: helpers para textos largos
// ===============================

function prescGeminiLangName(lang) {
  const l = String(lang || "").toLowerCase();
  if (l === "en" || l === "eng" || l === "english") return "English";
  if (l === "pt" || l === "por" || l === "portuguese") return "Portuguese";
  if (l === "es" || l === "spa" || l === "spanish") return "Spanish";
  return lang; // fallback
}




function prescSplitForGemini(text, maxLen = 1500) {
  const s = String(text || "");
  if (s.length <= maxLen) return [s];

  // Preferimos cortar por párrafos para conservar formato
  const paras = s.split(/\n\s*\n/);
  const chunks = [];
  let buf = "";

  const flush = () => {
    if (buf.trim()) chunks.push(buf);
    buf = "";
  };

  for (const p of paras) {
    const part = (buf ? buf + "\n\n" : "") + p;
    if (part.length <= maxLen) {
      buf = part;
    } else {
      // si el párrafo solo ya excede, cortamos duro
      flush();
      if (p.length <= maxLen) {
        buf = p;
      } else {
        for (let i = 0; i < p.length; i += maxLen) {
          chunks.push(p.slice(i, i + maxLen));
        }
      }
    }
  }
  flush();
  return chunks.length ? chunks : [s];
}

function prescJoinGeminiChunks(chunks) {
  // Si venían de párrafos, la separación original era "\n\n"
  return (chunks || []).join("\n\n");
}
// ========================================================
// Gemini batch adapter (LOCAL para Prescripción)
// ========================================================
// ========================================================
// Gemini batch adapter (LOCAL para Prescripción)
// ========================================================
async function prescGeminiTranslateBatch(texts, targetLang) {
  if (!Array.isArray(texts) || !texts.length) return [];

  // Usa tu traductor estricto (el que tienes al final del archivo)
  if (typeof prescTranslateTextWithAI === "function") {
    const out = [];
    for (const t of texts) {
      out.push(await prescTranslateTextWithAI(t, targetLang));
    }
    return out;
  }

  console.warn("[PRESC] prescTranslateTextWithAI no disponible, se devuelve texto original");
  return texts;
}

// ✅ EXPÓNLO para que translatePrescModel lo encuentre
window.geminiTranslateBatch = prescGeminiTranslateBatch;

async function translatePrescModel(model, targetLang) {
  const lang = String(targetLang || "").toLowerCase();
  if (!model || !Array.isArray(model.chapters) || !model.chapters.length) return;
  if (lang === "es") return;

  // Cache para no traducir textos repetidos
  const cache = new Map();

  const translateOne = async (text) => {
    const key = String(text ?? "");
    if (!key.trim()) return key;
    if (cache.has(key)) return cache.get(key);

    const out = await prescTranslateTextWithAI(key, lang);
    const finalText = String(out || key);
    cache.set(key, finalText);
    return finalText;
  };

  // ✅ SOLO se traduce el texto del capítulo (plantillas / mediciones)
  // ❌ NO se traduce el título del capítulo
  // ❌ NO se traducen las líneas
  for (const c of model.chapters) {
    c.text = await translateOne(c.text);
  }
}

// ========================================================
// DISPATCH EXPORT
// ========================================================

async function handlePrescExport(type) {
  const lang = appState.prescripcion.exportLang || "es";

  // 1) Modelo SIEMPRE en crudo (sin traducir UI)
  const model = await buildPrescExportModel(lang);

  if (!model.chapters.length) {
    alert("No hay capítulos para exportar.");
    return;
  }

  // 2) ✅ Traducción SOLO EN EXPORT (y solo del modelo)
  if (lang !== "es") {
    try {
      await translatePrescModel(model, lang);
    } catch (e) {
      console.warn("[PRESC] Error traduciendo para export:", e);
      // seguimos exportando en original si falla
    }
  }

  // 3) Export
  if (type === "excel" && window.exportPrescripcionToExcel) {
    window.exportPrescripcionToExcel(model);
    return;
  }
  if (type === "pdf" && window.exportPrescripcionToPdf) {
    window.exportPrescripcionToPdf(model);
    return;
  }
  if (type === "bc3" && window.exportPrescripcionToBc3) {
    window.exportPrescripcionToBc3(model);
    return;
  }

  console.warn("[PRESCRIPCIÓN] Exportador no disponible:", type);
}

// ========================================================
// PARTE 10 (FINAL)
// Exporters (XLSX/PDF/BC3) + helpers + window hooks
// ========================================================

// ------------------------
// Moneda / locale helpers
// ------------------------
function prescLangToLocale(lang) {
  if (lang === "en") return "en-GB";
  if (lang === "pt") return "pt-PT";
  return "es-ES";
}

function prescFormatCurrency(value, lang, opts = {}) {
  const locale = prescLangToLocale(lang);
  const v = Number(value);
  const n = Number.isFinite(v) ? v : 0;

  let num;
  try {
    num = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch (_) {
    num = n.toFixed(2);
  }

  const euro = opts.html ? "&nbsp;€" : " €";
  return String(num) + euro;
}

function prescFormatCurrencyHTML(value, lang) {
  // Evita salto de línea entre número y €
  return prescFormatCurrency(value, lang, { html: true });
}

// ------------------------
// Print / PDF (ventana)
// ------------------------
function openPrescPrintWindow(model, lang) {
  const language = lang || model?.lang || appState.prescripcion.exportLang || "es";
  const labels = (model?.labels) || PRESC_EXPORT_LABELS[language] || PRESC_EXPORT_LABELS.es;

  const win = window.open("", "_blank");
  if (!win) {
    alert("No se pudo abrir la ventana de impresión. Revisa el bloqueador de popups.");
    return;
  }

  const style = `
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 16px; color:#111; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      h2 { font-size: 14px; margin: 16px 0 6px; }
      .small { font-size: 10px; color: #6b7280; margin: 0 0 10px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 8px 0 14px; }
      th, td { border: 1px solid #d1d5db; padding: 4px 6px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; }
      .right { text-align:right; }
      .subtotal { font-weight:700; background:#fafafa; }
      .chapterText { margin: 6px 0 10px; white-space: pre-wrap; }
    </style>
  `;

  const chapters = model?.chapters || [];
  const totalGlobal = Number(model?.total) || 0;

  let html = `
    <html>
      <head><meta charset="utf-8" />${style}</head>
      <body>
        <h1>${labels.title || "Prescripción"}</h1>
        <p class="small">${(labels.language || "Idioma")}: ${String(language).toUpperCase()}</p>
  `;

  chapters.forEach((cap, idx) => {
   const capCode = cap.code ? `${escapeHtml(cap.code)} — ` : "";
   html += `<h2>${labels.chapter || "Capítulo"} ${idx + 1} — ${capCode}${escapeHtml(cap.title || "")}</h2>`;


    if (cap.text) {
      html += `<div class="chapterText">${escapeHtml(cap.text).replace(/\n/g, "<br>")}</div>`;
    }

    if (cap.lines && cap.lines.length) {
      html += `
        <table>
          <thead>
            <tr>
              <th style="width:120px;">${labels.code || "Código"}</th>
              <th>${labels.description || "Descripción"}</th>
              <th style="width:70px;">${labels.unit || "Ud"}</th>
              <th class="right" style="width:90px;">${labels.qty || "Cant."}</th>
              <th class="right" style="width:110px;">${labels.price || "PVP"} (€)</th>
              <th class="right" style="width:130px;">${labels.amount || "Importe"} (€)</th>
            </tr>
          </thead>
          <tbody>
      `;

      cap.lines.forEach((l) => {
        html += `
          <tr>
            <td style="font-family:ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(l.code || "")}</td>
            <td>${escapeHtml(l.description || "")}</td>
            <td>${escapeHtml(l.unit || "")}</td>
            <td class="right">${safeNumber(l.qty)}</td>
            <td class="right">${prescFormatCurrencyHTML(safeNumber(l.price), language)}</td>
            <td class="right">${prescFormatCurrencyHTML(safeNumber(l.amount), language)}</td>
          </tr>
        `;
      });

      html += `
          <tr class="subtotal">
            <td colspan="5" class="right">${labels.subtotal || "Subtotal capítulo"}</td>
            <td class="right">${prescFormatCurrencyHTML(safeNumber(cap.subtotal), language)}</td>
          </tr>
          </tbody>
        </table>
      `;
    }
  });

  html += `
        <p style="text-align:right; font-weight:800; margin-top:12px;">
          ${labels.total || "Total"}: ${prescFormatCurrencyHTML(totalGlobal, language)}
        </p>
      </body>
    </html>
  `;

  win.document.open();
  win.document.write(html);
  win.document.close();

  try {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 350);
  } catch (e) {
    console.warn("[PRESCRIPCIÓN] print() bloqueado:", e);
  }
}

// ------------------------
// Descargas (texto / BC3)
// ------------------------
function downloadTextFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "export.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========================================================
// BC3 EXPORT (FIEBDC-3) — COMPATIBLE (model.chapters o model.capitulos)
// ========================================================
// Normaliza texto para BC3 (solo para DESCRIPCIONES y TEXTOS, NO para la línea completa)
function prescBc3FieldSafe(s) {
  return String(s ?? "")
    .normalize("NFC") // ✅ CLAVE: convierte acentos combinados a ó/á/ñ “normales”
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

// Compat: si en tu código usas "prescBc3TextSafe", lo apuntamos al nuevo safe de campos
function prescBc3TextSafe(s) {
  return prescBc3FieldSafe(s);
}




// ========================================================
// BC3 download en Windows-1252 (ANSI) para evitar símbolos raros
// Mantiene la firma: downloadBc3File(content, filename)
// ========================================================

// ✅ Encoder CP850 (OEM/DOS) para Presto: evita ¬ y ± en acentos
function encodeCP850(str) {
  const s = String(str ?? "").normalize("NFC");

  // Mapa mínimo ES/PT (añade más si necesitas)
  const m = {
    "á": 0xA0, "é": 0x82, "í": 0xA1, "ó": 0xA2, "ú": 0xA3, "ü": 0x81, "ñ": 0xA4, "ç": 0x87,
    "ã": 0xC6, "õ": 0xE4, "â": 0x83, "ê": 0x88, "ô": 0x93, "à": 0x85,
    "Á": 0xB5, "É": 0x90, "Í": 0xD6, "Ó": 0xE0, "Ú": 0xE9, "Ü": 0x9A, "Ñ": 0xA5, "Ç": 0x80,
    "Ã": 0xC7, "Õ": 0xE5, "Â": 0xB6, "Ê": 0xD2, "Ô": 0xE2, "À": 0xB7
  };

  const out = new Uint8Array(s.length);

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = s.charCodeAt(i);

    if (code <= 0x7F) { out[i] = code; continue; } // ASCII

    const b = m[ch];
    if (b != null) { out[i] = b; continue; }

    // fallback
    out[i] = 0x3F; // '?'
  }

  return out;
}

function downloadBc3File(content, filename) {
  const bytes = encodeCP850(content);
  const blob = new Blob([bytes], { type: "application/octet-stream" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "export.bc3";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}




// Normaliza modelo (nuevo/viejo) a estructura común
function prescGetChaptersCompat(model) {
  if (!model) return [];
  if (Array.isArray(model.chapters)) return model.chapters;     // nuevo
  if (Array.isArray(model.capitulos)) return model.capitulos;   // viejo
  return [];
}

function prescGetLinesCompat(ch) {
  if (!ch) return [];
  if (Array.isArray(ch.lines)) return ch.lines;   // nuevo
  if (Array.isArray(ch.lineas)) return ch.lineas; // viejo
  return [];
}

function prescExportModelToBC3_Compat(model) {
  const out = [];
  const NL = "\r\n";
  const clean = prescBc3TextSafe;

  const num2 = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? String(n.toFixed(2)).replace(",", ".") : "0.00";
  };

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? String(n).replace(",", ".") : "0";
  };

  // Presto usa ddmmyy (ej: 080925)
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const prestoDate = `${dd}${mm}${yy}`;

  // Cabecera compatible
  out.push(`~V|SOFT S.A.|FIEBDC-3/2002|Presupuestos2N|1.0||OEM|`);

  out.push(`~K|\\2\\2\\3\\2\\2\\2\\2\\EUR\\|0|`);

  // ==================================================
// NOMBRE DEL PROYECTO → OBRA EN PRESTO
// ==================================================
const projectName =
  (typeof window.getNombreProyectoActual === "function" && window.getNombreProyectoActual()) ||
  (window.appState?.proyecto?.nombre) ||
  "Proyecto";

// ✅ ROOT correcto para PRESTO (obra)
const ROOT = "0##";
const used = new Set();


  // type: 0 = capítulo/partida, 3 = recurso/artículo
  const emitC = (code, unit, desc, price, type = 0) => {
    const c = clean(code);
    if (!c || used.has(c)) return;
    used.add(c);

    out.push(
      `~C|${c}|${clean(unit || "Ud")}|${clean(desc || "")}|${num2(price)}|${prestoDate}|${type}|`
    );
  };

  // Concepto raíz
  // ✅ Concepto raíz = nombre del proyecto (obra)
  emitC(ROOT, "", projectName, 0, 0);


  const chapters = prescGetChaptersCompat(model);
  const rootDecomp = [];

  chapters.forEach((ch, idx) => {
    // code base (sin inventarnos nada raro)
    const chBase = clean(
      ch.code || ch.codigo || ch.__importCode || `2N.${String(idx + 1).padStart(2, "0")}`
    );

    // ✅ ~C de capítulo: con #
    const chConcept = chBase.endsWith("#") ? chBase : (chBase + "#");
    // ✅ ~D raíz debe referenciar SIN # (como Presto)
    const chRef = chConcept.replace(/#+$/, "");

    const chTitle = ch.title || ch.nombre || "Capítulo";
    const chText  = ch.text  || ch.texto  || "";

    // Capítulo como concepto tipo 0
    emitC(chConcept, "Ud", chTitle, 0, 0);

    // ✅ IMPORTANTÍSIMO: el root cuelga el capítulo SIN #
    rootDecomp.push(`${chRef}\\1\\1\\`);

    // Texto del capítulo (si hay)
    if (chText) out.push(`~T|${chConcept}|${clean(chText)}|`);

    // Descomposición del capítulo con sus líneas (padre sí con #)
    const resRefs = [];
    const lines = prescGetLinesCompat(ch);

    lines.forEach((l, lineIdx) => {
      const lineCode = clean(
        l.code ||
          l.codigo ||
          `2N.${String(idx + 1).padStart(2, "0")}.${String(lineIdx + 1).padStart(2, "0")}`
      );

      const desc  = l.description || l.descripcion || "";
      const unit  = l.unit || l.unidad || "Ud";
      const price = Number(l.price ?? l.pvp ?? 0);
      const qty   = Number(l.qty ?? l.cantidad ?? 1);

      // Línea como recurso tipo 3
      emitC(lineCode, unit, desc, price, 3);

      const q = qty > 0 ? qty : 1; // evita que “desaparezca” por 0
      // ✅ 3 campos en descomposición: code\factor\qty\
      resRefs.push(`${lineCode}\\1\\${num(q)}\\`);
    });

    if (resRefs.length) {
      out.push(`~D|${chConcept}|${resRefs.join("")}|`);
    }
  });

  // Root → capítulos
  if (rootDecomp.length) out.push(`~D|${ROOT}|${rootDecomp.join("")}|`);

  return out.join(NL) + NL;
}

// Hook final (lo que debe llamar tu botón BC3)
function exportPrescripcionToBc3(model) {
  const lang = model?.lang || appState?.prescripcion?.exportLang || "es";
  const bc3 = prescExportModelToBC3_Compat(model);
  downloadBc3File(bc3, `prescripcion_${lang}.bc3`);
}

window.exportPrescripcionToBc3 = exportPrescripcionToBc3;


// ------------------------
// Export XLSX REAL (ExcelJS)
// ------------------------
async function exportPrescripcionToExcel(model) {
  const language = model?.lang || appState.prescripcion.exportLang || "es";
  const labels = model?.labels || PRESC_EXPORT_LABELS[language] || PRESC_EXPORT_LABELS.es;

  const ok = await ensureExcelDepsLoaded();
  if (!ok) {
    alert("No se pudo exportar a Excel (XLSX). Falta ExcelJS/FileSaver.");
    return;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((labels.title || "Prescripción").slice(0, 31));

  ws.columns = [
    { key: "chapter", width: 22 },
    { key: "code", width: 14 },
    { key: "desc", width: 55 },
    { key: "unit", width: 10 },
    { key: "qty", width: 10 },
    { key: "pvp", width: 14 },
    { key: "amount", width: 16 },
  ];

  const borderThin = {
    top: { style: "thin", color: { argb: "FFCCCCCC" } },
    left: { style: "thin", color: { argb: "FFCCCCCC" } },
    bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    right: { style: "thin", color: { argb: "FFCCCCCC" } },
  };

  const fmtCurrency = '#,##0.00" €"';
  const fmtQty = "#,##0.00";

  const projectName =
    (typeof window.getNombreProyectoActual === "function" && window.getNombreProyectoActual()) ||
    (appState.proyecto && appState.proyecto.nombre) ||
    "Proyecto";

  const today = new Date().toISOString().split("T")[0];

  // Título
  const titleRow = ws.addRow([labels.title || "Prescripción"]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 7);
  titleRow.font = { name: "Aptos Narrow", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  titleRow.alignment = { horizontal: "center", vertical: "middle" };
  titleRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };

  // Descripción proyecto (si existe)
  const projectDesc = String(getPrescProjectDescription() || "").trim();
  if (projectDesc) {
    const descRowTop = ws.addRow([projectDesc]);
    ws.mergeCells(descRowTop.number, 1, descRowTop.number, 7);
    descRowTop.getCell(1).font = { name: "Aptos Narrow", size: 10, italic: true, color: { argb: "FF374151" } };
    descRowTop.getCell(1).alignment = { horizontal: "center", vertical: "top", wrapText: true };

    // Ajuste de altura aproximado (exceljs no tiene autofit real)
    const approxCharsPerLineTop = 110;
    const linesTop = Math.max(1, Math.ceil(projectDesc.length / approxCharsPerLineTop));
    descRowTop.height = Math.min(300, 15 * linesTop + 6);
  }

  ws.addRow([]);

  const info1 = ws.addRow(["Proyecto", projectName]);
  ws.mergeCells(info1.number, 2, info1.number, 7);
  info1.getCell(1).font = { name: "Aptos Narrow", size: 11, bold: true };
  info1.getCell(2).font = { name: "Aptos Narrow", size: 10 };

  const info2 = ws.addRow(["Fecha", today]);
  ws.mergeCells(info2.number, 2, info2.number, 7);
  info2.getCell(1).font = { name: "Aptos Narrow", size: 11, bold: true };
  info2.getCell(2).font = { name: "Aptos Narrow", size: 10 };

  ws.addRow([]);

  // Header tabla
  const headerRow = ws.addRow([
    labels.chapter, labels.code, labels.description, labels.unit,
    labels.qty, labels.price + " (€)", labels.amount + " (€)"
  ]);
  headerRow.eachCell((cell) => {
    cell.font = { name: "Aptos Narrow", size: 11, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.border = borderThin;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  // Capítulos
  (model.chapters || []).forEach((cap) => {
    ws.addRow([]);

   const capHeader = `${cap.code || ""} ${String(cap.title || "").toUpperCase()}`;
const capRow = ws.addRow([capHeader]);

    ws.mergeCells(capRow.number, 1, capRow.number, 7);
    capRow.getCell(1).font = { name: "Aptos Narrow", size: 11, bold: true, color: { argb: "FF111827" } };
    capRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    capRow.getCell(1).border = borderThin;

    // Texto del capítulo debajo del título (ajuste de altura)
    const capDesc = String(cap.text || "").trim();
    if (capDesc) {
      const descRow = ws.addRow([capDesc]);
      ws.mergeCells(descRow.number, 1, descRow.number, 7);
      descRow.getCell(1).font = { name: "Aptos Narrow", size: 10, italic: true, color: { argb: "FF4B5563" } };
      descRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
      descRow.getCell(1).border = borderThin;

      const approxCharsPerLine = 110;
      const lines = Math.max(1, Math.ceil(capDesc.length / approxCharsPerLine));
      descRow.height = Math.min(300, 15 * lines + 6);
    }

    (cap.lines || []).forEach((l) => {
      const r = ws.addRow([
        cap.title || "",
        l.code || "",
        l.description || "",
        l.unit || "Ud",
        safeNumber(l.qty),
        safeNumber(l.price),
        safeNumber(l.amount),
      ]);

      r.eachCell((cell, col) => {
        cell.border = borderThin;
        cell.font = { name: "Aptos Narrow", size: 10 };

        if (col === 5) {
          cell.numFmt = fmtQty;
          cell.alignment = { horizontal: "right", vertical: "top" };
        } else if (col === 6 || col === 7) {
          cell.numFmt = fmtCurrency;
          cell.alignment = { horizontal: "right", vertical: "top" };
        } else if (col === 3) {
          cell.alignment = { wrapText: true, vertical: "top" };
        } else {
          cell.alignment = { horizontal: "left", vertical: "top" };
        }
      });
    });

    const subRow = ws.addRow([labels.subtotal, "", "", "", "", "", safeNumber(cap.subtotal)]);
    subRow.getCell(1).font = { name: "Aptos Narrow", size: 11, bold: true };
    subRow.getCell(7).font = { name: "Aptos Narrow", size: 11, bold: true };
    subRow.eachCell((cell, col) => {
      cell.border = borderThin;
      if (col === 7) {
        cell.numFmt = fmtCurrency;
        cell.alignment = { horizontal: "right", vertical: "middle" };
      }
    });
  });

  ws.addRow([]);

  const totalRow = ws.addRow([labels.total, "", "", "", "", "", safeNumber(model.total)]);
  totalRow.getCell(1).font = { name: "Aptos Narrow", size: 12, bold: true };
  totalRow.getCell(7).font = { name: "Aptos Narrow", size: 12, bold: true };
  totalRow.eachCell((cell, col) => {
    cell.border = borderThin;
    if (col === 7) {
      cell.numFmt = fmtCurrency;
      cell.alignment = { horizontal: "right", vertical: "middle" };
    }
  });

  const safeProject = String(projectName || "Proyecto").replace(/[^a-zA-Z0-9_-]+/g, "_");
  const fileName = `Prescripcion_${safeProject}_${today.replace(/-/g, "")}_${language}.xlsx`;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, fileName);
}

// ------------------------
// Export PDF (usa print)
// ------------------------
function exportPrescripcionToPdf(model) {
  const language = model?.lang || appState.prescripcion.exportLang || "es";
  openPrescPrintWindow(model, language);
}

// ------------------------
// Exponer a window (para handlePrescExport)
// ------------------------
window.exportPrescripcionToExcel = exportPrescripcionToExcel;
window.exportPrescripcionToPdf = exportPrescripcionToPdf;
window.exportPrescripcionToBc3 = exportPrescripcionToBc3;

// (opcional útil para debug desde consola)
window.handlePrescExport = handlePrescExport;
window.buildPrescExportModel = buildPrescExportModel;
// ========================================================
// PARTE 11
// Bootstrap final de Prescripción
// ========================================================

(function initPrescripcionModule() {
  // Evita doble inicialización
  if (window.__prescInitialized) return;
  window.__prescInitialized = true;

  console.log("[PRESCRIPCIÓN] Inicializando módulo de prescripción");

  // Asegurar estructura base
  window.appState = window.appState || {};
  appState.prescripcion = appState.prescripcion || {};

  if (!Array.isArray(appState.prescripcion.capitulos)) {
    appState.prescripcion.capitulos = [];
  }

  if (!Array.isArray(appState.prescripcion.plantillas)) {
    appState.prescripcion.plantillas = [];
  }

  if (!Array.isArray(appState.prescripcion.extraRefs)) {
    appState.prescripcion.extraRefs = [];
  }

  appState.prescripcion.previewExpanded =
    appState.prescripcion.previewExpanded || {};

  // Render diferido: espera a que exista el contenedor
  function tryRenderPrescripcion() {
    const container =
      document.getElementById("appContent") ||
      document.getElementById("docAppContent") ||
      document.querySelector(".app-content");

    if (!container) return false;

    try {
      renderDocPrescripcionView();
      console.log("[PRESCRIPCIÓN] Vista renderizada correctamente");
      return true;
    } catch (e) {
      console.error("[PRESCRIPCIÓN] Error renderizando vista:", e);
      return false;
    }
  }

  // Intento inmediato
  if (tryRenderPrescripcion()) return;

  // Reintento con observer (navegación SPA)
  const obs = new MutationObserver(() => {
    if (tryRenderPrescripcion()) {
      obs.disconnect();
    }
  });

  obs.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
// ======================================================
// GEMINI / IA (TRADUCCIÓN PARA PRESCRIPCIÓN)
// Reutiliza el mismo endpoint que Documentación (handleDocSectionAI)
// ======================================================

// 1) Sanitizador igual que Documentación (evita markdown raro)
function prescSanitizeAIText(raw) {
  if (!raw) return "";
  const lines = String(raw).split(/\r?\n/).map((line) => {
    let l = line;
    l = l.replace(/^\s*#{1,6}\s*/g, "");
    l = l.replace(/^\s*[-*•]\s+/g, "");
    l = l.replace(/^\s*\d+[\.\)]\s+/g, "");
    l = l.replace(/\*\*(.+?)\*\*/g, "$1");
    l = l.replace(/\*(.+?)\*/g, "$1");
    l = l.replace(/__(.+?)__/g, "$1");
    l = l.replace(/_(.+?)_/g, "$1");
    return l;
  });
  return lines.join("\n").trim();
}

// 2) Si NO existe handleDocSectionAI en esta vista, lo definimos igual que en Documentación
if (typeof window.handleDocSectionAI !== "function") {
  window.handleDocSectionAI = async ({
    sectionKey,
    idioma,
    titulo,
    texto,
    proyecto,
    presupuesto,
    modo,
  }) => {
    const payload = {
      sectionKey,
      idioma,
      titulo,
      texto,
      proyecto,
      presupuesto,
      modo,
    };

    // MISMO endpoint que usas en ui_documentacion.js
    const url = "https://docsectionai-is2pkrfj5a-uc.a.run.app";

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const extra = await resp.text().catch(() => "");
      throw new Error("IA error " + resp.status + ": " + extra);
    }

    const data = await resp.json().catch(() => null);
    if (!data || typeof data.text !== "string") {
      throw new Error("Respuesta IA inválida: falta ‘text’");
    }

    return prescSanitizeAIText(data.text);
  };
}

// 3) Traducción de un texto (PROMPT ESTRICTO: SOLO TRADUCIR, NO REESCRIBIR)
function prescLooksSpanish(text) {
  const s = String(text || "").toLowerCase();
  // stopwords típicas (heurística barata)
  const hits = [" el ", " la ", " de ", " que ", " y ", " para ", " con ", " sistema ", " acceso ", "capítulo"]
    .reduce((acc, w) => acc + (s.includes(w) ? 1 : 0), 0);
  return hits >= 3;
}

function prescBuildStrictTranslatePrompt(raw, targetLang) {
  const lang = String(targetLang || "es").toLowerCase();

  const langName =
    lang === "en" ? "ENGLISH" :
    lang === "pt" ? "PORTUGUESE" :
    "SPANISH";

  // Reglas MUY cortas y “duras” (menos margen a que se invente texto)
  return [
    `YOU ARE A TRANSLATION ENGINE. OUTPUT LANGUAGE: ${langName}.`,
    "STRICT RULES:",
    "1) Translate ONLY. Do NOT add, remove, rephrase, explain, summarize, or embellish.",
    "2) Keep the SAME structure, paragraph breaks, and technical tone.",
    "3) Do NOT invent intros/conclusions. Do NOT add marketing.",
    "4) Keep product names, brands, codes, units, acronyms unchanged (2N, WaveKey, SIP, RTSP, ONVIF, WDR, IP65, IK08, m², Ud).",
    "5) Length must be close to original (do not expand).",
    "Return ONLY the translated text. No markdown. No quotes.",
    "",
    "TEXT:",
    raw
  ].join("\n");
}

async function prescTranslateTextWithAI(text, targetLang) {
  const raw = String(text ?? "");
  if (!raw.trim()) return "";

  const proyecto = window.appState?.proyecto || {};
  const presupuesto =
    typeof window.getPresupuestoActual === "function"
      ? window.getPresupuestoActual()
      : null;

  const lang = String(targetLang || "es").toLowerCase();
  if (lang === "es") return raw;

  const prompt1 = prescBuildStrictTranslatePrompt(raw, lang);

  let out = await window.handleDocSectionAI({
    sectionKey: "presc_translate_strict_v2",
    idioma: lang,
    titulo: "TRANSLATE_ONLY_STRICT_V2",
    texto: prompt1,
    proyecto,
    presupuesto,
    modo: "translate_only_strict_v2",
  });

  // Limpieza mínima (por si mete fences)
  out = String(out || "").replace(/```[\s\S]*?```/g, "").trim();

  // ✅ Si pide EN y detectamos castellano, reintento 1 vez MÁS duro
  if (lang === "en" && prescLooksSpanish(out)) {
    const prompt2 = [
      "YOUR PREVIOUS OUTPUT CONTAINED SPANISH WORDS.",
      "Rewrite into PURE ENGLISH following the same STRICT RULES.",
      "",
      "ORIGINAL TEXT:",
      raw
    ].join("\n");

    const out2 = await window.handleDocSectionAI({
      sectionKey: "presc_translate_strict_retry_en",
      idioma: "en",
      titulo: "TRANSLATE_ONLY_STRICT_RETRY_EN",
      texto: prompt2,
      proyecto,
      presupuesto,
      modo: "translate_only_strict_retry_en",
    });

    const cleaned2 = String(out2 || "").replace(/```[\s\S]*?```/g, "").trim();
    if (cleaned2) out = cleaned2;
  }

  return out || raw;
}
