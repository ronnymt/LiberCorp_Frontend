import { requireAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { getCacheado } from '../lib/api-cache.js';
import { showToast } from '../v4/toast.js';
import { escapeHtml } from '../lib/ports-table.js';

requireAuth();

const clientesChecks = document.getElementById('dg-clientes-checks');
const selectAllCheck = document.getElementById('dg-select-all');
const buscarClienteInput = document.getElementById('dg-buscar-cliente');
const filtroPagoSelect = document.getElementById('dg-filtro-pago');
const desdeInput = document.getElementById('dg-desde');
const hastaInput = document.getElementById('dg-hasta');
const descargarBtn = document.getElementById('dg-descargar');
const estadoEl = document.getElementById('dg-estado');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

desdeInput.value = mesActual();
hastaInput.value = mesActual();

function clienteChecks() {
  return [...clientesChecks.querySelectorAll('.dg-cliente-check')];
}

/** "Seleccionar todos" refleja el estado de los checks individuales -- marcado si estan todos, tachado (indeterminate) si solo algunos, vacio si ninguno. */
function sincronizarSelectAll() {
  const checks = clienteChecks();
  const marcados = checks.filter((c) => c.checked).length;
  selectAllCheck.checked = checks.length > 0 && marcados === checks.length;
  selectAllCheck.indeterminate = marcados > 0 && marcados < checks.length;
}

async function cargarClientes() {
  try {
    const clientes = await getCacheado('/corporativos');
    clientesChecks.innerHTML = clientes
      .map(
        (c) => `
        <label class="dg-cliente-row" style="display:flex;align-items:center;gap:8px;padding:6px 4px">
          <input type="checkbox" class="dg-cliente-check" value="${c.id}" data-nombre="${escapeHtml(c.nombre.toLowerCase())}" data-pendiente="${Number(c.boletasPendientes) > 0}" checked style="width:auto">
          ${escapeHtml(c.nombre)}
        </label>`
      )
      .join('');
    sincronizarSelectAll();
  } catch (err) {
    clientesChecks.innerHTML = `<p style="color:var(--text-muted);font-size:12.5px;padding:8px 4px">No se pudieron cargar los clientes (${escapeHtml(err.message)}).</p>`;
  }
}

selectAllCheck.addEventListener('change', () => {
  const marcar = selectAllCheck.checked;
  clienteChecks().forEach((c) => {
    if (!c.closest('.dg-cliente-row').hidden) {c.checked = marcar;}
  });
  sincronizarSelectAll();
});

clientesChecks.addEventListener('change', (e) => {
  if (e.target.classList.contains('dg-cliente-check')) {sincronizarSelectAll();}
});

/**
 * Combina busqueda por texto + filtro de estado de pago -- ambos ocultan
 * filas, no desmarcan (asi no se pierde la seleccion si el usuario cambia
 * de filtro y vuelve). La fila (`.dg-cliente-row`) trae `style="display:flex;..."`
 * inline (para el layout del checkbox+nombre) -- una especificidad mas alta
 * que la regla `[hidden]{display:none}` del navegador, asi que poner
 * `row.hidden=true` NO la ocultaba visualmente (mismo patron de bug ya
 * encontrado antes con `.btn[hidden]`, ver memoria del proyecto). Por eso
 * se fuerza `style.display` a mano ademas de `hidden` (que se deja para que
 * `sincronizarSelectAll` lo siga usando para saber que filas estan visibles).
 */
function aplicarFiltros() {
  const q = buscarClienteInput.value.trim().toLowerCase();
  const filtroPago = filtroPagoSelect.value;
  clienteChecks().forEach((c) => {
    const coincideTexto = !q || c.dataset.nombre.includes(q);
    const pendiente = c.dataset.pendiente === 'true';
    const coincidePago = filtroPago === 'todos' || (filtroPago === 'pendiente' && pendiente) || (filtroPago === 'al-dia' && !pendiente);
    const visible = coincideTexto && coincidePago;
    const row = c.closest('.dg-cliente-row');
    row.hidden = !visible;
    row.style.display = visible ? 'flex' : 'none';
  });
}

buscarClienteInput.addEventListener('input', aplicarFiltros);
filtroPagoSelect.addEventListener('change', aplicarFiltros);

/** "Cliente-MesAño-Puerto" (cliente primero para que se ordenen/agrupen juntos al organizar), sin caracteres invalidos para nombre de archivo (Windows/macOS/Linux). */
function nombreArchivo(periodo, puerto, corporativo) {
  const [year, month] = periodo.slice(0, 7).split('-');
  const mesAnio = `${MESES[Number(month) - 1]}${year}`;
  const limpiar = (s) => s.replace(/[\\/:*?"<>|]/g, '-').trim();
  return `${limpiar(corporativo)}-${limpiar(mesAnio)}-${limpiar(puerto)}`;
}

/** Convierte el SVG archivado a PNG via canvas -- mismo enfoque que "Descargar imagen" en el tab Trafico del perfil de cliente. */
function svgAPngBlob(svg) {
  return new Promise((resolve, reject) => {
    const b64 = btoa(unescape(encodeURIComponent(svg)));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 980;
      canvas.height = img.naturalHeight || 300;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), 'image/png');
    };
    img.onerror = () => reject(new Error('No se pudo cargar la grafica'));
    img.src = `data:image/svg+xml;base64,${b64}`;
  });
}

descargarBtn.addEventListener('click', async () => {
  if (!desdeInput.value || !hastaInput.value) {
    showToast('Elige mes desde y hasta', { variant: 'error' });
    return;
  }
  if (desdeInput.value > hastaInput.value) {
    showToast('El mes "desde" no puede ser posterior a "hasta"', { variant: 'error' });
    return;
  }

  const clientesIds = clienteChecks()
    .filter((c) => c.checked)
    .map((c) => c.value);
  if (clientesIds.length === 0) {
    showToast('Selecciona al menos un cliente', { variant: 'error' });
    return;
  }
  const params = new URLSearchParams({ desde: `${desdeInput.value}-01`, hasta: `${hastaInput.value}-01`, corporativoIds: clientesIds.join(',') });

  descargarBtn.disabled = true;
  estadoEl.textContent = 'Buscando graficas...';
  try {
    const filas = await api.get(`/reportes/graficas?${params.toString()}`);
    if (filas.length === 0) {
      showToast('No hay graficas archivadas para ese rango/clientes', { variant: 'error' });
      return;
    }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const nombresUsados = new Map();

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      estadoEl.textContent = `Generando ${i + 1} de ${filas.length}...`;
      let nombre = nombreArchivo(f.periodo, f.puerto, f.corporativo);
      const veces = nombresUsados.get(nombre) ?? 0;
      nombresUsados.set(nombre, veces + 1);
      if (veces > 0) {nombre = `${nombre}-${veces + 1}`;}
      try {
        const blob = await svgAPngBlob(f.svgGrafica);
        zip.file(`${nombre}.png`, blob);
      } catch {
        // una grafica puntual con SVG invalido no debe tumbar el resto del zip
      }
    }

    estadoEl.textContent = 'Comprimiendo...';
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `graficas_${desdeInput.value}_${hastaInput.value}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    estadoEl.textContent = `Listo: ${filas.length} grafica(s) descargadas.`;
    showToast('ZIP generado', { variant: 'success' });
  } catch (err) {
    showToast(err.message || 'No se pudo generar el ZIP', { variant: 'error' });
    estadoEl.textContent = '';
  } finally {
    descargarBtn.disabled = false;
  }
});

cargarClientes();
