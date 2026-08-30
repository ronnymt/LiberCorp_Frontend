import { requireAuth, tienePermiso } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { showToast } from '../v4/toast.js';
import { showModal } from '../v4/modal.js';
import { openMenu } from '../v4/menus.js';
import { escapeHtml } from '../lib/ports-table.js';

requireAuth();

const puedeVer = tienePermiso('mensajeria.ver');
const puedeEliminar = tienePermiso('mensajeria.eliminar');
const puedeReenviar = tienePermiso('mensajeria.enviar');

const desdeInput = document.getElementById('me-desde');
const hastaInput = document.getElementById('me-hasta');
const porPaginaSelect = document.getElementById('me-porpagina');
const buscarTextoInput = document.getElementById('me-buscar-texto');
const rows = document.getElementById('me-rows');
const pag = document.getElementById('me-pagination');
const accionesBtn = document.getElementById('me-acciones-btn');
const selectAllCheckbox = document.getElementById('me-select-all');

const ESTADO_CLS = { pendiente: 'status-yellow', enviado: 'status-green', fallido: 'status-red' };
const ESTADO_TEXTO = { pendiente: 'Pendiente', enviado: 'Enviado', fallido: 'Fallido' };

let mensajes = [];
let paginaActual = 1;
/** Set<number> de ids seleccionados -- mismo patron que seleccionIds de editor-mensajes.js. */
let seleccionIds = new Set();
/** Segundos de pausa entre reenvios (Integraciones -> WaboxApp) -- se respeta tambien aca, no solo en el envio nuevo del Editor de mensajes. */
let pausaSegundos = 0;

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hace30Dias() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

desdeInput.value = hace30Dias();
hastaInput.value = hoy();

