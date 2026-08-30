import { requireAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { getCacheado } from '../lib/api-cache.js';
import { showToast } from '../v4/toast.js';
import { escapeHtml } from '../lib/ports-table.js';
import { fmtMonto } from '../lib/format.js';

requireAuth();

const desdeInput = document.getElementById('tx-desde');
const hastaInput = document.getElementById('tx-hasta');
const clienteSelect = document.getElementById('tx-cliente');
const cuentaSelect = document.getElementById('tx-cuenta');
const usuarioSelect = document.getElementById('tx-usuario');
const buscarTextoInput = document.getElementById('tx-buscar-texto');
const rows = document.getElementById('tx-rows');
const totalEl = document.getElementById('tx-total');
const pag = document.getElementById('tx-pagination');

const TX_POR_PAGINA = 10;
let transacciones = [];
let paginaActual = 1;

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

function fmtPeriodo(periodo) {
  const [year, month] = periodo.slice(0, 7).split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
}

async function cargarFiltrosBase() {
  try {
    const [clientes, cuentas] = await Promise.all([getCacheado('/corporativos'), getCacheado('/cuentas-empresa')]);
    clienteSelect.innerHTML =
      '<option value="">Cualquiera</option>' + clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    cuentaSelect.innerHTML =
      '<option value="">Cualquiera</option>' +
      cuentas.map((c) => `<option value="${c.id}">${escapeHtml(c.nombreCuenta)} — ${escapeHtml(c.banco)}</option>`).join('');
  } catch {
    // si falla, los selects quedan solo con "Cualquiera"
  }
  try {
    const usuarios = await api.get('/usuarios');
    usuarioSelect.innerHTML =
      '<option value="">Cualquiera</option>' + usuarios.map((u) => `<option value="${u.id}">${escapeHtml(u.nombre)}</option>`).join('');
  } catch {
    // usuario sin permiso usuarios.ver -- el select queda solo con "Cualquiera"
  }
}

function filasVisibles() {
  const q = buscarTextoInput.value.trim().toLowerCase();
  if (!q) {return transacciones;}
  return transacciones.filter(
    (t) =>
      t.corporativo.toLowerCase().includes(q) ||
      t.cuenta.toLowerCase().includes(q) ||
      t.usuario.toLowerCase().includes(q) ||
      (t.comprobante ?? '').toLowerCase().includes(q) ||
      (t.puerto ?? '').toLowerCase().includes(q)
  );
}

function renderTotal(filas) {
  const totalesPorMoneda = new Map();
  for (const t of filas) {
    totalesPorMoneda.set(t.moneda, (totalesPorMoneda.get(t.moneda) ?? 0) + Number(t.montoPagado));
  }
  totalEl.textContent =
    totalesPorMoneda.size === 0
      ? 'S/ 0.00'
      : Array.from(totalesPorMoneda.entries())
        .map(([moneda, total]) => `${moneda} ${fmtMonto(total)}`)
        .join(' · ');
}

function renderPaginacion(total) {
  const totalPaginas = Math.max(1, Math.ceil(total / TX_POR_PAGINA));
  paginaActual = Math.min(Math.max(paginaActual, 1), totalPaginas);
  const inicio = total === 0 ? 0 : (paginaActual - 1) * TX_POR_PAGINA + 1;
  const fin = Math.min(paginaActual * TX_POR_PAGINA, total);
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
  renderTotal(filas);

  if (filas.length === 0) {
    rows.innerHTML = '<tr><td colspan="8">Sin transacciones para los filtros elegidos.</td></tr>';
    renderPaginacion(0);
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(filas.length / TX_POR_PAGINA));
  paginaActual = Math.min(Math.max(paginaActual, 1), totalPaginas);
  const inicio = (paginaActual - 1) * TX_POR_PAGINA;
  const paginaItems = filas.slice(inicio, inicio + TX_POR_PAGINA);

  rows.innerHTML = paginaItems
    .map(
      (t) => `
      <tr>
        <td>${t.id}</td>
        <td class="cell-strong">${escapeHtml(t.corporativo)}</td>
        <td style="text-transform:capitalize">${escapeHtml(fmtPeriodo(t.periodo))}${t.puerto ? ` — ${escapeHtml(t.puerto)}` : ''}</td>
        <td>${escapeHtml(t.cuenta)}</td>
        <td>${fmtFechaHora(t.fechaPago)}</td>
        <td class="cell-strong">${escapeHtml(t.moneda)} ${fmtMonto(t.montoPagado)}</td>
        <td>${escapeHtml(t.comprobante ?? '-')}</td>
        <td>${escapeHtml(t.usuario)}</td>
      </tr>`
    )
    .join('');
  renderPaginacion(filas.length);
}

pag.addEventListener('click', (e) => {
  const btn = e.target.closest('.page-link');
  if (!btn || btn.classList.contains('disabled')) {return;}
  const pagina = Number(btn.dataset.page);
  if (!pagina || pagina === paginaActual) {return;}
  paginaActual = pagina;
  renderTabla();
});

async function buscar() {
  rows.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';
  const params = new URLSearchParams();
  if (desdeInput.value) {params.set('desde', desdeInput.value);}
  if (hastaInput.value) {params.set('hasta', hastaInput.value);}
  if (clienteSelect.value) {params.set('corporativoId', clienteSelect.value);}
  if (cuentaSelect.value) {params.set('cuentaId', cuentaSelect.value);}
  if (usuarioSelect.value) {params.set('usuarioId', usuarioSelect.value);}

  try {
    transacciones = await api.get(`/pagos?${params.toString()}`);
    paginaActual = 1;
    renderTabla();
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="8">No se pudieron cargar las transacciones (${escapeHtml(err.message)}).</td></tr>`;
  }
}

for (const el of [desdeInput, hastaInput, clienteSelect, cuentaSelect, usuarioSelect]) {
  el.addEventListener('change', buscar);
}
buscarTextoInput.addEventListener('input', () => {
  paginaActual = 1;
  renderTabla();
});

cargarFiltrosBase();
buscar();
