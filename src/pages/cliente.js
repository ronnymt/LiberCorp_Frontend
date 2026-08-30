import { requireAuth, getUsuario } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { getCacheado, invalidarCache } from '../lib/api-cache.js';
import { showToast } from '../v4/toast.js';
import { showModal } from '../v4/modal.js';
import { escapeHtml, portRowCells, portNombreVisible } from '../lib/ports-table.js';
import { initConsumoTab } from '../v4/consumo-tab.js';
import { fmtMonto } from '../lib/format.js';

requireAuth();

const params = new URLSearchParams(window.location.search);
const clienteId = Number(params.get('id'));
// Deep-link directo a un tab/subtab (ej. desde "Ver pagos" en Facturacion/Clientes -> Facturacion > Transacciones).
const tabInicial = params.get('tab');
const subtabInicial = params.get('subtab');
const periodoInicialTrafico = params.get('periodo');

let cliente = null;

const ESTADO_CLS = { pendiente: 'status-red', parcial: 'status-yellow', pagado: 'status-green', vencido: 'status-red' };
const ESTADO_TEXTO = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado', vencido: 'Vencido' };
const TIPO_COBRO_TEXTO = { variable: 'Variable', fijo_parcial: 'Fijo parcial', fijo_total: 'Fijo total', libre: 'Libre' };

function fmtPeriodo(periodo) {
  const [year, month] = periodo.slice(0, 7).split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}

function fmtFecha(fecha) {
  if (!fecha) {return '-';}
  const [year, month, day] = fecha.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function fmtFechaHora(iso) {
  return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function iniciales(nombre) {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '--';
}

/** "vencido" no es un estado guardado -- lo calcula el backend (boleta.vencida) comparando fecha_vencimiento contra hoy. */
function estadoVisible(b) {
  return b.vencida ? 'vencido' : b.estado;
}

// ===================== Header / Resumen =====================

function renderHeader() {
  document.getElementById('cl-avatar').textContent = iniciales(cliente.nombre);
  document.getElementById('cl-nombre').textContent = cliente.nombre;
  document.getElementById('cl-id').textContent = `#${cliente.id}`;
  const estadoBadge = document.getElementById('cl-estado-badge');
  estadoBadge.className = `status ${cliente.activo ? 'status-brand' : 'status-muted'}`;
  estadoBadge.textContent = cliente.activo ? 'Activo' : 'Inactivo';
  document.getElementById('cl-tipo-cobro-badge').textContent = TIPO_COBRO_TEXTO[cliente.tipoCobro] ?? cliente.tipoCobro;

  const activoBtn = document.getElementById('cl-activo-btn');
  activoBtn.textContent = cliente.activo ? 'Deshabilitar cliente' : 'Habilitar cliente';
}

function renderResumen(totalPuertos) {
  document.getElementById('rs-titular').textContent = cliente.titular || '-';
  document.getElementById('rs-correo').textContent = cliente.correo || '-';
  document.getElementById('rs-celular').textContent = cliente.celular || '-';
  document.getElementById('rs-puertos').textContent = totalPuertos;
  document.getElementById('rs-tipo-cobro').textContent = TIPO_COBRO_TEXTO[cliente.tipoCobro] ?? cliente.tipoCobro;
  document.getElementById('rs-monto-fijo').textContent =
    cliente.tipoCobro === 'fijo_total' ? `${cliente.monedaFijo ?? 'PEN'} ${fmtMonto(cliente.montoFijoMensual ?? 0)}` : 'No aplica';
  document.getElementById('rs-dia-vencimiento').textContent = cliente.diaVencimiento ?? 'Usa el default global';
  document.getElementById('rs-dia-creacion').textContent = cliente.diaCreacionBoleta ?? 'Sin definir';
}

async function cargarCliente() {
  cliente = await api.get(`/corporativos/${clienteId}`);
  renderHeader();
}

// ===================== Servicios =====================

function tarifaTexto(t) {
  if (!t) {return '<span style="color:var(--text-muted)">Sin tarifa</span>';}
  const simbolo = t.moneda === 'USD' ? '$' : 'S/';
  const sufijo = t.tipoCobro === 'fijo' ? '/mes fijo' : '/Mbps';
  return `${simbolo} ${fmtMonto(t.valorTarifa)} ${sufijo} desde ${t.fechaDesde}`;
}

function tarifaTextoFijoTotal() {
  const simbolo = cliente.monedaFijo === 'USD' ? '$' : 'S/';
  return `${simbolo} ${fmtMonto(cliente.montoFijoMensual)} /mes fijo desde ${cliente.fechaDesdeFijo}`;
}

async function cargarPuertos() {
  const tbody = document.getElementById('sv-rows');
  try {
    const puertos = await api.get(`/corporativos/${clienteId}/puertos`);
    document.getElementById('rs-puertos').textContent = puertos.length;
    const esFijoTotal = cliente.tipoCobro === 'fijo_total';
    tbody.innerHTML = puertos.length
      ? puertos
        .map(
          (p) => `
            <tr>
              ${portRowCells(p)}
              <td>${esFijoTotal ? tarifaTextoFijoTotal() : tarifaTexto(p.tarifaVigente)}</td>
              <td style="white-space:nowrap">
                ${
  esFijoTotal
    ? '<button class="btn btn-outline btn-sm" disabled title="Cliente con cobro fijo total: el monto se edita en Configuracion">Bloqueado</button>'
    : `<button class="btn btn-outline btn-sm" data-editar-tarifa data-port-id="${p.id}" data-port-nombre="${escapeHtml(portNombreVisible(p))}" data-port-tipo-cobro="${p.tarifaVigente?.tipoCobro ?? 'variable'}">${p.tarifaVigente ? 'Cambiar tarifa' : 'Asignar tarifa'}</button>`
}
                <button class="btn btn-outline btn-sm" data-editar-alias data-port-id="${p.id}" data-port-nombre-tecnico="${escapeHtml(p.nombrePuerto)}" data-port-alias="${escapeHtml(p.alias ?? '')}">Alias</button>
                <button class="btn btn-outline btn-sm" data-toggle-activo-puerto data-port-id="${p.id}" data-port-activo="${p.activo}">${p.activo ? 'Deshabilitar' : 'Habilitar'}</button>
              </td>
            </tr>`
        )
        .join('')
      : '<tr><td colspan="6">Este cliente no tiene puertos vinculados.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">No se pudieron cargar los puertos (${escapeHtml(err.message)}).</td></tr>`;
  }
}

async function abrirModalTarifa(portId, portNombre, tipoCobroActual) {
  let tiposServicio = [];
  try {
    tiposServicio = await api.get('/tipos-servicio');
  } catch {
    // si falla, el select queda vacio; el usuario puede reintentar
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const modal = showModal({
    title: `Nueva tarifa — ${portNombre}`,
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="tp-tipo-cobro">Tipo de cobro</label>
          <select id="tp-tipo-cobro">
            <option value="variable" ${tipoCobroActual !== 'fijo' ? 'selected' : ''}>Variable (tarifa x Mbps medido)</option>
            <option value="fijo" ${tipoCobroActual === 'fijo' ? 'selected' : ''}>Fijo (monto mensual, sin importar el consumo)</option>
          </select>
        </div>
        <div class="modal-form-row">
          <label for="tp-valor" id="tp-valor-label">Valor por Mbps</label>
          <input type="number" id="tp-valor" step="0.0001" min="0" required>
        </div>
        <div class="modal-form-row">
          <label for="tp-moneda">Moneda</label>
          <select id="tp-moneda">
            <option value="PEN">PEN</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div class="modal-form-row">
          <label for="tp-tipo-servicio">Tipo de servicio</label>
          <select id="tp-tipo-servicio">
            ${tiposServicio.map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('')}
          </select>
        </div>
        <div class="modal-form-row">
          <label for="tp-fecha">Vigente desde</label>
          <input type="date" id="tp-fecha" value="${hoy}" required>
        </div>
      </form>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Guardar',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body, close }) => {
          const valorTarifa = body.querySelector('#tp-valor').value;
          const moneda = body.querySelector('#tp-moneda').value;
          const tipoCobro = body.querySelector('#tp-tipo-cobro').value;
          const tipoServicioId = Number(body.querySelector('#tp-tipo-servicio').value);
          const fechaDesde = body.querySelector('#tp-fecha').value;
          if (!valorTarifa || !fechaDesde || !tipoServicioId) {
            showToast('Completa valor, tipo de servicio y fecha', { variant: 'error' });
            return;
          }
          try {
            await api.post(`/tarifas/puertos/${portId}`, { valorTarifa, moneda, tipoCobro, tipoServicioId, fechaDesde });
            await api.patch(`/ports/${portId}/tipo-servicio`, { tipoServicioId });
            showToast('Tarifa guardada', { variant: 'success' });
            close();
            await cargarPuertos();
          } catch (err) {
            showToast(err.message || 'No se pudo guardar la tarifa', { variant: 'error' });
          }
        }
      }
    ]
  });

  const tipoCobroSelect = modal.body.querySelector('#tp-tipo-cobro');
  const valorLabel = modal.body.querySelector('#tp-valor-label');
  const actualizarLabel = () => {
    valorLabel.textContent = tipoCobroSelect.value === 'fijo' ? 'Valor mensual' : 'Valor por Mbps';
  };
  tipoCobroSelect.addEventListener('change', actualizarLabel);
  actualizarLabel();
}

