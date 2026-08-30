import { requireAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { escapeHtml, portRowCells } from '../lib/ports-table.js';

requireAuth();

const REFRESH_MS = 30000;

let puertos = [];
let soloCaidos = false;

const tbody = document.getElementById('tabla-monitoreo-body');
const indicador = document.getElementById('puertos-caidos-indicador');
const filtroBtn = document.getElementById('filtro-caidos-btn');

function renderTabla() {
  // Los puertos deshabilitados no se monitorean (ver PortsSyncService) --
  // no tiene sentido mostrarlos en la tabla de monitoreo en vivo.
  const activos = puertos.filter((p) => p.activo);
  const filas = soloCaidos ? activos.filter((p) => p.estadoActual === 'down') : activos;

  if (filas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Sin puertos para mostrar.</td></tr>';
    return;
  }

  tbody.innerHTML = filas
    .map(
      (p) => `
        <tr>
          <td>${
  p.corporativoId
    ? `<a class="cell-link" href="cliente.html?id=${p.corporativoId}&tab=trafico">${escapeHtml(p.corporativo ?? 'Sin corporativo')}</a>`
    : escapeHtml(p.corporativo ?? 'Sin corporativo')
}</td>
          ${portRowCells(p)}
        </tr>`
    )
    .join('');
}

function renderKpis(kpis) {
  document.getElementById('kpi-total-clientes').textContent = kpis.totalClientes;
  document.getElementById('kpi-puertos-caidos').textContent = kpis.puertosCaidos;
  document.getElementById('kpi-ingresos-mes-pen').textContent = kpis.ingresosMesPen.toLocaleString('es-PE', {
    style: 'currency',
    currency: 'PEN'
  });
  document.getElementById('kpi-ingresos-mes-usd').textContent = kpis.ingresosMesUsd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  });
  document.getElementById('kpi-ingresos-mes-periodo').textContent = kpis.ingresosMesEtiqueta;
  document.getElementById('kpi-ingresos-mes-periodo-usd').textContent = kpis.ingresosMesEtiqueta;

  if (kpis.puertosCaidos > 0) {
    indicador.textContent = `${kpis.puertosCaidos} puerto${kpis.puertosCaidos === 1 ? '' : 's'} caido${kpis.puertosCaidos === 1 ? '' : 's'}`;
    indicador.style.display = '';
  } else {
    indicador.style.display = 'none';
  }
}

async function cargar() {
  const [kpis, listaPuertos] = await Promise.all([api.get('/dashboard/kpis'), api.get('/ports')]);
  puertos = listaPuertos;
  renderKpis(kpis);
  renderTabla();
}

filtroBtn.addEventListener('click', () => {
  soloCaidos = !soloCaidos;
  filtroBtn.setAttribute('aria-pressed', String(soloCaidos));
  filtroBtn.classList.toggle('active', soloCaidos);
  renderTabla();
});

cargar().catch(() => {
  tbody.innerHTML = '<tr><td colspan="5">No se pudo conectar con la API.</td></tr>';
});

setInterval(() => {
  cargar().catch(() => {});
}, REFRESH_MS);
