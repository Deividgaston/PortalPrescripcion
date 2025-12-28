
/**
 * index.tsx
 * Sistema Central de Navegación y Shell UI
 * Estilo Premium SaaS 2026
 */

// Mapeo de vistas a sus funciones de inicialización correspondientes (declaradas en los scripts externos)
const VIEW_MAP: Record<string, () => void> = {
  proyecto: () => (window as any).initProyectoUI?.(),
  presupuesto: () => (window as any).initPresupuestoUI?.(),
  simulador: () => (window as any).initSimuladorUI?.(),
  tarifa: () => (window as any).initTarifaUI?.(),
  tarifas: () => (window as any).initTarifasUI?.(),
  documentacion: () => (window as any).initDocumentacionUI?.(),
  prescripcion: () => (window as any).initDocPrescripcionUI?.(),
  diagramas: () => (window as any).initDiagramasUI?.(),
  docGestion: () => (window as any).initDocGestionUI?.(),
  usuarios: () => (window as any).initAdminUsersUI?.(),
};

/**
 * Cambia la vista activa del contenedor principal
 * @param viewKey La clave de la vista según el data-view del HTML
 */
function switchView(viewKey: string) {
  const container = document.getElementById('appContent');
  if (!container) return;

  // 1. Efecto visual de transición (limpieza)
  container.style.opacity = '0';
  
  setTimeout(() => {
    // 2. Limpiar contenido previo
    container.innerHTML = '';

    // 3. Ejecutar inicialización de la vista
    const initFn = VIEW_MAP[viewKey];
    if (initFn) {
      initFn();
    } else {
      container.innerHTML = `<div class="card"><p>La vista <strong>${viewKey}</strong> no está disponible.</p></div>`;
    }

    // 4. Actualizar estado visual de los enlaces
    document.querySelectorAll('.nav-item').forEach(link => {
      if (link.getAttribute('data-view') === viewKey) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // 5. Mostrar nueva vista
    container.style.opacity = '1';
  }, 200);
}

/**
 * Inicializa el comportamiento de la barra superior (Shell)
 */
function initShellUI() {
  const navContainer = document.getElementById('navContainer');
  const btnLogout = document.getElementById('btnLogout');

  if (navContainer) {
    navContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const navItem = target.closest('.nav-item');
      
      if (navItem) {
        e.preventDefault();
        const viewKey = navItem.getAttribute('data-view');
        if (viewKey) {
          switchView(viewKey);
        }
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        (window as any).cerrarSesion?.();
      }
    });
  }

  // Cargar vista inicial por defecto
  switchView('proyecto');
}

// Exportar a window para que app.js pueda invocarlo tras el login
(window as any).initShellUI = initShellUI;

// Manejo de cierres de modal
document.addEventListener('DOMContentLoaded', () => {
  const modalClose = document.getElementById('prescModalClose');
  const modalCancel = document.getElementById('prescModalCancel');
  const modal = document.getElementById('prescModal');

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  modalClose?.addEventListener('click', closeModal);
  modalCancel?.addEventListener('click', closeModal);
});
