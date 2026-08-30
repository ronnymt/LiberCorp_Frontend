import { requireAuth, tienePermiso } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { getCacheado } from '../lib/api-cache.js';
import { showToast } from '../v4/toast.js';
import { showModal } from '../v4/modal.js';
import { escapeHtml } from '../lib/ports-table.js';
import { fmtMonto } from '../lib/format.js';

requireAuth();

// ===================== Combo de reportes =====================
// Catalogo estatico (mismo criterio que PLANTILLAS en editor-mensajes.js) --
// no hay un endpoint de "catalogo de reportes" en el backend, asi que no
// tiene sentido fingir uno. Para agregar un reporte nuevo: una entrada aca +
// su <div class="filtro-set">/<div class="resultado-set"> en el HTML + su
// logica de buscar/descargar mas abajo.
const REPORTES = {
  'deuda-mensual': 'Lista a todos los corporativos activos con su saldo pendiente mes a mes.',
  'ingresos-fecha': 'Total cobrado (todos los clientes) agrupado por dia, dentro de un rango de fechas.',
  'deuda-cliente': 'Detalle de facturacion de UN cliente para UN mes, organizado por puerto.',
  'pagos-cliente': 'Todos los pagos registrados de UN cliente dentro de un rango de meses.'
};

const reporteSelect = document.getElementById('reporte-select');
const reporteDesc = document.getElementById('reporte-desc');

function mostrarReporte(valor) {
  reporteDesc.textContent = REPORTES[valor] ?? '';
  document.querySelectorAll('.filtro-set').forEach((el) => { el.hidden = el.dataset.set !== valor; });
  document.querySelectorAll('.resultado-set').forEach((el) => { el.hidden = el.dataset.set !== valor; });
}
reporteSelect.addEventListener('change', () => mostrarReporte(reporteSelect.value));