function abrirModalAlias(portId, nombreTecnico, aliasActual) {
  showModal({
    title: `Alias de puerto — ${nombreTecnico}`,
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="al-alias">Alias</label>
          <input type="text" id="al-alias" maxlength="150" value="${escapeHtml(aliasActual ?? '')}" placeholder="${escapeHtml(nombreTecnico)}">
        </div>
      </form>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Guardar',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body, close }) => {
          const alias = body.querySelector('#al-alias').value.trim();
          try {
            await api.patch(`/ports/${portId}/alias`, { alias: alias || null });
            showToast('Alias guardado', { variant: 'success' });
            close();
            await cargarPuertos();
          } catch (err) {
            showToast(err.message || 'No se pudo guardar el alias', { variant: 'error' });
          }
        }
      }
    ]
  });
}

document.getElementById('sv-rows').addEventListener('click', async (e) => {
  const tarifaBtn = e.target.closest('[data-editar-tarifa]');
  const aliasBtn = e.target.closest('[data-editar-alias]');
  const activoBtn = e.target.closest('[data-toggle-activo-puerto]');
  if (tarifaBtn) {
    abrirModalTarifa(Number(tarifaBtn.dataset.portId), tarifaBtn.dataset.portNombre, tarifaBtn.dataset.portTipoCobro);
  } else if (aliasBtn) {
    abrirModalAlias(Number(aliasBtn.dataset.portId), aliasBtn.dataset.portNombreTecnico, aliasBtn.dataset.portAlias);
  } else if (activoBtn) {
    const activo = activoBtn.dataset.portActivo !== 'true';
    try {
      await api.patch(`/ports/${activoBtn.dataset.portId}/activo`, { activo });
      showToast(activo ? 'Puerto habilitado' : 'Puerto deshabilitado', { variant: 'success' });
      await cargarPuertos();
    } catch (err) {
      showToast(err.message || 'No se pudo cambiar el estado del puerto', { variant: 'error' });
    }
  }
});

// ===================== Facturacion: Facturas =====================

const FACTURAS_POR_PAGINA = 15;
let facturasTodas = [];
let facturasPaginaActual = 1;
/** Cache de los pagos ya cargados por boleta (boletaId -> Pago[]), para poder editar/eliminar sin volver a pedirlos al servidor. */
const pagosPorBoletaCache = new Map();
/** Igual que pagosPorBoletaCache pero para pagos por linea/puerto (detalleBoletaId -> Pago[]), clientes fijo_parcial o variable con 2+ puertos. */
const pagosPorLineaCache = new Map();

// Path del chevron apuntando a la derecha (cerrado) / hacia abajo (abierto).
// Se intercambia el "d" del SVG en vez de rotar via CSS `transform` -- mas
// robusto entre motores de renderizado que el rotate(90deg) sobre el icono.
const CHEVRON_CERRADO = 'M8.25 4.5l7.5 7.5-7.5 7.5';
const CHEVRON_ABIERTO = 'M4.5 8.25l7.5 7.5 7.5-7.5';

/**
 * Fila de una boleta. El desglose de pagos se despliega con click (queda
 * colapsado por defecto). "Registrar pago" a nivel de boleta solo aplica
 * cuando se paga contra el total (no por linea) y todavia falta saldo; para
 * clientes por linea, cada puerto tiene su propio "Registrar pago" DENTRO
 * del desglose, asi que ahi el desplegable siempre esta disponible (es el
 * unico camino para registrar un pago).
 */
function facturaRowHtml(b) {
  const saldo = Math.max(Number(b.montoTotal) - Number(b.montoPagado), 0);
  const estado = estadoVisible(b);
  const esFijoParcial = cliente.tipoCobro === 'fijo_parcial';
  const esPorLinea = esFijoParcial || (cliente.tipoCobro === 'variable' && b.totalLineas > 1);
  const fila = `
    <tr class="factura-row-expandable" data-toggle-pagos="${b.id}" tabindex="0" role="button" aria-label="Ver detalle de pagos">
      <td class="cell-strong" style="text-transform:capitalize">
        <span class="factura-expand-btn" data-toggle-pagos="${b.id}" aria-expanded="false">
          <svg class="factura-expand-icon" data-chevron-icon viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${CHEVRON_CERRADO}"/></svg>
        </span>${escapeHtml(fmtPeriodo(b.periodo))}
      </td>
      <td class="cell-mono">${fmtFecha(b.fechaCreacion)}</td>
      <td class="cell-mono">${fmtFecha(b.fechaVencimiento)}</td>
      <td class="cell-mono">${escapeHtml(b.moneda)} ${fmtMonto(b.montoTotal)}${b.montoTotalManual ? ` <span class="status status-yellow" title="${escapeHtml(b.motivoAjusteMonto ?? '')}">Manual</span>` : ''}</td>
      <td class="cell-mono">${escapeHtml(b.moneda)} ${fmtMonto(b.montoPagado)}</td>
      <td class="cell-mono">${fmtFecha(b.ultimaFechaPago)}</td>
      <td class="cell-mono">${escapeHtml(b.moneda)} ${fmtMonto(saldo)}</td>
      <td>
        <span class="status ${ESTADO_CLS[estado] ?? 'status-red'}">${ESTADO_TEXTO[estado] ?? escapeHtml(estado)}</span>
        ${b.enProgreso ? '<span class="status status-blue" title="El mes todavia no termino -- el consumo se sigue midiendo dia a dia. Se podra pagar/editar/eliminar recien cuando cierre.">En curso</span>' : ''}
      </td>
      <td style="white-space:nowrap">
        ${
  b.enProgreso
    ? '<span style="font-size:12px;color:var(--text-muted)">Se habilita al cerrar el mes</span>'
    : `
        ${
  !esPorLinea && estado !== 'pagado'
    ? `<button class="btn btn-primary btn-sm" data-pagar-boleta data-id="${b.id}" data-saldo="${saldo}" data-moneda="${b.moneda}">Registrar pago</button>`
    : ''
}
        <button class="btn btn-outline btn-sm" data-editar-boleta="${b.id}" title="Editar boleta">Editar</button>
        <button class="btn btn-outline btn-sm" data-eliminar-boleta="${b.id}" title="Eliminar boleta">Eliminar</button>`
}
      </td>
    </tr>`;
  return `${fila}<tr class="factura-pagos-row" data-pagos-row="${b.id}" hidden><td colspan="9"><div class="factura-pagos-list" data-pagos-list="${b.id}" data-por-linea="${esPorLinea}"></div></td></tr>`;
}

function pagoBoletaRowHtml(p, boletaId, saldoRestante) {
  return `
    <tr>
      <td>${fmtFechaHora(p.fechaPago)}</td>
      <td class="cell-mono">${escapeHtml(p.moneda)} ${fmtMonto(p.montoPagado)}</td>
      <td>${escapeHtml(p.cuenta?.nombreCuenta ?? '-')}</td>
      <td class="cell-mono">${escapeHtml(p.numeroOperacion ?? '-')}</td>
      <td class="cell-mono">${escapeHtml(p.moneda)} ${fmtMonto(saldoRestante)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" data-editar-pago="${p.id}" data-boleta-id="${boletaId}" title="Editar pago">Editar</button>
        <button class="btn btn-outline btn-sm" data-eliminar-pago="${p.id}" data-boleta-id="${boletaId}" title="Eliminar pago">Eliminar</button>
      </td>
    </tr>`;
}

