import { requireAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { getCacheado } from '../lib/api-cache.js';
import { escapeHtml } from '../lib/ports-table.js';

requireAuth();

const mesInput = document.getElementById('ep-mes');
const buscarTexto = document.getElementById('ep-buscar-texto');
const rows = document.getElementById('ep-rows');
const pag = document.getElementById('ep-pagination');

const POR_PAGINA = 20;
let filas = [];
let paginaActual = 1;

const CHECK_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M4 10.5l4 4 8-9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
mesInput.value = mesActual();

function renderPaginacion(total) {
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  paginaActual = Math.min(Math.max(paginaActual, 1), totalPaginas);
  const inicio = total === 0 ? 0 : (paginaActual - 1) * POR_PAGINA + 1;
  const fin = Math.min(paginaActual * POR_PAGINA, total);
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

function filasVisibles() {
  const q = buscarTexto.value.trim().toLowerCase();
  if (!q) {return filas;}
  return filas.filter((f) => f.nombre.toLowerCase().includes(q));
}

function render() {
  const visibles = filasVisibles();
  if (visibles.length === 0) {
    rows.innerHTML = '<tr><td colspan="3">Sin clientes para mostrar.</td></tr>';
    pag.hidden = true;
    return;
  }
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  paginaActual = Math.min(Math.max(paginaActual, 1), totalPaginas);
  const inicio = (paginaActual - 1) * POR_PAGINA;
  const paginaItems = visibles.slice(inicio, inicio + POR_PAGINA);

  rows.innerHTML = paginaItems
    .map(
      (f) => `
      <tr>
        <td class="cell-strong">${escapeHtml(f.nombre)}</td>
        <td style="text-align:center;color:var(--green)">${f.pagado ? CHECK_SVG : ''}</td>
        <td style="text-align:center;color:var(--yellow)">${f.pagadoParcial ? CHECK_SVG : ''}</td>
      </tr>`
    )
    .join('');
  renderPaginacion(visibles.length);
}

pag.addEventListener('click', (e) => {
  const btn = e.target.closest('.page-link');
  if (!btn || btn.classList.contains('disabled')) {return;}
  const pagina = Number(btn.dataset.page);
  if (!pagina || pagina === paginaActual) {return;}
  paginaActual = pagina;
  render();
});

buscarTexto.addEventListener('input', () => {
  paginaActual = 1;
  render();
});

async function cargar() {
  if (!mesInput.value) {return;}
  rows.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  pag.hidden = true;
  const periodo = `${mesInput.value}-01`;
  try {
    const [clientes, boletas] = await Promise.all([getCacheado('/corporativos'), api.get(`/boletas?periodo=${periodo}`)]);
    const boletaPorCorporativo = new Map(boletas.map((b) => [b.corporativoId, b]));
    filas = clientes
      .map((c) => {
        const boleta = boletaPorCorporativo.get(c.id);
        return {
          nombre: c.nombre,
          pagado: boleta?.estado === 'pagado',
          pagadoParcial: boleta?.estado === 'parcial'
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    paginaActual = 1;
    render();
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="3">No se pudo cargar (${escapeHtml(err.message)}).</td></tr>`;
  }
}

mesInput.addEventListener('change', cargar);

cargar();
