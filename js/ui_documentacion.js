// js/ui_documentacion.js
// Página de DOCUMENTACIÓN: memoria de calidades auto-generada + editor flotante

// ======================================================
// ESTADO GLOBAL
// ======================================================

window.appState = window.appState || {};
appState.documentacion = appState.documentacion || {
  idioma: "es", // "es" | "en" | "pt"
  secciones: {}, // clave -> texto
  customBlocks: [], // bloques añadidos manualmente
  fichasIncluidas: {}, // (legacy) idLinea -> true/false
  ultimaAutoGen: null,
  modo: "comercial", // "comercial" | "tecnica"
  mediaLibrary: [], // [{id, nombre, type, mimeType, url, storagePath, folderName, docCategory,...}]
  mediaLoaded: false,
  sectionMedia: {}, // clave sección -> [mediaId]
  selectedFichasMediaIds: [], // fichas técnicas seleccionadas
  mediaSearchTerm: "",
  fichasSearchTerm: "",
  includedSections: {}, // clave sección -> true/false (incluir en PDF técnico)
  logoData: null, // cache logo para PDF
  sectionTitles: {}, // títulos personalizados por sección
};

// ======================================================
// PERSISTENCIA LOCAL
// ======================================================

const DOC_STORAGE_KEY = "docState_v1";

(function loadDocStateFromLocalStorage() {
  try {
    const raw =
      typeof window !== "undefined" &&
      window.localStorage &&
      localStorage.getItem(DOC_STORAGE_KEY);

    if (!raw) return;

    const saved = JSON.parse(raw);
    appState.documentacion = {
      ...appState.documentacion,
      ...saved,
        // 🔒 nunca persistimos media cache
  mediaLoaded: false,
  mediaLibrary: [],
    };
  } catch (e) {
    console.error("[DOC] Error cargando estado de documentación:", e);
  }
})();