/** Desglose de una boleta que se paga contra el total (variable con 1 puerto, o fijo_total). */
async function cargarListaPagosBoleta(boletaId) {
  const lista = document.querySelector(`[data-pagos-list="${boletaId}"]`);
  try {
    const boleta = facturasTodas.find((f) => f.id === boletaId);
    const montoTotal = Number(boleta?.montoTotal ?? 0);
    // La API devuelve los pagos mas recientes primero; para calcular el
    // saldo restante despues de CADA pago hace falta el orden cronologico.
    const pagos = (await api.get(`/pagos/boleta/${boletaId}`)).slice().reverse();
    pagosPorBoletaCache.set(boletaId, pagos);
    let acumulado = 0;
    const filas = pagos
      .map((p) => {
        acumulado += Number(p.montoPagado);
        return pagoBoletaRowHtml(p, boletaId, Math.max(montoTotal - acumulado, 0));
      })
      .join('');
    lista.innerHTML = pagos.length
      ? `
          <table class="pagos-mini-table">
            <thead><tr><th>Fecha</th><th>Monto pagado</th><th>Cuenta</th><th>N° operacion</th><th>Saldo restante</th><th></th></tr></thead>
            <tbody>${filas}</tbody>
          </table>`
      : '<p class="pagos-mini-empty">Todavia no hay pagos registrados para esta boleta.</p>';
  } catch (err) {
    lista.innerHTML = `<p class="pagos-mini-empty">No se pudieron cargar los pagos (${escapeHtml(err.message)}).</p>`;
  }
}

function pagoLineaRowHtml(p, detalleBoletaId, boletaId) {
  return `
    <tr>
      <td>${fmtFechaHora(p.fechaPago)}</td>
      <td class="cell-mono">${escapeHtml(p.moneda)} ${fmtMonto(p.montoPagado)}</td>
      <td>${escapeHtml(p.cuenta?.nombreCuenta ?? '-')}</td>
      <td class="cell-mono">${escapeHtml(p.numeroOperacion ?? '-')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" data-editar-pago-linea="${p.id}" data-detalle-id="${detalleBoletaId}" data-boleta-id="${boletaId}" title="Editar pago">Editar</button>
        <button class="btn btn-outline btn-sm" data-eliminar-pago-linea="${p.id}" data-detalle-id="${detalleBoletaId}" data-boleta-id="${boletaId}" title="Eliminar pago">Eliminar</button>
      </td>
    </tr>`;
}

function lineaConPagosHtml(l, pagos, boletaId, boletaEnProgreso) {
  const saldo = Number(l.subtotal) - Number(l.montoPagado);
  const filaPuerto = `
    <tr>
      <td>${escapeHtml(l.port?.alias || l.port?.nombrePuerto || 'Puerto')}</td>
      <td class="cell-mono">${escapeHtml(l.moneda)} ${fmtMonto(l.subtotal)}</td>
      <td class="cell-mono">${escapeHtml(l.moneda)} ${fmtMonto(l.montoPagado)}</td>
      <td class="cell-mono">${fmtFecha(l.ultimaFechaPago)}</td>
      <td><span class="status ${ESTADO_CLS[l.estadoPago] ?? 'status-red'}">${escapeHtml(l.estadoPago)}</span></td>
      <td>${l.estadoPago === 'pagado' || boletaEnProgreso ? '' : `<button class="btn btn-primary btn-sm" data-pagar-linea data-id="${l.id}" data-saldo="${saldo}" data-moneda="${l.moneda}" data-boleta-id="${boletaId}">Registrar pago</button>`}</td>
    </tr>`;
  const filaPagos = pagos.length
    ? `<tr><td colspan="6" style="padding-left:20px">
          <table class="pagos-mini-table">
            <thead><tr><th>Fecha</th><th>Monto pagado</th><th>Cuenta</th><th>N° operacion</th><th></th></tr></thead>
            <tbody>${pagos.map((p) => pagoLineaRowHtml(p, l.id, boletaId)).join('')}</tbody>
          </table>
        </td></tr>`
    : '';
  return filaPuerto + filaPagos;
}

/** Desglose de una boleta que se paga por linea/puerto (fijo_parcial, o variable con 2+ puertos). */
function pagoDirectoLegadoRowHtml(p, boletaId) {
  return `
    <tr>
      <td>${fmtFechaHora(p.fechaPago)}</td>
      <td class="cell-mono">${escapeHtml(p.moneda)} ${fmtMonto(p.montoPagado)}</td>
      <td>${escapeHtml(p.cuenta?.nombreCuenta ?? '-')}</td>
      <td class="cell-mono">${escapeHtml(p.numeroOperacion ?? '-')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" data-editar-pago="${p.id}" data-boleta-id="${boletaId}" title="Editar pago">Editar</button>
        <button class="btn btn-outline btn-sm" data-eliminar-pago="${p.id}" data-boleta-id="${boletaId}" title="Eliminar pago">Eliminar</button>
      </td>
    </tr>`;
}

async function cargarDetalleLineasBoleta(boletaId) {
  const lista = document.querySelector(`[data-pagos-list="${boletaId}"]`);
  const boletaEnProgreso = facturasTodas.find((f) => f.id === boletaId)?.enProgreso ?? false;
  try {
    // Un cliente puede haber pasado de pagar contra el total (1 puerto) a
    // pagar por linea (2+ puertos) despues de que LibreNMS le agrego otro
    // bill -- los pagos viejos siguen colgados de boletaId, no de una linea,
    // asi que hay que mostrarlos aparte para poder editarlos/eliminarlos
    // (si no, quedan "invisibles": la boleta los cuenta en su total pagado
    // pero ninguna linea los refleja).
    const [lineas, pagosDirectos] = await Promise.all([api.get(`/boletas/${boletaId}/detalle`), api.get(`/pagos/boleta/${boletaId}`)]);
    if (pagosDirectos.length) {pagosPorBoletaCache.set(boletaId, pagosDirectos);}
    const lineasConPagos = await Promise.all(
      lineas.map(async (l) => {
        if (Number(l.montoPagado) <= 0) {return { linea: l, pagos: [] };}
        const pagos = await api.get(`/pagos/detalle/${l.id}`);
        pagosPorLineaCache.set(l.id, pagos);
        return { linea: l, pagos };
      })
    );
    const seccionDirectos = pagosDirectos.length
      ? `<p style="font-size:12px;color:var(--text-muted);margin:0 0 6px">Pagos registrados directo contra la boleta (de antes de que este cliente pasara a pago por puerto):</p>
          <table class="pagos-mini-table" style="margin-bottom:12px">
            <thead><tr><th>Fecha</th><th>Monto pagado</th><th>Cuenta</th><th>N° operacion</th><th></th></tr></thead>
            <tbody>${pagosDirectos.map((p) => pagoDirectoLegadoRowHtml(p, boletaId)).join('')}</tbody>
          </table>`
      : '';
    lista.innerHTML =
      seccionDirectos +
      (lineasConPagos.length
        ? `
          <table class="pagos-mini-table">
            <thead><tr><th>Puerto</th><th>Subtotal</th><th>Pagado</th><th>Fecha de pago</th><th>Estado</th><th></th></tr></thead>
            <tbody>${lineasConPagos.map(({ linea, pagos }) => lineaConPagosHtml(linea, pagos, boletaId, boletaEnProgreso)).join('')}</tbody>
          </table>`
        : '<p class="pagos-mini-empty">Esta boleta no tiene lineas de detalle.</p>');
  } catch (err) {
    lista.innerHTML = `<p class="pagos-mini-empty">No se pudieron cargar los puertos (${escapeHtml(err.message)}).</p>`;
  }
}

async function togglePagosBoleta(boletaId) {
  const fila = document.querySelector(`tr[data-pagos-row="${boletaId}"]`);
  const lista = fila.querySelector(`[data-pagos-list="${boletaId}"]`);
  const chevron = document.querySelector(`.factura-expand-btn[data-toggle-pagos="${boletaId}"]`);
  const abrir = fila.hidden;
  fila.hidden = !abrir;
  chevron?.setAttribute('aria-expanded', String(abrir));
  chevron?.querySelector('[data-chevron-icon] path')?.setAttribute('d', abrir ? CHEVRON_ABIERTO : CHEVRON_CERRADO);
  if (abrir && !lista.dataset.cargado) {
    lista.dataset.cargado = '1';
    lista.innerHTML = 'Cargando pagos...';
    if (lista.dataset.porLinea === 'true') {
      await cargarDetalleLineasBoleta(boletaId);
    } else {
      await cargarListaPagosBoleta(boletaId);
    }
  }
}