function fmtFechaHora(iso) {
  return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function porPagina() {
  return Number(porPaginaSelect.value) || 15;
}

function filasVisibles() {
  const q = buscarTextoInput.value.trim().toLowerCase();
  if (!q) {return mensajes;}
  return mensajes.filter(
    (m) =>
      (m.corporativo?.nombre ?? '').toLowerCase().includes(q) ||
      m.numeroDestino.toLowerCase().includes(q) ||
      (m.mensaje ?? '').toLowerCase().includes(q)
  );
}

function actualizarBotonAcciones() {
  accionesBtn.disabled = seleccionIds.size === 0;
  accionesBtn.textContent = seleccionIds.size > 0 ? `Acciones (${seleccionIds.size})` : 'Acciones';
}

function actualizarSelectAll() {
  const filas = filasVisibles();
  const idsVisibles = filas.map((m) => m.id);
  const seleccionadosVisibles = idsVisibles.filter((id) => seleccionIds.has(id));
  selectAllCheckbox.checked = idsVisibles.length > 0 && seleccionadosVisibles.length === idsVisibles.length;
  selectAllCheckbox.indeterminate = seleccionadosVisibles.length > 0 && seleccionadosVisibles.length < idsVisibles.length;
}

function renderPaginacion(total) {
  const porPag = porPagina();
  const totalPaginas = Math.max(1, Math.ceil(total / porPag));
  paginaActual = Math.min(Math.max(paginaActual, 1), totalPaginas);
  const inicio = total === 0 ? 0 : (paginaActual - 1) * porPag + 1;
  const fin = Math.min(paginaActual * porPag, total);
  const botones = Array.from({ length: totalPaginas }, (_, i) => i + 1)
    .map((p) => `<button type="button" class="page-link${p === paginaActual ? ' active' : ''}" data-page="${p}">${p}</button>`)
    .join('');
  pag.hidden = false;
  pag.innerHTML = `
    <span class="page-info">Mostrando ${inicio}-${fin} de ${total}</span>
    <button type="button" class="page-link${paginaActual === 1 ? ' disabled' : ''}" data-page="${paginaActual - 1}" aria-label="Pagina anterior">&lsaquo;</button>
    ${botones}
    <button type="button" class="page-link${paginaActual === totalPaginas ? ' disabled' : ''}" data-page="${paginaActual + 1}" aria-label="Pagina siguiente">&rsaquo;</button>
  `;
}

function renderTabla() {
  const filas = filasVisibles();

  if (filas.length === 0) {
    rows.innerHTML = '<tr><td colspan="9">Sin mensajes para los filtros elegidos.</td></tr>';
    renderPaginacion(0);
    actualizarSelectAll();
    return;
  }

  const porPag = porPagina();
  const totalPaginas = Math.max(1, Math.ceil(filas.length / porPag));
  paginaActual = Math.min(Math.max(paginaActual, 1), totalPaginas);
  const inicio = (paginaActual - 1) * porPag;
  const paginaItems = filas.slice(inicio, inicio + porPag);

  rows.innerHTML = paginaItems
    .map((m) => {
      const mensajeCorto = (m.mensaje ?? '').length > 120 ? `${m.mensaje.slice(0, 120)}…` : (m.mensaje ?? '-');
      return `
      <tr>
        <td><input type="checkbox" class="me-row-check" data-id="${m.id}" ${seleccionIds.has(m.id) ? 'checked' : ''} aria-label="Seleccionar mensaje ${m.id}"></td>
        <td>${m.id}</td>
        <td class="cell-strong">${escapeHtml(m.corporativo?.nombre ?? '(sin cliente)')}</td>
        <td>${fmtFechaHora(m.fechaCreacion)}</td>
        <td>${escapeHtml(m.numeroDestino)}</td>
        <td><span class="status ${ESTADO_CLS[m.estado] ?? 'status-red'}">${ESTADO_TEXTO[m.estado] ?? escapeHtml(m.estado)}</span></td>
        <td>${escapeHtml(m.gateway)}</td>
        <td style="max-width:360px;white-space:normal">${escapeHtml(mensajeCorto)}</td>
        <td>${puedeReenviar && m.tipoMensaje === 'texto' ? `<button type="button" class="btn btn-ghost btn-sm" data-editar-reenviar data-id="${m.id}" title="Editar y reenviar">✎</button>` : ''}</td>
      </tr>`;
    })
    .join('');
  renderPaginacion(filas.length);
  actualizarSelectAll();
}

pag.addEventListener('click', (e) => {
  const btn = e.target.closest('.page-link');
  if (!btn || btn.classList.contains('disabled')) {return;}
  const pagina = Number(btn.dataset.page);
  if (!pagina || pagina === paginaActual) {return;}
  paginaActual = pagina;
  renderTabla();
});

rows.addEventListener('change', (e) => {
  const check = e.target.closest('.me-row-check');
  if (!check) {return;}
  const id = Number(check.dataset.id);
  if (check.checked) {seleccionIds.add(id);}
  else {seleccionIds.delete(id);}
  actualizarBotonAcciones();
  actualizarSelectAll();
});

selectAllCheckbox.addEventListener('change', () => {
  const idsVisibles = filasVisibles().map((m) => m.id);
  if (selectAllCheckbox.checked) {idsVisibles.forEach((id) => seleccionIds.add(id));}
  else {idsVisibles.forEach((id) => seleccionIds.delete(id));}
  actualizarBotonAcciones();
  renderTabla();
});

rows.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-editar-reenviar]');
  if (!btn) {return;}
  const id = Number(btn.dataset.id);
  const fila = mensajes.find((m) => m.id === id);
  if (fila) {abrirModalEditarReenviar(fila);}
});

function abrirModalEditarReenviar(fila) {
  showModal({
    title: 'Editar y reenviar',
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="me-edit-numero">Numero de WhatsApp</label>
          <input type="tel" id="me-edit-numero" value="${escapeHtml(fila.numeroDestino)}">
        </div>
        <div class="modal-form-row">
          <label for="me-edit-mensaje">Mensaje</label>
          <textarea id="me-edit-mensaje" rows="6">${escapeHtml(fila.mensaje ?? '')}</textarea>
        </div>
      </form>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Guardar y reenviar',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body, close }) => {
          const numero = body.querySelector('#me-edit-numero').value.trim();
          const texto = body.querySelector('#me-edit-mensaje').value.trim();
          if (!numero || !texto) {
            showToast('Completa numero y mensaje', { variant: 'error' });
            return;
          }
          try {
            const resultado = await api.post(`/mensajeria/whatsapp/enviados/${fila.id}/reenviar`, { numero, mensaje: texto });
            showToast(resultado.ok ? 'Mensaje reenviado' : resultado.error || 'WaboxApp no confirmo el reenvio', { variant: resultado.ok ? 'success' : 'error' });
            close();
            await buscar();
          } catch (err) {
            showToast(err.message || 'No se pudo reenviar', { variant: 'error' });
          }
        }
      }
    ]
  });
}

