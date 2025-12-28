// js/ui_diagramas.js
// Vista: DIAGRAMAS (IA)
// V2.10 (Hito 16+):
// - ✅ Export SVG (MAESTRO) estable (líneas + nodos + textos) basado en coords del preview
// - ✅ Mantiene Export DXF (ASCII) SIN atributos (opcional) reutilizando secciones de plantilla
// - ✅ Eliminado SCR (botón + función + textos) (ya estaba)
// - ✅ FIX buscador refs: ahora puedes escribir normal (sin re-render en cada tecla)
// - ✅ Preview drag estable (mantiene add/removeEventListener)

// ======================================================
// ESTADO GLOBAL
// ======================================================

window.appState = window.appState || {};
appState.diagramas = appState.diagramas || {
  dxfFileName: "",
  dxfText: "",
  dxfBlocks: [],
  dxfBlockAttrs: {}, // se mantiene por compatibilidad (ya no se usa para export)

  // cache secciones DXF plantilla
  dxfHeaderSection: "",
  dxfClassesSection: "",
  dxfTablesSection: "",
  dxfBlocksSection: "",
  dxfObjectsSection: "",

  refs: [],
  refsSearch: "",

  zones: [
    { key: "entrada_principal", label: "Entrada principal" },
    { key: "portales_interiores", label: "Portales interiores" },
    { key: "zonas_comunes", label: "Zonas comunes" },
    { key: "zonas_refugio", label: "Zonas refugio" },
    { key: "armario_cpd", label: "Armario / CPD" },
  ],
  assignments: {},

  promptUiOpen: false,
  useCustomPrompt: false,
  customPromptText: "",

  // Preview positions
  previewEditMode: false,
  manualCoords: {},

  _previewResult: null,

  lastResult: null,
  lastError: null,
  lastRaw: null,
  usedLocalFallback: false,
  busy: false,

  // internal (bind/unbind)
  _previewListenersBound: false,
  _previewMouseMoveHandler: null,
  _previewMouseUpHandler: null,
};

function _el(id) {
  return document.getElementById(id);
}

function _escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function _escapeHtmlAttr(s) {
  return _escapeHtml(s).replaceAll('"', "&quot;");
}

function _setBusy(b) {
  appState.diagramas.busy = !!b;
  const btn = _el("btnDiagGenerate");
  if (btn) btn.disabled = !!b;
  const sp = _el("diagBusy");
  if (sp) sp.style.display = b ? "" : "none";
}

function _clearDiagError() {
  appState.diagramas.lastError = null;
  appState.diagramas.lastRaw = null;
}

/* ======================================================
   Preview SVG (esquemático) basado en coords
 ====================================================== */

function _buildSchematicCoordsFromResult(result) {
  const zones = appState.diagramas.zones || [];
  const zoneIndex = new Map(zones.map((z, i) => [z.key, i]));

  const colW = 280;
  const rowH = 90;
  const startX = 80;
  const startY = 90;

  const placements = Array.isArray(result?.placements) ? result.placements : [];
  const infra = Array.isArray(result?.infra) ? result.infra : [];

  const perZoneCount = {};
  for (const z of zones) perZoneCount[z.key] = 0;

  function nextPos(zoneKey) {
    const i = zoneIndex.has(zoneKey) ? zoneIndex.get(zoneKey) : 0;
    const x = startX + i * colW;
    const n = perZoneCount[zoneKey] || 0;
    perZoneCount[zoneKey] = n + 1;
    const y = startY + n * rowH;
    return { x, y };
  }

  const map = new Map();
  const manual = appState.diagramas.manualCoords || {};

  for (const p of placements) {
    const zone = String(p.zone || "entrada_principal");
    const label = `${p.ref || p.id || ""}${p.qty ? ` x${p.qty}` : ""}`;

    const m = manual[p.id];
    const pos =
      m && Number.isFinite(m.x) && Number.isFinite(m.y)
        ? { x: m.x, y: m.y }
        : nextPos(zone);

    map.set(p.id, { x: pos.x, y: pos.y, label, kind: "placement", zone });
  }

  for (const n of infra) {
    const zone = String(n.zone || "armario_cpd");
    const label = `${n.type || n.id || ""}`;

    const m = manual[n.id];
    const pos =
      m && Number.isFinite(m.x) && Number.isFinite(m.y)
        ? { x: m.x, y: m.y }
        : nextPos(zone);

    map.set(n.id, { x: pos.x, y: pos.y, label, kind: "infra", zone });
  }

  return map;
}

function _renderPreviewSvg(result) {
  const coords = _buildSchematicCoordsFromResult(result);
  if (!coords.size) return `<div class="muted">Sin nodos para preview.</div>`;

  const zones = appState.diagramas.zones || [];
  const colW = 280;
  const startX = 80;

  function _iconForNode(id, p) {
    if (p.kind === "infra") {
      const r = appState.diagramas.lastResult || {};
      const infra = Array.isArray(r.infra) ? r.infra : [];
      const it = infra.find((x) => String(x.id) === String(id));
      const t = String(it?.type || "").toUpperCase();
      if (t.includes("ROUTER")) return "🌐";
      if (t.includes("CORE")) return "🧠";
      if (t.includes("SWITCH")) return "🔀";
      return "⬛";
    }

    const r = appState.diagramas.lastResult || {};
    const placements = Array.isArray(r.placements) ? r.placements : [];
    const it = placements.find((x) => String(x.id) === String(id));
    const blk = String(it?.icon_block || it?.iconBlock || "").toLowerCase();
    const ref = String(it?.ref || "").toLowerCase();

    const s = `${blk} ${ref} ${String(p.label || "").toLowerCase()}`;

    if (s.includes("ip style") || s.includes("ipstyle") || s.includes("ai_ip style") || s.includes("ai_ip_style"))
      return "📟";
    if (s.includes("verso")) return "📞";
    if (s.includes("ip one") || s.includes("ipone")) return "📞";
    if (s.includes("indoor") || s.includes("monitor") || s.includes("touch") || s.includes("clip")) return "🖥️";
    if (s.includes("access") || s.includes("unit") || s.includes("reader") || s.includes("rfid") || s.includes("ble"))
      return "🔑";
    if (s.includes("switch") || s.includes("poe")) return "🔀";
    if (s.includes("router") || s.includes("gateway")) return "🌐";
    if (s.includes("server") || s.includes("nvr")) return "🗄️";

    return "●";
  }

  let maxX = 0,
    maxY = 0;
  for (const [, p] of coords.entries()) {
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const vbW = Math.max(900, maxX + 320);
  const vbH = Math.max(420, maxY + 180);

  const connections = Array.isArray(result?.connections) ? result.connections : [];

  const lines = connections
    .map((c) => {
      const a = coords.get(c.from);
      const b = coords.get(c.to);
      if (!a || !b) return "";
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(29,79,216,.55)" stroke-width="2"/>`;
    })
    .join("");

  const nodes = Array.from(coords.entries())
    .map(([id, p]) => {
      const isInfra = p.kind === "infra";
      const fill = isInfra ? "rgba(17,24,39,.95)" : "rgba(29,79,216,.95)";
      const stroke = isInfra ? "rgba(17,24,39,.25)" : "rgba(29,79,216,.25)";
      const label = _escapeHtml(p.label);
      const icon = _escapeHtml(_iconForNode(id, p));

      return `
        <g class="diag-node" data-node-id="${_escapeHtmlAttr(id)}" style="cursor:${
        appState.diagramas.previewEditMode ? "grab" : "default"
      };">
          <circle class="diag-node-hit" cx="${p.x}" cy="${p.y}" r="18" fill="rgba(0,0,0,0)"></circle>
          <circle cx="${p.x}" cy="${p.y}" r="14" fill="${fill}" stroke="${stroke}" stroke-width="10"></circle>
          <text x="${p.x - 8}" y="${p.y + 7}" font-size="18" fill="white">${icon}</text>
          <text x="${p.x + 18}" y="${p.y + 5}" font-size="12" fill="rgba(17,24,39,.95)">${label}</text>
        </g>
      `;
    })
    .join("");

  const headers = zones
    .map((z, i) => {
      const x = startX + i * colW;
      return `<text x="${x}" y="36" font-size="13" fill="rgba(107,114,128,.95)">${_escapeHtml(z.label)}</text>`;
    })
    .join("");

  return `
    <div class="card" style="padding:12px; overflow:hidden; max-width:100%; min-width:0;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;">Preview</div>
          <div class="muted" style="font-size:12px;">
            Esquema por zonas (coords). Iconos = preview lógico (no CAD real).
            ${appState.diagramas.previewEditMode ? "Arrastra los nodos para fijar posición." : ""}
          </div>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button id="btnDiagToggleEdit" class="btn btn-sm">${
            appState.diagramas.previewEditMode ? "Salir edición" : "Editar posiciones"
          }</button>
          <button id="btnDiagResetLayout" class="btn btn-sm">Reset layout</button>
          <span class="chip">SVG</span>
        </div>
      </div>

      <div style="border:1px solid rgba(15,23,42,.10); border-radius:12px; overflow:auto; background:#fff; max-width:100%; min-width:0;">
        <svg id="diagPreviewSvg"
             width="100%" height="${vbH}"
             viewBox="0 0 ${vbW} ${vbH}"
             preserveAspectRatio="xMinYMin meet"
             style="display:block; max-width:100%; height:auto;">
          <rect x="0" y="0" width="${vbW}" height="${vbH}" fill="white"></rect>
          ${headers}
          ${lines}
          ${nodes}
        </svg>
      </div>

      <div class="muted mt-2" style="font-size:12px;">
        Tip: mueve dispositivos y exporta <b>SVG</b> (formato maestro).
      </div>
    </div>
  `;
}

// Drag controller para SVG
// (guard global para evitar 'already been declared' si el script se evalúa 2 veces)
var _diagDrag = (window._diagDrag = window._diagDrag || { active: false, nodeId: null, offsetX: 0, offsetY: 0 });

function _svgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const inv = ctm.inverse();
  const p = pt.matrixTransform(inv);
  return { x: p.x, y: p.y };
}