function saveDocStateToLocalStorage() {
  try {
    if (!window.localStorage) return;

    const d = appState.documentacion;
    const toSave = {
      idioma: d.idioma,
      secciones: d.secciones,
      customBlocks: d.customBlocks,
      fichasIncluidas: d.fichasIncluidas,
      modo: d.modo,
      sectionMedia: d.sectionMedia,
      selectedFichasMediaIds: d.selectedFichasMediaIds,
      mediaSearchTerm: d.mediaSearchTerm || "",
      fichasSearchTerm: d.fichasSearchTerm || "",
      includedSections: d.includedSections || {},
      sectionTitles: d.sectionTitles || {},
    };

    localStorage.setItem(DOC_STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error("[DOC] Error guardando estado documentación:", e);
  }
}

// ======================================================
// HELPERS DE CONTENEDOR
// ======================================================

function getDocAppContent() {
  if (typeof window.getAppContent === "function") {
    return window.getAppContent();
  }
  return document.getElementById("appContent");
}

// ======================================================
// CONFIGURACIÓN BASE
// ======================================================

const DOC_LANGS = {
  es: { code: "es", label: "Castellano" },
  en: { code: "en", label: "English" },
  pt: { code: "pt", label: "Português (PT)" },
};

const DOC_SECTION_ORDER = [
  "presentacion_empresa",
  "resumen",
  "sistema",
  "equipos",
  "infraestructura",
  "servicios",
  "normativa_red",
  "normativa_lpd",
  "normativa_ciber",
  "otros",
];

const DOC_LOGO_DEFAULT_URL = "img/logo_2n.svg";
const DOC_TECH_COVER_URL = "img/PortadaTecnica.jpg";

// ======================================================
// PLANTILLAS BASE
// ======================================================

const DOC_BASE_TEMPLATES = {
  es: {
    resumen:
      "El presente documento describe la solución de videoportero IP y control de accesos propuesta para el proyecto {{NOMBRE_PROYECTO}}, promovido por {{PROMOTORA}}.",
    sistema:
      "La solución se basa en un sistema de videoportero IP totalmente distribuido...",
    equipos:
      "La solución incluye los siguientes equipos principales:\n\n{{LISTADO_EQUIPOS}}",
    infraestructura:
      "Toda la infraestructura de comunicaciones se apoya en una red IP basada en cableado estructurado...",
    servicios:
      "La solución puede complementarse con servicios cloud para gestión remota...",
    normativa_red:
      "Normativa RED (Radio Equipment Directive) – 1 de agosto de 2025...",
    normativa_lpd: "Protección de datos (LPD / GDPR)...",
    normativa_ciber: "Ciberseguridad y certificaciones 2N...",
    otros:
      "En caso de requerirlo, se podrán añadir servicios adicionales o integraciones.",
  },
  en: {
    resumen:
      "This document describes the proposed IP video intercom and access control solution for the project {{NOMBRE_PROYECTO}}, promoted by {{PROMOTORA}}.",
    sistema:
      "The solution is based on a fully distributed IP video door entry system...",
    equipos:
      "The solution includes the following main devices:\n\n{{LISTADO_EQUIPOS}}",
    infraestructura:
      "All communication infrastructure is based on a structured cabling IP network...",
    servicios:
      "Cloud services can be added to enhance remote management and maintenance...",
    normativa_red: "RED Directive compliance...",
    normativa_lpd: "GDPR compliance information...",
    normativa_ciber: "Cybersecurity and Axis Group practices...",
    otros: "Additional notes and optional integrations.",
  },
  pt: {
    resumen:
      "O presente documento descreve a solução de videoporteiro IP e controlo de acessos proposta para o projeto {{NOMBRE_PROYECTO}}, promovido por {{PROMOTORA}}.",
    sistema:
      "A solução baseia-se num sistema de videoporteiro IP totalmente distribuído...",
    equipos:
      "A solução inclui os seguintes equipamentos principais:\n\n{{LISTADO_EQUIPOS}}",
    infraestructura:
      "Toda a infraestrutura de comunicações assenta numa rede IP com cablagem estruturada...",
    servicios:
      "A solução pode ser complementada com serviços cloud para gestão remota...",
    normativa_red:
      "Norma RED (Radio Equipment Directive) – 1 de agosto de 2025...",
    normativa_lpd: "Informações sobre RGPD...",
    normativa_ciber: "Práticas de cibersegurança e Axis...",
    otros: "Notas adicionais e integrações opcionais.",
  },
};

// ======================================================
// TOKENS Y AUTO-GENERACIÓN
// ======================================================

function buildDocTokens() {
  const proyecto = appState.proyecto || {};
  const presupuesto =
    typeof window.getPresupuestoActual === "function"
      ? window.getPresupuestoActual()
      : null;

  const nombreProyecto =
    proyecto.nombre ||
    proyecto.nombreProyecto ||
    (presupuesto && presupuesto.nombreProyecto) ||
    "el proyecto";

  const promotora =
    proyecto.promotora ||
    proyecto.cliente ||
    (presupuesto && presupuesto.cliente) ||
    "la propiedad";

  let listado = "";
  if (presupuesto && Array.isArray(presupuesto.lineas)) {
    listado = presupuesto.lineas
      .map((l) => {
        const ref = l.ref || l.referencia || "";
        const desc = l.descripcion || "";
        const qty = l.cantidad || 1;
        return `• ${ref} – ${desc} (x${qty})`;
      })
      .join("\n");
  }

  return {
    "{{NOMBRE_PROYECTO}}": nombreProyecto,
    "{{PROMOTORA}}": promotora,
    "{{LISTADO_EQUIPOS}}": listado,
  };
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyTokensToTemplate(txt, tokens) {
  if (!txt) return "";
  let out = txt;
  Object.keys(tokens).forEach((k) => {
    out = out.replace(new RegExp(escapeRegExp(k), "g"), tokens[k]);
  });
  return out;
}
const DOC_PRESENTACION_TEMPLATES = {
  es:
    "2N lidera el camino en tecnología de control de acceso, ofreciendo las características más avanzadas sin comprometer la fiabilidad ni la facilidad de uso.\n\n" +
    "Con más de 30 años de experiencia en el desarrollo de productos innovadores y de alta calidad, 2N ha marcado hitos en el sector tras inventar el primer intercomunicador IP del mundo en 2008 y el primer intercomunicador LTE / 4G diez años después. Desde entonces, continuamos ampliando los límites tecnológicos y adaptándonos a las demandas cambiantes del mercado.\n\n" +
    "Nuestra cartera incluye intercomunicadores, unidades interiores, lectores de control de accesos y sistemas de control de ascensores, garantizando a nuestros clientes una tecnología fiable, segura y preparada para el futuro. Soluciones como el acceso móvil mediante Bluetooth y credenciales QR forman parte de una propuesta diseñada para responder a los estándares actuales de confort, seguridad y flexibilidad.\n\n" +
    "En conjunto, estos productos crean una solución IP de control de accesos altamente avanzada, adecuada para cualquier proyecto residencial. Además, ofrecemos un ecosistema de herramientas y software online pensadas para apoyar a integradores y gestores de edificios en cada fase del proyecto, respaldadas por un soporte técnico integral siempre disponible.\n\n" +
    "La flexibilidad y la facilidad de integración son pilares fundamentales para 2N. Por ello, nuestros productos se basan en protocolos abiertos (SIP, RTSP, ONVIF, HTTPS, open API) y cuentan con más de 200 socios tecnológicos oficiales, permitiendo una integración fluida con una amplia gama de sistemas de terceros.\n\n" +
    "En 2N entendemos el diseño como una parte esencial de la innovación. Reconocimientos como los premios Red Dot e iF Design Awards avalan nuestro compromiso. Invertimos de forma continua en desarrollo y pruebas para garantizar que incluso nuestros dispositivos más avanzados puedan operar de forma fiable en condiciones climáticas exigentes y entornos de alta afluencia.\n\n" +
    "Historia de la empresa\n\n" +
    "2N fue fundada en 1991 en Praga por tres amigos con una visión clara de innovación y excelencia. Praga sigue siendo la sede mundial de la compañía, que desde entonces ha crecido de forma internacional con equipos en países como Estados Unidos, Reino Unido, Alemania, Italia, Francia, España, Bélgica, Países Bajos, Dinamarca, Emiratos Árabes Unidos y Australia, además de una extensa red de distribución global. En 2016, 2N pasó a formar parte del Grupo Axis, fortaleciendo sus recursos y consolidando aún más su estabilidad y proyección a largo plazo.",

  en:
    "2N leads the way in access control technology, delivering the most advanced modern features without compromising reliability or ease of use.\n\n" +
    "With more than 30 years of experience in developing innovative, high-quality products, 2N has shaped the industry after inventing the world’s first IP intercom in 2008 and the first LTE / 4G intercom ten years later. Since then, we have continued to push technological boundaries and respond to evolving market demands.\n\n" +
    "Our portfolio includes intercoms, indoor units, access control readers and lift control systems, ensuring our customers benefit from reliable, secure and future-ready technology. Solutions such as mobile access via Bluetooth and QR credentials are integral to an offering designed to meet modern standards of comfort, security and flexibility.\n\n" +
    "Together, these products form a highly advanced IP access control solution suitable for any residential project. In addition, we provide a comprehensive ecosystem of online tools and software to support integrators and building managers throughout every stage of the project, backed by professional technical support whenever needed.\n\n" +
    "Flexibility and ease of integration are fundamental values at 2N. That is why our products are built on open protocols (SIP, RTSP, ONVIF, HTTPS, open API) and integrate with more than 200 official technology partners, enabling seamless compatibility with a wide range of third-party systems.\n\n" +
    "At 2N, we regard design as an essential part of innovation. Prestigious awards such as the Red Dot and iF Design Awards reflect this commitment. We continuously invest in development and testing to ensure that even our most advanced devices operate reliably in demanding weather conditions and high-traffic environments.\n\n" +
    "Company history\n\n" +
    "2N was founded in 1991 in Prague by three friends with a clear vision for innovation and excellence. Prague remains the company’s global headquarters, and since then 2N has expanded internationally, with teams in countries such as the United States, the United Kingdom, Germany, Italy, France, Spain, Belgium, the Netherlands, Denmark, the United Arab Emirates and Australia, supported by an extensive global distribution network. In 2016, 2N became a proud member of the Axis Group, strengthening its resources and further reinforcing its long-term stability and growth.",

  pt:
    "A 2N lidera o caminho na tecnologia de controlo de acessos, oferecendo funcionalidades modernas avançadas sem comprometer a fiabilidade ou a facilidade de utilização.\n\n" +
    "Com mais de 30 anos de experiência no desenvolvimento de produtos inovadores e de alta qualidade, a 2N marcou o setor ao lançar o primeiro intercomunicador IP do mundo em 2008 e o primeiro intercomunicador LTE / 4G dez anos mais tarde. Desde então, continuamos a ultrapassar limites tecnológicos e a responder às exigências em constante evolução do mercado.\n\n" +
    "O nosso portefólio inclui intercomunicadores, unidades interiores, leitores de controlo de acessos e sistemas de controlo de elevadores, garantindo aos nossos clientes uma tecnologia fiável, segura e preparada para o futuro. Soluções como o acesso móvel através de Bluetooth e credenciais QR fazem parte de uma proposta concebida para responder aos padrões modernos de conforto, segurança e flexibilidade.\n\n" +
    "Em conjunto, estes produtos criam uma solução IP de controlo de acessos altamente avançada, adequada para qualquer projeto residencial. Além disso, disponibilizamos um ecossistema completo de ferramentas e software online para apoiar integradores e gestores de edifícios em todas as fases do projeto, complementado por um suporte técnico profissional sempre disponível.\n\n" +
    "A flexibilidade e a facilidade de integração são valores fundamentais para a 2N. Por isso, os nossos produtos baseiam-se em protocolos abertos (SIP, RTSP, ONVIF, HTTPS, open API) e contam com mais de 200 parceiros tecnológicos oficiais, permitindo uma integração perfeita com uma vasta gama de sistemas de terceiros.\n\n" +
    "Na 2N, encaramos o design como uma parte essencial da inovação. Distinções como os prémios Red Dot e iF Design Awards comprovam este compromisso. Investimos continuamente em desenvolvimento e testes para garantir que mesmo os nossos dispositivos mais avançados funcionem de forma fiável em condições climatéricas exigentes e em ambientes de elevada afluência.\n\n" +
    "História da empresa\n\n" +
    "A 2N foi fundada em 1991 em Praga por três amigos com uma visão clara de inovação e excelência. Praga continua a ser a sede global da empresa, que desde então se expandiu internacionalmente com equipas em países como os Estados Unidos, Reino Unido, Alemanha, Itália, França, Espanha, Bélgica, Países Baixos, Dinamarca, Emirados Árabes Unidos e Austrália, apoiada por uma extensa rede de distribuição global. Em 2016, a 2N tornou-se um orgulhoso membro do Grupo Axis, reforçando os seus recursos e consolidando ainda mais a sua estabilidade e crescimento a longo prazo."
};

function autoGenerateDocumentacion(idioma) {
  const lang = DOC_BASE_TEMPLATES[idioma] ? idioma : "es";
  const base = DOC_BASE_TEMPLATES[lang];
  const tokens = buildDocTokens();

  const nuevas = {};
  const d = appState.documentacion;

  DOC_SECTION_ORDER.forEach((key) => {
    if (key === "presentacion_empresa") {
      const tpl =
        DOC_PRESENTACION_TEMPLATES[lang] ||
        DOC_PRESENTACION_TEMPLATES.es;
      nuevas[key] = tpl;
    } else {
      const tpl = base[key] || "";
      nuevas[key] = applyTokensToTemplate(tpl, tokens);
    }
  });

  d.secciones = nuevas;
  d.ultimaAutoGen = new Date().toISOString();
  d.idioma = lang;

  saveDocStateToLocalStorage();
}

// ======================================================
// HELPERS GENERALES
// ======================================================

function docEscapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function labelForSection(key) {
  switch (key) {
    case "presentacion_empresa":
      return "Presentación de empresa";
    case "resumen":
      return "Resumen del proyecto";
    case "sistema":
      return "Sistema de videoportero y accesos";
    case "equipos":
      return "Equipos principales";
    case "infraestructura":
      return "Infraestructura y red IP";
    case "servicios":
      return "Servicios cloud y operación";
    case "normativa_red":
      return "Normativa RED (1 agosto 2025)";
    case "normativa_lpd":
      return "Protección de datos (LPD / GDPR)";
    case "normativa_ciber":
      return "Ciberseguridad y cumplimiento";
    case "otros":
      return "Otros aspectos / observaciones";
    default:
      return key;
  }
}

function getSectionTitle(key) {
  const titles = appState.documentacion.sectionTitles || {};
  const custom = titles[key];
  if (custom && String(custom).trim().length > 0) {
    return String(custom).trim();
  }
  return labelForSection(key);
}

function getSectionIncluded(key) {
  const m = appState.documentacion.includedSections || {};
  if (typeof m[key] === "boolean") return m[key];
  return true;
}
// ======================================================
// MEDIA POR SECCIÓN (chips dentro de cada bloque)
// ======================================================

function renderSectionMediaHTML(sectionKey) {
  const mediaLib = appState.documentacion.mediaLibrary || [];
  const map = {};
  mediaLib.forEach((m) => {
    if (m && m.id) map[m.id] = m;
  });

  const ids = appState.documentacion.sectionMedia?.[sectionKey] || [];
  if (!ids.length) return "";

  return ids
    .map((id) => {
      const m = map[id];
      if (!m) return "";

      const mime = (m.mimeType || "").toLowerCase();
      const url = (m.url || "").toLowerCase();
      const isImg =
        mime.startsWith("image/") ||
        url.endsWith(".png") ||
        url.endsWith(".jpg") ||
        url.endsWith(".jpeg") ||
        url.endsWith(".webp") ||
        url.endsWith(".gif");

      const caption = m.nombre || "";

      return `
        <div class="doc-section-media-chip">
          <div class="doc-section-media-thumb">
            ${
              isImg
                ? `<img src="${m.url}" alt="${docEscapeHtml(caption)}">`
                : `<div class="doc-section-media-icon">📄</div>`
            }
          </div>
          <div class="doc-section-media-foot">
            <span class="doc-section-media-caption">${docEscapeHtml(
              caption
            )}</span>
            <button
              type="button"
              class="doc-section-media-remove"
              data-remove-media-id="${id}"
            >✕</button>
          </div>
        </div>
      `;
    })
    .join("");
}

// ======================================================
// RENDER DE SECCIONES (columna izquierda)
// ======================================================

function renderDocSectionsHTML() {
  const secciones = appState.documentacion.secciones || {};

  return DOC_SECTION_ORDER.map((key) => {
    const contenido = secciones[key] || "";
    const included = getSectionIncluded(key);
    const title = getSectionTitle(key);

    return `
      <div class="card doc-section-card" data-doc-section="${key}">
        <div class="card-header">
          <div class="doc-section-title-wrap" style="flex:1;max-width:60%;">
            <input
              type="text"
              class="form-control doc-section-title-input"
              data-doc-section-title="${key}"
              value="${docEscapeHtml(title)}"
              placeholder="${docEscapeHtml(labelForSection(key))}"
            >
          </div>

          <div class="doc-section-header-actions">
            <label class="doc-section-include-toggle" style="font-size:0.75rem;display:flex;align-items:center;gap:0.25rem;margin-right:0.5rem;">
              <input type="checkbox"
                data-doc-section-enable="${key}"
                ${included ? "checked" : ""}>
              Incluir en PDF
            </label>

            <button class="btn btn-xs btn-outline"
              data-doc-ai-section="${key}">
              ✨ Preguntar a IA
            </button>
          </div>
        </div>

        <div class="card-body">
          <textarea
            class="form-control doc-section-textarea"
            data-doc-section-text="${key}"
            rows="10"
          >${docEscapeHtml(contenido)}</textarea>

          <div class="doc-section-media-drop"
            data-doc-section-drop="${key}">
            <div class="doc-section-media-items">
              ${renderSectionMediaHTML(key)}
            </div>
            <div class="doc-section-media-hint">
              Arrastra aquí imágenes para adjuntar a esta sección (máx. 10).
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ======================================================
// RENDER FICHAS TÉCNICAS (barra derecha)
// ======================================================

function renderDocFichasHTML() {
  const media = appState.documentacion.mediaLibrary || [];

  const fichas = media.filter((m) => {
    const cat = (m.docCategory || "").toLowerCase();
    const mime = (m.mimeType || "").toLowerCase();

    if (cat === "ficha") return true;
    if (mime === "application/pdf") return true;
    if (
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mime === "application/msword"
    )
      return true;

    return false;
  });

  const selected = new Set(
    appState.documentacion.selectedFichasMediaIds || []
  );

  const term = (appState.documentacion.fichasSearchTerm || "")
    .trim()
    .toLowerCase();

  const filtered = term
    ? fichas.filter((m) => {
        const t =
          (m.nombre || "") +
          " " +
          (m.folderName || "") +
          " " +
          (m.docCategory || "");
        return t.toLowerCase().includes(term);
      })
    : fichas;

  const searchInputHtml = `
    <div class="form-group mb-2">
      <input
        type="text"
        id="docFichasSearchInput"
        class="form-control"
        placeholder="Buscar por nombre..."
        value="${docEscapeHtml(
          appState.documentacion.fichasSearchTerm || ""
        )}"
      >
    </div>
  `;

 if (!filtered.length) {
  return `
    <div class="doc-fichas-section">
      <div class="doc-fichas-block">
        <div class="doc-fichas-title">Fichas técnicas</div>
        <p class="doc-fichas-help">
          No se han encontrado fichas técnicas. Puedes subirlas desde
          <strong>Gestión de documentación</strong>.
        </p>
        ${searchInputHtml}

        <div id="docFichasListWrap">
          <p class="text-muted" style="font-size:0.85rem;">
            Sin resultados.
          </p>
        </div>

      </div>
    </div>
  `;
}

  const list = filtered
    .map((m) => {
      const checked = selected.has(m.id) ? "checked" : "";
      const main = m.folderName
        ? `<strong>${docEscapeHtml(
            m.folderName
          )}</strong> – ${docEscapeHtml(m.nombre || "")}`
        : `<strong>${docEscapeHtml(m.nombre || "")}</strong>`;

      return `
        <label class="doc-ficha-item">
          <input type="checkbox"
            data-doc-ficha-media-id="${m.id}"
            ${checked}
          >
          <span class="doc-ficha-main">${main}</span>
        </label>
      `;
    })
    .join("");

  return `
    <div class="doc-fichas-section">
      <div class="doc-fichas-block">
        <div class="doc-fichas-title">Fichas técnicas</div>
        <p class="doc-fichas-help">
          Selecciona las fichas que quieras incluir en el PDF técnico.
        </p>
        ${searchInputHtml}
<div id="docFichasListWrap">
  <div class="doc-fichas-list doc-fichas-media-list">
    ${list}
  </div>
</div>

        </div>
      </div>
    </div>
  `;
}
// ======================================================
// DOCUMENTACIÓN GRÁFICA – SOLO IMÁGENES
// ======================================================

function cleanInvalidMediaItems() {
  const list = appState.documentacion.mediaLibrary || [];
  appState.documentacion.mediaLibrary = list.filter(
    (m) => m && m.id && typeof m.id === "string" && m.id.trim()
  );
}

function renderDocMediaLibraryHTML() {
  cleanInvalidMediaItems();

  const all = appState.documentacion.mediaLibrary || [];

  const images = all.filter((m) => {
    const mime = (m.mimeType || "").toLowerCase();
    const type = (m.type || "").toLowerCase();
    const url = (m.url || "").toLowerCase();

    return (
      mime.startsWith("image/") ||
      type === "image" ||
      url.endsWith(".png") ||
      url.endsWith(".jpg") ||
      url.endsWith(".jpeg") ||
      url.endsWith(".webp") ||
      url.endsWith(".gif")
    );
  });

  if (!images.length) {
    return `
      <p class="text-muted" style="font-size:0.85rem;">
        Todavía no has subido documentación gráfica.
      </p>
    `;
  }

  const term = (appState.documentacion.mediaSearchTerm || "")
    .trim()
    .toLowerCase();

  const filtered = term
    ? images.filter((m) => {
        const t =
          (m.nombre || "") +
          " " +
          (m.folderName || "") +
          " " +
          (m.docCategory || "");
        return t.toLowerCase().includes(term);
      })
    : images;

  if (!filtered.length) {
    return `
      <p class="text-muted" style="font-size:0.85rem;">
        No se han encontrado imágenes que coincidan con la búsqueda.
      </p>
    `;
  }

  return `
    <div class="doc-media-list doc-fichas-list">
      ${filtered
        .map((m) => {
          const caption =
            m.folderName && m.nombre
              ? `${m.folderName} – ${m.nombre}`
              : m.nombre;
          return `
            <div class="doc-media-item doc-media-row"
              draggable="true"
              data-media-id="${m.id}">
              <div class="doc-media-row-main">
                <span class="doc-media-row-icon">🖼️</span>
                <span class="doc-media-caption">${docEscapeHtml(
                  caption || ""
                )}</span>
              </div>
              <div class="doc-media-row-actions">
                <button class="btn btn-xs"
                  data-media-view-id="${m.id}">
                  👁 Ver
                </button>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function refreshDocMediaGridOnly() {
  const container = getDocAppContent();
  if (!container) return;

  const wrap = container.querySelector("#docMediaListWrap");
  if (!wrap) return;

  wrap.innerHTML = renderDocMediaLibraryHTML();
  attachDocMediaGridHandlers(container);
}

function refreshDocFichasOnly() {
  const container = getDocAppContent();
  if (!container) return;

  const wrap = container.querySelector("#docFichasListWrap");
  if (!wrap) return;

  wrap.innerHTML = renderDocFichasListOnlyHTML();

  wrap.querySelectorAll("[data-doc-ficha-media-id]").forEach((chk) => {
    chk.addEventListener("change", () => {
      const id = chk.getAttribute("data-doc-ficha-media-id");
      if (!id) return;

      const set = new Set(appState.documentacion.selectedFichasMediaIds || []);
      if (chk.checked) set.add(id);
      else set.delete(id);

      appState.documentacion.selectedFichasMediaIds = Array.from(set);
      saveDocStateToLocalStorage();
    });
  });
}

function renderDocFichasListOnlyHTML() {
  const media = appState.documentacion.mediaLibrary || [];

  const fichas = media.filter((m) => {
    const cat = (m.docCategory || "").toLowerCase();
    const mime = (m.mimeType || "").toLowerCase();
    if (cat === "ficha") return true;
    if (mime === "application/pdf") return true;
    if (
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mime === "application/msword"
    ) return true;
    return false;
  });

  const selected = new Set(appState.documentacion.selectedFichasMediaIds || []);
  const term = (appState.documentacion.fichasSearchTerm || "").trim().toLowerCase();

  const filtered = term
    ? fichas.filter((m) => {
        const t =
          (m.nombre || "") +
          " " +
          (m.folderName || "") +
          " " +
          (m.docCategory || "");
        return t.toLowerCase().includes(term);
      })
    : fichas;

  if (!filtered.length) {
    return `
      <p class="text-muted" style="font-size:0.85rem;">
        No se han encontrado fichas técnicas.
      </p>
    `;
  }

  return `
    <div class="doc-fichas-list doc-fichas-media-list">
      ${filtered
        .map((m) => {
          const checked = selected.has(m.id) ? "checked" : "";
          const main = m.folderName
            ? `<strong>${docEscapeHtml(m.folderName)}</strong> – ${docEscapeHtml(m.nombre || "")}`
            : `<strong>${docEscapeHtml(m.nombre || "")}</strong>`;

          return `
            <label class="doc-ficha-item">
              <input type="checkbox"
                data-doc-ficha-media-id="${m.id}"
                ${checked}
              >
              <span class="doc-ficha-main">${main}</span>
            </label>
          `;
        })
        .join("")}
    </div>
  `;
}
// ======================================================
// OVERLAY FLOTANTE PARA VER UNA IMAGEN
// ======================================================

function openDocImageFloatingPreview(item) {
  if (!item?.url) return;

  const prev = document.getElementById("docMediaFloatingPreview");
  if (prev) prev.remove();

  const title =
    item.folderName && item.nombre
      ? item.folderName + " – " + item.nombre
      : item.nombre || "Imagen";

  const overlay = document.createElement("div");
  overlay.id = "docMediaFloatingPreview";
  overlay.style =
    "position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;" +
    "align-items:center;justify-content:center;z-index:999999;";

  overlay.innerHTML = `
    <div style="
      position:relative;
      max-width:90vw;
      max-height:90vh;
      background:#111827;
      padding:12px;
      border-radius:12px;
      box-shadow:0 15px 40px rgba(0,0,0,0.6);
      display:flex;
      flex-direction:column;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="
          color:#e5e7eb;
          font-size:0.9rem;
          font-weight:500;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          max-width:70vw;
        ">
          ${docEscapeHtml(title)}
        </div>
        <button id="docMediaFloatingCloseBtn"
          style="border:none;background:#374151;color:#f9fafb;border-radius:999px;
          padding:4px 10px;font-size:0.8rem;cursor:pointer;">
          ✕ Cerrar
        </button>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;">
        <img src="${item.url}"
          style="max-width:86vw;max-height:80vh;object-fit:contain;border-radius:6px;background:#000;">
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) overlay.remove();
  });

  document
    .getElementById("docMediaFloatingCloseBtn")
    ?.addEventListener("click", () => overlay.remove());
}

// ======================================================
// MEDIA GRID HANDLERS
// ======================================================

function attachDocMediaGridHandlers(root) {
  const container = root || getDocAppContent();
  if (!container) return;

  // Drag
  container.querySelectorAll(".doc-media-item").forEach((item) => {
    item.addEventListener("dragstart", (ev) => {
      const id = item.getAttribute("data-media-id");
      if (!id || !ev.dataTransfer) return;
      ev.dataTransfer.setData("text/plain", id);
      ev.dataTransfer.effectAllowed = "copy";
    });
  });

  // Ver imagen
  container.querySelectorAll("[data-media-view-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-media-view-id");
      if (!id) return;

      const item =
        (appState.documentacion.mediaLibrary || []).find((m) => m.id === id) ||
        null;

      if (!item?.url) {
        alert("No se ha encontrado la imagen. Revisa la consola.");
        return;
      }

      const mime = (item.mimeType || "").toLowerCase();
      const url = (item.url || "").toLowerCase();
      const isImg =
        mime.startsWith("image/") ||
        url.endsWith(".png") ||
        url.endsWith(".jpg") ||
        url.endsWith(".jpeg") ||
        url.endsWith(".webp") ||
        url.endsWith(".gif");

      if (isImg) openDocImageFloatingPreview(item);
      else window.open(item.url, "_blank");
    });
  });

  // Botón quitar imagen de sección
  container.querySelectorAll(".doc-section-media-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-media-id");
      const zone = btn.closest("[data-doc-section-drop]");
      const sec = zone ? zone.getAttribute("data-doc-section-drop") : null;
      if (!id || !sec) return;
      detachMediaFromSection(sec, id);
    });
  });
}