/** Modal para corregir un pago ya registrado (monto, cuenta, comprobante, observaciones) -- la moneda se mantiene fija, siempre la de la boleta. */
async function abrirModalEditarPago(pago, onSaved) {
  let cuentas = [];
  try {
    cuentas = await getCacheado('/cuentas-empresa');
  } catch {
    // si falla, el select queda vacio; el usuario puede reintentar
  }

  showModal({
    title: 'Editar pago',
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="ep-monto">Monto pagado (${escapeHtml(pago.moneda)})</label>
          <input type="number" id="ep-monto" step="0.01" min="0.01" value="${Number(pago.montoPagado)}" required>
        </div>
        <div class="modal-form-row">
          <label for="ep-fecha">Fecha de pago</label>
          <input type="date" id="ep-fecha" value="${escapeHtml(String(pago.fechaPago).slice(0, 10))}" max="${new Date().toISOString().slice(0, 10)}" required>
        </div>
        <div class="modal-form-row">
          <label for="ep-cuenta">Cuenta destino</label>
          <select id="ep-cuenta">
            ${cuentas.map((c) => `<option value="${c.id}" ${c.id === pago.cuentaId ? 'selected' : ''}>${escapeHtml(c.nombreCuenta)} — ${escapeHtml(c.banco)}</option>`).join('')}
          </select>
        </div>
        <div class="modal-form-row">
          <label for="ep-num-operacion">Numero de operacion</label>
          <input type="text" id="ep-num-operacion" value="${escapeHtml(pago.numeroOperacion ?? '')}" placeholder="ej. 0000123456789">
        </div>
        <div class="modal-form-row">
          <label for="ep-comprobante">Comprobante (referencia/nombre de archivo)</label>
          <input type="text" id="ep-comprobante" value="${escapeHtml(pago.comprobante ?? '')}">
        </div>
        <div class="modal-form-row">
          <label for="ep-obs">Observaciones</label>
          <textarea id="ep-obs" rows="2">${escapeHtml(pago.observaciones ?? '')}</textarea>
        </div>
      </form>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Guardar',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body, close }) => {
          const montoPagado = body.querySelector('#ep-monto').value;
          const cuentaId = Number(body.querySelector('#ep-cuenta').value);
          const fechaPago = body.querySelector('#ep-fecha').value;
          const numeroOperacion = body.querySelector('#ep-num-operacion').value.trim();
          const comprobante = body.querySelector('#ep-comprobante').value.trim();
          const observaciones = body.querySelector('#ep-obs').value.trim();
          if (!montoPagado || !cuentaId || !fechaPago) {
            showToast('Completa el monto, la fecha de pago y la cuenta destino', { variant: 'error' });
            return;
          }
          try {
            await api.patch(`/pagos/${pago.id}`, {
              montoPagado,
              cuentaId,
              fechaPago,
              numeroOperacion: numeroOperacion || null,
              comprobante: comprobante || null,
              observaciones: observaciones || null
            });
            showToast('Pago actualizado', { variant: 'success' });
            close();
            await onSaved();
          } catch (err) {
            showToast(err.message || 'No se pudo actualizar el pago', { variant: 'error' });
          }
        }
      }
    ]
  });
}

/**
 * Tras registrar/editar/eliminar un pago (boleta o linea), recarga todo --
 * totales y estado. cargarFacturas() vuelve a pintar la fila desde cero
 * (colapsada), asi que si el desglose de esa boleta estaba abierto, lo
 * reabrimos con los datos frescos.
 */
async function refrescarFacturas(boletaId) {
  await Promise.all([cargarFacturas(), cargarTransacciones()]);
  if (boletaId && document.querySelector(`tr[data-pagos-row="${boletaId}"]`)) {
    await togglePagosBoleta(boletaId);
  }
}

function confirmarEliminarPago(pago, onSaved) {
  showModal({
    title: 'Eliminar pago',
    body: `<p>¿Eliminar el pago de <strong>${escapeHtml(pago.moneda)} ${fmtMonto(pago.montoPagado)}</strong> del ${escapeHtml(fmtFechaHora(pago.fechaPago))}? El saldo de la boleta se recalcula al instante. Esta accion no se puede deshacer.</p>`,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Eliminar',
        variant: 'danger',
        closeOnAction: false,
        action: async ({ close }) => {
          try {
            await api.delete(`/pagos/${pago.id}`);
            showToast('Pago eliminado', { variant: 'success' });
            close();
            await onSaved();
          } catch (err) {
            showToast(err.message || 'No se pudo eliminar el pago', { variant: 'error' });
          }
        }
      }
    ]
  });
}