function _unbindPreviewWindowListeners() {
  const s = appState.diagramas;
  if (s._previewMouseMoveHandler) {
    window.removeEventListener("mousemove", s._previewMouseMoveHandler, true);
    s._previewMouseMoveHandler = null;
  }
  if (s._previewMouseUpHandler) {
    window.removeEventListener("mouseup", s._previewMouseUpHandler, true);
    s._previewMouseUpHandler = null;
  }
  s._previewListenersBound = false;
}

function _bindPreviewWindowListeners(svg) {
  const s = appState.diagramas;

  _unbindPreviewWindowListeners();

  s._previewMouseMoveHandler = (ev) => {
    if (!_diagDrag.active || !_diagDrag.nodeId) return;
    const p = _svgPoint(svg, ev.clientX, ev.clientY);
    const nx = p.x + _diagDrag.offsetX;
    const ny = p.y + _diagDrag.offsetY;

    s.manualCoords = s.manualCoords || {};
    s.manualCoords[_diagDrag.nodeId] = { x: nx, y: ny };

    _renderResult();
  };

  s._previewMouseUpHandler = () => {
    _diagDrag.active = false;
    _diagDrag.nodeId = null;
  };

  window.addEventListener("mousemove", s._previewMouseMoveHandler, true);
  window.addEventListener("mouseup", s._previewMouseUpHandler, true);
  s._previewListenersBound = true;
}

function _bindPreviewInteractions() {
  const svg = _el("diagPreviewSvg");
  if (!svg) {
    _unbindPreviewWindowListeners();
    return;
  }

  const btnEdit = _el("btnDiagToggleEdit");
  if (btnEdit) {
    btnEdit.onclick = () => {
      appState.diagramas.previewEditMode = !appState.diagramas.previewEditMode;
      _renderResult();
    };
  }

  const btnReset = _el("btnDiagResetLayout");
  if (btnReset) {
    btnReset.onclick = () => {
      appState.diagramas.manualCoords = {};
      _renderResult();
    };
  }

  if (!appState.diagramas.previewEditMode) {
    _unbindPreviewWindowListeners();
    svg.onmousedown = null;
    return;
  }

  const baseResult = appState.diagramas._previewResult || appState.diagramas.lastResult;

  _bindPreviewWindowListeners(svg);

  svg.onmousedown = (ev) => {
    const t = ev.target;
    const g = t && t.closest ? t.closest(".diag-node") : null;
    if (!g) return;

    const nodeId = g.getAttribute("data-node-id");
    if (!nodeId) return;

    const p = _svgPoint(svg, ev.clientX, ev.clientY);

    const coords = _buildSchematicCoordsFromResult(baseResult);
    const cur = coords.get(nodeId);
    if (!cur) return;

    _diagDrag.active = true;
    _diagDrag.nodeId = nodeId;
    _diagDrag.offsetX = cur.x - p.x;
    _diagDrag.offsetY = cur.y - p.y;

    try {
      ev.preventDefault();
    } catch (_) {}
  };
}

function _buildPreviewOnlyResultFromAssignments() {
  const zones = appState.diagramas.zones || [];
  const assignments = appState.diagramas.assignments || {};

  const placements = [];
  for (const z of zones) {
    const list = assignments[z.key] || [];
    for (const it of list) {
      placements.push({
        id: it.id,
        ref: it.ref,
        zone: z.key,
        icon_block: it.iconBlock || "",
        qty: it.qty || 1,
        meta: { source: "USER" },
      });
    }
  }

  return { placements, infra: [], connections: [], summary: {}, errors: [] };
}

function _renderResult() {
  const out = _el("diagOutput");
  if (!out) return;

  const previewOnly = _buildPreviewOnlyResultFromAssignments();
  const hasPreviewPlacements = previewOnly.placements && previewOnly.placements.length > 0;

  if (appState.diagramas.lastError) {
    const raw = appState.diagramas.lastRaw
      ? `
        <details class="mt-2">
          <summary class="muted" style="cursor:pointer;">Ver respuesta IA (raw)</summary>
          <pre style="white-space:pre-wrap; background:#0b1020; color:#e5e7eb; padding:12px; border-radius:10px; overflow:auto; margin-top:8px;">${_escapeHtml(
            appState.diagramas.lastRaw
          )}</pre>
        </details>
      `
      : "";

    if (hasPreviewPlacements) {
      appState.diagramas._previewResult = previewOnly;
      out.innerHTML = `
        <div class="alert alert-error">${_escapeHtml(appState.diagramas.lastError)}</div>
        ${_renderPreviewSvg(previewOnly)}
        ${raw}
      `;
      _bindPreviewInteractions();
      return;
    }

    out.innerHTML = `<div class="alert alert-error">${_escapeHtml(appState.diagramas.lastError)}</div>${raw}`;
    _bindPreviewInteractions();
    return;
  }

  if (!appState.diagramas.lastResult) {
    if (!hasPreviewPlacements) {
      out.innerHTML = `<div class="muted">Arrastra referencias a las zonas.</div>`;
      _bindPreviewInteractions();
      return;
    }

    appState.diagramas._previewResult = previewOnly;
    out.innerHTML = `
      <div class="alert alert-info mb-2">Preview manual (sin IA). Puedes posicionar dispositivos.</div>
      ${_renderPreviewSvg(previewOnly)}
    `;
    _bindPreviewInteractions();
    return;
  }

  const banner = appState.diagramas.usedLocalFallback
    ? `<div class="alert alert-info mb-2">Se generó el diseño en <b>modo local</b> (la IA devolvió texto, no JSON).</div>`
    : "";

  const raw = appState.diagramas.lastRaw
    ? `
      <details class="mt-2">
        <summary class="muted" style="cursor:pointer;">Ver respuesta IA (raw)</summary>
        <pre style="white-space:pre-wrap; background:#0b1020; color:#e5e7eb; padding:12px; border-radius:10px; overflow:auto; margin-top:8px;">${_escapeHtml(
          appState.diagramas.lastRaw
        )}</pre>
      </details>
    `
    : "";

  appState.diagramas._previewResult = appState.diagramas.lastResult;

  const preview = _renderPreviewSvg(appState.diagramas.lastResult);
  const pretty = _escapeHtml(JSON.stringify(appState.diagramas.lastResult, null, 2));

  out.innerHTML = `
    ${banner}
    <div class="mb-2" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
      <span class="chip">Diseño</span>
      <span class="muted">UTP Cat6 · topología eficiente</span>
    </div>

    ${preview}

    <div class="card mt-3" style="padding:12px; min-width:0;">
      <div class="mb-2" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <span class="chip">JSON</span>
        <span class="muted" style="font-size:12px;">Salida completa</span>
      </div>
      <pre style="white-space:pre-wrap; background:#0b1020; color:#e5e7eb; padding:12px; border-radius:10px; overflow:auto;">${pretty}</pre>
      ${raw}
    </div>
  `;

  _bindPreviewInteractions();
}