// ======================================================
// AÑADIR / QUITAR MEDIA A SECCIÓN
// ======================================================

function attachMediaToSection(sectionKey, mediaId) {
  const map = appState.documentacion.sectionMedia || {};
  const arr = map[sectionKey] || [];

  if (!arr.includes(mediaId) && arr.length >= 10) {
    alert("Solo puedes adjuntar hasta 10 imágenes por sección.");
    return;
  }

  if (!arr.includes(mediaId)) arr.push(mediaId);
  map[sectionKey] = arr;
  appState.documentacion.sectionMedia = map;

  saveDocStateToLocalStorage();

  // 🔧 Evitamos ReferenceError si este helper se usa en otras pantallas
  if (typeof window.renderDocumentacionView === "function") {
    window.renderDocumentacionView();
  }
}

function detachMediaFromSection(sectionKey, mediaId) {
  const map = appState.documentacion.sectionMedia || {};
  const arr = map[sectionKey] || [];
  map[sectionKey] = arr.filter((id) => id !== mediaId);
  appState.documentacion.sectionMedia = map;

  saveDocStateToLocalStorage();

  // 🔧 Evitamos ReferenceError si se llama desde Gestión documentación
  if (typeof window.renderDocumentacionView === "function") {
    window.renderDocumentacionView();
  }
}
// ======================================================
// MODAL PARA BLOQUES CUSTOM
// ======================================================

function openDocCustomModal() {
  const modal = document.getElementById("docCustomModal");
  const back = document.getElementById("docModalBackdrop");

  if (modal) modal.classList.remove("hidden");
  if (back) back.classList.remove("hidden");

  const txt = document.getElementById("docCustomText");
  if (txt) txt.value = "";
}

function closeDocCustomModal() {
  document.getElementById("docCustomModal")?.classList.add("hidden");
  document.getElementById("docModalBackdrop")?.classList.add("hidden");
}

function saveDocCustomBlock() {
  const select = document.getElementById("docCustomSectionSelect");
  const textarea = document.getElementById("docCustomText");

  if (!select || !textarea) return;

  const sec = select.value;
  const text = textarea.value.trim();

  if (!text) {
    closeDocCustomModal();
    return;
  }

  const secs = (appState.documentacion.secciones ||= {});
  const actual = secs[sec] || "";
  const nuevo =
    actual.trim().length > 0 ? actual.trim() + "\n\n" + text : text;

  secs[sec] = nuevo;

  (appState.documentacion.customBlocks ||= []).push({
    section: sec,
    text,
    ts: new Date().toISOString(),
  });

  saveDocStateToLocalStorage();
  closeDocCustomModal();
  renderDocumentacionView();
}