async function eliminarSeleccionados() {
  const ids = Array.from(seleccionIds);
  try {
    await api.delete(`/mensajeria/whatsapp/enviados?ids=${ids.join(',')}`);
    showToast(`${ids.length} mensaje${ids.length === 1 ? '' : 's'} eliminado${ids.length === 1 ? '' : 's'}`, { variant: 'success' });
    seleccionIds.clear();
    actualizarBotonAcciones();
    await buscar();
  } catch (err) {
    showToast(err.message || 'No se pudo eliminar', { variant: 'error' });
  }
}

async function reenviarSeleccionados() {
  const ids = Array.from(seleccionIds);
  let ok = 0;
  for (let i = 0; i < ids.length; i++) {
    try {
      const resultado = await api.post(`/mensajeria/whatsapp/enviados/${ids[i]}/reenviar`, {});
      if (resultado.ok) {ok++;}
    } catch {
      // seguir con los demas aunque uno falle
    }
    const esUltimo = i === ids.length - 1;
    if (!esUltimo && pausaSegundos > 0) {await esperar(pausaSegundos * 1000);}
  }
  showToast(`Reenviados: ${ok}/${ids.length}`, { variant: ok === ids.length ? 'success' : 'error' });
  seleccionIds.clear();
  actualizarBotonAcciones();
  await buscar();
}

accionesBtn.addEventListener('click', () => {
  const items = [];
  if (puedeEliminar) {
    items.push({
      label: 'Eliminar',
      action: () => {
        const n = seleccionIds.size;
        showModal({
          title: 'Eliminar mensajes',
          body: `<p>Se van a eliminar ${n} mensaje${n === 1 ? '' : 's'} del historial. Esto no cancela nada, solo borra el registro.</p>`,
          actions: [
            { label: 'Cancelar', variant: 'outline' },
            { label: 'Eliminar', variant: 'danger', action: eliminarSeleccionados }
          ]
        });
      }
    });
  }
  if (puedeReenviar) {
    items.push({
      label: 'Reenviar',
      action: () => {
        const seleccion = mensajes.filter((m) => seleccionIds.has(m.id));
        const listaHtml = seleccion
          .map(
            (m) => `
            <div style="border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:10px;margin-bottom:8px">
              <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px">${escapeHtml(m.corporativo?.nombre ?? '(sin cliente)')} &middot; ${escapeHtml(m.numeroDestino)}</div>
              <pre style="white-space:pre-wrap;font-family:var(--font);font-size:12px;color:var(--text);margin:0">${escapeHtml(m.mensaje ?? '(sin texto)')}</pre>
            </div>`
          )
          .join('');
        showModal({
          title: `Reenviar ${seleccion.length} mensaje${seleccion.length === 1 ? '' : 's'}`,
          size: 'lg',
          body: `
            <p style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px">Se van a reenviar tal cual, al mismo numero y con el mismo contenido. Revisa antes de confirmar:</p>
            <div style="max-height:380px;overflow:auto">${listaHtml}</div>
          `,
          actions: [
            { label: 'Cancelar', variant: 'outline' },
            { label: 'Reenviar', variant: 'primary', action: reenviarSeleccionados }
          ]
        });
      }
    });
  }
  if (items.length > 0) {openMenu(accionesBtn, items);}
});

async function buscar() {
  rows.innerHTML = '<tr><td colspan="9">Cargando...</td></tr>';
  const params = new URLSearchParams();
  if (desdeInput.value) {params.set('desde', desdeInput.value);}
  if (hastaInput.value) {params.set('hasta', hastaInput.value);}

  try {
    mensajes = await api.get(`/mensajeria/whatsapp/enviados?${params.toString()}`);
    paginaActual = 1;
    renderTabla();
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="9">No se pudieron cargar los mensajes (${escapeHtml(err.message)}).</td></tr>`;
  }
}

for (const el of [desdeInput, hastaInput]) {
  el.addEventListener('change', buscar);
}
porPaginaSelect.addEventListener('change', () => {
  paginaActual = 1;
  renderTabla();
});
buscarTextoInput.addEventListener('input', () => {
  paginaActual = 1;
  renderTabla();
});

async function init() {
  if (!puedeVer) {
    document.querySelector('.page-wrapper').innerHTML = '<p>No tienes permiso para ver los mensajes enviados.</p>';
    return;
  }
  try {
    const config = await api.get('/configuracion');
    pausaSegundos = Number(config.waboxappPausaSegundos) || 0;
  } catch {
    // sin pausa configurada disponible -- reenviar sigue funcionando, solo sin el espaciado
  }
  await buscar();
}

init();