/** Deshabilita `btn` y le cambia el texto mientras corre `fn` -- mismo estado de carga en los 3 reportes (Buscar) y en cada boton de descarga (no bloquea los demas botones de la fila). */
async function conEstadoCarga(btn, textoCarga, fn) {
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = textoCarga;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

// ===================== Reporte 1: Deuda mensual por cliente =====================

const mesesSelect = document.getElementById('rg-meses');
const corporativoSelect = document.getElementById('rg-corporativo');
const monedaSelect = document.getElementById('rg-moneda');
const ordenSelect = document.getElementById('rg-orden');
const tipoPagoSelect = document.getElementById('rg-tipo-pago');
const estadoPendiente = document.getElementById('rg-estado-pendiente');
const estadoParcial = document.getElementById('rg-estado-parcial');
const estadoPagado = document.getElementById('rg-estado-pagado');
const generarBtn = document.getElementById('rg-generar');
const excelBtn = document.getElementById('rg-excel');
const encabezado = document.getElementById('rg-encabezado');
const filasBody = document.getElementById('rg-filas');

/** null si no se eligio ningun estado (el caller debe avisar -- omitir el parametro en el backend se interpreta como "todos", justo lo contrario de "ninguno"). */
function estadosSeleccionados() {
  const elegidos = [
    estadoPendiente.checked ? 'pendiente' : null,
    estadoParcial.checked ? 'parcial' : null,
    estadoPagado.checked ? 'pagado' : null
  ].filter(Boolean);
  return elegidos.length > 0 ? elegidos : null;
}

function armarParamsDeudaMensual() {
  const estados = estadosSeleccionados();
  const params = new URLSearchParams({ meses: mesesSelect.value, ordenarPor: ordenSelect.value });
  if (corporativoSelect.value) {params.set('corporativoId', corporativoSelect.value);}
  if (monedaSelect.value) {params.set('moneda', monedaSelect.value);}
  if (tipoPagoSelect.value) {params.set('tipoCobro', tipoPagoSelect.value);}
  if (estados) {params.set('estados', estados.join(','));}
  return params;
}

function fmtColumnaMes(periodo) {
  const [year, month] = periodo.slice(0, 7).split('-');
  const texto = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function renderTablaDeudaMensual(reporte) {
  encabezado.innerHTML =
    '<th>Cliente</th>' +
    reporte.periodos.map((p) => `<th${p === reporte.periodoActual ? ' title="Mes en curso -- todavia puede cambiar"' : ''}>${escapeHtml(fmtColumnaMes(p))}${p === reporte.periodoActual ? ' *' : ''}</th>`).join('') +
    '<th>Total general</th>';

  if (reporte.filas.length === 0) {
    filasBody.innerHTML = `<tr><td colspan="${reporte.periodos.length + 2}">Sin resultados para estos filtros.</td></tr>`;
    excelBtn.disabled = true;
    return;
  }

  filasBody.innerHTML = reporte.filas
    .map((fila) => {
      const celdas = reporte.periodos
        .map((p) => {
          const celda = fila.celdas[p];
          if (!celda) {return '<td class="cell-mono">-</td>';}
          const simbolo = celda.moneda === 'USD' ? '$' : 'S/';
          return `<td class="cell-mono">${simbolo} ${fmtMonto(celda.saldo)}</td>`;
        })
        .join('');
      return `
        <tr>
          <td class="cell-strong">${escapeHtml(fila.corporativo)}</td>
          ${celdas}
          <td class="cell-mono cell-strong">${fmtMonto(fila.totalGeneral)}</td>
        </tr>`;
    })
    .join('');
  if (tienePermiso('reportes.exportar')) {excelBtn.disabled = false; excelBtn.removeAttribute('title');}
}

async function generarDeudaMensual() {
  if (!estadosSeleccionados()) {
    showToast('Elige al menos un estado de pago', { variant: 'error' });
    return;
  }
  excelBtn.disabled = true;
  filasBody.innerHTML = '<tr><td colspan="20">Buscando...</td></tr>';
  await conEstadoCarga(generarBtn, 'Buscando...', async () => {
    try {
      const reporte = await api.get(`/reportes/deuda-mensual?${armarParamsDeudaMensual().toString()}`);
      renderTablaDeudaMensual(reporte);
    } catch (err) {
      filasBody.innerHTML = `<tr><td colspan="20">No se pudo generar el reporte (${escapeHtml(err.message)}).</td></tr>`;
    }
  });
}

generarBtn.addEventListener('click', generarDeudaMensual);
excelBtn.addEventListener('click', () => {
  if (!estadosSeleccionados()) {
    showToast('Elige al menos un estado de pago', { variant: 'error' });
    return;
  }
  conEstadoCarga(excelBtn, 'Generando...', () =>
    api
      .download(`/reportes/deuda-mensual/excel?${armarParamsDeudaMensual().toString()}`, `deuda-mensual_${mesesSelect.value}meses.xlsx`)
      .catch((err) => showToast(err.message || 'No se pudo descargar el reporte', { variant: 'error' })));
});

// ===================== Reporte 2: Ingresos por fecha =====================

const ingresosDesde = document.getElementById('ingresos-desde');
const ingresosHasta = document.getElementById('ingresos-hasta');
const ingresosRows = document.getElementById('ingresos-rows');
const ingresosTotalRango = document.getElementById('ingresos-total-rango');
const ingresosBuscarBtn = document.getElementById('ingresos-buscar');
const ingresosExcelBtn = document.getElementById('ingresos-excel');
const ingresosPdfBtn = document.getElementById('ingresos-pdf');

function hace30Dias() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function validarRangoFechas(desdeEl, hastaEl) {
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

async function buscarIngresos() {
  if (!validarRangoFechas(ingresosDesde, ingresosHasta)) {return;}
  ingresosExcelBtn.disabled = true;
  ingresosPdfBtn.disabled = true;
  ingresosRows.innerHTML = '<tr><td colspan="4">Buscando...</td></tr>';
  ingresosTotalRango.textContent = '-';
  await conEstadoCarga(ingresosBuscarBtn, 'Buscando...', async () => {
    const params = new URLSearchParams({ desde: ingresosDesde.value, hasta: ingresosHasta.value });
    try {
      const filas = await api.get(`/reportes/ingresos?${params.toString()}`);
      if (filas.length === 0) {
        ingresosRows.innerHTML = '<tr><td colspan="4">Sin pagos registrados en este rango.</td></tr>';
        return;
      }
      ingresosRows.innerHTML = filas
        .map(
          (f) => `
          <tr>
            <td>${escapeHtml(f.fecha)}</td>
            <td>${escapeHtml(f.moneda)}</td>
            <td>${escapeHtml(f.moneda)} ${fmtMonto(f.total)}</td>
            <td>${f.cantidadPagos}</td>
          </tr>`
        )
        .join('');

      const totalesPorMoneda = new Map();
      for (const f of filas) {
        totalesPorMoneda.set(f.moneda, (totalesPorMoneda.get(f.moneda) ?? 0) + Number(f.total));
      }
      ingresosTotalRango.textContent = Array.from(totalesPorMoneda.entries())
        .map(([moneda, total]) => `${moneda} ${fmtMonto(total)}`)
        .join(' · ');
      if (tienePermiso('reportes.exportar')) {
        ingresosExcelBtn.disabled = false;
        ingresosExcelBtn.removeAttribute('title');
        ingresosPdfBtn.disabled = false;
        ingresosPdfBtn.removeAttribute('title');
      }
    } catch (err) {
      ingresosRows.innerHTML = `<tr><td colspan="4">No se pudo cargar el reporte (${escapeHtml(err.message)}).</td></tr>`;
    }
  });
}

ingresosBuscarBtn.addEventListener('click', buscarIngresos);
ingresosExcelBtn.addEventListener('click', () => {
  if (!validarRangoFechas(ingresosDesde, ingresosHasta)) {return;}
  const params = new URLSearchParams({ desde: ingresosDesde.value, hasta: ingresosHasta.value });
  conEstadoCarga(ingresosExcelBtn, 'Generando...', () =>
    api.download(`/reportes/ingresos/excel?${params.toString()}`, `ingresos_${ingresosDesde.value}_${ingresosHasta.value}.xlsx`)
      .catch((err) => showToast(err.message || 'No se pudo descargar el reporte', { variant: 'error' })));
});
ingresosPdfBtn.addEventListener('click', () => {
  if (!validarRangoFechas(ingresosDesde, ingresosHasta)) {return;}
  const params = new URLSearchParams({ desde: ingresosDesde.value, hasta: ingresosHasta.value });
  conEstadoCarga(ingresosPdfBtn, 'Generando...', () =>
    api.download(`/reportes/ingresos/pdf?${params.toString()}`, `ingresos_${ingresosDesde.value}_${ingresosHasta.value}.pdf`)
      .catch((err) => showToast(err.message || 'No se pudo descargar el reporte', { variant: 'error' })));
});

// ===================== Reporte 3: Reporte de deuda por cliente (mes unico) =====================

const deudaCorporativo = document.getElementById('deuda-corporativo');
const deudaPeriodo = document.getElementById('deuda-periodo');
const deudaPreview = document.getElementById('deuda-preview');
const deudaBuscarBtn = document.getElementById('deuda-buscar');
const deudaPdfBtn = document.getElementById('deuda-pdf');

function mesActualMenosUno() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** El PDF de un mes que todavia no termino se sigue recalculando dia a dia (mismo criterio que BoletasService.esEnProgreso en el backend) -- avisa antes de descargar, no bloquea (el usuario puede querer un adelanto igual). */
function esMesEnCurso(periodoMensual) {
  return periodoMensual === mesActual();
}

function confirmarDescargaDeudaEnCurso(onConfirmar) {
  showModal({
    title: 'El mes todavia no termino',
    body: '<p>El periodo elegido es el mes en curso: el consumo se sigue midiendo dia a dia hasta que termine, asi que este PDF va a quedar <strong>desactualizado</strong> apenas haya mas trafico o se corrija algun percentil. ¿Descargar de todos modos?</p>',
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      { label: 'Descargar de todos modos', variant: 'primary', action: onConfirmar }
    ]
  });
}

function validarDeuda() {
  if (!deudaCorporativo.value) {
    showToast('Elige un cliente', { variant: 'error' });
    return false;
  }
  if (!deudaPeriodo.value) {
    showToast('Elige un mes', { variant: 'error' });
    return false;
  }
  return true;
}

async function buscarDeuda() {
  if (!validarDeuda()) {return;}
  deudaPdfBtn.disabled = true;
  deudaPreview.innerHTML = '<p style="color:var(--text-muted)">Buscando...</p>';
  await conEstadoCarga(deudaBuscarBtn, 'Buscando...', async () => {
    const params = new URLSearchParams({ corporativoId: deudaCorporativo.value, periodo: `${deudaPeriodo.value}-01` });
    try {
      const reporte = await api.get(`/reportes/deuda?${params.toString()}`);
      if (reporte.puertos.length === 0) {
        const urlConsumo = `cliente.html?id=${encodeURIComponent(deudaCorporativo.value)}&tab=trafico&periodo=${encodeURIComponent(deudaPeriodo.value)}`;
        deudaPreview.innerHTML = `
          <p style="color:var(--text-muted)">No hay boleta calculada para ${escapeHtml(reporte.periodoTexto)}.</p>
          <a href="${escapeHtml(urlConsumo)}" class="btn btn-primary btn-sm" style="margin-top:8px">Calcular en Consumo &rarr;</a>`;
        return;
      }
      const filas = reporte.puertos
        .map(
          (p) => `
          <tr>
            <td class="cell-strong">${p.librenmsUrl ? `<a href="${escapeHtml(p.librenmsUrl)}" target="_blank" rel="noreferrer">${escapeHtml(p.puerto)}</a>` : escapeHtml(p.puerto)}</td>
            <td>${escapeHtml(p.precioTexto)}</td>
            <td>${escapeHtml(p.consumoTexto)}</td>
            <td>$${fmtMonto(p.costoUsd)}</td>
            <td>S/ ${fmtMonto(p.costoPen)}</td>
          </tr>`
        )
        .join('');
      deudaPreview.innerHTML = `
        <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:8px">
          ${escapeHtml(reporte.corporativo)} · ${escapeHtml(reporte.periodoTexto)}${reporte.tipoCambio ? ` · Tipo de cambio: S/ ${reporte.tipoCambio.toFixed(2)}` : ' · Sin tipo de cambio registrado para este periodo'}
        </p>
        ${
  esMesEnCurso(deudaPeriodo.value)
    ? '<p class="status status-blue" style="margin-bottom:8px">Mes en curso — estos valores todavia pueden cambiar hasta que termine</p>'
    : ''
}
        <div class="table-responsive">
          <table class="table">
            <thead><tr><th>Puerto</th><th>Precio</th><th>Consumo (95th Out)</th><th>Costo (USD)</th><th>Costo (S/)</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
        <p style="margin-top:8px"><strong>Total acumulado:</strong> $${fmtMonto(reporte.totalUsd)} · S/ ${fmtMonto(reporte.totalPen)}</p>`;
      if (tienePermiso('reportes.exportar')) {deudaPdfBtn.disabled = false; deudaPdfBtn.removeAttribute('title');}
    } catch (err) {
      deudaPreview.innerHTML = `<p>No se pudo cargar el reporte (${escapeHtml(err.message)}).</p>`;
    }
  });
}

function descargarDeudaPdf() {
  const params = new URLSearchParams({ corporativoId: deudaCorporativo.value, periodo: `${deudaPeriodo.value}-01` });
  return conEstadoCarga(deudaPdfBtn, 'Generando...', () =>
    api.download(`/reportes/deuda/pdf?${params.toString()}`, `deuda_${deudaCorporativo.options[deudaCorporativo.selectedIndex].text}_${deudaPeriodo.value}.pdf`)
      .catch((err) => showToast(err.message || 'No se pudo descargar el reporte', { variant: 'error' })));
}

deudaBuscarBtn.addEventListener('click', buscarDeuda);
deudaPdfBtn.addEventListener('click', () => {
  if (!validarDeuda()) {return;}
  if (esMesEnCurso(deudaPeriodo.value)) {
    confirmarDescargaDeudaEnCurso(descargarDeudaPdf);
    return;
  }
  descargarDeudaPdf();
});

// ===================== Reporte 4: Pagos por cliente =====================

const pcCorporativo = document.getElementById('pc-corporativo');
const pcDesde = document.getElementById('pc-desde');
const pcHasta = document.getElementById('pc-hasta');
const pcEncabezado = document.getElementById('pc-encabezado');
const pcRows = document.getElementById('pc-rows');
const pcTotalRango = document.getElementById('pc-total-rango');
const pcBuscarBtn = document.getElementById('pc-buscar');
const pcExcelBtn = document.getElementById('pc-excel');
const pcPdfBtn = document.getElementById('pc-pdf');

function pcEsPorPuerto() {
  return document.querySelector('input[name="pc-alcance"]:checked').value === 'puerto';
}

/** "YYYY-MM" -> primer dia de ese mes ("YYYY-MM-01"), formato que espera el backend (parsearRango). */
function primerDiaDeMes(mesInput) {
  return `${mesInput}-01`;
}

/** "YYYY-MM" -> ultimo dia real de ese mes (28-31 segun corresponda). */
function ultimoDiaDeMes(mesInput) {
  const [year, month] = mesInput.split('-').map(Number);
  const ultimoDia = new Date(year, month, 0).getDate();
  return `${mesInput}-${String(ultimoDia).padStart(2, '0')}`;
}

function armarParamsPagosCliente() {
  return new URLSearchParams({
    corporativoId: pcCorporativo.value,
    porPuerto: String(pcEsPorPuerto()),
    desde: primerDiaDeMes(pcDesde.value),
    hasta: ultimoDiaDeMes(pcHasta.value)
  });
}

function validarPagosCliente() {
  if (!pcCorporativo.value) {
    showToast('Elige un cliente', { variant: 'error' });
    return false;
  }
  if (!pcDesde.value || !pcHasta.value) {
    showToast('Elige mes desde y hasta', { variant: 'error' });
    return false;
  }
  if (pcDesde.value > pcHasta.value) {
    showToast('El mes "desde" no puede ser posterior a "hasta"', { variant: 'error' });
    return false;
  }
  return true;
}

/** Celda con una sola moneda: "PEN 123.45". Con varias (raro): "PEN 123.45 / USD 10.00". Sin pagos ese mes: "-" (pedido explicito del usuario, nunca una celda vacia). */
function celdaPagosClienteTexto(celda) {
  if (!celda || Object.keys(celda).length === 0) {return '-';}
  return Object.entries(celda)
    .map(([moneda, monto]) => `${moneda} ${fmtMonto(monto)}`)
    .join(' / ');
}

/**
 * Matriz mes-por-columna, igual criterio visual que "Deuda mensual general":
 * modo "cliente" = 1 sola fila (el cliente, sumando todos sus puertos); modo
 * "puerto" = 1 fila por cada puerto del cliente (incluye los que no tuvieron
 * ningun pago en el rango -- todas sus celdas salen "-"). La columna de un
 * pago es el PERIODO facturado, no la fecha en que se pago -- eso ya lo
 * resuelve el backend.
 */
function renderResultadoPagosCliente(reporte) {
  pcEncabezado.innerHTML = `<th>${pcEsPorPuerto() ? 'Puerto' : 'Cliente'}</th>${reporte.periodos.map((p) => `<th>${escapeHtml(fmtColumnaMes(p))}</th>`).join('')}`;

  if (reporte.filas.length === 0) {
    pcRows.innerHTML = `<tr><td colspan="${reporte.periodos.length + 1}">Este cliente no tiene puertos.</td></tr>`;
    return;
  }

  pcRows.innerHTML = reporte.filas
    .map((fila) => {
      const celdas = reporte.periodos.map((p) => `<td class="cell-mono">${escapeHtml(celdaPagosClienteTexto(fila.celdas[p]))}</td>`).join('');
      return `<tr><td class="cell-strong">${escapeHtml(fila.etiqueta)}</td>${celdas}</tr>`;
    })
    .join('');
}

/** Suma TODAS las celdas de TODAS las filas y periodos, agrupado por moneda -- gran total del rango elegido, mostrado debajo de la tabla. */
function totalRangoPagosCliente(reporte) {
  const totales = {};
  for (const fila of reporte.filas) {
    for (const celda of Object.values(fila.celdas)) {
      for (const [moneda, monto] of Object.entries(celda)) {
        totales[moneda] = (totales[moneda] ?? 0) + monto;
      }
    }
  }
  const entradas = Object.entries(totales);
  return entradas.length ? entradas.map(([moneda, total]) => `${moneda} ${fmtMonto(total)}`).join(' · ') : '-';
}

async function buscarPagosCliente() {
  if (!validarPagosCliente()) {return;}
  pcExcelBtn.disabled = true;
  pcPdfBtn.disabled = true;
  pcRows.innerHTML = '<tr><td>Buscando...</td></tr>';
  pcTotalRango.textContent = '-';
  await conEstadoCarga(pcBuscarBtn, 'Buscando...', async () => {
    try {
      const reporte = await api.get(`/reportes/pagos-cliente?${armarParamsPagosCliente().toString()}`);
      renderResultadoPagosCliente(reporte);
      pcTotalRango.textContent = totalRangoPagosCliente(reporte);
      if (tienePermiso('reportes.exportar')) {
        pcExcelBtn.disabled = false;
        pcExcelBtn.removeAttribute('title');
        pcPdfBtn.disabled = false;
        pcPdfBtn.removeAttribute('title');
      }
    } catch (err) {
      pcRows.innerHTML = `<tr><td>No se pudo cargar el reporte (${escapeHtml(err.message)}).</td></tr>`;
    }
  });
}

pcBuscarBtn.addEventListener('click', buscarPagosCliente);
pcExcelBtn.addEventListener('click', () => {
  if (!validarPagosCliente()) {return;}
  const nombreCliente = pcCorporativo.options[pcCorporativo.selectedIndex].text;
  conEstadoCarga(pcExcelBtn, 'Generando...', () =>
    api.download(`/reportes/pagos-cliente/excel?${armarParamsPagosCliente().toString()}`, `pagos_${nombreCliente}_${pcDesde.value}_${pcHasta.value}.xlsx`)
      .catch((err) => showToast(err.message || 'No se pudo descargar el reporte', { variant: 'error' })));
});
pcPdfBtn.addEventListener('click', () => {
  if (!validarPagosCliente()) {return;}
  const nombreCliente = pcCorporativo.options[pcCorporativo.selectedIndex].text;
  conEstadoCarga(pcPdfBtn, 'Generando...', () =>
    api.download(`/reportes/pagos-cliente/pdf?${armarParamsPagosCliente().toString()}`, `pagos_${nombreCliente}_${pcDesde.value}_${pcHasta.value}.pdf`)
      .catch((err) => showToast(err.message || 'No se pudo descargar el reporte', { variant: 'error' })));
});

// ===================== Carga inicial =====================

async function cargarCorporativos() {
  try {
    const clientes = await getCacheado('/corporativos');
    const opciones = clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    corporativoSelect.innerHTML = '<option value="">Todos los clientes</option>' + opciones;
    deudaCorporativo.innerHTML = '<option value="">Elige un cliente</option>' + opciones;
    pcCorporativo.innerHTML = '<option value="">Elige un cliente</option>' + opciones;
  } catch {
    // si falla, los selects quedan solo con la opcion por defecto
  }
}

function aplicarPermisos() {
  if (tienePermiso('reportes.exportar')) {return;}
  for (const btn of [excelBtn, ingresosExcelBtn, ingresosPdfBtn, deudaPdfBtn, pcExcelBtn, pcPdfBtn]) {
    btn.disabled = true;
    btn.title = 'No tienes permiso para exportar reportes';
  }
}

async function init() {
  ingresosDesde.value = hace30Dias();
  ingresosHasta.value = hoy();
  deudaPeriodo.value = mesActualMenosUno();
  pcDesde.value = mesActualMenosUno();
  pcHasta.value = mesActual();

  mostrarReporte(reporteSelect.value);
  aplicarPermisos();

  // Independientes entre si (generarDeudaMensual no depende de las opciones de
  // corporativoSelect, solo de su .value que es "" hasta que el usuario elija) --
  // en paralelo en vez de secuencial ahorra una vuelta de red completa al cargar.
  await Promise.all([cargarCorporativos(), generarDeudaMensual()]);
}

init();