// ======================================================
// IA POR SECCIÓN
// ======================================================

// Limpia formato Markdown y viñetas que pueda devolver la IA
function sanitizeAIText(raw) {
  if (!raw) return "";

  const lines = String(raw).split(/\r?\n/).map((line) => {
    let l = line;

    // Quitar encabezados tipo "# Título", "## Título"
    l = l.replace(/^\s*#{1,6}\s*/g, "");

    // Quitar viñetas al inicio de línea: "-", "*", "•"
    l = l.replace(/^\s*[-*•]\s+/g, "");

    // Quitar numeraciones tipo "1. Texto", "2) Texto"
    l = l.replace(/^\s*\d+[\.\)]\s+/g, "");

    // Quitar negritas/cursivas markdown (**texto**, *texto*, _texto_, __texto__)
    l = l.replace(/\*\*(.+?)\*\*/g, "$1");
    l = l.replace(/\*(.+?)\*/g, "$1");
    l = l.replace(/__(.+?)__/g, "$1");
    l = l.replace(/_(.+?)_/g, "$1");

    return l;
  });

  return lines.join("\n").trim();
}

async function askAIForSection(sectionKey) {
  const idioma = appState.documentacion.idioma || "es";
  const secciones = appState.documentacion.secciones || {};
  const textoActual = secciones[sectionKey] || "";
  const titulo = getSectionTitle(sectionKey);
  const proyecto = appState.proyecto || {};
  const presupuesto =
    typeof window.getPresupuestoActual === "function"
      ? window.getPresupuestoActual()
      : null;

  const modo = appState.documentacion.modo || "comercial";

  if (typeof window.handleDocSectionAI === "function") {
    try {
      const nuevo = await window.handleDocSectionAI({
        sectionKey,
        idioma,
        titulo,
        texto: textoActual,
        proyecto,
        presupuesto,
        modo,
      });

      if (typeof nuevo === "string" && nuevo.trim()) {
        const limpio = sanitizeAIText(nuevo);
        return limpio || textoActual;
      }
      return textoActual;
    } catch (e) {
      console.error("[DOC] Error IA:", e);
      alert("Ha ocurrido un error al consultar la IA.");
      return textoActual;
    }
  }

  alert("Función IA no implementada. Debes añadir window.handleDocSectionAI.");
  return textoActual;
}

// Implementación por defecto si no existe
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

    // Limpiamos símbolos (*, #, -, listas...) antes de devolver
    return sanitizeAIText(data.text);
  };
}
// ======================================================
// CARGA MEDIA (Firestore + Storage)
// ======================================================

// ✅ Nuevo helper: intenta sacar proyectoId de varias fuentes (proyecto + presupuesto)
function getCurrentProyectoIdSafe() {
  const proyecto = appState.proyecto || {};
  let proyectoId = proyecto.id || proyecto.proyectoId || proyecto.projectId || null;

  if (!proyectoId && typeof window.getPresupuestoActual === "function") {
    const p = window.getPresupuestoActual() || {};
    proyectoId = p.proyectoId || p.projectId || p.id || null;
  }

  // último recurso: si guardaste el proyecto en localStorage con alguna clave típica
  if (!proyectoId) {
    try {
      const raw =
        window?.localStorage &&
        (localStorage.getItem("presupuestos2n_proyecto") ||  
          localStorage.getItem("presupuestos2n_proyecto_v1") ||
          localStorage.getItem("proyectoState_v1") ||
          localStorage.getItem("proyecto_v1"));
      if (raw) {
        const obj = JSON.parse(raw);
        proyectoId = obj?.id || obj?.proyectoId || obj?.projectId || null;
      }
    } catch (_) {}
  }

  return proyectoId || null;
}

async function ensureDocMediaLoaded() {
  const db =
    window.db ||
    (window.firebase?.firestore ? window.firebase.firestore() : null);
  if (!db) return false;

  try {
    const auth =
      window.auth ||
      (window.firebase?.auth ? window.firebase.auth() : null);

    const user =
      auth?.currentUser ||
      (typeof waitForAuthReady === "function"
        ? await waitForAuthReady(8000)
        : null);

    if (!user) {
      appState.documentacion.mediaLoaded = false;
      return false;
    }

    const mediaMap = new Map();

    // ✅ 1) CARGA GLOBAL DE LIBRERÍA (lo subido en Gestión)
    const snapAll = await db
      .collection("documentacion_media")
      .orderBy("uploadedAt", "desc")
      .limit(500)
      .get();

    snapAll.forEach((d) =>
      mediaMap.set(d.id, { ...d.data(), id: d.id })
    );

    // ✅ 2) Compatibilidad legacy por uid (media antigua)
    const snapUid = await db
      .collection("documentacion_media")
      .where("uid", "==", user.uid)
      .limit(200)
      .get();

    snapUid.forEach((d) =>
      mediaMap.set(d.id, { ...d.data(), id: d.id })
    );

    appState.documentacion.mediaLibrary = Array.from(mediaMap.values());
    appState.documentacion.mediaLoaded = true;

    console.log(
      "[DOC] Librería de documentación cargada:",
      appState.documentacion.mediaLibrary.length
    );

    return true;
  } catch (e) {
    console.error("[DOC] Error cargando documentación media:", e);
    appState.documentacion.mediaLoaded = false;
    return false;
  }
}


async function saveMediaFileToStorageAndFirestore(file, options = {}) {
  const name = file.name || "archivo";
  const now = new Date().toISOString();
  const isImg = file.type?.startsWith("image/");
  const type = isImg ? "image" : "file";

  const folderName = options.folderName || "";
  const docCategory = options.docCategory || "imagen";

  const folderSlug = slugifyFolderName(folderName);

  const storage =
    window.storage ||
    (window.firebase?.storage ? window.firebase.storage() : null);
  const db =
    window.db ||
    (window.firebase?.firestore ? window.firebase.firestore() : null);
  const auth =
    window.auth ||
    (window.firebase?.auth ? window.firebase.auth() : null);

  let url = null;
  let storagePath = null;

  let uid = auth?.currentUser?.uid || null;

  if (storage) {
    storagePath =
      "documentacion_media/" +
      (uid || "anon") +
      "/" +
      folderSlug +
      "/" +
      Date.now() +
      "_" +
      name;

    const ref = storage.ref().child(storagePath);
    await ref.put(file);
    url = await ref.getDownloadURL();
  } else {
    url = URL.createObjectURL(file);
  }

  const proyectoId =
  (typeof getCurrentProyectoIdSafe === "function"
    ? getCurrentProyectoIdSafe()
    : (appState.proyecto?.id || appState.proyecto?.proyectoId || appState.proyecto?.projectId || null));


  const mediaData = {
    nombre: name,
    type,
    mimeType: file.type,
    url,
    storagePath,
    uploadedAt: now,
    folderName: folderName || null,
    docCategory,
    proyectoId, // ✅ CLAVE
  };

  if (db) {
    const ref = await db.collection("documentacion_media").add({
      ...mediaData,
      uid,
      proyectoId, // ✅ redundante ok
    });

    mediaData.id = ref.id;
  } else {
    mediaData.id =
      "local_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 8);
  }

  return mediaData;
}

async function deleteMediaById(mediaId) {
  const media = appState.documentacion.mediaLibrary || [];
  const item = media.find((m) => m.id === mediaId);
  if (!item) return;

  const storage =
    window.storage ||
    (window.firebase?.storage ? window.firebase.storage() : null);
  const db =
    window.db ||
    (window.firebase?.firestore ? window.firebase.firestore() : null);

  if (storage && item.storagePath) {
    try {
      await storage.ref().child(item.storagePath).delete();
    } catch (e) {
      console.warn("[DOC] No se pudo borrar en Storage:", e);
    }
  }

  if (db) {
    try {
      await db.collection("documentacion_media").doc(mediaId).delete();
    } catch (e) {
      console.warn("[DOC] No se pudo borrar en Firestore:", e);
    }
  }

  appState.documentacion.mediaLibrary = media.filter((m) => m.id !== mediaId);

  const map = appState.documentacion.sectionMedia || {};
  Object.keys(map).forEach((sec) => {
    map[sec] = map[sec].filter((id) => id !== mediaId);
  });

  appState.documentacion.selectedFichasMediaIds =
    (appState.documentacion.selectedFichasMediaIds || []).filter(
      (id) => id !== mediaId
    );

  saveDocStateToLocalStorage();

  // 🔧 Aquí era donde se producía el error si la vista de Documentación no estaba montada
  if (typeof window.renderDocumentacionView === "function") {
    window.renderDocumentacionView();
  }
}
// ======================================================
// UTILS PDF
// ======================================================

function slugifyFolderName(name) {
  if (!name) return "general";
  return (
    String(name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "general"
  );
}

function loadImageAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = () => {
      try {
        const maxDim = 1200;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        const max = Math.max(w, h);
        const scale = max > maxDim ? maxDim / max : 1;

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve({
          dataUrl: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height,
        });
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = reject;
    img.src = url;
  });
}

async function getDocLogoImage() {
  if (appState.documentacion.logoData) {
    return appState.documentacion.logoData;
  }

  const url =
    window.DOC_LOGO_URL || DOC_LOGO_DEFAULT_URL || "img/logo_2n.svg";

  try {
    const obj = await loadImageAsDataUrl(url);
    appState.documentacion.logoData = obj;
    return obj;
  } catch (e) {
    console.warn("[DOC] No se pudo cargar el logo:", e);
    return null;
  }
}

// Justifica una línea dentro de un ancho máximo (solo se usa en PDF técnico)
function drawJustifiedLine(doc, text, x, y, maxWidth) {
  if (!text) {
    doc.text("", x, y);
    return;
  }

  const str = String(text).trim();
  if (!str) {
    doc.text("", x, y);
    return;
  }

  const words = str.split(/\s+/);
  if (words.length <= 1) {
    doc.text(str, x, y);
    return;
  }

  const fullWidth = doc.getTextWidth(str);
  const extraTotal = maxWidth - fullWidth;

  // Si ya ocupa casi todo el ancho o es más estrecha, no forzamos nada raro
  if (extraTotal <= 0) {
    doc.text(str, x, y);
    return;
  }

  const spaceCount = words.length - 1;
  const normalSpaceWidth = doc.getTextWidth(" ");
  const extraPerSpace = extraTotal / spaceCount;

  let cursorX = x;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    doc.text(w, cursorX, y);
    if (i < words.length - 1) {
      const wWidth = doc.getTextWidth(w);
      cursorX += wWidth + normalSpaceWidth + extraPerSpace;
    }
  }
}

function getDocPageDimensions(pdf) {
  const size = pdf.internal.pageSize;
  return {
    width: size.getWidth ? size.getWidth() : size.width,
    height: size.getHeight ? size.getHeight() : size.height,
  };
}
// ======================================================
// PDF TÉCNICO (títulos 20 / texto 11)
// ======================================================