/** Modal para corregir vencimiento/tipo de cambio de una boleta a mano -- monto y descripcion NO son editables aqui, se recalculan solos desde las lineas de consumo. */
function abrirModalEditarBoleta(boleta, onSaved) {
  const esUsd = boleta.moneda === 'USD';
  // El monto solo se puede fijar a mano para boletas que se pagan contra el
  // TOTAL (variable con 1 puerto, o fijo_total) -- para pago por linea el
  // estado sale de las lineas (ver PagosService.recalcularEstadoBoletaDesdeLineas),
  // fijar el total ahi no cambiaria nada de lo que el cliente/admin ve por puerto.
  const esPorLinea = cliente.tipoCobro === 'fijo_parcial' || (cliente.tipoCobro === 'variable' && boleta.totalLineas > 1);
  const esManual = Boolean(boleta.montoTotalManual);

  showModal({
    title: 'Editar boleta',
    body: `
      <form class="modal-form" novalidate>
        <p style="margin:0 0 12px;color:var(--text-secondary)">El monto y la descripcion se calculan solos desde el consumo del periodo y no se editan aqui${esPorLinea ? '.' : ', salvo que fijes un monto manual abajo.'}</p>
        <div class="modal-form-row">
          <label for="eb-vencimiento">Fecha de vencimiento</label>
          <input type="date" id="eb-vencimiento" value="${boleta.fechaVencimiento ?? ''}">
        </div>
        ${
  esUsd
    ? `<div class="modal-form-row">
          <label for="eb-tipo-cambio">Tipo de cambio aplicado</label>
          <input type="number" id="eb-tipo-cambio" step="0.0001" min="0" value="${boleta.tipoCambioAplicado ?? ''}">
        </div>`
    : ''
}
        ${
  esPorLinea
    ? ''
    : `<div class="modal-form-row">
          <label for="eb-monto-manual">
            <input type="checkbox" id="eb-monto-manual" ${esManual ? 'checked' : ''} style="width:auto;margin-right:6px">
            Fijar monto total a mano (ej. precio acordado distinto al calculo automatico)
          </label>
        </div>
        <div id="eb-monto-manual-campos" style="display:${esManual ? '' : 'none'}">
          <div class="modal-form-row">
            <label for="eb-monto">Monto total (${escapeHtml(boleta.moneda)})</label>
            <input type="number" id="eb-monto" step="0.01" min="0.01" value="${esManual ? Number(boleta.montoTotal) : ''}">
          </div>
          <div class="modal-form-row">
            <label for="eb-motivo-monto">Motivo del ajuste</label>
            <input type="text" id="eb-motivo-monto" maxlength="500" placeholder="ej. Precio acordado con el cliente para este mes" value="${escapeHtml(boleta.motivoAjusteMonto ?? '')}">
          </div>
          <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 8px">
            Mientras este fijado, el cierre diario y las correcciones de percentil dejan de recalcular el monto -- desmarca la casilla para volver al calculo automatico.
          </p>
        </div>`
}
      </form>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Guardar',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body, close }) => {
          const fechaVencimiento = body.querySelector('#eb-vencimiento').value || null;
          const tipoCambioInput = body.querySelector('#eb-tipo-cambio');
          const tipoCambioAplicado = tipoCambioInput ? tipoCambioInput.value || null : undefined;
          const montoManualCheck = body.querySelector('#eb-monto-manual');
          const payload = { fechaVencimiento, ...(tipoCambioAplicado !== undefined ? { tipoCambioAplicado } : {}) };

          if (montoManualCheck) {
            const montoManualActivo = montoManualCheck.checked;
            if (montoManualActivo) {
              const montoTotal = body.querySelector('#eb-monto').value;
              const motivoAjusteMonto = body.querySelector('#eb-motivo-monto').value.trim();
              if (!montoTotal || !motivoAjusteMonto) {
                showToast('Completa el monto y el motivo del ajuste', { variant: 'error' });
                return;
              }
              payload.montoTotalManual = true;
              payload.montoTotal = montoTotal;
              payload.motivoAjusteMonto = motivoAjusteMonto;
            } else if (esManual) {
              payload.montoTotalManual = false;
            }
          }

          try {
            await api.patch(`/boletas/${boleta.id}`, payload);
            showToast('Boleta actualizada', { variant: 'success' });
            close();
            await onSaved();
          } catch (err) {
            showToast(err.message || 'No se pudo actualizar la boleta', { variant: 'error' });
          }
        }
      }
    ]
  });

  document.getElementById('eb-monto-manual')?.addEventListener('change', (e) => {
    document.getElementById('eb-monto-manual-campos').style.display = e.target.checked ? '' : 'none';
  });
}

/** Confirmacion para borrar una boleta completa. Si ya tiene pagos registrados, el aviso lo dice explicitamente -- borrarla se lleva tambien esos pagos. */
function confirmarEliminarBoleta(boleta, onSaved) {
  const tienePagos = Number(boleta.montoPagado) > 0;
  showModal({
    title: 'Eliminar boleta',
    body: tienePagos
      ? `<p>Esta boleta de <strong>${escapeHtml(fmtPeriodo(boleta.periodo))}</strong> ya tiene <strong>${escapeHtml(boleta.moneda)} ${fmtMonto(boleta.montoPagado)}</strong> en pagos registrados. Si continuas, esos pagos tambien se eliminan junto con la boleta. Esta accion no se puede deshacer.</p>`
      : `<p>¿Eliminar la boleta de <strong>${escapeHtml(fmtPeriodo(boleta.periodo))}</strong>? Esta accion no se puede deshacer.</p>`,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: tienePagos ? 'Eliminar boleta y pagos' : 'Eliminar',
        variant: 'danger',
        closeOnAction: false,
        action: async ({ close }) => {
          try {
            await api.delete(`/boletas/${boleta.id}`);
            showToast('Boleta eliminada', { variant: 'success' });
            close();
            await onSaved();
          } catch (err) {
            showToast(err.message || 'No se pudo eliminar la boleta', { variant: 'error' });
          }
        }
      }
    ]
  });
}

function renderFacturasPagina() {
  const tbody = document.getElementById('fc-facturas-rows');
  const pag = document.getElementById('fc-facturas-pagination');

  if (facturasTodas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9">Este cliente todavia no tiene boletas calculadas.</td></tr>';
    pag.hidden = true;
    pag.innerHTML = '';
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(facturasTodas.length / FACTURAS_POR_PAGINA));
  facturasPaginaActual = Math.min(Math.max(facturasPaginaActual, 1), totalPaginas);
  const inicio = (facturasPaginaActual - 1) * FACTURAS_POR_PAGINA;
  const paginaItems = facturasTodas.slice(inicio, inicio + FACTURAS_POR_PAGINA);

  tbody.innerHTML = paginaItems.map(facturaRowHtml).join('');

  const desde = inicio + 1;
  const hasta = Math.min(inicio + FACTURAS_POR_PAGINA, facturasTodas.length);
  const botonesPagina = Array.from({ length: totalPaginas }, (_, i) => i + 1)
    .map(
      (p) =>
        `<button type="button" class="page-link${p === facturasPaginaActual ? ' active' : ''}" data-page="${p}">${p}</button>`
    )
    .join('');

  pag.hidden = false;
  pag.innerHTML = `
    <span class="page-info">Mostrando ${desde}-${hasta} de ${facturasTodas.length}</span>
    <button type="button" class="page-link${facturasPaginaActual === 1 ? ' disabled' : ''}" data-page="${facturasPaginaActual - 1}" aria-label="Pagina anterior">&lsaquo;</button>
    ${botonesPagina}
    <button type="button" class="page-link${facturasPaginaActual === totalPaginas ? ' disabled' : ''}" data-page="${facturasPaginaActual + 1}" aria-label="Pagina siguiente">&rsaquo;</button>
  `;
}

document.getElementById('fc-facturas-pagination').addEventListener('click', (e) => {
  const btn = e.target.closest('.page-link');
  if (!btn || btn.classList.contains('disabled')) {return;}
  const pagina = Number(btn.dataset.page);
  if (!pagina || pagina === facturasPaginaActual) {return;}
  facturasPaginaActual = pagina;
  renderFacturasPagina();
});

async function cargarFacturasLibre() {
  const tbody = document.getElementById('fc-facturas-libre-rows');
  try {
    const boletas = await api.get(`/boletas/corporativos/${clienteId}`);
    tbody.innerHTML = boletas.length
      ? boletas
        .map(
          (b) => `
              <tr>
                <td>${fmtFecha(b.periodo)}</td>
                <td>${escapeHtml(b.descripcion ?? '-')}</td>
                <td class="cell-mono">${escapeHtml(b.moneda)} ${fmtMonto(b.montoTotal)}</td>
              </tr>`
        )
        .join('')
      : '<tr><td colspan="3">Todavia no se genero ninguna boleta libre para este cliente.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3">No se pudieron cargar las boletas (${escapeHtml(err.message)}).</td></tr>`;
  }
}

async function cargarFacturas() {
  const registrarPagoBtn = document.getElementById('fc-registrar-pago-libre');
  const generarSiguienteBtn = document.getElementById('fc-generar-siguiente-btn');
  const generarHistoricaBtn = document.getElementById('fc-generar-historica-btn');
  const generarLibreBtn = document.getElementById('fc-generar-libre-btn');
  const panelLibre = document.getElementById('fc-facturas-libre');
  const panelNormal = document.getElementById('fc-facturas-normal');

  if (cliente.tipoCobro === 'libre') {
    registrarPagoBtn.hidden = false;
    generarLibreBtn.hidden = false;
    generarSiguienteBtn.hidden = true;
    generarHistoricaBtn.hidden = true;
    panelLibre.hidden = false;
    panelNormal.hidden = true;
    await cargarFacturasLibre();
    return;
  }
  registrarPagoBtn.hidden = true;
  generarLibreBtn.hidden = true;
  generarSiguienteBtn.hidden = false;
  generarHistoricaBtn.hidden = false;
  panelLibre.hidden = true;
  panelNormal.hidden = false;

  const tbody = document.getElementById('fc-facturas-rows');
  try {
    facturasTodas = await api.get(`/boletas/corporativos/${clienteId}`);
    facturasPaginaActual = 1;
    renderFacturasPagina();
  } catch (err) {
    facturasTodas = [];
    tbody.innerHTML = `<tr><td colspan="9">No se pudieron cargar las facturas (${escapeHtml(err.message)}).</td></tr>`;
    document.getElementById('fc-facturas-pagination').hidden = true;
  }
}

document.getElementById('fc-registrar-pago-libre').addEventListener('click', () => {
  abrirModalPago({ corporativoId: clienteId }, () => Promise.all([cargarFacturas(), cargarTransacciones()]));
});

document.getElementById('fc-generar-siguiente-btn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const nueva = await api.post('/boletas/generar-siguiente', { corporativoId: clienteId });
    showToast(`Boleta de ${fmtPeriodo(nueva.periodo)} generada`, { variant: 'success' });
    await cargarFacturas();
  } catch (err) {
    showToast(err.message || 'No se pudo generar la boleta', { variant: 'error' });
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('fc-generar-libre-btn').addEventListener('click', abrirModalGenerarBoletaLibre);

/**
 * Boleta manual de un mes YA PASADO -- para cargar historial de pagos de
 * antes de este sistema, o un mes que por lo que sea nunca se calculo. Sin
 * lineas de consumo (no hay datos reales de esa epoca); se paga despues con
 * el "Registrar pago" de siempre. Ver BoletasService.generarBoletaHistorica.
 */
function abrirModalGenerarBoletaHistorica() {
  const mesAnterior = new Date();
  mesAnterior.setDate(1);
  mesAnterior.setMonth(mesAnterior.getMonth() - 1);
  const maxMes = mesAnterior.toISOString().slice(0, 7);

  showModal({
    title: 'Boleta manual (mes pasado)',
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="bh-periodo">Periodo</label>
          <input type="month" id="bh-periodo" max="${maxMes}" value="${maxMes}" required>
          <p style="font-size:11px;color:var(--text-muted);margin:4px 0 0">Solo meses ya pasados -- el mes en curso se calcula desde la pestaña Trafico.</p>
        </div>
        <div class="row col-6-6">
          <div class="modal-form-row">
            <label for="bh-moneda">Moneda</label>
            <select id="bh-moneda">
              <option value="PEN">PEN</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div class="modal-form-row">
            <label for="bh-monto">Monto total</label>
            <input type="number" id="bh-monto" step="0.01" min="0.01" required>
          </div>
        </div>
        <div class="modal-form-row">
          <label for="bh-descripcion">Descripcion (opcional)</label>
          <input type="text" id="bh-descripcion" placeholder="ej. Pago histórico pre-sistema">
        </div>
      </form>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Generar',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body, close }) => {
          const periodoMes = body.querySelector('#bh-periodo').value;
          const moneda = body.querySelector('#bh-moneda').value;
          const montoTotal = body.querySelector('#bh-monto').value;
          const descripcion = body.querySelector('#bh-descripcion').value.trim();
          if (!periodoMes || !montoTotal) {
            showToast('Completa el periodo y el monto', { variant: 'error' });
            return;
          }
          try {
            await api.post('/boletas/generar-historica', {
              corporativoId: clienteId,
              periodo: `${periodoMes}-01`,
              montoTotal,
              moneda,
              descripcion: descripcion || undefined
            });
            showToast('Boleta historica generada', { variant: 'success' });
            close();
            await cargarFacturas();
          } catch (err) {
            showToast(err.message || 'No se pudo generar la boleta', { variant: 'error' });
          }
        }
      }
    ]
  });
}

