import { requireAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/ports-table.js';
import { fmtMonto } from '../lib/format.js';

requireAuth();

const rows = document.getElementById('facturacion-rows');
const resumenRows = document.getElementById('resumen-rows');
const filtroTexto = document.getElementById('filtro-texto');
const filtroEstado = document.getElementById('filtro-estado');
const filtroPeriodo = document.getElementById('filtro-periodo');
const pag = document.getElementById('facturacion-pagination');

const BOLETAS_POR_PAGINA = 15;
let paginaActual = 1;

const ESTADO_CLS = { pendiente: 'status-red', parcial: 'status-yellow', pagado: 'status-green', vencido: 'status-red' };
const ESTADO_TEXTO = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado', vencido: 'Vencido' };

let boletasCargadas = [];

function fmtPeriodo(periodo) {
  const [year, month] = periodo.slice(0, 7).split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}

function fmtFecha(fecha) {
  if (!fecha) {return '-';}
  const [year, month, day] = fecha.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** "vencido" no es un estado guardado -- lo calcula el backend (boleta.vencida) comparando fecha_vencimiento contra hoy, sin tocar el estado real (pendiente/parcial/pagado). Para filtrar/agrupar en la UI se trata como un 4to estado aparte. */
function estadoVisible(b) {
  return b.vencida ? 'vencido' : b.estado;
}

function filasVisibles() {
  const q = filtroTexto.value.trim().toLowerCase();
  return boletasCargadas.filter((b) => {
    if (filtroEstado.value && estadoVisible(b) !== filtroEstado.value) {return false;}
    if (q && !(b.corporativo?.nombre ?? '').toLowerCase().includes(q)) {return false;}
    return true;
  });
}

function renderResumen(boletas) {
  const grupos = { pendiente: [], parcial: [], pagado: [], vencido: [] };
  for (const b of boletas) {grupos[estadoVisible(b)]?.push(b);}

  const fila = (etiqueta, lista) => {
    const total = lista.reduce((acc, b) => acc + Number(b.montoTotal), 0);
    const cobrado = lista.reduce((acc, b) => acc + Number(b.montoPagado), 0);
    const saldo = Math.max(total - cobrado, 0);
    return `
      <tr>
        <td class="cell-strong">${etiqueta}</td>
        <td>${lista.length}</td>
        <td>${fmtMonto(total)}</td>
        <td>${fmtMonto(cobrado)}</td>
        <td>${fmtMonto(saldo)}</td>
      </tr>`;
  };

  resumenRows.innerHTML =
    fila('Pendientes', grupos.pendiente) +
    fila('Parciales', grupos.parcial) +
    fila('Pagadas', grupos.pagado) +
    fila('Vencidas', grupos.vencido) +
    fila('Totales', boletas);
}

function renderPaginacion(total) {
  const totalPaginas = Math.max(1, Math.ceil(total / BOLETAS_POR_PAGINA));
  paginaActual = Math.min(Math.max(paginaActual, 1), totalPaginas);
  const inicio = total === 0 ? 0 : (paginaActual - 1) * BOLETAS_POR_PAGINA + 1;
  const fin = Math.min(paginaActual * BOLETAS_POR_PAGINA, total);
  const botones = Array.from({ length: totalPaginas }, (_, i) => i + 1)
    .map((p) => `<button type="button" class="page-link${p === paginaActual ? ' active' : ''}" data-page="${p}">${p}</button>`)
    .join('');
  pag.hidden = totalPaginas <= 1;
  pag.innerHTML = `
    <span class="page-info">Mostrando ${inicio}-${fin} de ${total}</span>
    <button type="button" class="page-link${paginaActual === 1 ? ' disabled' : ''}" data-page="${paginaActual - 1}" aria-label="Pagina anterior">&lsaquo;</button>
    ${botones}
    <button type="button" class="page-link${paginaActual === totalPaginas ? ' disabled' : ''}" data-page="${paginaActual + 1}" aria-label="Pagina siguiente">&rsaquo;</button>
  `;
}

function renderTabla(boletas) {
  renderResumen(boletas);
  if (boletas.length === 0) {
    rows.innerHTML = '<tr><td colspan="8">Sin boletas para mostrar.</td></tr>';
    pag.hidden = true;
    return;
  }
  const totalPaginas = Math.max(1, Math.ceil(boletas.length / BOLETAS_POR_PAGINA));
  paginaActual = Math.min(Math.max(paginaActual, 1), totalPaginas);
  const inicio = (paginaActual - 1) * BOLETAS_POR_PAGINA;
  const paginaItems = boletas.slice(inicio, inicio + BOLETAS_POR_PAGINA);

  rows.innerHTML = paginaItems
    .map((b) => {
      const saldo = Math.max(Number(b.montoTotal) - Number(b.montoPagado), 0);
      const estado = estadoVisible(b);
      return `
        <tr>
          <td class="cell-strong">${escapeHtml(b.corporativo?.nombre ?? '-')}</td>
          <td style="text-transform:capitalize">${escapeHtml(fmtPeriodo(b.periodo))}</td>
          <td>${fmtFecha(b.fechaVencimiento)}</td>
          <td>${escapeHtml(b.moneda)} ${fmtMonto(b.montoTotal)}</td>
          <td>${escapeHtml(b.moneda)} ${fmtMonto(b.montoPagado)}</td>
          <td>${escapeHtml(b.moneda)} ${fmtMonto(saldo)}</td>
          <td>
            <span class="status ${ESTADO_CLS[estado] ?? 'status-red'}">${ESTADO_TEXTO[estado] ?? escapeHtml(estado)}</span>
            ${b.enProgreso ? '<span class="status status-blue" title="El mes todavia no termino -- se sigue calculando dia a dia. No se puede pagar/editar hasta que cierre.">En curso</span>' : ''}
          </td>
          <td><a class="btn btn-outline btn-sm" href="cliente.html?id=${b.corporativoId}&tab=facturacion&subtab=transacciones">Ver pagos</a></td>
        </tr>`;
    })
    .join('');
  renderPaginacion(boletas.length);
}

pag.addEventListener('click', (e) => {
  const btn = e.target.closest('.page-link');
  if (!btn || btn.classList.contains('disabled')) {return;}
  const pagina = Number(btn.dataset.page);
  if (!pagina || pagina === paginaActual) {return;}
  paginaActual = pagina;
  renderTabla(filasVisibles());
});

function render() {
  paginaActual = 1;
  renderTabla(filasVisibles());
}

async function cargar() {
  rows.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';
  const params = new URLSearchParams();
  if (filtroPeriodo.value) {params.set('periodo', `${filtroPeriodo.value}-01`);}
  // el estado se filtra en el cliente (mas abajo) porque "vencido" no es un valor real de boleta.estado en el backend

  try {
    boletasCargadas = await api.get(`/boletas?${params.toString()}`);
    render();
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="8">No se pudieron cargar las boletas (${escapeHtml(err.message)}).</td></tr>`;
  }
}

filtroTexto.addEventListener('input', render);
filtroEstado.addEventListener('change', render);
filtroPeriodo.addEventListener('change', cargar);

cargar();