async function insertImagesForSection(doc, sectionKey, y, onNewPage) {
  const ids = appState.documentacion.sectionMedia?.[sectionKey] || [];
  const media = appState.documentacion.mediaLibrary || [];

  const images = ids
    .map((id) => media.find((m) => m.id === id))
    .filter((m) => {
      if (!m?.url) return false;
      const mime = (m.mimeType || "").toLowerCase();
      const url = (m.url || "").toLowerCase();
      return (
        mime.startsWith("image/") ||
        url.endsWith(".png") ||
        url.endsWith(".jpg") ||
        url.endsWith(".jpeg") ||
        url.endsWith(".webp") ||
        url.endsWith(".gif")
      );
    });

  if (!images.length) return y;

  const dims = getDocPageDimensions(doc);
  const maxY = dims.height - 25;
  const pageWidth = dims.width;

  for (const m of images) {
    try {
      const obj = await loadImageAsDataUrl(m.url);
      const ratio = obj.width / obj.height;

      let imgW = 60;
      let imgH = imgW / ratio;

      if (imgH > 38) {
        imgH = 38;
        imgW = imgH * ratio;
      }

      const needed = imgH + 10;

      if (y + needed > maxY) {
        y = typeof onNewPage === "function" ? onNewPage() : 25;
      }

      const x = (pageWidth - imgW) / 2;
      doc.addImage(obj.dataUrl, "PNG", x, y, imgW, imgH);
      y += imgH + 6;
    } catch (e) {
      console.warn("[DOC] Error insertando imagen sección:", e);
    }
  }

  return y;
}

function drawTechHeader(pdf, opts = {}) {
  const dims = getDocPageDimensions(pdf);
  const w = dims.width;

  const nombreProyecto = opts.nombreProyecto || "Proyecto";
  const logo = opts.logo || null;

  const marginX = 20;
  const textY = 18;

  let logoBottomY = textY;

  if (logo?.dataUrl) {
    const ratio = logo.width / logo.height || 2.5;
    const logoW = 25;
    const logoH = logoW / ratio;
    const logoX = w - marginX - logoW;
    const logoY = textY - 6;

    try {
      pdf.addImage(logo.dataUrl, "PNG", logoX, logoY, logoW, logoH);
      logoBottomY = logoY + logoH;
    } catch (e) {
      console.warn("[DOC] No se pudo dibujar logo en header:", e);
    }
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(55, 65, 81);
  pdf.text(nombreProyecto, marginX, textY);

  const lineY = Math.max(textY + 2, logoBottomY + 2);
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.3);
  pdf.line(marginX, lineY, w - marginX, lineY);

  // Subimos un poco más el margen para que el texto nunca invada el encabezado
  return lineY + 14; // antes: lineY + 8
}

function drawTechFooter(pdf, opts = {}) {
  const dims = getDocPageDimensions(pdf);
  const h = dims.height;

  const idioma = opts.idioma || "es";
  let txt =
    idioma === "en"
      ? "IP video intercom & access control solution – 2N®"
      : idioma === "pt"
      ? "Solução IP de videoporteiro e controlo de acessos – 2N®"
      : "Solución IP de videoportero y control de accesos – 2N®";

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text(txt, 20, h - 10);
}

function setupTechContentPage(pdf, opts = {}) {
  const startY = drawTechHeader(pdf, opts);
  drawTechFooter(pdf, opts);

  // 🔧 RESETEAMOS tipografía NORMAL para el contenido
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(55, 65, 81); // #374151

  return startY;
}

// ---------------- PDF técnico completo ----------------

