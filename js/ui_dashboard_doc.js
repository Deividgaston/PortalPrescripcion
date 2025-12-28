// js/ui_dashboard_doc.js
// Pestaña de documentación (solo texto informativo)

function renderDashboardDoc(container) {
  container.innerHTML = `
    <div class="page-title">Documentación 2N</div>
    <div class="page-subtitle">
      Información orientativa para acompañar el presupuesto en fase de diseño.
    </div>

    <div class="card">
      <div class="card-header">Notas generales</div>
      <ul style="font-size:0.85rem; color:#4b5563; padding-left:18px; margin-top:8px;">
        <li style="margin-bottom:4px;">
          Todos los precios son orientativos y deben confirmarse con la tarifa oficial vigente.
        </li>
        <li style="margin-bottom:4px;">
          La alimentación de los equipos se realizará mediante switches PoE dimensionados
          según el consumo de cada dispositivo.
        </li>
        <li style="margin-bottom:4px;">
          La solución admite desvío de llamadas a móvil, control de accesos por Bluetooth,
          códigos PIN, tarjetas RFID/NFC y códigos QR temporales.
        </li>
        <li>
          El sistema es ampliable e integrable con domótica, PMS y sistemas terceros de seguridad
          según las necesidades del proyecto.
        </li>
      </ul>
    </div>
  `;
}
