// js/ui_admin_users.js
// Vista: Configuración de usuarios (solo superadmin)
// Firestore: users/{uid} + invites/{inviteId}

(function () {
  window.appState = window.appState || {};

  const ROLES = [
    "ACCOUNT_MANAGER",
    "PRESCRIPTOR",
    "SUPER_PRESCRIPTOR",
    "DOC_MANAGER",
    "SUPER_ADMIN",
  ];

  // ✅ SUPERADMIN “fijo” (solo esta cuenta queda protegida)
  const SUPERADMIN_EMAIL = "gastonortigosa@gmail.com";

  function normalizeRole(r) {
    return String(r || "").trim().toUpperCase();
  }

  function normalizeEmail(e) {
    return String(e || "").trim().toLowerCase();
  }

  function isProtectedSuperAdminUser(u) {
    const email = normalizeEmail(u?.email || "");
    return email && email === normalizeEmail(SUPERADMIN_EMAIL);
  }

  // ==========================
  // Capabilities DUAL (legacy + v2)
  // ==========================
  function buildCapabilitiesForRoleDual(role) {
    const r = normalizeRole(role);

    // Legacy
    const legacy = {
      views: {
        proyecto: false,
        presupuesto: false,
        simulador: false,
        tarifa: false,
        tarifas: false,
        documentacion: false,
        prescripcion: false,
        diagramas: false, // ✅ NUEVO
        docGestion: false,
        usuarios: false,
      },
      features: {
        tarifasWrite: false,
        docExportTecnico: false,
        docModo: "none",
        prescTemplatesWrite: false,
        prescExtraRefsWrite: false,
      },
    };

    // v2 pactado
    const v2 = {
      pages: {
        proyecto: false,
        presupuesto: false,
        simulador: false,
        tarifa: false, // ✅ por defecto OFF (se activa por usuario desde permisos)
        tarifas: "none",
        documentacion: "none",
        prescripcion: "none",
        diagramas: false, // ✅ NUEVO
        docGestion: false,
        usuarios: false,
      },
      documentacion: {
        exportTecnico: false,
      },
      prescripcion: {
        templates: "readOnly",
        extraRefs: "readOnly",
      },
    };

    function allowView(k) {
      legacy.views[k] = true;
      if (k === "tarifas") v2.pages.tarifas = "view";
      else if (k === "documentacion") v2.pages.documentacion = "commercial";
      else if (k === "prescripcion") v2.pages.prescripcion = "view";
      else if (k === "docGestion") v2.pages.docGestion = true;
      else if (k === "usuarios") v2.pages.usuarios = true;
      else v2.pages[k] = true; // incluye diagramas si se activa por rol
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
      v2.pages.prescripcion = "view";
      v2.prescripcion.templates = "full";
      v2.prescripcion.extraRefs = "full";

      // SUPER_ADMIN sí ve tarifa siempre
      v2.pages.tarifa = true;
      legacy.views.tarifa = true;

      // ✅ SUPER_ADMIN ve diagramas
      v2.pages.diagramas = true;
      legacy.views.diagramas = true;

      return { ...legacy, ...v2 };
    }

    if (r === "ACCOUNT_MANAGER") {
      allowView("proyecto");
      allowView("presupuesto");
      allowView("simulador");
      allowView("tarifas");
      allowView("documentacion");
      allowView("docGestion");

      legacy.features.tarifasWrite = false;
      legacy.features.docExportTecnico = false;
      legacy.features.docModo = "commercial";

      v2.pages.documentacion = "commercial";
      v2.documentacion.exportTecnico = false;
      v2.pages.prescripcion = "none";
      v2.prescripcion.templates = "readOnly";
      v2.prescripcion.extraRefs = "readOnly";

      // ✅ tarifa OFF por defecto
      v2.pages.tarifa = false;
      legacy.views.tarifa = false;

      // ✅ diagramas OFF por defecto
      v2.pages.diagramas = false;
      legacy.views.diagramas = false;

      return { ...legacy, ...v2 };
    }

    if (r === "PRESCRIPTOR") {
      allowView("proyecto");
      allowView("presupuesto");
      allowView("simulador");
      allowView("tarifas");
      allowView("documentacion");
      allowView("docGestion");

      legacy.features.tarifasWrite = false;
      legacy.features.docExportTecnico = true;
      legacy.features.docModo = "technical";
      legacy.features.prescTemplatesWrite = true;
      legacy.features.prescExtraRefsWrite = true;

      v2.pages.documentacion = "technical";
      v2.documentacion.exportTecnico = true;
      v2.pages.prescripcion = "none";
      v2.prescripcion.templates = "full";
      v2.prescripcion.extraRefs = "full";

      // ✅ tarifa OFF por defecto
      v2.pages.tarifa = false;
      legacy.views.tarifa = false;

      // ✅ diagramas OFF por defecto
      v2.pages.diagramas = false;
      legacy.views.diagramas = false;

      return { ...legacy, ...v2 };
    }

    if (r === "SUPER_PRESCRIPTOR") {
      allowView("proyecto");
      allowView("presupuesto");
      allowView("simulador");
      allowView("tarifas");
      allowView("documentacion");
      allowView("prescripcion");
      allowView("docGestion");

      legacy.features.tarifasWrite = false;
      legacy.features.docExportTecnico = true;
      legacy.features.docModo = "technical";
      legacy.features.prescTemplatesWrite = false;
      legacy.features.prescExtraRefsWrite = false;

      v2.pages.documentacion = "technical";
      v2.documentacion.exportTecnico = true;
      v2.pages.prescripcion = "view";
      v2.prescripcion.templates = "readOnly";
      v2.prescripcion.extraRefs = "readOnly";

      // ✅ tarifa OFF por defecto
      v2.pages.tarifa = false;
      legacy.views.tarifa = false;

      // ✅ diagramas OFF por defecto
      v2.pages.diagramas = false;
      legacy.views.diagramas = false;

      return { ...legacy, ...v2 };
    }

    if (r === "DOC_MANAGER") {
      allowView("documentacion");
      allowView("docGestion");

      legacy.features.docModo = "technical";
      legacy.features.docExportTecnico = false;

      v2.pages.documentacion = "technical";
      v2.documentacion.exportTecnico = false;
      v2.pages.prescripcion = "none";
      v2.prescripcion.templates = "readOnly";
      v2.prescripcion.extraRefs = "readOnly";

      // ✅ tarifa OFF por defecto
      v2.pages.tarifa = false;
      legacy.views.tarifa = false;

      // ✅ diagramas OFF por defecto
      v2.pages.diagramas = false;
      legacy.views.diagramas = false;

      return { ...legacy, ...v2 };
    }

    return { ...legacy, ...v2 };
  }

  function normalizeCapabilitiesDual(caps, role) {
    const base = buildCapabilitiesForRoleDual(role);
    const out = { ...(caps || {}) };

    if (!out.views) out.views = base.views;
    if (!out.features) out.features = base.features;

    if (!out.pages) out.pages = base.pages;
    if (!out.documentacion) out.documentacion = base.documentacion;
    if (!out.prescripcion) out.prescripcion = base.prescripcion;

    // ✅ completar claves nuevas aunque ya existan
    out.views = { ...(base.views || {}), ...(out.views || {}) };
    out.features = { ...(base.features || {}), ...(out.features || {}) };
    out.pages = { ...(base.pages || {}), ...(out.pages || {}) };
    out.documentacion = { ...(base.documentacion || {}), ...(out.documentacion || {}) };
    out.prescripcion = { ...(base.prescripcion || {}), ...(out.prescripcion || {}) };

    return out;
  }

  function syncLegacyFromV2(caps) {
    const out = { ...(caps || {}) };

    out.views = out.views || {};
    out.features = out.features || {};

    const pages = out.pages || {};
    const doc = out.documentacion || {};
    const presc = out.prescripcion || {};

    Object.keys(pages).forEach((k) => {
      const val = pages[k];
      if (typeof val === "boolean") out.views[k] = val;
      else if (typeof val === "string") out.views[k] = val !== "none";
      else out.views[k] = !!val;
    });

    if (pages.tarifas !== undefined) out.views.tarifas = pages.tarifas !== "none";

    if (pages.documentacion) {
      out.views.documentacion = pages.documentacion !== "none";
      out.features.docModo = pages.documentacion;
    }

    if (pages.prescripcion) out.views.prescripcion = pages.prescripcion !== "none";

    out.features.docExportTecnico = !!doc.exportTecnico;

    out.features.prescTemplatesWrite = presc.templates === "full";
    out.features.prescExtraRefsWrite = presc.extraRefs === "full";

    return out;
  }

  function isSuperAdmin() {
    const role = normalizeRole(appState?.user?.role);
    return role === "SUPER_ADMIN";
  }

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(ts) {
    try {
      if (!ts) return "";
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString();
    } catch (_) {
      return "";
    }
  }

  // ==========================
  // ✅ estado local para filtro (sin lecturas extra)
  // ==========================
  let _usersCache = [];
  let _usersSearch = "";

  function _norm(s) {
    return String(s || "").trim().toLowerCase();
  }

  function _applyUsersFilter(users) {
    const t = _norm(_usersSearch);
    if (!t) return users;

    return (users || []).filter((u) => {
      const email = _norm(u.email);
      const alias = _norm(u.alias || u.aliasLower);
      return email.includes(t) || alias.includes(t);
    });
  }

  async function loadUsersAndInvitesOnce() {
    const [usersSnap, invitesSnap] = await Promise.all([
      db.collection("users").orderBy("updatedAt", "desc").limit(50).get(),
      db.collection("invites").orderBy("createdAt", "desc").limit(50).get(),
    ]);

    const users = [];
    usersSnap.forEach((doc) => users.push({ id: doc.id, ...(doc.data() || {}) }));

    const invites = [];
    invitesSnap.forEach((doc) => invites.push({ id: doc.id, ...(doc.data() || {}) }));

    return { users, invites };
  }

  // ==========================
  // ✅ guardar alias/apodo
  // ==========================
  async function setUserAlias(uid, alias) {
    const a = String(alias || "").trim();
    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          alias: a || null,
          aliasLower: a ? a.toLowerCase() : null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  // ==========================
  // ✅ borrar usuario (Cloud Function)
  // ==========================
  async function deleteUser(uid) {
    if (!firebase?.functions) {
      throw new Error("Firebase Functions no está disponible en el cliente.");
    }
    const fn =
      (window.functions && typeof window.functions.httpsCallable === "function"
        ? window.functions
        : firebase.functions());
    const call = fn.httpsCallable("adminDeleteUser");
    const resp = await call({ uid });
    return resp?.data || null;
  }

  // ==========================
  // ✅ createInvite via Cloud Function (Callable)
  // ==========================
  async function createInvite({ email, role }) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanRole = normalizeRole(role) || "ACCOUNT_MANAGER";

    if (!firebase?.functions) {
      throw new Error("Firebase Functions no está disponible en el cliente.");
    }

    const fn =
      (window.functions && typeof window.functions.httpsCallable === "function"
        ? window.functions
        : firebase.functions());

    const call = fn.httpsCallable("adminCreateInvite");

    const resp = await call({
      email: cleanEmail,
      role: cleanRole,
    });

    return resp?.data || null;
  }

  async function updateUserRole(uid, role) {
    const cleanRole = normalizeRole(role);
    const capabilities = buildCapabilitiesForRoleDual(cleanRole);

    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          role: cleanRole,
          capabilities,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  async function updateUserCapabilities(uid, role, partialCapsV2) {
    const base = normalizeCapabilitiesDual({}, role);
    const merged = {
      ...base,
      ...(partialCapsV2 || {}),
      pages: { ...(base.pages || {}), ...((partialCapsV2 && partialCapsV2.pages) || {}) },
      documentacion: {
        ...(base.documentacion || {}),
        ...((partialCapsV2 && partialCapsV2.documentacion) || {}),
      },
      prescripcion: {
        ...(base.prescripcion || {}),
        ...((partialCapsV2 && partialCapsV2.prescripcion) || {}),
      },
    };

    const synced = syncLegacyFromV2(merged);

    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          capabilities: synced,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return synced;
  }

  async function setUserActive(uid, active) {
    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          active: !!active,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  async function deleteInvite(inviteId) {
    await db.collection("invites").doc(inviteId).delete();
  }

  function safeGetUserCapsV2(u) {
    const role = normalizeRole(u.role);
    return normalizeCapabilitiesDual(u.capabilities || {}, role);
  }

  // ✅ aplicar cambios en vivo si editas tu propio usuario
  function applyLivePermissionsIfSelf(uid, { role, capabilities } = {}) {
    try {
      if (!uid || !appState?.user?.uid) return;
      if (String(uid) !== String(appState.user.uid)) return;

      if (role) appState.user.role = normalizeRole(role);
      if (capabilities) appState.user.capabilities = capabilities;

      if (typeof window.applyShellPermissions === "function" && appState.user.capabilities) {
        window.applyShellPermissions(appState.user.capabilities);
      }

      if (typeof window.setCurrentView === "function") {
        const current = appState.currentView || "proyecto";
        window.setCurrentView(current);
      }
    } catch (e) {
      console.warn("applyLivePermissionsIfSelf error:", e);
    }
  }

  async function refresh() {
    const status = el("adminUsersStatus");
    const usersWrap = el("adminUsersList");
    const invitesWrap = el("adminInvitesList");

    if (status) status.textContent = "Cargando…";

    try {
      const { users, invites } = await loadUsersAndInvitesOnce();
      _usersCache = users || [];

      if (invitesWrap) {
        invitesWrap.innerHTML =
          invites.length === 0
            ? `<div style="color:#6b7280; font-size:0.9rem;">Sin invitaciones.</div>`
            : invites
                .map((inv) => {
                  const exp = inv.expiresAt ? formatDate(inv.expiresAt) : "";
                  return `
                  <div class="card" style="margin-top:10px;">
                    <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
                      <div>
                        <div style="font-weight:700;">${escapeHtml(inv.email || "")}</div>
                        <div style="font-size:0.85rem; color:#6b7280;">
                          Rol: <b>${escapeHtml(inv.role || "")}</b> · Estado: <b>${escapeHtml(inv.status || "")}</b>
                        </div>
                        <div style="font-size:0.85rem; color:#6b7280;">Caduca: ${escapeHtml(exp)}</div>
                      </div>
                      <div style="display:flex; gap:8px;">
                        <button class="btn btn-secondary btn-sm" data-action="deleteInvite" data-id="${escapeHtml(
                          inv.id
                        )}">Borrar</button>
                      </div>
                    </div>
                  </div>
                `;
                })
                .join("");
      }

      const filteredUsers = _applyUsersFilter(users);

      if (usersWrap) {
        usersWrap.innerHTML =
          filteredUsers.length === 0
            ? `<div style="color:#6b7280; font-size:0.9rem;">Sin usuarios.</div>`
            : filteredUsers
                .map((u) => {
                  const uid = u.id;
                  const email = u.email || "";
                  const role = normalizeRole(u.role) || "";
                  const active = u.active !== false;

                  const isProtected = isProtectedSuperAdminUser(u);

                  const roleOptions = ROLES.map(
                    (r) =>
                      `<option value="${r}" ${r === role ? "selected" : ""}>${r}</option>`
                  ).join("");

                  const caps = safeGetUserCapsV2(u);
                  const p = caps.pages || {};

                  const aliasVal = u.alias || "";

                  // ✅ valores actuales -> checkboxes
                  const tarifa2NOn = !!p.tarifa;
                  const diagramasOn = !!p.diagramas;
                  const docGestionOn = !!p.docGestion;

                  const docMode = p.documentacion || "none";
                  const docCommercialOn = docMode === "commercial";
                  const docTechnicalOn = docMode === "technical";

                  const tarifasOn = (p.tarifas || "none") === "view";

                  const prescOn = (p.prescripcion || "none") === "view";
                  const prescTplFull = (caps.prescripcion?.templates || "readOnly") === "full";
                  const prescExtraFull = (caps.prescripcion?.extraRefs || "readOnly") === "full";

                  const exportTec = !!caps.documentacion?.exportTecnico;

                  return `
                  <div class="card" style="margin-top:10px;">
                    <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
                      <div>
                        <div style="font-weight:700;">${escapeHtml(email)}</div>
                        <div style="font-size:0.85rem; color:#6b7280;">UID: ${escapeHtml(uid)}</div>

                        <div style="margin-top:8px;">
                          <label style="font-size:0.85rem; color:#6b7280;">Alias / apodo</label>
                          <input
                            data-alias-input="${escapeHtml(uid)}"
                            type="text"
                            placeholder="Ej: Juan (Obra X)"
                            value="${escapeHtml(aliasVal)}"
                            style="max-width:260px;"
                          />
                        </div>

                        <div style="font-size:0.85rem; color:#6b7280; margin-top:6px;">
                          Activo: <b style="color:${active ? "#16a34a" : "#ef4444"};">${
                    active ? "Sí" : "No"
                  }</b>
                        </div>

                        ${
                          isProtected
                            ? `<div style="margin-top:6px; font-size:0.82rem; color:#6b7280;">
                                 Nota: cuenta SUPER_ADMIN protegida (no editable).
                               </div>`
                            : ``
                        }
                      </div>

                      <div style="min-width:320px; display:flex; flex-direction:column; gap:10px;">
                        <div style="display:flex; gap:8px; align-items:center;">
                          <label style="font-size:0.85rem; color:#6b7280; min-width:44px;">Rol</label>
                          <select class="form-control" data-role-select="${escapeHtml(uid)}" ${
                    isProtected ? "disabled" : ""
                  }>
                            ${roleOptions}
                          </select>
                          <button class="btn btn-primary btn-sm" data-action="saveRole" data-id="${escapeHtml(
                            uid
                          )}" ${isProtected ? "disabled" : ""}>Guardar</button>
                        </div>

                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                          <button class="btn btn-secondary btn-sm" data-action="toggleActive" data-id="${escapeHtml(
                            uid
                          )}" data-active="${active ? "1" : "0"}" ${isProtected ? "disabled" : ""}>
                            ${active ? "Desactivar" : "Activar"}
                          </button>

                          <button class="btn btn-secondary btn-sm" data-action="togglePerms" data-id="${escapeHtml(
                            uid
                          )}" ${isProtected ? "disabled" : ""}>
                            Permisos (v2)
                          </button>

                          <button class="btn btn-secondary btn-sm" data-action="deleteUser" data-id="${escapeHtml(
                            uid
                          )}" ${isProtected ? "disabled" : ""}>
                            Borrar usuario
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- ✅ Panel permisos ordenado + SOLO CHECKBOX -->
                    <div class="card" style="margin-top:10px; padding:14px; display:none;" data-perms-panel="${escapeHtml(
                      uid
                    )}">
                      <div style="font-weight:700; margin-bottom:10px;">Permisos (v2)</div>

                      <div style="
                        display:grid;
                        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
                        gap:12px 16px;
                        align-items:start;
                      ">

                        <div>
                          <div style="font-weight:600; font-size:0.9rem; margin-bottom:6px;">Pestañas</div>

                          <label style="display:flex; gap:10px; align-items:center; margin:6px 0;">
                            <input type="checkbox" data-tarifa2n="${escapeHtml(uid)}" ${
                              tarifa2NOn ? "checked" : ""
                            } />
                            <span>Tarifa 2N <span style="color:#6b7280; font-size:0.85rem;">(pages.tarifa)</span></span>
                          </label>

                          <label style="display:flex; gap:10px; align-items:center; margin:6px 0;">
                            <input type="checkbox" data-diagramas="${escapeHtml(uid)}" ${
                              diagramasOn ? "checked" : ""
                            } />
                            <span>Diagramas (IA / DXF) <span style="color:#6b7280; font-size:0.85rem;">(pages.diagramas)</span></span>
                          </label>

                          <label style="display:flex; gap:10px; align-items:center; margin:6px 0;">
                            <input type="checkbox" data-doc-gestion="${escapeHtml(uid)}" ${
                              docGestionOn ? "checked" : ""
                            } />
                            <span>Gestión documentación <span style="color:#6b7280; font-size:0.85rem;">(pages.docGestion)</span></span>
                          </label>
                        </div>

                        <div>
                          <div style="font-weight:600; font-size:0.9rem; margin-bottom:6px;">Documentación</div>

                          <label style="display:flex; gap:10px; align-items:center; margin:6px 0;">
                            <input type="checkbox" data-doc-commercial="${escapeHtml(uid)}" ${
                              docCommercialOn ? "checked" : ""
                            } />
                            <span>Modo comercial <span style="color:#6b7280; font-size:0.85rem;">(commercial)</span></span>
                          </label>

                          <label style="display:flex; gap:10px; align-items:center; margin:6px 0;">
                            <input type="checkbox" data-doc-technical="${escapeHtml(uid)}" ${
                              docTechnicalOn ? "checked" : ""
                            } />
                            <span>Modo técnico <span style="color:#6b7280; font-size:0.85rem;">(technical)</span></span>
                          </label>

                          <label style="display:flex; gap:10px; align-items:center; margin:10px 0 6px;">
                            <input type="checkbox" data-doc-export="${escapeHtml(uid)}" ${
                              exportTec ? "checked" : ""
                            } />
                            <span>Export técnico <span style="color:#6b7280; font-size:0.85rem;">(documentacion.exportTecnico)</span></span>
                          </label>
                        </div>

                        <div>
                          <div style="font-weight:600; font-size:0.9rem; margin-bottom:6px;">Tarifas</div>

                          <label style="display:flex; gap:10px; align-items:center; margin:6px 0;">
                            <input type="checkbox" data-tarifas-view="${escapeHtml(uid)}" ${
                              tarifasOn ? "checked" : ""
                            } />
                            <span>Acceso <span style="color:#6b7280; font-size:0.85rem;">(pages.tarifas=view)</span></span>
                          </label>
                        </div>

                        <div>
                          <div style="font-weight:600; font-size:0.9rem; margin-bottom:6px;">Prescripción</div>

                          <label style="display:flex; gap:10px; align-items:center; margin:6px 0;">
                            <input type="checkbox" data-presc-page="${escapeHtml(uid)}" ${
                              prescOn ? "checked" : ""
                            } />
                            <span>Página prescripción <span style="color:#6b7280; font-size:0.85rem;">(pages.prescripcion=view)</span></span>
                          </label>

                          <label style="display:flex; gap:10px; align-items:center; margin:6px 0;">
                            <input type="checkbox" data-presc-templates-full="${escapeHtml(uid)}" ${
                              prescTplFull ? "checked" : ""
                            } />
                            <span>Plantillas: full <span style="color:#6b7280; font-size:0.85rem;">(prescripcion.templates)</span></span>
                          </label>

                          <label style="display:flex; gap:10px; align-items:center; margin:6px 0;">
                            <input type="checkbox" data-presc-extrarefs-full="${escapeHtml(uid)}" ${
                              prescExtraFull ? "checked" : ""
                            } />
                            <span>Extra refs: full <span style="color:#6b7280; font-size:0.85rem;">(prescripcion.extraRefs)</span></span>
                          </label>
                        </div>
                      </div>

                      <div style="display:flex; justify-content:flex-end; margin-top:12px; gap:10px;">
                        <button class="btn btn-primary btn-sm" data-action="savePerms" data-id="${escapeHtml(
                          uid
                        )}">Guardar permisos</button>
                      </div>

                      <div style="margin-top:10px; font-size:0.82rem; color:#6b7280;">
                        Nota: al guardar permisos v2, también se sincroniza legacy (views/features) para compatibilidad.
                      </div>
                    </div>
                  </div>
                `;
                })
                .join("");
      }

      if (status) status.textContent = "OK";
    } catch (e) {
      console.error("AdminUsers refresh error:", e);
      if (status) status.textContent = "Error cargando datos.";
    }
  }

  function wireActions(container) {
    if (!container || container._wiredAdminUsers) return;
    container._wiredAdminUsers = true;

    // ✅ buscador
    container.addEventListener("input", (ev) => {
      const inp = ev.target?.closest?.("#adminUsersSearch");
      if (!inp) return;
      _usersSearch = inp.value || "";
      refresh();
    });

    // ✅ exclusividad: doc comercial vs doc técnico
    container.addEventListener("change", (ev) => {
      const c = ev.target;

      const docC = c?.closest?.('input[type="checkbox"][data-doc-commercial]');
      if (docC) {
        const uid = docC.getAttribute("data-doc-commercial");
        const tech = container.querySelector(`input[type="checkbox"][data-doc-technical="${uid}"]`);
        if (docC.checked && tech) tech.checked = false;
        return;
      }

      const docT = c?.closest?.('input[type="checkbox"][data-doc-technical]');
      if (docT) {
        const uid = docT.getAttribute("data-doc-technical");
        const comm = container.querySelector(`input[type="checkbox"][data-doc-commercial="${uid}"]`);
        if (docT.checked && comm) comm.checked = false;
        return;
      }
    });

    // ✅ guardar alias (blur)
    container.addEventListener(
      "blur",
      async (ev) => {
        const inp = ev.target?.closest?.("input[data-alias-input]");
        if (!inp) return;

        const uid = inp.getAttribute("data-alias-input");
        const alias = inp.value || "";

        try {
          await setUserAlias(uid, alias);

          const ix = _usersCache.findIndex((u) => String(u.id) === String(uid));
          if (ix >= 0) {
            _usersCache[ix].alias = String(alias || "").trim() || null;
            _usersCache[ix].aliasLower = _usersCache[ix].alias
              ? _usersCache[ix].alias.toLowerCase()
              : null;
          }
        } catch (e) {
          console.error("setUserAlias error:", e);
          alert("No se pudo guardar el alias.");
        }
      },
      true
    );

    container.addEventListener("click", async (ev) => {
      const btn = ev.target?.closest?.("button[data-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");

      try {
        if (action === "deleteInvite") {
          await deleteInvite(id);
          await refresh();
          return;
        }

        // ✅ bloqueo por “superadmin fijo”
        if (action === "deleteUser" || action === "toggleActive" || action === "saveRole" || action === "savePerms") {
          const u = _usersCache.find((x) => String(x.id) === String(id));
          if (isProtectedSuperAdminUser(u)) {
            alert("Esta cuenta SUPER_ADMIN está protegida.");
            return;
          }
        }

        if (action === "saveRole") {
          const sel = container.querySelector(`select[data-role-select="${id}"]`);
          const role = sel ? sel.value : "ACCOUNT_MANAGER";

          await updateUserRole(id, role);

          applyLivePermissionsIfSelf(id, {
            role,
            capabilities: buildCapabilitiesForRoleDual(role),
          });

          await refresh();
          return;
        }

        if (action === "toggleActive") {
          const current = btn.getAttribute("data-active") === "1";
          await setUserActive(id, !current);
          await refresh();
          return;
        }

        if (action === "togglePerms") {
          const panel = container.querySelector(`[data-perms-panel="${id}"]`);
          if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
          return;
        }

        if (action === "deleteUser") {
          const ok = window.confirm("¿Seguro que quieres BORRAR este usuario? (Auth + Firestore)");
          if (!ok) return;

          await deleteUser(id);
          await refresh();
          alert("Usuario borrado.");
          return;
        }

        if (action === "savePerms") {
          const selRole = container.querySelector(`select[data-role-select="${id}"]`);
          const role = selRole ? normalizeRole(selRole.value) : "ACCOUNT_MANAGER";

          const tarifa2N =
            !!container.querySelector(`input[type="checkbox"][data-tarifa2n="${id}"]`)?.checked;

          const diagramas =
            !!container.querySelector(`input[type="checkbox"][data-diagramas="${id}"]`)?.checked;

          const docGestion =
            !!container.querySelector(`input[type="checkbox"][data-doc-gestion="${id}"]`)?.checked;

          const docCommercial =
            !!container.querySelector(`input[type="checkbox"][data-doc-commercial="${id}"]`)?.checked;

          const docTechnical =
            !!container.querySelector(`input[type="checkbox"][data-doc-technical="${id}"]`)?.checked;

          const docMode = docTechnical ? "technical" : docCommercial ? "commercial" : "none";

          const tarifasView =
            !!container.querySelector(`input[type="checkbox"][data-tarifas-view="${id}"]`)?.checked;
          const tarifasMode = tarifasView ? "view" : "none";

          const prescOn =
            !!container.querySelector(`input[type="checkbox"][data-presc-page="${id}"]`)?.checked;
          const prescPage = prescOn ? "view" : "none";

          const prescTplFull =
            !!container.querySelector(`input[type="checkbox"][data-presc-templates-full="${id}"]`)?.checked;

          const prescExtraFull =
            !!container.querySelector(`input[type="checkbox"][data-presc-extrarefs-full="${id}"]`)?.checked;

          const prescTpl = prescTplFull ? "full" : "readOnly";
          const prescExtra = prescExtraFull ? "full" : "readOnly";

          const exportTec =
            !!container.querySelector(`input[type="checkbox"][data-doc-export="${id}"]`)?.checked;

          const partial = {
            pages: {
              tarifa: tarifa2N,
              diagramas: diagramas,
              tarifas: tarifasMode,
              documentacion: docMode,
              prescripcion: prescPage,
              docGestion: docGestion,
            },
            documentacion: { exportTecnico: exportTec },
            prescripcion: { templates: prescTpl, extraRefs: prescExtra },
          };

          const newCaps = await updateUserCapabilities(id, role, partial);

          applyLivePermissionsIfSelf(id, { role, capabilities: newCaps });

          await refresh();

          const panel = container.querySelector(`[data-perms-panel="${id}"]`);
          if (panel) panel.style.display = "none";

          alert("Permisos guardados.");
          return;
        }
      } catch (e) {
        console.error("AdminUsers action error:", e);
        alert("No se pudo completar la acción.");
      }
    });

    const btnCreate = el("btnCreateInvite");
    if (btnCreate && !btnCreate._wired) {
      btnCreate._wired = true;
      btnCreate.addEventListener("click", async (ev) => {
        ev.preventDefault();

        const email = el("inviteEmail")?.value || "";
        const role = el("inviteRole")?.value || "ACCOUNT_MANAGER";

        const cleanEmail = String(email).trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes("@")) {
          alert("Email no válido.");
          return;
        }

        try {
          const out = await createInvite({ email: cleanEmail, role });
          el("inviteEmail").value = "";
          await refresh();

          const link = out?.resetLink || "";
          if (link) {
            window.prompt("Reset link (cópialo y envíaselo al usuario):", link);
            alert("Invitación creada (Auth + Firestore). Reset link generado.");
          } else {
            alert("Invitación creada (Auth + Firestore).");
          }
        } catch (e) {
          console.error("createInvite error:", e);
          const msg =
            e?.message ||
            e?.details ||
            (typeof e === "string" ? e : "No se pudo crear la invitación.");
          alert(msg);
        }
      });
    }

    const btnReload = el("btnReloadUsers");
    if (btnReload && !btnReload._wired) {
      btnReload._wired = true;
      btnReload.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await refresh();
      });
    }
  }

  // ==========================
  // Render principal
  // ==========================
  window.renderAdminUsersView = function renderAdminUsersView() {
    const container = document.getElementById("appContent");
    if (!container) return;

    if (!isSuperAdmin()) {
      container.innerHTML = `
        <div class="page-title">Usuarios</div>
        <div class="card">
          <div class="card-header">Acceso denegado</div>
          <div style="color:#6b7280; font-size:0.9rem;">
            Esta página es solo para SUPER_ADMIN.
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="page-title">Usuarios</div>
      <div class="page-subtitle">Alta y gestión de roles/permisos.</div>

      <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Crear invitación (por defecto: ACCOUNT_MANAGER)</span>
          <span id="adminUsersStatus" style="font-size:0.85rem; color:#6b7280;">—</span>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
          <div style="flex:1; min-width:240px;">
            <label style="font-size:0.85rem; color:#6b7280;">Email</label>
            <input id="inviteEmail" type="email" placeholder="usuario@empresa.com" />
          </div>

          <div style="min-width:220px;">
            <label style="font-size:0.85rem; color:#6b7280;">Rol</label>
            <select id="inviteRole">
              ${ROLES.filter((r) => r !== "SUPER_ADMIN")
                .map(
                  (r) =>
                    `<option value="${r}" ${
                      r === "ACCOUNT_MANAGER" ? "selected" : ""
                    }>${r}</option>`
                )
                .join("")}
            </select>
          </div>

          <div style="display:flex; gap:8px;">
            <button id="btnCreateInvite" class="btn btn-primary">Crear</button>
            <button id="btnReloadUsers" class="btn btn-secondary">Refrescar</button>
          </div>
        </div>

        <div style="margin-top:10px; font-size:0.85rem; color:#6b7280;">
          Nota: “Crear” llama a Cloud Function (Auth + Firestore) y genera un enlace de reset de contraseña válido 24h.
        </div>
      </div>

      <div class="page-title" style="margin-top:18px; font-size:1.05rem;">Invitaciones</div>
      <div id="adminInvitesList"></div>

      <div class="card" style="margin-top:18px;">
        <div class="card-header">Buscar usuarios</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
          <div style="flex:1; min-width:240px;">
            <label style="font-size:0.85rem; color:#6b7280;">Email o alias</label>
            <input id="adminUsersSearch" type="text" placeholder="Ej: juan / empresa.com" />
          </div>
        </div>
      </div>

      <div class="page-title" style="margin-top:18px; font-size:1.05rem;">Usuarios (Auth ya creado)</div>
      <div id="adminUsersList"></div>
    `;

    wireActions(container);
    refresh();
  };

  console.log(
    "%cUI Admin Users cargada (ui_admin_users.js)",
    "color:#0ea5e9; font-weight:600;"
  );
})();
