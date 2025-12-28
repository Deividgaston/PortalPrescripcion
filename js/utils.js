// js/utils.js
// Funciones auxiliares y carga optimizada de tarifas 2N

/* ============================================================
   CARGA OPTIMIZADA DE TARIFAS 2N (con caché y una sola lectura)
   ============================================================ */

let tarifasPromise = null;

async function getTarifas() {
  // 1) Si ya están cargadas en memoria → devolver
  if (appState.tarifas && Object.keys(appState.tarifas).length > 0) {
    return appState.tarifas;
  }

  // 2) Si ya hay una petición en curso → reutilizar
  if (tarifasPromise) return tarifasPromise;

  // 3) Crear la promesa compartida
  tarifasPromise = (async () => {
    /* 3.1) Intentar cargar desde localStorage */
    const cached = localStorage.getItem(TARIFA_CACHE_KEY);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        if (data && typeof data === "object") {
          appState.tarifas = data;
          return data;
        }
      } catch (e) {
        console.warn("Error parseando tarifa cacheada:", e);
      }
    }

    /* 3.2) Si no hay cache → UNA sola lectura a Firestore */
    try {
      const snap = await db.collection("tarifas").doc("v1").get();

      if (!snap.exists) {
        console.warn("No existe tarifas/v1 en Firestore");
        appState.tarifas = {};
        return {};
      }

      const data = snap.data() || {};
      const productos = data.productos || {};

      appState.tarifas = productos;

      // Guardar en caché local
      localStorage.setItem(TARIFA_CACHE_KEY, JSON.stringify(productos));

      return productos;
    } catch (err) {
      console.error("Error cargando tarifas:", err);
      return {};
    }
  })();

  try {
    return await tarifasPromise;
  } finally {
    tarifasPromise = null; // liberar
  }
}

/* ============================================================
   UTILIDADES PARA ARCHIVOS, STRINGS, FECHAS
   ============================================================ */

// Formatear número con separadores
function formatNumber(num, dec = 2) {
  return Number(num || 0).toLocaleString("es-ES", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

// Fecha formateada
function formatFecha(fecha = null) {
  try {
    return new Date(fecha || Date.now()).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "--/--/----";
  }
}

// Descargar archivo (PDF / Excel)
function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

/* ============================================================
   UTILIDADES PARA PRESUPUESTOS / PROYECTOS
   ============================================================ */

// Calcula los totales del presupuesto
function calcularTotalesPresupuesto(lineas, dtoGlobal = 0) {
  let base = 0;

  for (const l of lineas) {
    base += Number(l.total) || 0;
  }

  const dtoImporte = base * (dtoGlobal / 100);
  const baseConDto = base - dtoImporte;
  const iva = baseConDto * 0.21;

  return {
    base: Number(base.toFixed(2)),
    dtoGlobal: Number(dtoImporte.toFixed(2)),
    iva: Number(iva.toFixed(2)),
    totalConIva: Number((baseConDto + iva).toFixed(2)),
  };
}

// Limpia un string genérico
function limpiarTexto(txt) {
  return String(txt || "").trim().replace(/\s+/g, " ");
}

// Normaliza referencias (mayúsculas)
function normalizarRef(ref) {
  return limpiarTexto(ref).toUpperCase();
}

/* ============================================================
   AVISO PARA LA CONSOLA
   ============================================================ */

console.log(
  "%c2N Presupuestos - utils.js cargado correctamente",
  "color:#1d4fd8; font-weight:600;"
);