/* ======================================================
   1) Refs desde presupuesto
 ====================================================== */
function diagLoadProjectRefs() {
  const presu = appState?.presupuesto;
  const lineas = Array.isArray(presu?.lineas) ? presu.lineas : [];

  const map = new Map();
  for (const l of lineas) {
    const ref = String(l?.ref || "").trim();
    if (!ref) continue;
    const qty = Number(l?.cantidad || l?.qty || 0) || 0;
    const desc = String(l?.descripcion || "").trim();

    if (!map.has(ref)) {
      map.set(ref, { ref, descripcion: desc, qty: qty > 0 ? qty : 0 });
    } else {
      const it = map.get(ref);
      it.qty += qty > 0 ? qty : 0;
      if (!it.descripcion && desc) it.descripcion = desc;
    }
  }

  appState.diagramas.refs = Array.from(map.values()).sort((a, b) => a.ref.localeCompare(b.ref));

  appState.diagramas.assignments = appState.diagramas.assignments || {};
  for (const z of appState.diagramas.zones) {
    if (!Array.isArray(appState.diagramas.assignments[z.key])) {
      appState.diagramas.assignments[z.key] = [];
    }
  }
}

/* ======================================================
   2) DXF blocks (solo para biblioteca)
 ====================================================== */
function _stripBom(s) {
  return String(s || "").replace(/^\uFEFF/, "");
}

// ✅ FIX: mantener vacíos como valores, pero nunca como "código"
function _dxfSectionToLines(sectionText) {
  const t = _stripBom(String(sectionText || ""));
  if (!t.trim()) return [];

  let lines = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Quita líneas vacías en posición de "código" (0,2,4...) => inválidas en DXF
  lines = lines.filter((ln, idx) => !(idx % 2 === 0 && ln === ""));

  // Asegura pares code/value
  if (lines.length % 2 === 1) lines.push("");

  return lines;
}

// ✅ TABLES mínimo CON handles (5) + owner (330)
// (AutoCAD LT 2026 suele petar si APPID/LAYER/LTYPE/STYLE no llevan handle)
function _buildMinimalTablesSection() {
  let h = 0x100; // handles > 0
  const nextH = () => (h++).toString(16).toUpperCase();

  const TABLES_OWNER = nextH(); // handle ficticio "owner" de las tablas

  function tableStart(name, count) {
    const th = nextH(); // table handle
    return {
      th,
      lines: [
        "0",
        "TABLE",
        "2",
        name,
        "5",
        th,
        "330",
        TABLES_OWNER,
        "100",
        "AcDbSymbolTable",
        "70",
        String(count),
      ],
    };
  }

  function endTab() {
    return ["0", "ENDTAB"];
  }

  function appidRecord(tableHandle, appName) {
    const rh = nextH();
    return [
      "0",
      "APPID",
      "5",
      rh,
      "330",
      tableHandle,
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbRegAppTableRecord",
      "2",
      appName,
      "70",
      "0",
    ];
  }

  function ltypeContinuous(tableHandle) {
    const rh = nextH();
    return [
      "0",
      "LTYPE",
      "5",
      rh,
      "330",
      tableHandle,
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbLinetypeTableRecord",
      "2",
      "CONTINUOUS",
      "70",
      "0",
      "3",
      "Solid line",
      "72",
      "65",
      "73",
      "0",
      "40",
      "0.0",
    ];
  }

  function layer0(tableHandle) {
    const rh = nextH();
    return [
      "0",
      "LAYER",
      "5",
      rh,
      "330",
      tableHandle,
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbLayerTableRecord",
      "2",
      "0",
      "70",
      "0",
      "62",
      "7",
      "6",
      "CONTINUOUS",
      // PlotStyleName / lineweight default
      "370",
      "0",
      "390",
      "0",
    ];
  }

  function styleStandard(tableHandle) {
    const rh = nextH();
    return [
      "0",
      "STYLE",
      "5",
      rh,
      "330",
      tableHandle,
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbTextStyleTableRecord",
      "2",
      "STANDARD",
      "70",
      "0",
      "40",
      "0",
      "41",
      "1",
      "50",
      "0",
      "71",
      "0",
      "42",
      "2.5",
      "3",
      "txt",
      "4",
      "",
    ];
  }

  const out = ["0", "SECTION", "2", "TABLES"];

  // APPID (ACAD)
  const appid = tableStart("APPID", 1);
  out.push(...appid.lines);
  out.push(...appidRecord(appid.th, "ACAD"));
  out.push(...endTab());

  // LTYPE
  const ltype = tableStart("LTYPE", 1);
  out.push(...ltype.lines);
  out.push(...ltypeContinuous(ltype.th));
  out.push(...endTab());

  // LAYER
  const layer = tableStart("LAYER", 1);
  out.push(...layer.lines);
  out.push(...layer0(layer.th));
  out.push(...endTab());

  // STYLE
  const style = tableStart("STYLE", 1);
  out.push(...style.lines);
  out.push(...styleStandard(style.th));
  out.push(...endTab());

  // VIEW (requerido por AutoCAD LT: SymbolTable:VIEW)
  const view = tableStart("VIEW", 0);
  out.push(...view.lines);
  out.push(...endTab());

  out.push("0", "ENDSEC");
  return out.join("\n");
}

// ✅ HEADER mínimo (añade HANDSEED)
function _buildMinimalHeaderSection() {
  return [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1027",
    "9",
    "$INSUNITS",
    "70",
    "4", // 4=mm
    "9",
    "$HANDSEED",
    "5",
    "FFFF", // semilla alta para que AutoCAD no choque
    "0",
    "ENDSEC",
  ].join("\n");
}

// ✅ NUEVO: quita XDATA (1001 + 1000..1071) para no requerir APPID
function _stripDxfXDataFromLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 2) {
    const code = String(lines[i] ?? "").trim();
    const value = String(lines[i + 1] ?? "");

    if (code === "1001") {
      i += 2;
      while (i < lines.length) {
        const c = String(lines[i] ?? "").trim();
        if (!c) {
          i += 2;
          continue;
        }
        const n = parseInt(c, 10);
        if (Number.isFinite(n) && n >= 1000 && n <= 1071) {
          i += 2;
          continue;
        }
        i -= 2;
        break;
      }
      continue;
    }

    out.push(code, value);
  }
  return out;
}

function _dxfToPairs(dxfText) {
  const lines = _stripBom(String(dxfText || ""))
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i] != null ? String(lines[i]).trim() : "";
    const value = lines[i + 1] != null ? String(lines[i + 1]).trimEnd() : "";
    if (code === "" && value === "" && i > 50) continue;
    pairs.push([code, value.trim()]);
  }
  return pairs;
}

// Extrae NOMBRES de bloques + nº de atributos (ATTDEF) por bloque (compat)
function _dxfExtractBlocks(pairs) {
  const blocks = [];
  const attrsByBlock = {}; // name -> { count, tags[] }

  let inBlocksSection = false;
  let inBlockEntity = false;

  let curName = null;
  let curTags = [];

  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];

    if (c === "0" && v === "SECTION") {
      const next = pairs[i + 1];
      if (next && next[0] === "2") {
        inBlocksSection = String(next[1] || "").toUpperCase() === "BLOCKS";
        inBlockEntity = false;
        curName = null;
        curTags = [];
      }
      continue;
    }

    if (!inBlocksSection) continue;

    if (c === "0" && v === "ENDSEC") {
      inBlocksSection = false;
      inBlockEntity = false;
      curName = null;
      curTags = [];
      continue;
    }

    if (c === "0" && v === "BLOCK") {
      inBlockEntity = true;
      curName = null;
      curTags = [];
      continue;
    }

    if (c === "0" && v === "ENDBLK") {
      if (curName) {
        if (!blocks.includes(curName)) blocks.push(curName);
        attrsByBlock[curName] = { count: curTags.length, tags: curTags.slice() };
      }
      inBlockEntity = false;
      curName = null;
      curTags = [];
      continue;
    }

    if (!inBlockEntity) continue;

    if (!curName && c === "2") {
      curName = String(v || "").trim();
      continue;
    }

    if (c === "0" && v === "ATTDEF") {
      let tag = "";
      for (let j = i + 1; j < pairs.length; j++) {
        const [c2, v2] = pairs[j];
        if (c2 === "0") break;
        if (c2 === "2") {
          tag = String(v2 || "").trim();
          break;
        }
      }
      if (tag) curTags.push(tag);
    }
  }

  return { blocks, attrsByBlock };
}