async function exportarPDFTecnico() {
  const jsPDF = window.jspdf.jsPDF;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const idioma = appState.documentacion.idioma || "es";
  const secciones = appState.documentacion.secciones || {};
  const included = appState.documentacion.includedSections || {};

  const proyecto = appState.proyecto || {};
  const presupuesto =
    typeof window.getPresupuestoActual === "function"
      ? window.getPresupuestoActual()
      : null;

  const nombreProyecto =
    proyecto.nombre ||
    proyecto.nombreProyecto ||
    presupuesto?.nombreProyecto ||
    "Proyecto";

  const promotora =
    proyecto.promotora ||
    proyecto.cliente ||
    presupuesto?.cliente ||
    "";

  const logo = await getDocLogoImage();
  const dims = getDocPageDimensions(doc);
  const pageW = dims.width;
  const pageH = dims.height;

  let titulo = "Memoria de calidades";
  if (idioma === "en") titulo = "Technical specification";
  if (idioma === "pt") titulo = "Memória descritiva";

  // Portada
  try {
    const cover = await loadImageAsDataUrl(DOC_TECH_COVER_URL);
    if (cover?.dataUrl) {
      const ratio = cover.width / cover.height;
      const pageRatio = pageW / pageH;

      let w, h, x, y;

      if (ratio > pageRatio) {
        h = pageH;
        w = h * ratio;
        x = (pageW - w) / 2;
        y = 0;
      } else {
        w = pageW;
        h = w / ratio;
        x = 0;
        y = (pageH - h) / 2;
      }

      doc.addImage(cover.dataUrl, "PNG", x, y, w, h);
    }
  } catch (e) {
    console.warn("[DOC] No se pudo cargar portada técnica:", e);
  }

  const gradHeight = 70;
  const gradStart = pageH - gradHeight;
  for (let i = 0; i < 6; i++) {
    const y = gradStart + (i * gradHeight) / 6;
    const h = gradHeight / 6 + 0.5;
    const shade = 255 - i * 8;
    doc.setFillColor(shade, shade, shade);
    doc.rect(0, y, pageW, h, "F");
  }

  const panelH = 55;
  const panelY = pageH - panelH;

  // Panel blanco inferior
  doc.setFillColor(255, 255, 255);
  doc.rect(0, panelY, pageW, panelH, "F");

  // LOGO 2N – PORTADA TÉCNICA (SOLO UNA VEZ)
  if (logo?.dataUrl) {
    const ratio = logo.width / logo.height || 2.5;
    const lw = 32;
    const lh = lw / ratio;

    const lx = pageW - 20 - lw;
    const ly = panelY + panelH - lh - 8;

    doc.addImage(logo.dataUrl, "PNG", lx, ly, lw, lh);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(0, 0, 0);
  doc.text(titulo, 20, panelY - 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Videoportero y control de accesos 2N", 20, panelY + 7);

  let y = panelY + 18;

  doc.setFont("helvetica", "bold");
  doc.text("Proyecto:", 20, y);
  doc.setFont("helvetica", "normal");

  const linesProyecto = doc.splitTextToSize(nombreProyecto, pageW - 60);
  doc.text(linesProyecto, 45, y);
  y += linesProyecto.length * 6 + 4;

  if (promotora) {
    doc.setFont("helvetica", "bold");
    doc.text("Promotor:", 20, y);
    doc.setFont("helvetica", "normal");
    const linesProm = doc.splitTextToSize(promotora, pageW - 60);
    doc.text(linesProm, 45, y);
    y += linesProm.length * 6 + 4;
  }

  drawTechFooter(doc, { idioma });

  // Índice
  doc.addPage();
  const tocPage = doc.getNumberOfPages();
  const tocStartY = setupTechContentPage(doc, {
    idioma,
    nombreProyecto,
    logo,
  });

  const tocEntries = [];
  const pageHLimit = pageH - 35;

  // Página de Presentación de empresa (si incluida)
  const includePresentacion = included["presentacion_empresa"] !== false;

  if (includePresentacion) {
    doc.addPage();
    let current = doc.getNumberOfPages();
    let y = setupTechContentPage(doc, {
      idioma,
      nombreProyecto,
      logo,
    });

    const baseTitle =
      idioma === "en"
        ? "Company introduction"
        : idioma === "pt"
        ? "Apresentação de empresa"
        : "Presentación de empresa";

    // TÍTULO SECCIÓN: 20
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(30, 64, 175);
    doc.text(baseTitle, 20, y);
    y += 6;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(20, y, pageW - 20, y);
    y += 8;

    const texto = secciones["presentacion_empresa"] || "";

    // TEXTO: 11, fluyendo línea a línea hasta el final de página
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(55, 65, 81);

    const lines = doc.splitTextToSize(texto, pageW - 40);
    const lineH = 5.5;
    const limitY = pageH - 35;

    tocEntries.push({ title: baseTitle, page: current });

    function newPagePresentacion() {
      doc.addPage();
      current = doc.getNumberOfPages();
      y = setupTechContentPage(doc, { idioma, nombreProyecto, logo });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(30, 64, 175);
      doc.text(baseTitle + " (cont.)", 20, y);
      y += 6;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(20, y, pageW - 20, y);
      y += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(55, 65, 81);
    }

    for (let i = 0; i < lines.length; i++) {
      if (y + lineH > limitY) {
        newPagePresentacion();
      }

      const isLastLine = i === lines.length - 1 || !lines[i + 1];

      if (isLastLine) {
        // Última línea: alineación normal (no se fuerza la justificación)
        doc.text(lines[i], 20, y);
      } else {
        // Líneas intermedias: justificación completa
        drawJustifiedLine(doc, lines[i], 20, y, pageW - 40);
      }

      y += lineH;
    }
  }
  // Resto secciones
  doc.addPage();
  let currentPage = doc.getNumberOfPages();
  y = setupTechContentPage(doc, { idioma, nombreProyecto, logo });

  function newPage() {
    doc.addPage();
    currentPage = doc.getNumberOfPages();
    y = setupTechContentPage(doc, { idioma, nombreProyecto, logo });
    return y;
  }

  function ensureSpace(linesCount) {
    const need = linesCount * 5.5 + 14;
    if (y + need > pageHLimit) {
      newPage();
    }
  }

  const sectionKeys = [
    "resumen",
    "sistema",
    "equipos",
    "infraestructura",
    "servicios",
    "normativa_red",
    "normativa_lpd",
    "normativa_ciber",
    "otros",
  ];

  for (const key of sectionKeys) {
    if (included[key] === false) continue;

    const contenido = (secciones[key] || "").trim();
    const imgsIds = appState.documentacion.sectionMedia?.[key] || [];
    if (!contenido && imgsIds.length === 0) continue;

    // Si no cabe ni el título ni unas pocas líneas, pasamos sección a la siguiente página
    const minSpaceForSection = 25; // espacio mínimo después del título
    if (y + minSpaceForSection > pageHLimit) {
      newPage();
    }

    const sectionTitle = getSectionTitle(key);
    const sectionStartPage = currentPage;
    tocEntries.push({ title: sectionTitle, page: sectionStartPage });

    // TÍTULO SECCIÓN: 20
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(30, 64, 175);
    doc.text(sectionTitle, 20, y);
    y += 6;

    // Línea bajo título
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(20, y, pageW - 20, y);
    y += 8;

    // CUERPO: 11, LÍNEA A LÍNEA
    if (contenido) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(55, 65, 81);

      const lines = doc.splitTextToSize(contenido, pageW - 40);
      const lineH = 5.5;

      for (let i = 0; i < lines.length; i++) {
        if (y + lineH > pageHLimit) {
          newPage();
        }

        const isLastLine = i === lines.length - 1 || !lines[i + 1];

        if (isLastLine) {
          doc.text(lines[i], 20, y);
        } else {
          drawJustifiedLine(doc, lines[i], 20, y, pageW - 40);
        }

        y += lineH;
      }

      y += 4;
    }

    // Imágenes asociadas a la sección (con control de saltos de página)
    y = await insertImagesForSection(doc, key, y, newPage);
    y += 4;
  }

  // Anexo fichas técnicas
  const allMedia = appState.documentacion.mediaLibrary || [];
  const selected = appState.documentacion.selectedFichasMediaIds || [];
  const fichas = allMedia.filter((m) => selected.includes(m.id));

  if (fichas.length > 0) {
    doc.addPage();
    currentPage = doc.getNumberOfPages();
    y = setupTechContentPage(doc, { idioma, nombreProyecto, logo });

    let tituloAnexo =
      idioma === "en"
        ? "Appendix – Technical documentation"
        : idioma === "pt"
        ? "Anexo – Documentação técnica"
        : "Anexo – Fichas técnicas adjuntas";

    tocEntries.push({ title: tituloAnexo, page: currentPage });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 64, 175);
    doc.text(tituloAnexo, 20, y);
    y += 6;

    doc.setDrawColor(226, 232, 240);
    doc.line(20, y, pageW - 20, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    for (const m of fichas) {
      const extra = m.folderName ? " – " + m.folderName : "";
      const text =
        "• " + m.nombre + extra + (m.url ? " (" + m.url + ")" : "");

      const lines = doc.splitTextToSize(text, pageW - 40);
      const need = lines.length * 4.8 + 10;
      if (y + need > pageHLimit) {
        newPage();
      }

      doc.text(lines, 20, y);
      y += lines.length * 4.8 + 2;
    }
  }

  // Reescribir índice
  doc.setPage(tocPage);
  let yToc = tocStartY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text("Contenido", 20, yToc);
  yToc += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(55, 65, 81);

  for (const entry of tocEntries) {
    if (yToc > pageH - 35) {
      doc.addPage();
      yToc = setupTechContentPage(doc, {
        idioma,
        nombreProyecto,
        logo,
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Contenido (cont.)", 20, yToc);
      yToc += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(55, 65, 81);
    }

    const label = entry.title;
    const pageStr = String(entry.page);
    const textWidth = doc.getTextWidth(pageStr);

    doc.text(label, 25, yToc);
    doc.text(pageStr, pageW - 25 - textWidth, yToc);

    doc.setDrawColor(230, 230, 230);
    doc.line(25, yToc + 1.5, pageW - 25, yToc + 1.5);

    yToc += 7;
  }

  let base =
    idioma === "en"
      ? "technical_specification"
      : idioma === "pt"
      ? "memoria_descritiva"
      : "memoria_calidades";

  const safe =
    nombreProyecto
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "proyecto";

  doc.save(base + "_" + safe + ".pdf");
}
// ======================================================
// PDF COMERCIAL (títulos 20 / texto 11 en secciones)
// ======================================================

async function exportarPDFComercial() {
  const jsPDF = window.jspdf.jsPDF;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const idioma = appState.documentacion.idioma || "es";
  const secciones = appState.documentacion.secciones || {};
  const included = appState.documentacion.includedSections || {};
  const proyecto = appState.proyecto || {};
  const presupuesto =
    typeof window.getPresupuestoActual === "function"
      ? window.getPresupuestoActual()
      : null;

  const nombreProyecto =
    proyecto.nombre ||
    proyecto.nombreProyecto ||
    presupuesto?.nombreProyecto ||
    "Proyecto";

  const promotora =
    proyecto.promotora ||
    proyecto.cliente ||
    presupuesto?.cliente ||
    "";

  const logo = await getDocLogoImage();
  const dims = getDocPageDimensions(doc);
  const pageW = dims.width;
  const pageH = dims.height;

  const marginX = 20;
  const marginTop = 20;
  const marginBottom = 20;

  // Tarjeta tipo Salesforce (no se corta entre páginas)
  function drawSalesforceCard({
    x,
    y,
    width,
    title,
    body,
    doc,
    maxBodyWidth,
    minHeight,
    marginTop = 20,
    marginBottom = 20,
  }) {
    const paddingX = 8;
    const paddingTop = 8;
    const paddingBottom = 8;

    // 🔹 Ancho efectivo: NUNCA mayor que el ancho interior de la tarjeta
    const innerW = width - paddingX * 2;

    // 🔹 En comercial queremos que el texto ocupe igual en todas las cards
    const bodyW = innerW;

    const raw = (body || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\u2028|\u2029/g, "\n") // 👈 clave: saltos Unicode
      .trim();

    // Mantener párrafos (doble salto), pero "desenrollar" saltos dentro de cada párrafo
    const paragraphs = raw
      .split(/\n\s*\n+/g)
      .map((p) => p.replace(/\n+/g, " ").replace(/[ \t]+/g, " ").trim())
      .filter(Boolean);

    // Generar líneas por párrafo y meter una línea en blanco entre párrafos
    const lines = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const chunk = doc.splitTextToSize(paragraphs[i], bodyW);
      lines.push(...chunk);
      if (i < paragraphs.length - 1) lines.push(""); // separación entre párrafos
    }

    const bodyH = lines.length * 5.0;

    let cardH = paddingTop + 8 + 4 + bodyH + paddingBottom;
    if (minHeight && cardH < minHeight) cardH = minHeight;

    const dimsLocal = getDocPageDimensions(doc);
    const pageHLocal = dimsLocal.height;

    if (y + cardH > pageHLocal - marginBottom) {
      doc.addPage();
      y = marginTop;
    }

    doc.setFillColor(229, 231, 235);
    doc.roundedRect(x + 1.2, y + 1.8, width, cardH, 3, 3, "F");

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(209, 213, 219);
    doc.roundedRect(x, y, width, cardH, 3, 3, "FD");

    // Título
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(31, 41, 55);
    const titleLines = doc.splitTextToSize(title, innerW);
    doc.text(titleLines, x + paddingX, y + paddingTop + 7);

    // Texto del cuerpo
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(75, 85, 99);

    const yBody = y + paddingTop + 7 + titleLines.length * 7 + 3;

    if (lines.length) {
      const xBody = x + paddingX;
      const maxW = bodyW;
      const lh = 5.0;
      let yy = yBody;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] || "";

        // línea en blanco entre párrafos
        if (!line.trim()) {
          yy += lh;
          continue;
        }

        // si la siguiente es "" => esta es última línea de párrafo (NO justificar)
        const next = lines[i + 1] || "";
        const isLastOfParagraph = !next.trim();

       doc.text(line, xBody, yy);


        yy += lh;
      }
    }

    return {
      bottomY: y + cardH,
      height: cardH,
    };
  }

  function collectSectionImagesWithCaptions() {
    const map = appState.documentacion.sectionMedia || {};
    const media = appState.documentacion.mediaLibrary || [];
    const byId = {};
    media.forEach((m) => (byId[m.id] = m));

    const used = new Set();
    const out = [];

    for (const key of Object.keys(map)) {
      for (const id of map[key]) {
        if (used.has(id)) continue;
        const m = byId[id];
        if (!m?.url) continue;

        const mime = (m.mimeType || "").toLowerCase();
        const type = (m.type || "").toLowerCase();
        const url = m.url.toLowerCase();

        const isImg =
          mime.startsWith("image/") ||
          type === "image" ||
          url.endsWith(".png") ||
          url.endsWith(".jpg") ||
          url.endsWith(".jpeg") ||
          url.endsWith(".webp") ||
          url.endsWith(".gif");

        if (!isImg) continue;

        used.add(id);
        out.push({
          media: m,
          caption: (m.nombre || "").replace(/\.[^/.]+$/, ""),
        });
      }
    }

    return out.slice(0, 8);
  }
  // -------- Portada --------
  try {
    const cover = await loadImageAsDataUrl(DOC_TECH_COVER_URL);
    if (cover?.dataUrl) {
      const ratio = cover.width / cover.height;
      const pageRatio = pageW / pageH;

      let w, h, x, y;

      if (ratio > pageRatio) {
        h = pageH;
        w = h * ratio;
        x = (pageW - w) / 2;
        y = 0;
      } else {
        w = pageW;
        h = w / ratio;
        x = 0;
        y = (pageH - h) / 2;
      }

      doc.addImage(cover.dataUrl, "PNG", x, y, w, h);
    }
  } catch (e) {
    console.warn("[DOC] Error portada comercial:", e);
  }

  const gradH = 70;
  const gradStart = pageH - gradH;
  for (let i = 0; i < 6; i++) {
    const y = gradStart + (i * gradH) / 6;
    const h = gradH / 6 + 0.5;
    const shade = 255 - i * 8;
    doc.setFillColor(shade, shade, shade);
    doc.rect(0, y, pageW, h, "F");
  }

  const panelH = 55;
  const panelY = pageH - panelH;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, panelY, pageW, panelH, "F");

  let titulo =
    idioma === "en"
      ? "Highlights – IP access & video intercom solution"
      : idioma === "pt"
      ? "Highlights – solução IP de acessos e videoporteiro"
      : "Highlights – solución de accesos y videoportero IP";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  let linesTitulo = doc.splitTextToSize(titulo, pageW - marginX * 2 - 40);
  let y = panelY + 11;
  doc.text(linesTitulo, marginX, y);

  y += linesTitulo.length * 5 + 1;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  let subtitulo = nombreProyecto;
  if (promotora) subtitulo += " · " + promotora;

  const stLines = doc.splitTextToSize(subtitulo, pageW - marginX * 2 - 40);
  doc.text(stLines, marginX, y);
  y += stLines.length * 4.8 + 2;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);

  let claim =
    idioma === "en"
      ? "Architecture, design and IP technology for a truly premium access experience."
      : idioma === "pt"
      ? "Arquitetura, design e tecnologia IP para uma experiência de acesso verdadeiramente premium."
      : "Arquitectura, diseño y tecnología IP para una experiencia de acceso verdaderamente premium.";

  const claimLines = doc.splitTextToSize(claim, pageW - marginX * 2 - 40);
  doc.text(claimLines, marginX, y);

  if (logo?.dataUrl) {
    const ratio = logo.width / logo.height || 2.5;
    const lw = 32;
    const lh = lw / ratio;

    const lx = pageW - marginX - lw;
    const ly = panelY + panelH - lh - 6;

    try {
      doc.addImage(logo.dataUrl, "PNG", lx, ly, lw, lh);
    } catch (e) {
      console.warn("[DOC] Logo portada comercial:", e);
    }
  }

