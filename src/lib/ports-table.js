// Render compartido de una fila de "port" (usado por el Dashboard y por el
// detalle de Cliente), para que el pill de estado y el link a LibreNMS sean
// siempre el mismo componente en toda la app.

export function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

export function portEstadoBadge(estado, activo = true) {
  if (!activo) return `<span class="status status-muted" title="Puerto deshabilitado -- no se monitorea ni se factura">Inactivo</span>`;
  const cls = estado === 'up' ? 'status-green' : 'status-red';
  return `<span class="status ${cls}">${escapeHtml(estado ?? 'sin datos')}</span>`;
}

/** Nombre a mostrar: alias si existe, si no el nombre tecnico de LibreNMS. */
export function portNombreVisible(port) {
  return port.alias || port.nombrePuerto;
}

/** Celdas Puerto | Dispositivo | Servicio | Estado (sin <tr>, para componer). */
export function portRowCells(port) {
  const nombreVisible = portNombreVisible(port);
  const subtitulo = port.alias ? `<div style="font-size:11px;color:var(--text-muted)">${escapeHtml(port.nombrePuerto)}</div>` : '';
  return `
    <td><a href="${escapeHtml(port.librenmsUrl)}" target="_blank" rel="noreferrer">${escapeHtml(nombreVisible)}</a>${subtitulo}</td>
    <td>${escapeHtml(port.device?.nombre)}</td>
    <td>${escapeHtml(port.tipoServicio?.nombre)}</td>
    <td>${portEstadoBadge(port.estadoActual, port.activo)}</td>
  `;
}