function _extractDxfSection(dxfText, sectionName) {
  let text = _stripBom(String(dxfText || ""));
  if (!text) return "";

  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const name = String(sectionName || "").trim().toUpperCase();
  if (!name) return "";

  const reStart = new RegExp(String.raw`(?:^|\n)\s*0\s*\n\s*SECTION\s*\n\s*2\s*\n\s*${name}\b`, "i");
  const m0 = reStart.exec(text);
  if (!m0) return "";

  const startIdx = m0.index;

  const reEnd = /(?:^|\n)\s*0\s*\n\s*ENDSEC\b/gi;
  reEnd.lastIndex = startIdx;
  const m1 = reEnd.exec(text);
  if (!m1) return "";

  const endIdx = m1.index + m1[0].length;
  return text.slice(startIdx, endIdx);
}

async function diagImportDxfFile(file) {
  if (!file) return;

  appState.diagramas.lastError = null;
  appState.diagramas.lastRaw = null;

  appState.diagramas.dxfFileName = file.name || "";
  appState.diagramas.dxfText = "";
  appState.diagramas.dxfBlocks = [];
  appState.diagramas.dxfBlockAttrs = {};
  appState.diagramas.dxfHeaderSection = "";
  appState.diagramas.dxfClassesSection = "";
  appState.diagramas.dxfTablesSection = "";
  appState.diagramas.dxfBlocksSection = "";
  appState.diagramas.dxfObjectsSection = "";

  if (!/\.dxf$/i.test(file.name || "")) {
    appState.diagramas.lastError = "El archivo no parece DXF (.dxf).";
    _renderResult();
    return;
  }

  try {
    const text0 = await file.text();
    if (/\x00/.test(text0)) throw new Error("DXF parece binario. Exporta como DXF ASCII.");

    const text = _stripBom(text0);
    appState.diagramas.dxfText = text;

    const pairs = _dxfToPairs(text);
    const ex = _dxfExtractBlocks(pairs);
    appState.diagramas.dxfBlocks = (ex.blocks || []).sort((a, b) => a.localeCompare(b));
    appState.diagramas.dxfBlockAttrs = ex.attrsByBlock || {};

    appState.diagramas.dxfHeaderSection = _extractDxfSection(text, "HEADER") || "";
    appState.diagramas.dxfClassesSection = _extractDxfSection(text, "CLASSES") || "";
    appState.diagramas.dxfTablesSection = _extractDxfSection(text, "TABLES") || "";
    appState.diagramas.dxfBlocksSection = _extractDxfSection(text, "BLOCKS") || "";
    appState.diagramas.dxfObjectsSection = _extractDxfSection(text, "OBJECTS") || "";

    if (!appState.diagramas.dxfBlocksSection) {
      throw new Error("El DXF no contiene SECTION/BLOCKS (o no está en formato ASCII esperado).");
    }

    try {
      localStorage.setItem("diag_dxf_fileName", appState.diagramas.dxfFileName || "");
      localStorage.setItem("diag_dxf_blocks", JSON.stringify(appState.diagramas.dxfBlocks || []));
      localStorage.setItem("diag_dxf_blockAttrs", JSON.stringify(appState.diagramas.dxfBlockAttrs || {}));
      localStorage.setItem("diag_dxf_headerSection", appState.diagramas.dxfHeaderSection || "");
      localStorage.setItem("diag_dxf_classesSection", appState.diagramas.dxfClassesSection || "");
      localStorage.setItem("diag_dxf_tablesSection", appState.diagramas.dxfTablesSection || "");
      localStorage.setItem("diag_dxf_blocksSection", appState.diagramas.dxfBlocksSection || "");
      localStorage.setItem("diag_dxf_objectsSection", appState.diagramas.dxfObjectsSection || "");
    } catch (_) {}

    _renderDiagramasUI();
    _renderResult();
  } catch (e) {
    appState.diagramas.lastError = e.message || String(e);
    _renderResult();
  }
}

/* ======================================================
   3) Drag & drop (refs a zonas)
 ====================================================== */
var _dragRefKey = (window._dragRefKey = window._dragRefKey || null);

function _onRefDragStart(ev, ref) {
  _dragRefKey = (window._dragRefKey = String(ref || ""));
  try {
    ev.dataTransfer.setData("text/plain", _dragRefKey);
    ev.dataTransfer.effectAllowed = "copy";
  } catch (_) {}
}

function _onZoneDragOver(ev) {
  ev.preventDefault();
  try {
    ev.dataTransfer.dropEffect = "copy";
  } catch (_) {}
  const zone = ev.currentTarget;
  if (zone) zone.classList.add("is-drag-over");
}

function _onZoneDragLeave(ev) {
  const zone = ev.currentTarget;
  if (zone) zone.classList.remove("is-drag-over");
}