// Página 2 – Presentación de empresa como ficha Salesforce
  const includePresentacion = included.presentacion_empresa !== false;

  if (includePresentacion) {
    doc.addPage();
    const dims2 = getDocPageDimensions(doc);
    const pw2 = dims2.width;

    let y2 = marginTop;

    const sectionLabel =
      idioma === "en"
        ? "Company introduction"
        : idioma === "pt"
        ? "Apresentação da empresa"
        : "Presentación de empresa";

   // quitamos el encabezado
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(31, 41, 55);
    doc.text(sectionLabel, marginX, y2);

    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.4);
    doc.line(marginX, y2 + 2.5, pw2 - marginX, y2 + 2.5);

   y2 += 10;

    const bodyText = secciones["presentacion_empresa"] || "";

    drawSalesforceCard({
      x: marginX,
      y: y2,
      width: pw2 - marginX * 2,
      title: sectionLabel,
      body: bodyText,
      doc,
      maxBodyWidth: pw2 - marginX * 2 - 16,
      minHeight: 60,
      marginTop,
      marginBottom,
    });
  }

  // Página 3 – Resumen + Sistema
  doc.addPage();

  const dims3 = getDocPageDimensions(doc);
  const pw3 = dims3.width;

  let yCards = marginTop;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);

  let tit2 =
    idioma === "en"
      ? "Project overview"
      : idioma === "pt"
      ? "Visão geral do projeto"
      : "Visión general del proyecto";

  doc.text(tit2, marginX, yCards);
  doc.setDrawColor(209, 213, 219);
  doc.line(marginX, yCards + 2.5, pw3 - marginX, yCards + 2.5);

  yCards += 10;

  const cardWidth = pw3 - marginX * 2;

  const bloques2 = [];

  if (secciones.resumen?.trim() && included.resumen !== false) {
    bloques2.push({
      title:
        idioma === "en"
          ? "Project summary"
          : idioma === "pt"
          ? "Resumo do projeto"
          : "Resumen del proyecto",
      body: secciones.resumen,
    });
  }

  if (secciones.sistema?.trim() && included.sistema !== false) {
    bloques2.push({
      title:
        idioma === "en"
          ? "System architecture"
          : idioma === "pt"
          ? "Arquitetura do sistema"
          : "Sistema de videoportero y accesos",
      body: secciones.sistema,
    });
  }

  for (const b of bloques2) {
    const r = drawSalesforceCard({
      x: marginX,
      y: yCards,
      width: cardWidth,
      title: b.title,
      body: b.body,
      doc,
      maxBodyWidth: cardWidth - 16,
      minHeight: 45,
      marginTop,
      marginBottom,
    });
    yCards = r.bottomY + 8;
  }

  // Página 4 – Servicios / Infraestructura / Otros
  const tieneServicios =
    (secciones.servicios || "").trim().length > 0 &&
    included.servicios !== false;
  const tieneInfra =
    (secciones.infraestructura || "").trim().length > 0 &&
    included.infraestructura !== false;
  const tieneOtros =
    (secciones.otros || "").trim().length > 0 &&
    included.otros !== false;

  if (tieneServicios || tieneInfra || tieneOtros) {
    doc.addPage();
    const dims4 = getDocPageDimensions(doc);
    const pw4 = dims4.width;

    let y4 = marginTop;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(31, 41, 55);

    let tit3 =
      idioma === "en"
        ? "Services, operation & infrastructure"
        : idioma === "pt"
        ? "Serviços, operação e infraestrutura"
        : "Servicios, operación e infraestructura";

    doc.text(tit3, marginX, y4);
    doc.setDrawColor(209, 213, 219);
    doc.line(marginX, y4 + 2.5, pw4 - marginX, y4 + 2.5);

    y4 += 10;

    const bloques3 = [];

    if (tieneServicios) {
      bloques3.push({
        title:
          idioma === "en"
            ? "Cloud services & operation"
            : idioma === "pt"
            ? "Serviços cloud e operação"
            : "Servicios cloud y operación",
        body: secciones.servicios,
      });
    }

    if (tieneInfra) {
      bloques3.push({
        title:
          idioma === "en"
            ? "Infrastructure & IP network"
            : idioma === "pt"
            ? "Infraestrutura e rede IP"
            : "Infraestructura y red IP",
        body: secciones.infraestructura,
      });
    }

    if (tieneOtros) {
      bloques3.push({
        title:
          idioma === "en"
            ? "Additional notes & options"
            : idioma === "pt"
            ? "Notas adicionais e opções"
            : "Otros aspectos y opciones",
        body: secciones.otros,
      });
    }

    for (const b of bloques3) {
      const r = drawSalesforceCard({
        x: marginX,
        y: y4,
        width: pw4 - marginX * 2,
        title: b.title,
        body: b.body,
        doc,
        maxBodyWidth: pw4 - marginX * 2 - 16,
        minHeight: 45,
        marginTop,
        marginBottom,
      });

      y4 = r.bottomY + 8;
    }
  }
  // Página 5 – Galería visual
  const galeria = collectSectionImagesWithCaptions();

  if (galeria.length) {
    doc.addPage();

    const dimsG = getDocPageDimensions(doc);
    const pwG = dimsG.width;
    const phG = dimsG.height;

    let yG = marginTop;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(31, 41, 55);

    let tituloGaleria =
      idioma === "en"
        ? "Visual gallery of the solution"
        : idioma === "pt"
        ? "Galeria visual da solução"
        : "Galería visual de la solución";

    doc.text(tituloGaleria, marginX, yG);
    doc.setDrawColor(209, 213, 219);
    doc.line(marginX, yG + 2.5, pwG - marginX, yG + 2.5);

    yG += 12;

    const maxW = (pwG - marginX * 2 - 10) / 2;
    const maxH = 38;
    const rowH = maxH + 20;

    for (let i = 0; i < galeria.length; i++) {
      const item = galeria[i];
      const m = item.media;
      const caption = item.caption || "";
      const col = i % 2;

      if (i % 2 === 0 && i !== 0) yG += rowH;

      if (yG + rowH > phG - marginBottom) {
        doc.addPage();
        yG = marginTop;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(31, 41, 55);
        doc.text(tituloGaleria, marginX, yG);

        doc.setDrawColor(209, 213, 219);
        doc.line(marginX, yG + 2.5, pwG - marginX, yG + 2.5);

        yG += 12;
      }

      try {
        const imgObj = await loadImageAsDataUrl(m.url);

        const ratio = imgObj.width / imgObj.height || 1.5;
        let w = maxW;
        let h = w / ratio;

        if (h > maxH) {
          h = maxH;
          w = h * ratio;
        }

        const xImg = marginX + col * (maxW + 10) + (maxW - w) / 2;

        doc.addImage(imgObj.dataUrl, "PNG", xImg, yG, w, h);

        const captionLines = doc.splitTextToSize(caption, maxW);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(75, 85, 99);

        doc.text(captionLines, xImg + w / 2, yG + h + 5, { align: "center" });
      } catch (e) {
        console.warn("[DOC] Error imagen galería:", e);
      }
    }

    if (logo?.dataUrl) {
      const r = logo.width / logo.height || 2.5;
      const lw = 24;
      const lh = lw / r;

      const lx = pwG - marginX - lw;
      const ly = phG - marginBottom - lh + 4;

      try {
        doc.addImage(logo.dataUrl, "PNG", lx, ly, lw, lh);
      } catch (e) {
        console.warn("[DOC] Logo galería:", e);
      }
    }
  }

  let baseCom =
    idioma === "en"
      ? "highlights_access_solution"
      : idioma === "pt"
      ? "highlights_acessos"
      : "highlights_accesos";

  const safeCom =
    nombreProyecto
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "proyecto";

  doc.save(baseCom + "_" + safeCom + ".pdf");
}

// ======================================================
// EXPORTAR PDF SEGÚN MODO
// ======================================================

async function exportarDocumentacionPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("jsPDF no está cargado.");
    return;
  }

  const modo = appState.documentacion.modo || "comercial";

  if (modo === "tecnica") {
    await exportarPDFTecnico();
  } else {
    await exportarPDFComercial();
  }
}

// ======================================================
// HANDLERS DE UI
// ======================================================

function attachDocSectionHandlers(container) {
  container.querySelectorAll(".doc-section-title-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const key = inp.getAttribute("data-doc-section-title");
      if (!key) return;

      appState.documentacion.sectionTitles =
        appState.documentacion.sectionTitles || {};
      appState.documentacion.sectionTitles[key] = inp.value || "";

      saveDocStateToLocalStorage();
    });
  });

  container.querySelectorAll(".doc-section-textarea").forEach((txt) => {
    txt.addEventListener("input", () => {
      const key = txt.getAttribute("data-doc-section-text");
      if (!key) return;

      appState.documentacion.secciones = appState.documentacion.secciones || {};
      appState.documentacion.secciones[key] = txt.value;

      saveDocStateToLocalStorage();
    });
  });

  container.querySelectorAll("[data-doc-section-enable]").forEach((chk) => {
    chk.addEventListener("change", () => {
      const key = chk.getAttribute("data-doc-section-enable");
      if (!key) return;

      appState.documentacion.includedSections =
        appState.documentacion.includedSections || {};

      appState.documentacion.includedSections[key] = chk.checked;

      saveDocStateToLocalStorage();
    });
  });

  container.querySelectorAll("[data-doc-ai-section]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.getAttribute("data-doc-ai-section");
      if (!key) return;

      const nuevo = await askAIForSection(key);

      appState.documentacion.secciones[key] = nuevo;
      saveDocStateToLocalStorage();
      renderDocumentacionView();
    });
  });

  container.querySelectorAll("[data-doc-section-drop]").forEach((zone) => {
    zone.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      zone.classList.add("is-drag-over");
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
    });

    zone.addEventListener("dragleave", () =>
      zone.classList.remove("is-drag-over")
    );

    zone.addEventListener("drop", (ev) => {
      ev.preventDefault();
      zone.classList.remove("is-drag-over");

      const mediaId = ev.dataTransfer?.getData("text/plain");
      const sectionKey = zone.getAttribute("data-doc-section-drop");

      if (!mediaId || !sectionKey) return;

      attachMediaToSection(sectionKey, mediaId);
    });
  });
}

function attachDocSearchHandlers(container) {
  const inputImg = container.querySelector("#docMediaSearchInput");
  if (inputImg) {
    inputImg.addEventListener("input", () => {
      appState.documentacion.mediaSearchTerm = inputImg.value || "";
      saveDocStateToLocalStorage();
      refreshDocMediaGridOnly();
    });
  }

  const inputFich = container.querySelector("#docFichasSearchInput");
  if (inputFich) {
    inputFich.addEventListener("input", () => {
      appState.documentacion.fichasSearchTerm = inputFich.value || "";
      saveDocStateToLocalStorage();
      refreshDocFichasOnly();
    });
  }
}
// ======================================================
// CARGA MEDIA (una sola vez por entrada en la vista)
// ======================================================

function waitForAuthUserOnce(auth, timeoutMs = 8000) {
  return new Promise((resolve) => {
    try {
      if (!auth || auth.currentUser) return resolve(auth?.currentUser || null);

      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(auth.currentUser || null);
      }, timeoutMs);

      const unsub = auth.onAuthStateChanged((u) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          unsub && unsub();
        } catch (_) {}
        resolve(u || null);
      });
    } catch (_) {
      resolve(auth?.currentUser || null);
    }
  });
}

function waitForFirestoreReady(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const start = Date.now();

    (function tick() {
      const db =
        window.db ||
        (window.firebase?.firestore ? window.firebase.firestore() : null);

      if (db) return resolve(db);

      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 120);
    })();
  });
}

function waitForAuthReady(timeoutMs = 2500) {
  const auth =
    window.auth || (window.firebase?.auth ? window.firebase.auth() : null);

  if (!auth) return Promise.resolve(null);
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(auth.currentUser || null);
    }, timeoutMs);

    const unsub = auth.onAuthStateChanged((user) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        unsub && unsub();
      } catch (_) {}
      resolve(user || null);
    });
  });
}

let __docMediaLoadPromise = null;
let __docMediaLastAttempt = 0;