document.getElementById('fc-generar-historica-btn').addEventListener('click', abrirModalGenerarBoletaHistorica);

async function abrirModalGenerarBoletaLibre() {
  let tiposServicio = [];
  try {
    tiposServicio = await api.get('/tipos-servicio');
  } catch {
    // si falla, el select queda vacio; el usuario puede reintentar
  }

  showModal({
    title: 'Generar boleta libre',
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="bl-tipo-servicio">Tipo de servicio</label>
          <select id="bl-tipo-servicio">
            ${tiposServicio.map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('')}
          </select>
        </div>
        <div class="row col-6-6">
          <div class="modal-form-row">
            <label for="bl-moneda">Moneda</label>
            <select id="bl-moneda">
              <option value="PEN">PEN</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div class="modal-form-row">
            <label for="bl-monto">Monto</label>
            <input type="number" id="bl-monto" step="0.01" min="0.01" required>
          </div>
        </div>
        <p style="font-size:11.5px;color:var(--text-muted)">
          Es solo un documento (descripcion + monto) para imprimir/enviar -- no afecta el saldo del cliente, que se
          sigue manejando con "Registrar pago".
        </p>
      </form>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Generar',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body, close }) => {
          const tipoServicioId = Number(body.querySelector('#bl-tipo-servicio').value);
          const moneda = body.querySelector('#bl-moneda').value;
          const montoTotal = body.querySelector('#bl-monto').value;
          if (!tipoServicioId || !montoTotal) {
            showToast('Completa el tipo de servicio y el monto', { variant: 'error' });
            return;
          }
          try {
            await api.post('/boletas/generar-libre', { corporativoId: clienteId, montoTotal, moneda, tipoServicioId });
            showToast('Boleta libre generada', { variant: 'success' });
            close();
            await cargarFacturas();
          } catch (err) {
            showToast(err.message || 'No se pudo generar la boleta', { variant: 'error' });
          }
        }
      }
    ]
  });
}

