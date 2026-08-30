import { requireAuth, tienePermiso } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { getCacheado } from '../lib/api-cache.js';
import { showToast } from '../v4/toast.js';
import { showModal } from '../v4/modal.js';
import { escapeHtml } from '../lib/ports-table.js';

requireAuth();

const caidasDesde = document.getElementById('caidas-desde');
const caidasHasta = document.getElementById('caidas-hasta');
const caidasCorporativo = document.getElementById('caidas-corporativo');
const caidasRows = document.getElementById('caidas-rows');
const caidasPag = document.getElementById('caidas-pagination');

const CAIDAS_POR_PAGINA = 10;
let caidasFilas = [];
let caidasPaginaActual = 1;

const puedeNotificar = tienePermiso('configuracion.editar');
let numerosAlertaActivos = [];

function hace30Dias() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

caidasDesde.value = hace30Dias();
caidasHasta.value = hoy();

if (!tienePermiso('reportes.exportar')) {
  for (const id of ['caidas-excel', 'caidas-pdf']) {
    const btn = document.getElementById(id);
    btn.disabled = true;
    btn.title = 'No tienes permiso para exportar reportes';
  }
}

function fmtFechaHora(iso) {
  if (!iso) {return '';}
  return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDuracion(min, enCurso) {
  if (enCurso) {return '<span class="status status-red">En curso</span>';}
  if (min === null || min === undefined) {return '-';}
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function cargarCorporativos() {
  try {
    const clientes = await getCacheado('/corporativos');
    const opciones = clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    caidasCorporativo.innerHTML = '<option value="">Todos los clientes</option>' + opciones;
  } catch {
    // si falla, el select queda solo con la opcion por defecto
  }
}

async function cargarNumerosAlerta() {
  if (!puedeNotificar) {return;}
  try {
    const numeros = await api.get('/configuracion/numeros-alerta');
    numerosAlertaActivos = numeros.filter((n) => n.activo);
  } catch {
    numerosAlertaActivos = [];
  }
}

/** Modal: elegir a cuales "Numeros de alerta" llamar por este puerto puntual, y disparar la llamada de Twilio. */
function abrirModalNotificar(fila) {
  if (numerosAlertaActivos.length === 0) {
    showToast('No hay numeros de alerta activos -- configuralos en Integraciones', { variant: 'error' });
    return;
  }
  const opcionesHtml = numerosAlertaActivos
    .map(
      (n) => `
      <label class="modal-form-row" style="flex-direction:row;align-items:center;gap:8px">
        <input type="checkbox" value="${n.id}" checked style="width:auto">
        ${escapeHtml(n.nombre)} &middot; ${escapeHtml(n.numero)}
      </label>`
    )
    .join('');

  showModal({
    title: 'Notificar caida por telefono',
    size: 'md',
    body: `
      <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:12px">
        Puerto <strong>${escapeHtml(fila.puerto)}</strong> de <strong>${escapeHtml(fila.corporativo)}</strong>.
        Se va a llamar (Twilio) a los numeros marcados.
      </p>
      <div style="display:flex;flex-direction:column;gap:6px">${opcionesHtml}</div>
    `,
    actions: [
      { label: 'Cancelar', variant: 'ghost' },
      {
        label: 'Enviar',
        variant: 'primary',
        closeOnAction: true,
        action: async (ctx) => {
          const numeroIds = Array.from(ctx.body.querySelectorAll('input[type="checkbox"]:checked')).map((el) => Number(el.value));
          if (numeroIds.length === 0) {
            showToast('Selecciona al menos un numero', { variant: 'error' });
            return false;
          }
          try {
            const resultados = await api.post('/alertas/notificar', { portId: fila.portId, numeroIds });
            const exitosos = resultados.filter((r) => r.ok).length;
            if (exitosos === resultados.length) {
              showToast(`${exitosos} llamada${exitosos === 1 ? '' : 's'} de alerta iniciada${exitosos === 1 ? '' : 's'}`, { variant: 'success' });
            } else if (exitosos === 0) {
              showToast(resultados[0]?.error || 'No se pudo iniciar ninguna llamada', { variant: 'error' });
            } else {
              showToast(`${exitosos} de ${resultados.length} llamadas iniciadas -- revisa el resto`, { variant: 'error' });
            }
          } catch (err) {
            showToast(err.message || 'No se pudo notificar', { variant: 'error' });
          }
          return undefined;
        }
      }
    ]
  });
}

function validarRango(desdeEl, hastaEl) {
  if (!desdeEl.value || !hastaEl.value) {
    showToast('Elige fecha desde y hasta', { variant: 'error' });
    return false;
  }
  if (desdeEl.value > hastaEl.value) {
    showToast('La fecha "desde" no puede ser posterior a "hasta"', { variant: 'error' });
    return false;
  }
  return true;
}

function renderCaidasPaginacion(total) {
  const totalPaginas = Math.max(1, Math.ceil(total / CAIDAS_POR_PAGINA));
  caidasPaginaActual = Math.min(Math.max(caidasPaginaActual, 1), totalPaginas);
  const inicio = total === 0 ? 0 : (caidasPaginaActual - 1) * CAIDAS_POR_PAGINA + 1;
  const fin = Math.min(caidasPaginaActual * CAIDAS_POR_PAGINA, total);
  const botones = Array.from({ length: totalPaginas }, (_, i) => i + 1)
    .map((p) => `<button type="button" class="page-link${p === caidasPaginaActual ? ' active' : ''}" data-page="${p}">${p}</button>`)
    .join('');
  caidasPag.hidden = totalPaginas <= 1;
  caidasPag.innerHTML = `
    <span class="page-info">Mostrando ${inicio}-${fin} de ${total}</span>
    <button type="button" class="page-link${caidasPaginaActual === 1 ? ' disabled' : ''}" data-page="${caidasPaginaActual - 1}" aria-label="Pagina anterior">&lsaquo;</button>
    ${botones}
    <button type="button" class="page-link${caidasPaginaActual === totalPaginas ? ' disabled' : ''}" data-page="${caidasPaginaActual + 1}" aria-label="Pagina siguiente">&rsaquo;</button>
  `;
}

function renderCaidasTabla() {
  if (caidasFilas.length === 0) {
    caidasRows.innerHTML = '<tr><td colspan="7">Sin caidas en este rango.</td></tr>';
    caidasPag.hidden = true;
    return;
  }
  const totalPaginas = Math.max(1, Math.ceil(caidasFilas.length / CAIDAS_POR_PAGINA));
  caidasPaginaActual = Math.min(Math.max(caidasPaginaActual, 1), totalPaginas);
  const inicio = (caidasPaginaActual - 1) * CAIDAS_POR_PAGINA;
  const paginaItems = caidasFilas.slice(inicio, inicio + CAIDAS_POR_PAGINA);

  caidasRows.innerHTML = paginaItems
    .map(
      (f, i) => `
      <tr>
        <td>${escapeHtml(f.corporativo)}</td>
        <td>${f.librenmsUrl ? `<a href="${escapeHtml(f.librenmsUrl)}" target="_blank" rel="noreferrer">${escapeHtml(f.puerto)}</a>` : escapeHtml(f.puerto)}</td>
        <td>${escapeHtml(f.dispositivo ?? '-')}</td>
        <td>${fmtFechaHora(f.inicio)}</td>
        <td>${f.enCurso ? '<span class="status status-red">En curso</span>' : fmtFechaHora(f.fin)}</td>
        <td>${fmtDuracion(f.duracionMin, f.enCurso)}</td>
        <td style="white-space:nowrap">${f.enCurso && puedeNotificar ? `<button type="button" class="btn btn-outline btn-sm" data-notificar data-idx="${inicio + i}">Notificar</button>` : ''}</td>
      </tr>`
    )
    .join('');
  renderCaidasPaginacion(caidasFilas.length);
}

caidasPag.addEventListener('click', (e) => {
  const btn = e.target.closest('.page-link');
  if (!btn || btn.classList.contains('disabled')) {return;}
  const pagina = Number(btn.dataset.page);
  if (!pagina || pagina === caidasPaginaActual) {return;}
  caidasPaginaActual = pagina;
  renderCaidasTabla();
});

async function buscarCaidas() {
  if (!validarRango(caidasDesde, caidasHasta)) {return;}
  caidasRows.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';
  caidasPag.hidden = true;
  const params = new URLSearchParams({ desde: caidasDesde.value, hasta: caidasHasta.value });
  if (caidasCorporativo.value) {params.set('corporativoId', caidasCorporativo.value);}
  try {
    caidasFilas = await api.get(`/reportes/caidas?${params.toString()}`);
    caidasPaginaActual = 1;
    renderCaidasTabla();
    if (tienePermiso('reportes.exportar')) {
      const excelBtn = document.getElementById('caidas-excel');
      const pdfBtn = document.getElementById('caidas-pdf');
      excelBtn.disabled = false;
      excelBtn.removeAttribute('title');
      pdfBtn.disabled = false;
      pdfBtn.removeAttribute('title');
    }
  } catch (err) {
    caidasFilas = [];
    caidasRows.innerHTML = `<tr><td colspan="7">No se pudo cargar el reporte (${escapeHtml(err.message)}).</td></tr>`;
  }
}

document.getElementById('caidas-buscar').addEventListener('click', buscarCaidas);
caidasRows.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-notificar]');
  if (!btn) {return;}
  const fila = caidasFilas[Number(btn.dataset.idx)];
  if (fila) {abrirModalNotificar(fila);}
});
document.getElementById('caidas-excel').addEventListener('click', () => {
  if (!validarRango(caidasDesde, caidasHasta)) {return;}
  const params = new URLSearchParams({ desde: caidasDesde.value, hasta: caidasHasta.value });
  if (caidasCorporativo.value) {params.set('corporativoId', caidasCorporativo.value);}
  api.download(`/reportes/caidas/excel?${params.toString()}`, `historial-caidas_${caidasDesde.value}_${caidasHasta.value}.xlsx`)
    .catch((err) => showToast(err.message || 'No se pudo descargar el reporte', { variant: 'error' }));
});
document.getElementById('caidas-pdf').addEventListener('click', () => {
  if (!validarRango(caidasDesde, caidasHasta)) {return;}
  const params = new URLSearchParams({ desde: caidasDesde.value, hasta: caidasHasta.value });
  if (caidasCorporativo.value) {params.set('corporativoId', caidasCorporativo.value);}
  api.download(`/reportes/caidas/pdf?${params.toString()}`, `historial-caidas_${caidasDesde.value}_${caidasHasta.value}.pdf`)
    .catch((err) => showToast(err.message || 'No se pudo descargar el reporte', { variant: 'error' }));
});

async function init() {
  await cargarCorporativos();
  await cargarNumerosAlerta();
  // Deep-link desde la campana de alertas de red: preselecciona el cliente
  // del evento en el mismo filtro "Todos los clientes" de este reporte.
  const corporativoId = new URLSearchParams(window.location.search).get('corporativoId');
  if (corporativoId && [...caidasCorporativo.options].some((o) => o.value === corporativoId)) {
    caidasCorporativo.value = corporativoId;
  }
  buscarCaidas();
}

init();