function ensureDocMediaLoadedOnce() {
  const d = appState.documentacion;

  const mediaLen = Array.isArray(d.mediaLibrary) ? d.mediaLibrary.length : 0;

  // ✅ Solo consideramos “loaded” si hay contenido (o sea, no bloqueamos recarga si está vacío)
  if (d.mediaLoaded && mediaLen > 0) return Promise.resolve(true);

  if (__docMediaLoadPromise) return __docMediaLoadPromise;

  const now = Date.now();
  if (now - __docMediaLastAttempt < 1200) return Promise.resolve(false);
  __docMediaLastAttempt = now;

  __docMediaLoadPromise = Promise.resolve()
    .then(() => waitForFirestoreReady(4000))
    .then((db) => {
      if (!db) return false;
      return waitForAuthReady(2500).then(() => true);
    })
    .then((ok) => {
      if (!ok) return false;
      return ensureDocMediaLoaded().then(() => !!appState.documentacion.mediaLoaded);
    })
    .catch((e) => {
      console.error("[DOC] Error en carga inicial de media:", e);
      return false;
    })
    .finally(() => {
      __docMediaLoadPromise = null;
    });

  return __docMediaLoadPromise;
}


// ======================================================
// RENDER PRINCIPAL
// ======================================================

function renderDocumentacionView() {
  const container = getDocAppContent();
  if (!container) return;

  const d = appState.documentacion;




  // 🔥 Cargar media si NO está cargada O si está vacía (evita depender de haber pasado por Gestión)
const mediaLen = Array.isArray(d.mediaLibrary) ? d.mediaLibrary.length : 0;

if (!d.mediaLoaded || mediaLen === 0) {
  ensureDocMediaLoadedOnce().then((ok) => {
    if (ok && typeof window.renderDocumentacionView === "function") {
      window.renderDocumentacionView();
    }
  });
}





  const idioma = d.idioma || "es";

  const langButtons = Object.values(DOC_LANGS)
    .map((l) => {
      const active = idioma === l.code ? "btn-primary" : "btn-light";
      return `
        <button class="btn btn-xs ${active}"
          data-doc-lang="${l.code}">
          ${l.label}
        </button>
      `;
    })
    .join("");

  const modo = d.modo || "comercial";
  const modoComActive = modo === "comercial" ? "btn-primary" : "btn-light";
  const modoTecActive = modo === "tecnica" ? "btn-primary" : "btn-light";

  container.innerHTML = `
    <div class="doc-layout">
      <div class="doc-header-bar card">
        <div style="display:flex;gap:16px;align-items:flex-start;justify-content:space-between;">
          <div class="doc-header-left">
            <div class="doc-title">Documentación del proyecto</div>
            <div class="doc-subtitle">
              Genera la memoria de calidades y la documentación técnica/comercial del proyecto.
            </div>
          </div>

          <div class="doc-header-right" style="display:flex;flex-direction:row;gap:12px;align-items:flex-start;flex-wrap:wrap;justify-content:flex-end;">
            <div class="doc-header-row">
              <span class="doc-header-label">Idioma:</span>
              <div class="btn-group btn-group-xs">
                ${langButtons}
              </div>
            </div>
            <div class="doc-header-row">
              <span class="doc-header-label">Modo:</span>
              <div class="btn-group btn-group-xs">
                <button id="docModoComercialBtn" class="btn btn-xs ${modoComActive}">
                  Comercial
                </button>
                <button id="docModoTecnicoBtn" class="btn btn-xs ${modoTecActive}">
                  Técnico
                </button>
              </div>
            </div>
            <div class="doc-header-row">
              <button id="docRegenerarBtn" class="btn btn-xs btn-outline">
                🔁 Regenerar secciones
              </button>
              <button id="docNuevoBloqueBtn" class="btn btn-xs btn-outline">
                ➕ Añadir bloque
              </button>
              <button id="docExportarBtn" class="btn btn-xs btn-primary">
                📄 Exportar PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="doc-main-grid"
           style="display:flex;align-items:flex-start;gap:16px;">
        <!-- Columna izquierda: secciones -->
        <div class="doc-main-center"
             style="flex:1 1 auto;min-width:0;">
          ${renderDocSectionsHTML()}
        </div>

        <!-- Barra derecha: documentación gráfica + fichas técnicas -->
        <div class="doc-main-right"
             style="max-width:320px;flex:0 0 300px;">
          <div class="card mb-3">
            <div class="card-body doc-media-body">
              <div class="doc-fichas-section">
                <div class="doc-fichas-block">
                  <div class="doc-fichas-title">Documentación gráfica</div>
                  <p class="doc-fichas-help">
                    Arrastra las imágenes que quieras usar en cada sección del documento.
                  </p>

                  <div class="form-group mb-2">
                    <input
                      type="text"
                      id="docMediaSearchInput"
                      class="form-control form-control-sm"
                      placeholder="Buscar imágenes..."
                      value="${docEscapeHtml(d.mediaSearchTerm || "")}"
                    >
                  </div>

                 <div id="docMediaListWrap">
  ${renderDocMediaLibraryHTML()}
</div>

                </div>
              </div>
            </div>
          </div>

         <div class="card">
  <div class="card-body">
    <div id="docFichasPanel">
      ${renderDocFichasHTML()}
    </div>
  </div>
</div>

        </div>
      </div>
    </div>

    <!-- Modal bloques custom -->
    <div id="docModalBackdrop" class="doc-modal-backdrop hidden"></div>
    <div id="docCustomModal" class="doc-modal hidden">
      <div class="doc-modal-content">
        <div class="doc-modal-header">
          <div class="doc-modal-title">Añadir bloque de texto</div>
          <button id="docCustomCancelBtn" class="btn btn-xs btn-light">
            ✕
          </button>
        </div>
        <div class="doc-modal-body">
          <div class="form-group">
            <label for="docCustomSectionSelect">Sección destino</label>
            <select id="docCustomSectionSelect" class="form-control">
              ${DOC_SECTION_ORDER.map(
                (k) =>
                  `<option value="${k}">${docEscapeHtml(
                    labelForSection(k)
                  )}</option>`
              ).join("")}
            </select>
          </div>
          <div class="form-group">
            <label for="docCustomText">Texto a añadir</label>
            <textarea id="docCustomText"
              class="form-control"
              rows="6"
              placeholder="Escribe aquí el texto adicional..."></textarea>
          </div>
        </div>
        <div class="doc-modal-footer">
          <button id="docCustomSaveBtn" class="btn btn-primary btn-sm">
            Guardar bloque
          </button>
        </div>
      </div>
    </div>
  `;
  // HANDLERS
  attachDocSearchHandlers(container);
  attachDocSectionHandlers(container);
  attachDocMediaGridHandlers(container);

  const regenBtn = container.querySelector("#docRegenerarBtn");
  if (regenBtn) {
    regenBtn.addEventListener("click", () => {
      autoGenerateDocumentacion(appState.documentacion.idioma || "es");
      renderDocumentacionView();
    });
  }

  container.querySelectorAll("[data-doc-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.getAttribute("data-doc-lang");
      autoGenerateDocumentacion(lang);
      renderDocumentacionView();
    });
  });

  // ======================================================
  // ✅ PERMISOS DOCUMENTACIÓN (CAMBIOS MÍNIMOS)
  // Reglas:
  // - Modo técnico SOLO si caps.pages.documentacion === "technical"
  // - Export técnico SOLO si caps.documentacion.exportTecnico === true
  // ======================================================

function getCurrentCapsSafe() {
  return appState?.user?.capabilities || null;
}

  const caps = getCurrentCapsSafe();
  const canTechMode = caps?.pages?.documentacion === "technical";
  const canExportTech = caps?.documentacion?.exportTecnico === true;

  // Forzar modo comercial si no hay permiso técnico
  if (!canTechMode && appState.documentacion.modo === "tecnica") {
    appState.documentacion.modo = "comercial";
    saveDocStateToLocalStorage();
  }

  const modoComBtn = container.querySelector("#docModoComercialBtn");
  const modoTecBtn = container.querySelector("#docModoTecnicoBtn");

  if (modoComBtn) {
    modoComBtn.addEventListener("click", () => {
      appState.documentacion.modo = "comercial";
      saveDocStateToLocalStorage();
      renderDocumentacionView();
    });
  }

  if (modoTecBtn) {
    if (!canTechMode) {
      // ❌ oculto si NO puede técnico
      modoTecBtn.style.display = "none";
    } else {
      modoTecBtn.addEventListener("click", () => {
        appState.documentacion.modo = "tecnica";
        saveDocStateToLocalStorage();
        renderDocumentacionView();
      });
    }
  }

  const nuevoBloqueBtn = container.querySelector("#docNuevoBloqueBtn");
  if (nuevoBloqueBtn) {
    nuevoBloqueBtn.addEventListener("click", openDocCustomModal);
  }

  const exportBtn = container.querySelector("#docExportarBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      // Bloqueo duro del export técnico si no hay permiso
      const modoNow = appState.documentacion.modo || "comercial";
      if (modoNow === "tecnica" && !canExportTech) {
        alert("No tienes permisos para exportar la memoria técnica.");
        return;
      }

      // Si no puede modo técnico, nunca exportar técnico aunque el estado venga sucio
      if (modoNow === "tecnica" && !canTechMode) {
        alert("No tienes permisos para usar el modo técnico.");
        appState.documentacion.modo = "comercial";
        saveDocStateToLocalStorage();
        renderDocumentacionView();
        return;
      }

      exportarDocumentacionPDF().catch((err) =>
        console.error("[DOC] Error exportando PDF:", err)
      );
    });
  }

  const modal = document.getElementById("docCustomModal");
  const cancelBtn = modal && modal.querySelector("#docCustomCancelBtn");
  const saveBtn = modal && modal.querySelector("#docCustomSaveBtn");
  const backdrop = document.getElementById("docModalBackdrop");

  if (cancelBtn) cancelBtn.addEventListener("click", closeDocCustomModal);
  if (saveBtn) saveBtn.addEventListener("click", saveDocCustomBlock);
  if (backdrop) backdrop.addEventListener("click", closeDocCustomModal);
}

// ======================================================
// ✅ EXTRA SAFETY: export técnico imposible sin permiso
// (cambio mínimo: wrapper de seguridad)
// ======================================================

(function wrapExportDocPDFWithCapsGuard() {
  const _orig = exportarDocumentacionPDF;

  exportarDocumentacionPDF = async function () {
   const caps = appState?.user?.capabilities || null;


    const canTechMode = caps?.pages?.documentacion === "technical";
    const canExportTech = caps?.documentacion?.exportTecnico === true;

    const modo = appState.documentacion.modo || "comercial";

    if (modo === "tecnica" && !canTechMode) {
      alert("No tienes permisos para usar el modo técnico.");
      appState.documentacion.modo = "comercial";
      saveDocStateToLocalStorage();
      return;
    }

    if (modo === "tecnica" && !canExportTech) {
      alert("No tienes permisos para exportar la memoria técnica.");
      return;
    }

    return _orig();
  };
})();

// ======================================================
// EXPONER FUNCIONES PÚBLICAS
// ======================================================

window.renderDocumentacionView = renderDocumentacionView;
window.ensureDocMediaLoaded = ensureDocMediaLoaded;
window.saveMediaFileToStorageAndFirestore = saveMediaFileToStorageAndFirestore;
window.deleteMediaById = deleteMediaById;