function _onZoneDrop(ev, zoneKey) {
  ev.preventDefault();
  const zone = ev.currentTarget;
  if (zone) zone.classList.remove("is-drag-over");

  let ref = "";
  try {
    ref = ev.dataTransfer.getData("text/plain") || "";
  } catch (_) {
    ref = _dragRefKey || "";
  }

  ref = String(ref || "").trim();
  if (!ref) return;

  const source = (appState.diagramas.refs || []).find((r) => r.ref === ref);
  if (!source) return;

  const list = (appState.diagramas.assignments[zoneKey] = appState.diagramas.assignments[zoneKey] || []);
  const existing = list.find((x) => x.ref === ref);

  if (existing) {
    existing.qty = Number(existing.qty || 0) + 1;
  } else {
    list.push({
      id: `A_${zoneKey}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      ref: source.ref,
      descripcion: source.descripcion || "",
      qty: Math.max(1, Number(source.qty || 1) || 1),
      iconBlock: "",
    });
  }

  _clearDiagError();
  _renderDiagramasUI();
  _renderResult();
}

function _removeAssignment(zoneKey, id) {
  const list = appState.diagramas.assignments[zoneKey] || [];
  const idx = list.findIndex((x) => x.id === id);
  if (idx >= 0) list.splice(idx, 1);

  _clearDiagError();
  _renderDiagramasUI();
  _renderResult();
}

function _updateAssignment(zoneKey, id, patch) {
  const list = appState.diagramas.assignments[zoneKey] || [];
  const it = list.find((x) => x.id === id);
  if (!it) return;
  Object.assign(it, patch);
  _clearDiagError();
}

/* ======================================================
   4) AUTO icon suggestion
 ====================================================== */
function _norm(s) {
  return String(s || "").toLowerCase();
}

function _suggestIconBlockForItem(item, blocks) {
  const text = `${item.ref || ""} ${item.descripcion || ""}`.toLowerCase();
  const rules = [
    { patterns: ["ip style", "ipstyle"], blockHints: ["ip style", "ipstyle"] },
    { patterns: ["ip one", "ipone"], blockHints: ["ip one", "ipone"] },
    { patterns: ["indoor", "monitor", "pantalla"], blockHints: ["indoor", "monitor"] },
    { patterns: ["access", "unit", "ble", "rfid", "lector"], blockHints: ["access", "unit"] },
    { patterns: ["switch", "poe"], blockHints: ["switch", "poe"] },
    { patterns: ["router", "gateway"], blockHints: ["router", "gateway"] },
    { patterns: ["server", "nvr"], blockHints: ["server", "nvr"] },
  ];
  const bNorm = blocks.map((b) => ({ raw: b, n: _norm(b) }));

  for (const r of rules) {
    if (!r.patterns.some((p) => text.includes(p))) continue;
    for (const hint of r.blockHints) {
      const hit = bNorm.find((x) => x.n.includes(_norm(hint)));
      if (hit) return hit.raw;
    }
  }

  const refNorm = _norm(item.ref);
  if (refNorm) {
    const hit2 = bNorm.find((x) => x.n.includes(refNorm));
    if (hit2) return hit2.raw;
  }
  return "";
}

function diagAutoAssignIcons() {
  const blocks = Array.isArray(appState.diagramas.dxfBlocks) ? appState.diagramas.dxfBlocks : [];
  if (!blocks.length) {
    appState.diagramas.lastError = "Carga primero la plantilla DXF para poder sugerir iconos (BLOCKS).";
    appState.diagramas.lastRaw = null;
    _renderResult();
    return;
  }

  _clearDiagError();

  for (const z of appState.diagramas.zones) {
    const list = appState.diagramas.assignments[z.key] || [];
    for (const it of list) {
      if (it.iconBlock) continue;
      const sug = _suggestIconBlockForItem(it, blocks);
      if (sug) it.iconBlock = sug;
    }
  }

  _renderDiagramasUI();
  _renderResult();
}

/* ======================================================
   5) Payload base (para IA y para fallback local)
 ====================================================== */
function _defaultInstructions() {
  return `
RESPONDE ÚNICAMENTE CON JSON (sin markdown, sin \`\`\`, sin texto).
Tu respuesta DEBE empezar por "{" y terminar por "}".

Objetivo: Diseñar una red eficiente UTP_CAT6 con estrella jerárquica:
devices -> switches zona -> core -> router (en armario_cpd si existe).
No inventes dispositivos finales: SOLO placements con source USER.
Puedes proponer infraestructura VIRTUAL_* en infra.

Devuelve EXACTAMENTE:
{
  "placements":[{"id":"...","ref":"...","zone":"...","icon_block":"...","qty":1,"meta":{"source":"USER"}}],
  "infra":[{"id":"...","type":"VIRTUAL_SWITCH_POE"|"VIRTUAL_SWITCH"|"VIRTUAL_CORE"|"VIRTUAL_ROUTER","zone":"...","meta":{}}],
  "connections":[{"from":"...","to":"...","type":"UTP_CAT6","note":"..."}],
  "summary":{"total_refs":0,"total_devices":0,"total_switches":0},
  "errors":[]
}
`.trim();
}

function _getEffectiveInstructions() {
  const s = appState.diagramas;
  if (s.useCustomPrompt && String(s.customPromptText || "").trim()) return String(s.customPromptText).trim();
  return _defaultInstructions();
}

function _buildSpecFromAssignments() {
  const zones = appState.diagramas.zones || [];
  const assignments = appState.diagramas.assignments || {};

  const placements = [];
  for (const z of zones) {
    const list = Array.isArray(assignments[z.key]) ? assignments[z.key] : [];
    for (const it of list) {
      placements.push({
        id: it.id,
        ref: it.ref,
        descripcion: it.descripcion || "",
        zone: z.key,
        icon_block: it.iconBlock || "",
        qty: Math.max(1, Number(it.qty || 1) || 1),
        meta: { source: "USER" },
      });
    }
  }

  if (!placements.length) throw new Error("No hay referencias asignadas. Arrastra refs a alguna zona.");

  return {
    cable: "UTP_CAT6",
    zones: zones.map((z) => ({ key: z.key, label: z.label })),
    placements,
    icon_library_blocks: (appState.diagramas.dxfBlocks || []).slice(0, 2000),
  };
}

/* ======================================================
   Fallback LOCAL (determinista)
 ====================================================== */
function _isPoeDevice(p) {
  const t = `${p.ref || ""} ${p.descripcion || ""}`.toUpperCase();
  const poeHints = ["IPSTYLE", "IP STYLE", "ACCESS", "UNIT", "READER", "INTERCOM", "IP ONE", "VERSO"];
  return poeHints.some((k) => t.includes(k));
}

function _pickCoreZoneKey(spec) {
  const zones = Array.isArray(spec?.zones) ? spec.zones : [];
  const hasCpd = zones.some((z) => z.key === "armario_cpd");
  if (hasCpd) return "armario_cpd";
  return zones.length ? zones[0].key : "entrada_principal";
}

function _localDesignFromSpec(spec) {
  const placements = Array.isArray(spec?.placements) ? spec.placements : [];
  const zones = Array.isArray(spec?.zones) ? spec.zones : [];

  const byZone = {};
  for (const z of zones) byZone[z.key] = [];
  for (const p of placements) {
    const zk = String(p.zone || zones[0]?.key || "entrada_principal");
    if (!byZone[zk]) byZone[zk] = [];
    byZone[zk].push(p);
  }

  const coreZone = _pickCoreZoneKey(spec);

  const infra = [];
  const connections = [];

  const routerId = `V_ROUTER_${coreZone}`;
  const coreId = `V_CORE_${coreZone}`;
  infra.push({ id: routerId, type: "VIRTUAL_ROUTER", zone: coreZone, meta: { role: "EDGE" } });
  infra.push({ id: coreId, type: "VIRTUAL_CORE", zone: coreZone, meta: { role: "CORE" } });
  connections.push({ from: coreId, to: routerId, type: "UTP_CAT6", note: "Uplink core -> router" });

  let totalSwitches = 0;
  for (const z of zones) {
    const list = byZone[z.key] || [];
    if (!list.length) continue;

    let ports = 0;
    let needsPoe = false;
    for (const p of list) {
      ports += Math.max(1, Number(p.qty || 1) || 1);
      if (_isPoeDevice(p)) needsPoe = true;
    }

    const switchesNeeded = ports > 24 ? 2 : 1;
    for (let i = 1; i <= switchesNeeded; i++) {
      totalSwitches += 1;
      const swId = `V_SW_${z.key}_${i}`;
      infra.push({
        id: swId,
        type: needsPoe ? "VIRTUAL_SWITCH_POE" : "VIRTUAL_SWITCH",
        zone: z.key,
        meta: { ports_estimated: ports, index: i },
      });

      connections.push({
        from: swId,
        to: coreId,
        type: "UTP_CAT6",
        note: z.key === coreZone ? "Switch local -> core" : "Uplink zona -> core",
      });

      for (const p of list) {
        connections.push({
          from: p.id,
          to: swId,
          type: "UTP_CAT6",
          note: "Device -> switch zona",
        });
      }
    }
  }

  const summary = {
    total_refs: placements.length,
    total_devices: placements.reduce((a, p) => a + Math.max(1, Number(p.qty || 1) || 1), 0),
    total_switches: totalSwitches,
  };

  return {
    placements: placements.map((p) => ({
      id: p.id,
      ref: p.ref,
      zone: p.zone,
      icon_block: p.icon_block || "",
      qty: p.qty || 1,
      meta: { source: "USER" },
    })),
    infra,
    connections,
    summary,
    errors: [],
  };
}

/* ======================================================
   IA (opcional) + parse robusto
 ====================================================== */
function _buildHandlerEnvelope(payload) {
  const sectionKey = "diagramas_network";
  const docKey = "diagramas";
  const sectionText = [payload.instructions, "", "INPUT_JSON:", JSON.stringify({ spec: payload.spec, network_rules: payload.network_rules })].join(
    "\n"
  );

  return {
    docKey,
    doc_key: docKey,
    documentKey: docKey,

    sectionKey,
    section_key: sectionKey,
    sectionId: sectionKey,
    section_id: sectionKey,

    sectionText,
    section_text: sectionText,
    content: sectionText,
    text: sectionText,

    mode: "diagram_network_v5_zones_cpd",
    instructions: payload.instructions,
    spec: payload.spec,
    network_rules: payload.network_rules,
    user: { email: appState?.user?.email || "", role: appState?.user?.role || "" },

    jsonOnly: true,
    response_format: "json",
  };
}

function _coerceTextFromHandlerResponse(res) {
  if (res == null) return "";
  if (typeof res === "string") return res;

  const candidates = [res.text, res.output_text, res.outputText, res.content, res.result, res.data, res.response];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }

  try {
    return JSON.stringify(res);
  } catch (_) {
    return String(res);
  }
}

function _extractJsonString(s) {
  const t = String(s || "").trim();
  if (!t) return "";

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) return fence[1].trim();

  const i0 = t.indexOf("{");
  const i1 = t.lastIndexOf("}");
  if (i0 >= 0 && i1 > i0) return t.slice(i0, i1 + 1).trim();

  return "";
}

function _parseJsonRobust(res) {
  if (res == null) return { ok: false, error: "Respuesta vacía", raw: "" };

  if (typeof res === "object" && res) {
    if ("placements" in res && "connections" in res && "errors" in res) {
      return { ok: true, obj: res, raw: "" };
    }
  }

  const rawText = _coerceTextFromHandlerResponse(res);
  const jsonText = _extractJsonString(rawText);

  if (!jsonText) {
    return { ok: false, error: 'La IA devolvió texto sin JSON reconocible (no encuentro "{ ... }").', raw: rawText };
  }

  try {
    const obj = JSON.parse(jsonText);
    return { ok: true, obj, raw: rawText };
  } catch (_) {
    return { ok: false, error: "El JSON extraído no se puede parsear (JSON.parse falla).", raw: rawText };
  }
}

async function diagGenerateDesign() {
  appState.diagramas.lastError = null;
  appState.diagramas.lastResult = null;
  appState.diagramas.lastRaw = null;
  appState.diagramas.usedLocalFallback = false;
  _renderResult();

  appState.diagramas.useCustomPrompt = !!(_el("diagUseCustomPrompt") && _el("diagUseCustomPrompt").checked);
  appState.diagramas.customPromptText = _el("diagPromptText")
    ? String(_el("diagPromptText").value || "")
    : appState.diagramas.customPromptText;

  let spec;
  try {
    spec = _buildSpecFromAssignments();
  } catch (e) {
    appState.diagramas.lastError = e.message || String(e);
    _renderResult();
    return;
  }

  const payload = {
    instructions: _getEffectiveInstructions(),
    spec,
    network_rules: {
      cable: "UTP_CAT6",
      topology: ["hierarchical_star", "star"],
      hints: { cpd_zone_key: "armario_cpd" },
    },
  };

  const handler = window.handleDocSectionAI || window.handleAI || window.callGemini || null;

  if (typeof handler !== "function") {
    appState.diagramas.lastResult = _localDesignFromSpec(spec);
    appState.diagramas.usedLocalFallback = true;
    _renderResult();
    return;
  }

  _setBusy(true);
  try {
    const env = _buildHandlerEnvelope(payload);
    const res = await handler(env);

    const parsed = _parseJsonRobust(res);
    if (!parsed.ok) {
      appState.diagramas.lastRaw = parsed.raw || null;
      appState.diagramas.lastResult = _localDesignFromSpec(spec);
      appState.diagramas.usedLocalFallback = true;
      appState.diagramas.lastError = null;
      _renderResult();
      return;
    }

    const obj = parsed.obj;

    if (!obj || typeof obj !== "object") throw new Error("Respuesta IA inválida.");
    if (!("placements" in obj) || !("connections" in obj) || !("errors" in obj)) {
      appState.diagramas.lastRaw = parsed.raw || null;
      appState.diagramas.lastResult = _localDesignFromSpec(spec);
      appState.diagramas.usedLocalFallback = true;
      appState.diagramas.lastError = null;
      _renderResult();
      return;
    }

    appState.diagramas.lastResult = obj;
    appState.diagramas.lastError = null;
    appState.diagramas.usedLocalFallback = false;
    _renderResult();
  } catch (e) {
    console.error(e);
    appState.diagramas.lastResult = _localDesignFromSpec(spec);
    appState.diagramas.usedLocalFallback = true;
    appState.diagramas.lastError = null;
    _renderResult();
  } finally {
    _setBusy(false);
  }
}

/* ======================================================
   6A) ✅ Export SVG (MAESTRO)
 ====================================================== */
function diagExportSvg() {
  const r = appState.diagramas.lastResult || appState.diagramas._previewResult;
  if (!r) {
    appState.diagramas.lastError = "No hay resultado para exportar. Genera el diseño o crea un preview manual.";
    appState.diagramas.lastRaw = null;
    _renderResult();
    return;
  }

  const coords = _buildSchematicCoordsFromResult(r);
  if (!coords.size) {
    appState.diagramas.lastError = "No hay nodos para exportar.";
    appState.diagramas.lastRaw = null;
    _renderResult();
    return;
  }

  let maxX = 0,
    maxY = 0;
  for (const [, p] of coords.entries()) {
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const vbW = Math.max(900, maxX + 320);
  const vbH = Math.max(420, maxY + 180);

  const zones = appState.diagramas.zones || [];
  const colW = 280;
  const startX = 80;

  const connections = Array.isArray(r?.connections) ? r.connections : [];
  const placements = Array.isArray(r?.placements) ? r.placements : [];
  const infra = Array.isArray(r?.infra) ? r.infra : [];

  const headers = zones
    .map((z, i) => {
      const x = startX + i * colW;
      return `<text x="${x}" y="36" font-size="13" fill="#6b7280" font-family="Arial, sans-serif">${_escapeHtml(z.label)}</text>`;
    })
    .join("");

  const lines = connections
    .map((c) => {
      const a = coords.get(c.from);
      const b = coords.get(c.to);
      if (!a || !b) return "";
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#1d4fd8" stroke-opacity="0.55" stroke-width="2"/>`;
    })
    .join("");

  const placementNodes = placements
    .map((p) => {
      const pos = coords.get(p.id);
      if (!pos) return "";
      const label = _escapeHtml(String(p.ref || p.id || ""));
      return `
      <g>
        <circle cx="${pos.x}" cy="${pos.y}" r="14" fill="#1d4fd8" opacity="0.95"></circle>
        <text x="${pos.x + 18}" y="${pos.y + 5}" font-size="12" fill="#111827" font-family="Arial, sans-serif">${label}</text>
      </g>
    `;
    })
    .join("");

  const infraNodes = infra
    .map((n) => {
      const pos = coords.get(n.id);
      if (!pos) return "";
      const label = _escapeHtml(String(n.type || n.id || ""));
      return `
      <g>
        <circle cx="${pos.x}" cy="${pos.y}" r="14" fill="#111827" opacity="0.95"></circle>
        <text x="${pos.x + 18}" y="${pos.y + 5}" font-size="12" fill="#111827" font-family="Arial, sans-serif">${label}</text>
      </g>
    `;
    })
    .join("");

  const title = `<text x="80" y="20" font-size="14" fill="#111827" font-family="Arial, sans-serif" font-weight="700">DIAGRAMA RED UTP CAT6 (ESQUEMA)</text>`;

  const svgText =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="0 0 ${vbW} ${vbH}">\n` +
    `<rect x="0" y="0" width="${vbW}" height="${vbH}" fill="#ffffff"/>\n` +
    `${title}\n${headers}\n${lines}\n${placementNodes}\n${infraNodes}\n` +
    `</svg>\n`;

  const nameBase = (appState.diagramas.dxfFileName || "diagrama").replace(/\.dxf$/i, "");
  const fileName = `${nameBase}_red_cat6.svg`;

  try {
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    a.rel = "noopener";

    document.body.appendChild(a);
    requestAnimationFrame(() => {
      a.click();
      setTimeout(() => {
        try {
          a.remove();
        } catch (_) {}
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      }, 2000);
    });
  } catch (e) {
    console.error(e);
    appState.diagramas.lastError = "No se pudo descargar el SVG (bloqueado por el navegador).";
    _renderResult();
  }
}

/* ======================================================
   6B) ✅ Export DXF (ASCII) SIN atributos
   FIX: HEADER mínimo + TABLES mínimo + VIEW + STRIP XDATA en BLOCKS
 ====================================================== */
function diagExportDxf() {
  const r = appState.diagramas.lastResult;
  if (!r) {
    appState.diagramas.lastError = "No hay resultado para exportar. Genera el diseño primero.";
    appState.diagramas.lastRaw = null;
    _renderResult();
    return;
  }

  if (!appState.diagramas.dxfBlocksSection) {
    appState.diagramas.lastError = "Para exportar DXF, carga primero la plantilla DXF (para reutilizar BLOCKS).";
    appState.diagramas.lastRaw = null;
    _renderResult();
    return;
  }

  const blocks = Array.isArray(appState.diagramas.dxfBlocks) ? appState.diagramas.dxfBlocks : [];
  if (!blocks.length) {
    appState.diagramas.lastError = "La plantilla DXF no tiene bloques detectados (BLOCKS).";
    appState.diagramas.lastRaw = null;
    _renderResult();
    return;
  }

  const coords = _buildSchematicCoordsFromResult(r);
  if (!coords.size) {
    appState.diagramas.lastError = "No hay nodos en el resultado para exportar.";
    appState.diagramas.lastRaw = null;
    _renderResult();
    return;
  }

  function _normBlockName(s) {
    return String(s || "").trim().toLowerCase();
  }
  const blockMap = new Map();
  blocks.forEach((b) => {
    const nb = _normBlockName(b);
    if (nb && !blockMap.has(nb)) blockMap.set(nb, String(b));
  });

  const placements = Array.isArray(r.placements) ? r.placements : [];
  const infra = Array.isArray(r.infra) ? r.infra : [];
  const connections = Array.isArray(r.connections) ? r.connections : [];

  const _fmt = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0";
    return v.toFixed(3);
  };

  const ent = [];

  function dxfLine(x1, y1, x2, y2) {
    ent.push("0", "LINE", "8", "0", "10", _fmt(x1), "20", _fmt(y1), "30", "0", "11", _fmt(x2), "21", _fmt(y2), "31", "0");
  }

  function dxfCircle(x, y, rad) {
    ent.push("0", "CIRCLE", "8", "0", "10", _fmt(x), "20", _fmt(y), "30", "0", "40", _fmt(rad));
  }

  function dxfText(x, y, h, text) {
    const t = String(text || "").replace(/\r?\n/g, " ");
    ent.push("0", "TEXT", "8", "0", "10", _fmt(x), "20", _fmt(y), "30", "0", "40", _fmt(h), "1", t, "50", "0");
  }

  function dxfInsert(blockName, x, y, sx, sy, rotDeg) {
    const bn = String(blockName || "").replaceAll('"', "").trim();
    ent.push(
      "0",
      "INSERT",
      "8",
      "0",
      "2",
      bn,
      "10",
      _fmt(x),
      "20",
      _fmt(y),
      "30",
      "0",
      "41",
      _fmt(sx),
      "42",
      _fmt(sy),
      "43",
      _fmt(1),
      "50",
      _fmt(rotDeg || 0)
    );
  }

  // Título y cabeceras de zona
  const zones = appState.diagramas.zones || [];
  const colW = 280,
    startX = 80,
    titleY = 40;
  dxfText(80, 20, 14, "DIAGRAMA RED UTP CAT6 (ESQUEMA)");
  zones.forEach((z, i) => dxfText(startX + i * colW, titleY, 12, z.label));

  // Cables
  for (const c of connections) {
    const a = coords.get(c.from);
    const b = coords.get(c.to);
    if (!a || !b) continue;
    dxfLine(a.x, a.y, b.x, b.y);
  }

  // Placements (usa bloque seleccionado; si no, círculo)
  for (const p of placements) {
    const pos = coords.get(p.id);
    if (!pos) continue;

    const wanted = String(p.icon_block || p.iconBlock || "").trim();
    const resolved = wanted ? blockMap.get(_normBlockName(wanted)) || "" : "";

    if (resolved) {
      dxfInsert(resolved, pos.x, pos.y, 1, 1, 0);
    } else {
      dxfCircle(pos.x, pos.y, 10);
    }

    dxfText(pos.x + 16, pos.y + 4, 10, String(p.ref || p.id || ""));
  }

  // Infra (simple círculo + texto)
  for (const n of infra) {
    const pos = coords.get(n.id);
    if (!pos) continue;
    dxfCircle(pos.x, pos.y, 12);
    dxfText(pos.x + 16, pos.y + 4, 10, String(n.type || n.id));
  }

  // ✅ Construcción robusta “por líneas”
  const outLines = [];

  const header = _buildMinimalHeaderSection();
  const tables = _buildMinimalTablesSection(); // incluye VIEW

  const blocksSectionRaw = appState.diagramas.dxfBlocksSection; // requerido
  const blocksLines = _dxfSectionToLines(blocksSectionRaw);
  const blocksCleanLines = _stripDxfXDataFromLines(blocksLines); // quita XDATA

  outLines.push(..._dxfSectionToLines(header));
  outLines.push(..._dxfSectionToLines(tables));
  outLines.push(...blocksCleanLines);

  // ENTITIES
  outLines.push("0", "SECTION", "2", "ENTITIES");
  outLines.push(...ent);
  outLines.push("0", "ENDSEC");

  outLines.push("0", "EOF");

  const out = outLines.join("\n") + "\n";

  const nameBase = (appState.diagramas.dxfFileName || "plantilla").replace(/\.dxf$/i, "");
  const fileName = `${nameBase}_red_cat6_sin_atributos.dxf`;

  try {
    const blob = new Blob([out], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    a.rel = "noopener";

    document.body.appendChild(a);
    requestAnimationFrame(() => {
      a.click();
      setTimeout(() => {
        try {
          a.remove();
        } catch (_) {}
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      }, 2000);
    });
  } catch (e) {
    console.error(e);
    appState.diagramas.lastError = "No se pudo descargar el DXF (bloqueado por el navegador).";
    _renderResult();
  }
}

/* ======================================================
   7) Render UI + FIX buscador
 ====================================================== */

function _renderRefsList() {
  const host = _el("diagRefsList");
  if (!host) return;

  const s = appState.diagramas;
  const refs = Array.isArray(s.refs) ? s.refs : [];
  const q = String(s.refsSearch || "").toLowerCase().trim();
  const filtered = q
    ? refs.filter((r) => (r.ref || "").toLowerCase().includes(q) || (r.descripcion || "").toLowerCase().includes(q))
    : refs;

  host.innerHTML = `
    ${
      filtered.length
        ? filtered
            .slice(0, 300)
            .map(
              (r) => `
            <div class="card diag-draggable" style="padding:10px; margin-bottom:8px;"
                 draggable="true" data-ref="${_escapeHtmlAttr(r.ref)}">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
                <div style="min-width:0;">
                  <div style="font-weight:700;">${_escapeHtml(r.ref)}</div>
                  <div class="muted" style="font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${_escapeHtml(r.descripcion || "")}
                  </div>
                </div>
                <span class="chip">${Number(r.qty || 0)}</span>
              </div>
            </div>
          `
            )
            .join("")
        : `<div class="muted">No hay referencias. Genera un presupuesto primero.</div>`
    }
    ${filtered.length > 300 ? `<div class="muted mt-2">Mostrando 300.</div>` : ""}
  `;

  host.querySelectorAll("[draggable='true'][data-ref]").forEach((node) => {
    node.addEventListener("dragstart", (ev) => _onRefDragStart(ev, node.dataset.ref));
    node.addEventListener("dragend", () => (_dragRefKey = (window._dragRefKey = null)));
  });
}

function _renderDiagramasUI() {
  const host = _el("diagMain");
  if (!host) return;

  const s = appState.diagramas;
  const blocks = Array.isArray(s.dxfBlocks) ? s.dxfBlocks : [];

  function zoneHtml(z) {
    const list = Array.isArray(s.assignments[z.key]) ? s.assignments[z.key] : [];
    const items = list
      .map((it) => {
        const blockOptions =
          `<option value="">(sin icono)</option>` +
          blocks
            .slice(0, 800)
            .map((b) => `<option value="${_escapeHtmlAttr(b)}"${it.iconBlock === b ? " selected" : ""}>${_escapeHtml(b)}</option>`)
            .join("");

        return `
          <div class="card" style="padding:10px; margin-top:8px; min-width:0;">
            <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
              <div style="min-width:0;">
                <div style="font-weight:600;">${_escapeHtml(it.ref)}</div>
                <div class="muted" style="font-size:12px;">${_escapeHtml(it.descripcion || "")}</div>
              </div>
              <button class="btn btn-sm" data-act="remove" data-zone="${_escapeHtmlAttr(z.key)}" data-id="${_escapeHtmlAttr(it.id)}">Quitar</button>
            </div>

            <div class="grid mt-2" style="display:grid; grid-template-columns: 120px 1fr; gap:10px; align-items:center; min-width:0;">
              <div class="form-group" style="margin:0;">
                <label style="font-size:12px;">Cantidad</label>
                <input type="number" min="1" value="${Number(it.qty || 1)}" data-act="qty" data-zone="${_escapeHtmlAttr(
          z.key
        )}" data-id="${_escapeHtmlAttr(it.id)}"/>
              </div>
              <div class="form-group" style="margin:0; min-width:0;">
                <label style="font-size:12px;">Icono (BLOCK)</label>
                <select style="max-width:100%;" data-act="icon" data-zone="${_escapeHtmlAttr(z.key)}" data-id="${_escapeHtmlAttr(
          it.id
        )}">
                  ${blockOptions}
                </select>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="card diag-dropzone" data-zone="${_escapeHtmlAttr(z.key)}" style="padding:12px; min-height:180px; min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <div>
            <div style="font-weight:700;">${_escapeHtml(z.label)}</div>
            <div class="muted" style="font-size:12px;">Suelta aquí referencias del presupuesto</div>
          </div>
          <span class="chip">${list.length}</span>
        </div>
        ${items || `<div class="muted mt-2" style="font-size:12px;">(vacío)</div>`}
      </div>
    `;
  }

  host.innerHTML = `
    <div class="grid" style="display:grid; grid-template-columns: 360px 1fr; gap:14px; min-width:0; max-width:100%;">
      <div class="card" style="padding:12px; min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <h3 style="margin:0;">Referencias del proyecto</h3>
          <button id="btnDiagReloadRefs" class="btn btn-sm">Recargar</button>
        </div>

        <div class="muted mt-1" style="font-size:12px;">
          Fuente: presupuesto (appState.presupuesto.lineas). Arrastra a zonas.
        </div>

        <div class="form-group mt-2">
          <input id="diagRefsSearch" type="text" placeholder="Buscar ref/descripcion..." value="${_escapeHtml(s.refsSearch || "")}"/>
        </div>

        <div id="diagRefsList" style="max-height:520px; overflow:auto; border:1px solid rgba(15,23,42,.08); border-radius:10px; padding:8px;"></div>

        <div class="card mt-3" style="padding:12px;">
          <h4 style="margin:0;">Biblioteca de iconos (DXF)</h4>
          <div class="muted" style="font-size:12px; margin-top:6px;">
            (Opcional) Carga tu “PLANTILLA DE ICONOS.dxf” para sugerir BLOCKs o exportar <b>DXF</b>.
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:10px;">
            <input id="diagDxfFile" type="file" accept=".dxf"/>
            <span class="muted" style="font-size:12px;">
              ${
                s.dxfFileName ? `Cargado: <b>${_escapeHtml(s.dxfFileName)}</b> · blocks: ${blocks.length}` : "Sin DXF cargado"
              }
            </span>
          </div>
        </div>
      </div>

      <div style="min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="min-width:0;">
            <h3 style="margin:0;">Ubicación de dispositivos</h3>
            <div class="muted" style="font-size:12px;">
              Arrastra refs a zonas. AUTO sugiere iconos. Genera diseño, ajusta posiciones y exporta.
              <b>Recomendado</b>: Exportar <b>SVG</b> (formato maestro).
            </div>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button id="btnDiagAuto" class="btn btn-secondary btn-sm">Auto</button>
            <button id="btnDiagTogglePrompt" class="btn btn-sm">Prompt</button>
            <button id="btnDiagGenerate" class="btn btn-primary btn-sm">Generar diseño</button>
            <button id="btnDiagExportSvg" class="btn btn-sm">Exportar SVG</button>
            <button id="btnDiagExportDxf" class="btn btn-sm">Exportar DXF</button>
            <span id="diagBusy" class="muted" style="display:none;">Generando…</span>
          </div>
        </div>

        <div id="diagPromptBox" class="card mt-3" style="padding:12px; display:${s.promptUiOpen ? "" : "none"};">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <h4 style="margin:0;">Prompt</h4>
            <span class="muted" style="font-size:12px;">Editable</span>
          </div>
          <label style="display:flex; gap:8px; align-items:center; margin-top:10px;">
            <input id="diagUseCustomPrompt" type="checkbox"${s.useCustomPrompt ? " checked" : ""}/> Usar prompt personalizado
          </label>
          <div class="form-group mt-2">
            <textarea id="diagPromptText" rows="12">${_escapeHtml(s.customPromptText || _defaultInstructions())}</textarea>
          </div>
        </div>

        <div class="grid mt-3" style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; min-width:0;">
          ${s.zones.map(zoneHtml).join("")}
        </div>

        <div class="mt-3" id="diagOutput" style="min-width:0;"></div>
      </div>
    </div>
  `;

  _renderRefsList();

  const inp = _el("diagRefsSearch");
  if (inp) {
    inp.addEventListener("input", () => {
      appState.diagramas.refsSearch = String(inp.value || "");
      _renderRefsList();
    });
  }

  const btnReload = _el("btnDiagReloadRefs");
  if (btnReload) {
    btnReload.addEventListener("click", () => {
      diagLoadProjectRefs();
      _renderRefsList();
      _renderDiagramasUI();
      _renderResult();
    });
  }

  const inpDxf = _el("diagDxfFile");
  if (inpDxf) {
    inpDxf.addEventListener("change", async () => {
      const f = inpDxf.files && inpDxf.files[0] ? inpDxf.files[0] : null;
      await diagImportDxfFile(f);
    });
  }

  const btnPrompt = _el("btnDiagTogglePrompt");
  if (btnPrompt) {
    btnPrompt.addEventListener("click", () => {
      appState.diagramas.promptUiOpen = !appState.diagramas.promptUiOpen;
      _renderDiagramasUI();
      _renderResult();
    });
  }

  const btnAuto = _el("btnDiagAuto");
  if (btnAuto) btnAuto.addEventListener("click", diagAutoAssignIcons);

  const btnGen = _el("btnDiagGenerate");
  if (btnGen) btnGen.addEventListener("click", diagGenerateDesign);

  const btnSvg = _el("btnDiagExportSvg");
  if (btnSvg) btnSvg.addEventListener("click", diagExportSvg);

  const btnDxf = _el("btnDiagExportDxf");
  if (btnDxf) btnDxf.addEventListener("click", diagExportDxf);

  host.querySelectorAll(".diag-dropzone[data-zone]").forEach((zone) => {
    const zoneKey = zone.dataset.zone;
    zone.addEventListener("dragover", _onZoneDragOver);
    zone.addEventListener("dragleave", _onZoneDragLeave);
    zone.addEventListener("drop", (ev) => _onZoneDrop(ev, zoneKey));
  });

  host.querySelectorAll("[data-act]").forEach((node) => {
    const act = node.dataset.act;
    const zoneKey = node.dataset.zone;
    const id = node.dataset.id;

    if (act === "remove") {
      node.addEventListener("click", () => _removeAssignment(zoneKey, id));
    } else if (act === "qty") {
      node.addEventListener("change", () => {
        const v = Number(node.value || 1);
        _updateAssignment(zoneKey, id, { qty: Math.max(1, Number.isFinite(v) ? v : 1) });
        _renderResult();
      });
    } else if (act === "icon") {
      node.addEventListener("change", () => {
        _updateAssignment(zoneKey, id, { iconBlock: String(node.value || "") });
        _renderResult();
      });
    }
  });
}

/* ======================================================
   Public view
 ====================================================== */
function renderDiagramasView() {
  const root = document.getElementById("appContent");
  if (!root) return;

  const caps = appState?.user?.capabilities;
  const allowed = (caps?.pages && !!caps.pages.diagramas) || (caps?.views && !!caps.views.diagramas);

  if (!allowed) {
    root.innerHTML = `
      <div class="card">
        <h2>Diagrama</h2>
        <div class="alert alert-error mt-2">No tienes permisos para acceder a esta vista.</div>
      </div>
    `;
    return;
  }

  try {
    if (!appState.diagramas.dxfBlocksSection) {
      appState.diagramas.dxfFileName = localStorage.getItem("diag_dxf_fileName") || "";
      const b = localStorage.getItem("diag_dxf_blocks");
      if (b) appState.diagramas.dxfBlocks = JSON.parse(b) || [];

      const ba = localStorage.getItem("diag_dxf_blockAttrs");
      if (ba) appState.diagramas.dxfBlockAttrs = JSON.parse(ba) || {};

      appState.diagramas.dxfHeaderSection = localStorage.getItem("diag_dxf_headerSection") || "";
      appState.diagramas.dxfClassesSection = localStorage.getItem("diag_dxf_classesSection") || "";
      appState.diagramas.dxfTablesSection = localStorage.getItem("diag_dxf_tablesSection") || "";
      appState.diagramas.dxfBlocksSection = localStorage.getItem("diag_dxf_blocksSection") || "";
      appState.diagramas.dxfObjectsSection = localStorage.getItem("diag_dxf_objectsSection") || "";
    }
  } catch (_) {}

  diagLoadProjectRefs();

  root.innerHTML = `
    <div class="card">
      <div>
        <h2 style="margin-bottom:4px;">Diagramas · Drag & Drop</h2>
        <div class="muted">
          Exporta <b>SVG</b> (maestro). Si alguien necesita CAD, convierte SVG→DXF con Inkscape/Illustrator/Visio.
        </div>
      </div>
      <div id="diagMain" class="mt-3"></div>
    </div>
  `;

  _renderDiagramasUI();
  _renderResult();
}

// exports
window.renderDiagramasView = renderDiagramasView;
window.diagImportDxfFile = diagImportDxfFile;
window.diagGenerateDesign = diagGenerateDesign;
window.diagAutoAssignIcons = diagAutoAssignIcons;
window.diagExportSvg = diagExportSvg;
window.diagExportDxf = diagExportDxf;
