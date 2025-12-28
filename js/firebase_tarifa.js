// js/firebase_tarifa.js
// Funciones específicas para gestionar la TARIFA 2N en Firestore (modo compat)

const db = firebase.firestore();

const TARIFAS_COLLECTION = "tarifas";
const TARIFA_VERSION = "v1";
const PRODUCTOS_SUBCOL = "productos";

export async function subirTarifaAFirestore(productosMap) {
  const entries = Object.entries(productosMap || {});
  if (!entries.length) return 0;

  try {
    const tarifaVersionRef = db
      .collection(TARIFAS_COLLECTION)
      .doc(TARIFA_VERSION);

    const batch0 = db.batch();

    batch0.set(
      tarifaVersionRef,
      {
        version: TARIFA_VERSION,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await batch0.commit();
    console.log("%cDocumento padre /tarifas/v1 creado OK", "color:#22c55e;");
  } catch (e) {
    console.error("Error creando documento padre tarifas/v1:", e);
    throw e;
  }

  const batchSize = 400;
  let totalEscritos = 0;

  for (let i = 0; i < entries.length; i += batchSize) {
    const chunk = entries.slice(i, i + batchSize);
    const batch = db.batch();

    chunk.forEach(([ref, data]) => {
      const docRef = db
        .collection(TARIFAS_COLLECTION)
        .doc(TARIFA_VERSION)
        .collection(PRODUCTOS_SUBCOL)
        .doc(String(ref));

      const safeData = { ...(data || {}) };
      if ("rawRow" in safeData) delete safeData.rawRow;

      const payload = {
        ...safeData,
        referencia: String(ref),
        pvp: Number(safeData.pvp) || 0,
        descripcion: safeData.descripcion || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      batch.set(docRef, payload, { merge: true });
    });

    await batch.commit();
    totalEscritos += chunk.length;
    console.log(
      `%cTarifa · Batch subido (${i + chunk.length}/${entries.length})`,
      "color:#22c55e;"
    );
  }

  console.log(
    `%cTarifa · Subida completa: ${totalEscritos} referencias`,
    "color:#16a34a; font-weight:600;"
  );

  return totalEscritos;
}

export async function getTarifas() {
  const colRef = db
    .collection(TARIFAS_COLLECTION)
    .doc(TARIFA_VERSION)
    .collection(PRODUCTOS_SUBCOL);

  const snap = await colRef.get();
  const result = {};

  snap.forEach((docSnap) => {
    const d = docSnap.data();
    if (!d) return;

    const ref = docSnap.id;
    const pvp = Number(d.pvp) || 0;
    if (!pvp) return;

    result[ref] = pvp;
  });

  console.log(
    `%cTarifa · getTarifas() -> ${Object.keys(result).length} referencias`,
    "color:#3b82f6;"
  );

  return result;
}

/**
 * ✅ NUEVO: Vacía /tarifas/v1/productos (borrado por batches)
 * Devuelve cuántos docs se han borrado.
 */
export async function vaciarTarifaEnFirestore() {
  const colRef = db
    .collection(TARIFAS_COLLECTION)
    .doc(TARIFA_VERSION)
    .collection(PRODUCTOS_SUBCOL);

  const batchSize = 400;
  let totalBorrados = 0;

  while (true) {
    const snap = await colRef.limit(batchSize).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    totalBorrados += snap.size;
    console.log(
      `%cTarifa · Borrados ${totalBorrados}...`,
      "color:#ef4444; font-weight:600;"
    );
  }

  // (Opcional) dejar marca en el doc padre
  try {
    await db
      .collection(TARIFAS_COLLECTION)
      .doc(TARIFA_VERSION)
      .set(
        { updatedAt: firebase.firestore.FieldValue.serverTimestamp(), emptiedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
  } catch (_) {}

  console.log(
    `%cTarifa · Vaciado completo: ${totalBorrados} docs`,
    "color:#ef4444; font-weight:700;"
  );

  return totalBorrados;
}