async function abrirModalPago({ boletaId, detalleBoletaId, corporativoId, saldoPendiente, moneda }, onSaved) {
  let cuentas = [];
  try {
    cuentas = await getCacheado('/cuentas-empresa');
  } catch {
    // si falla, el select queda vacio; el usuario puede reintentar
  }

  // Pago "Libre" (corporativoId): no hay boleta ni saldo pendiente de la cual
  // partir -- el monto es libre y la moneda se elige a mano.
  const esLibre = corporativoId !== null && corporativoId !== undefined;

  const modal = showModal({
    title: 'Registrar pago',
    body: `
      <form class="modal-form" novalidate>
        ${
  esLibre
    ? `<div class="modal-form-row">
                 <label for="pg-moneda">Moneda</label>
                 <select id="pg-moneda">
                   <option value="PEN">PEN</option>
                   <option value="USD">USD</option>
                 </select>
               </div>
               <div class="modal-form-row">
                 <label for="pg-monto">Monto pagado</label>
                 <input type="number" id="pg-monto" step="0.01" min="0.01" required>
               </div>`
    : `<div class="modal-form-row">
                 <label for="pg-monto">Monto pagado (${escapeHtml(moneda)}) — saldo pendiente: ${escapeHtml(moneda)} ${fmtMonto(Math.max(saldoPendiente, 0))}</label>
                 <input type="number" id="pg-monto" step="0.01" min="0.01" value="${saldoPendiente > 0 ? saldoPendiente.toFixed(2) : ''}" required>
               </div>`
}
        <div class="modal-form-row">
          <label for="pg-fecha">Fecha de pago</label>
          <input type="date" id="pg-fecha" value="${new Date().toISOString().slice(0, 10)}" max="${new Date().toISOString().slice(0, 10)}" required>
          <p style="font-size:11px;color:var(--text-muted);margin:4px 0 0">La fecha real en que el cliente pago, no necesariamente hoy (ej. pago un dia y se registra al siguiente).</p>
        </div>
        <div class="modal-form-row">
          <label for="pg-cuenta">Cuenta destino</label>
          <select id="pg-cuenta">
            ${cuentas.map((c) => `<option value="${c.id}">${escapeHtml(c.nombreCuenta)} — ${escapeHtml(c.banco)}</option>`).join('')}
          </select>
        </div>
        <div class="modal-form-row">
          <label for="pg-num-operacion">Numero de operacion</label>
          <div style="display:flex;gap:6px">
            <input type="text" id="pg-num-operacion" placeholder="ej. 0000123456789" required style="flex:1">
            <button type="button" class="btn btn-outline btn-sm" id="pg-num-operacion-comodin" title="Usar cuando no hay numero de operacion real (ej. pago en efectivo)">Sin comprobante</button>
          </div>
          <p style="font-size:11px;color:var(--text-muted);margin:4px 0 0">Obligatorio. Si no hay numero real, usa "0000000".</p>
        </div>
        <div class="modal-form-row">
          <label for="pg-comprobante">Comprobante (referencia/nombre de archivo)</label>
          <input type="text" id="pg-comprobante" placeholder="ej. deposito_0472.jpg">
        </div>
        <div class="modal-form-row">
          <label for="pg-obs">Observaciones</label>
          <textarea id="pg-obs" rows="2"></textarea>
        </div>
      </form>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Registrar',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body, close }) => {
          const montoPagado = body.querySelector('#pg-monto').value;
          const monedaPago = esLibre ? body.querySelector('#pg-moneda').value : moneda;
          const cuentaId = Number(body.querySelector('#pg-cuenta').value);
          const fechaPago = body.querySelector('#pg-fecha').value;
          const numeroOperacion = body.querySelector('#pg-num-operacion').value.trim();
          const comprobante = body.querySelector('#pg-comprobante').value.trim();
          const observaciones = body.querySelector('#pg-obs').value.trim();
          if (!montoPagado || !cuentaId || !fechaPago) {
            showToast('Completa el monto, la fecha de pago y la cuenta destino', { variant: 'error' });
            return;
          }
          if (!numeroOperacion) {
            showToast('El numero de operacion es obligatorio -- usa "Sin comprobante" si no hay uno real', { variant: 'error' });
            return;
          }
          try {
            await api.post('/pagos', {
              boletaId: boletaId ?? undefined,
              detalleBoletaId: detalleBoletaId ?? undefined,
              corporativoId: corporativoId ?? undefined,
              montoPagado,
              moneda: monedaPago,
              cuentaId,
              usuarioId: getUsuario()?.id,
              fechaPago,
              numeroOperacion,
              comprobante: comprobante || null,
              observaciones: observaciones || null
            });
            showToast('Pago registrado', { variant: 'success' });
            close();
            await onSaved();
          } catch (err) {
            showToast(err.message || 'No se pudo registrar el pago', { variant: 'error' });
          }
        }
      }
    ]
  });

  modal.body.querySelector('#pg-num-operacion-comodin').addEventListener('click', () => {
    modal.body.querySelector('#pg-num-operacion').value = '0000000';
  });
}

document.getElementById('fc-facturas-rows').addEventListener('click', (e) => {
  const pagarBoletaBtn = e.target.closest('[data-pagar-boleta]');
  const pagarLineaBtn = e.target.closest('[data-pagar-linea]');
  const editarPagoBtn = e.target.closest('[data-editar-pago]');
  const eliminarPagoBtn = e.target.closest('[data-eliminar-pago]');
  const editarPagoLineaBtn = e.target.closest('[data-editar-pago-linea]');
  const eliminarPagoLineaBtn = e.target.closest('[data-eliminar-pago-linea]');
  const editarBoletaBtn = e.target.closest('[data-editar-boleta]');
  const eliminarBoletaBtn = e.target.closest('[data-eliminar-boleta]');
  const expandTarget = e.target.closest('[data-toggle-pagos]');
  if (pagarBoletaBtn) {
    const boletaId = Number(pagarBoletaBtn.dataset.id);
    abrirModalPago({ boletaId, saldoPendiente: Number(pagarBoletaBtn.dataset.saldo), moneda: pagarBoletaBtn.dataset.moneda }, () => refrescarFacturas(boletaId));
  } else if (pagarLineaBtn) {
    const boletaId = Number(pagarLineaBtn.dataset.boletaId);
    abrirModalPago({ detalleBoletaId: Number(pagarLineaBtn.dataset.id), saldoPendiente: Number(pagarLineaBtn.dataset.saldo), moneda: pagarLineaBtn.dataset.moneda }, () => refrescarFacturas(boletaId));
  } else if (editarPagoBtn) {
    const boletaId = Number(editarPagoBtn.dataset.boletaId);
    const pago = pagosPorBoletaCache.get(boletaId)?.find((p) => p.id === Number(editarPagoBtn.dataset.editarPago));
    if (!pago) {return;}
    abrirModalEditarPago(pago, () => refrescarFacturas(boletaId));
  } else if (eliminarPagoBtn) {
    const boletaId = Number(eliminarPagoBtn.dataset.boletaId);
    const pago = pagosPorBoletaCache.get(boletaId)?.find((p) => p.id === Number(eliminarPagoBtn.dataset.eliminarPago));
    if (!pago) {return;}
    confirmarEliminarPago(pago, () => refrescarFacturas(boletaId));
  } else if (editarPagoLineaBtn) {
    const detalleId = Number(editarPagoLineaBtn.dataset.detalleId);
    const boletaId = Number(editarPagoLineaBtn.dataset.boletaId);
    const pago = pagosPorLineaCache.get(detalleId)?.find((p) => p.id === Number(editarPagoLineaBtn.dataset.editarPagoLinea));
    if (!pago) {return;}
    abrirModalEditarPago(pago, () => refrescarFacturas(boletaId));
  } else if (eliminarPagoLineaBtn) {
    const detalleId = Number(eliminarPagoLineaBtn.dataset.detalleId);
    const boletaId = Number(eliminarPagoLineaBtn.dataset.boletaId);
    const pago = pagosPorLineaCache.get(detalleId)?.find((p) => p.id === Number(eliminarPagoLineaBtn.dataset.eliminarPagoLinea));
    if (!pago) {return;}
    confirmarEliminarPago(pago, () => refrescarFacturas(boletaId));
  } else if (editarBoletaBtn) {
    const boleta = facturasTodas.find((f) => f.id === Number(editarBoletaBtn.dataset.editarBoleta));
    if (!boleta) {return;}
    abrirModalEditarBoleta(boleta, () => refrescarFacturas());
  } else if (eliminarBoletaBtn) {
    const boleta = facturasTodas.find((f) => f.id === Number(eliminarBoletaBtn.dataset.eliminarBoleta));
    if (!boleta) {return;}
    confirmarEliminarBoleta(boleta, () => refrescarFacturas());
  } else if (expandTarget) {
    togglePagosBoleta(Number(expandTarget.dataset.togglePagos));
  }
});

document.getElementById('fc-facturas-rows').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') {return;}
  const row = e.target.closest('tr[data-toggle-pagos]');
  if (!row) {return;}
  e.preventDefault();
  togglePagosBoleta(Number(row.dataset.togglePagos));
});

// ===================== Facturacion: Transacciones =====================

async function cargarTransacciones() {
  const tbody = document.getElementById('fc-transacciones-rows');
  try {
    const pagos = await api.get(`/pagos?corporativoId=${clienteId}`);
    if (pagos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">Todavia no hay pagos registrados para este cliente.</td></tr>';
      return;
    }
    tbody.innerHTML = pagos
      .map(
        (p) => `
        <tr>
          <td class="cell-mono">${fmtFechaHora(p.fechaPago)}</td>
          <td class="cell-mono cell-strong">${escapeHtml(p.moneda)} ${fmtMonto(p.montoPagado)}</td>
          <td>${escapeHtml(p.cuenta)}</td>
          <td>${escapeHtml(p.comprobante ?? '-')}</td>
          <td>${escapeHtml(p.usuario)}</td>
        </tr>`
      )
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">No se pudo cargar el historial (${escapeHtml(err.message)}).</td></tr>`;
  }
}

// ===================== Facturacion: Configuracion =====================

/** "Crear factura (override)"/"Dias de gracia (override)": vacio = usa el default global, si no cantidad de dias 0-30. */
function llenarCantidadDiasOverride(select, sufijo, etiquetaCero) {
  const opciones = Array.from({ length: 31 }, (_, i) => i)
    .map((d) => `<option value="${d}">${d === 0 ? etiquetaCero : `${d} ${sufijo}`}</option>`)
    .join('');
  select.innerHTML = `<option value="">Usa el default global</option>${opciones}`;
}

llenarCantidadDiasOverride(document.getElementById('cf-dias-crear-factura'), 'Dias antes', 'El mismo dia');
llenarCantidadDiasOverride(document.getElementById('cf-dias-gracia'), 'Dias', 'Sin gracia');

function fmt12h(horaHHMMSS) {
  const [h, m] = horaHHMMSS.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${periodo}`;
}

function previewBadgeHtml(colorBg, colorTexto, etiqueta, valor) {
  return `
    <div style="flex:1;min-width:170px;background:${colorBg};border-radius:var(--radius-sm);padding:10px 14px">
      <div style="font-size:11px;color:var(--text-muted)">${etiqueta}</div>
      <div style="font-weight:var(--font-weight-bold);color:${colorTexto}">${valor}</div>
    </div>`;
}

/**
 * Fechas resueltas (override del cliente + default global ya combinados) de
 * cuando se generaria la boleta por adelantado, cuando vence, y hasta cuando
 * corre el dia de gracia -- ver BoletasService.previewFacturacion. "Crear
 * factura" sale null si el cliente no es elegible para creacion anticipada
 * (VARIABLE, o FIJO_PARCIAL con algun puerto no-fijo), se muestra como "No
 * aplica" en vez de omitir el bloque, para que siempre sean 3 bloques.
 */
async function cargarPreviewFacturacion() {
  const badgesEl = document.getElementById('cf-preview-badges');
  if (cliente.tipoCobro === 'libre') {
    badgesEl.innerHTML = '';
    return;
  }
  try {
    const p = await api.get(`/boletas/corporativos/${clienteId}/preview-facturacion`);
    badgesEl.innerHTML = [
      previewBadgeHtml(
        'var(--blue-lt)',
        '#1f6fa8',
        'Crear factura',
        p.fechaCrearFactura ? `${fmtFecha(p.fechaCrearFactura)} · ${fmt12h(p.horaCierreDiario)}` : 'No aplica (no elegible para creacion anticipada)'
      ),
      previewBadgeHtml('var(--yellow-lt)', '#b45309', 'Dia de pago', fmtFecha(p.fechaVencimiento)),
      previewBadgeHtml('var(--red-lt)', '#b8362a', 'Dia de corte (informativo, sin automatizacion)', fmtFecha(p.fechaCorte))
    ].join('');
  } catch {
    badgesEl.innerHTML = '';
  }
}

function renderConfigForm() {
  const esFijoTotal = cliente.tipoCobro === 'fijo_total';
  document.getElementById('cf-tipo-cobro').value = cliente.tipoCobro ?? 'variable';
  document.getElementById('cf-monto-fijo').value = cliente.montoFijoMensual ?? '';
  document.getElementById('cf-moneda-fijo').value = cliente.monedaFijo ?? 'PEN';
  document.getElementById('cf-dia-vencimiento').value = cliente.diaVencimiento ?? '';
  document.getElementById('cf-dia-creacion').value = cliente.diaCreacionBoleta ?? '';
  document.getElementById('cf-dias-crear-factura').value = cliente.diasAntesCrearFactura ?? '';
  document.getElementById('cf-dias-gracia').value = cliente.diasGracia ?? '';
  document.getElementById('cf-fijo-row').style.display = esFijoTotal ? '' : 'none';
  document.getElementById('cf-fijo-moneda-row').style.display = esFijoTotal ? '' : 'none';
}

document.getElementById('cf-tipo-cobro').addEventListener('change', (e) => {
  const mostrar = e.target.value === 'fijo_total';
  document.getElementById('cf-fijo-row').style.display = mostrar ? '' : 'none';
  document.getElementById('cf-fijo-moneda-row').style.display = mostrar ? '' : 'none';
});

document.getElementById('cf-guardar').addEventListener('click', async () => {
  const tipoCobro = document.getElementById('cf-tipo-cobro').value;
  const montoFijoMensual = document.getElementById('cf-monto-fijo').value;
  const monedaFijo = document.getElementById('cf-moneda-fijo').value;
  const diaVencimientoRaw = document.getElementById('cf-dia-vencimiento').value;
  const diaCreacionRaw = document.getElementById('cf-dia-creacion').value;
  const diasCrearFacturaRaw = document.getElementById('cf-dias-crear-factura').value;
  const diasGraciaRaw = document.getElementById('cf-dias-gracia').value;

  if (tipoCobro === 'fijo_total' && !montoFijoMensual) {
    showToast('Ingresa el monto fijo mensual', { variant: 'error' });
    return;
  }
  for (const [valor, etiqueta] of [
    [diaVencimientoRaw, 'de vencimiento'],
    [diaCreacionRaw, 'de creacion']
  ]) {
    if (valor && (Number(valor) < 1 || Number(valor) > 28)) {
      showToast(`El dia ${etiqueta} debe estar entre 1 y 28`, { variant: 'error' });
      return;
    }
  }
  try {
    cliente = await api.patch(`/corporativos/${clienteId}`, {
      tipoCobro,
      montoFijoMensual: tipoCobro === 'fijo_total' ? montoFijoMensual : null,
      monedaFijo: tipoCobro === 'fijo_total' ? monedaFijo : null,
      diaVencimiento: diaVencimientoRaw ? Number(diaVencimientoRaw) : null,
      diaCreacionBoleta: diaCreacionRaw ? Number(diaCreacionRaw) : null,
      diasAntesCrearFactura: diasCrearFacturaRaw ? Number(diasCrearFacturaRaw) : null,
      diasGracia: diasGraciaRaw ? Number(diasGraciaRaw) : null
    });
    showToast('Configuracion guardada', { variant: 'success' });
    invalidarCache('/corporativos');
    renderHeader();
    renderResumen(document.getElementById('rs-puertos').textContent);
    await Promise.all([cargarFacturas(), cargarPreviewFacturacion()]);
  } catch (err) {
    showToast(err.message || 'No se pudo guardar', { variant: 'error' });
  }
});

// ===================== Editar cliente (modal) =====================

function abrirModalEditar() {
  showModal({
    title: `Editar cliente — ${cliente.nombre}`,
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="ec-titular">Titular</label>
          <input type="text" id="ec-titular" value="${escapeHtml(cliente.titular ?? '')}">
        </div>
        <div class="modal-form-row">
          <label for="ec-correo">Correo</label>
          <input type="email" id="ec-correo" value="${escapeHtml(cliente.correo ?? '')}">
        </div>
        <div class="modal-form-row">
          <label for="ec-celular">Celular</label>
          <input type="tel" id="ec-celular" value="${escapeHtml(cliente.celular ?? '')}">
        </div>
      </form>
      <p style="font-size:11.5px;color:var(--text-muted);margin-top:8px">
        Titular/Correo/Celular se vuelven a sincronizar desde LibreNMS (bill_notes) en cada ciclo —
        una edicion manual aqui se pisa en el proximo sync si LibreNMS trae otro valor.
        Tipo de cobro, montos y dias de vencimiento/creacion se editan desde la pestaña Facturacion → Configuracion.
      </p>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Guardar',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body, close }) => {
          const titular = body.querySelector('#ec-titular').value.trim();
          const correo = body.querySelector('#ec-correo').value.trim();
          const celular = body.querySelector('#ec-celular').value.trim();
          try {
            cliente = await api.patch(`/corporativos/${clienteId}`, {
              titular: titular || null,
              correo: correo || null,
              celular: celular || null
            });
            showToast('Cliente actualizado', { variant: 'success' });
            invalidarCache('/corporativos');
            close();
            renderHeader();
            renderResumen(document.getElementById('rs-puertos').textContent);
          } catch (err) {
            showToast(err.message || 'No se pudo actualizar el cliente', { variant: 'error' });
          }
        }
      }
    ]
  });
}

document.getElementById('cl-editar-btn').addEventListener('click', abrirModalEditar);

document.getElementById('cl-activo-btn').addEventListener('click', async () => {
  const activo = !cliente.activo;
  try {
    cliente = await api.patch(`/corporativos/${clienteId}/activo`, { activo });
    showToast(activo ? 'Cliente habilitado' : 'Cliente deshabilitado (todos sus puertos tambien)', { variant: 'success' });
    invalidarCache('/corporativos');
    renderHeader();
    await cargarPuertos();
  } catch (err) {
    showToast(err.message || 'No se pudo cambiar el estado del cliente', { variant: 'error' });
  }
});

// ===================== Tabs =====================

/**
 * Monta el componente de Consumo (src/v4/consumo-tab.js) directamente en el
 * panel "Trafico" -- sin iframe, sin navegacion, sin volver a pasar el id del
 * cliente por la URL (ya lo tenemos de esta misma pagina). Unico lugar que
 * muestra trafico -- la vieja pagina standalone consumo.html se elimino por
 * redundante (mismo componente, dos URLs para lo mismo).
 */
function cargarTrafico() {
  const panel = document.getElementById('tr-panel');
  if (panel.dataset.cargado) {return;}
  panel.dataset.cargado = '1';
  initConsumoTab(panel, clienteId, { periodoInicial: periodoInicialTrafico });
}

function activarTab(target) {
  const btn = document.querySelector(`#cl-tabs .profile-tab[data-tab="${target}"]`);
  if (!btn) {return;}
  document.querySelectorAll('#cl-tabs .profile-tab').forEach((t) => t.classList.toggle('active', t === btn));
  document.querySelectorAll('[data-panel]').forEach((p) => {
    p.hidden = p.dataset.panel !== target;
  });
  if (target === 'trafico') {cargarTrafico();}
}

function activarSubtab(target) {
  const btn = document.querySelector(`#fc-subtabs .profile-tab[data-subtab="${target}"]`);
  if (!btn) {return;}
  document.querySelectorAll('#fc-subtabs .profile-tab').forEach((t) => t.classList.toggle('active', t === btn));
  document.querySelectorAll('[data-subpanel]').forEach((p) => {
    p.hidden = p.dataset.subpanel !== target;
  });
}

document.getElementById('cl-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.profile-tab');
  if (btn) {activarTab(btn.dataset.tab);}
});

document.getElementById('fc-subtabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.profile-tab');
  if (btn) {activarSubtab(btn.dataset.subtab);}
});

// ===================== Carga inicial =====================

if (!clienteId) {
  document.querySelector('.page-wrapper').innerHTML = '<p>Falta el parametro "id" en la URL.</p>';
} else {
  cargarCliente()
    .then(() => {
      renderResumen('-');
      renderConfigForm();
      return Promise.all([cargarPuertos(), cargarFacturas(), cargarTransacciones(), cargarPreviewFacturacion()]);
    })
    .then(() => {
      if (tabInicial) {activarTab(tabInicial);}
      if (subtabInicial) {activarSubtab(subtabInicial);}
    })
    .catch((err) => {
      document.getElementById('cl-nombre').textContent = 'Cliente';
      showToast(err.message || 'No se pudo cargar el cliente', { variant: 'error' });
    });
}
