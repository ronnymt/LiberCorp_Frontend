import { requireAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { getCacheado, invalidarCache } from '../lib/api-cache.js';
import { showToast } from '../v4/toast.js';
import { showModal } from '../v4/modal.js';
import { escapeHtml, portRowCells, portNombreVisible } from '../lib/ports-table.js';
import { fmtMonto } from '../lib/format.js';

requireAuth();

// Iconos inline (16x16, stroke=currentColor) para las acciones por fila --
// mismo lenguaje visual que el resto de la app (search box, KPIs).
const ICONO_PUERTOS =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="6" width="9" height="6" rx="1"/><path d="M4.5 6V4M6.5 6V4M8.5 6V4"/><path d="M11.5 8h2"/></svg>';
const ICONO_EDITAR =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M10.5 2.5l3 3-7.5 7.5-3.5 1 1-3.5z"/></svg>';
const ICONO_POWER =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2.5v5"/><path d="M4.6 4.3a5 5 0 108.6 3.5A5 5 0 0011.4 4.3"/></svg>';

let clientes = [];
let filtroTexto = '';
let filtroEstado = 'activos';
let filtroTipoCobro = 'todos';

const CLIENTES_POR_PAGINA = 9;
let paginaActual = 1;

const rows = document.getElementById('clientes-rows');
const pag = document.getElementById('clientes-pagination');
const filtroEstadoSelect = document.getElementById('clientes-filtro-estado');
const filtroTipoCobroSelect = document.getElementById('clientes-filtro-tipo-cobro');

function visibles() {
  let items = clientes;
  if (filtroEstado === 'activos') {items = items.filter((c) => c.activo);}
  else if (filtroEstado === 'deshabilitados') {items = items.filter((c) => !c.activo);}
  if (filtroTipoCobro !== 'todos') {items = items.filter((c) => (c.tipoCobro ?? 'variable') === filtroTipoCobro);}

  const q = filtroTexto.toLowerCase();
  if (!q) {return items;}
  return items.filter(
    (c) =>
      c.nombre.toLowerCase().includes(q) ||
      (c.titular ?? '').toLowerCase().includes(q) ||
      (c.correo ?? '').toLowerCase().includes(q)
  );
}

function renderPaginacion(total) {
  const totalPaginas = Math.max(1, Math.ceil(total / CLIENTES_POR_PAGINA));
  paginaActual = Math.min(Math.max(paginaActual, 1), totalPaginas);
  const inicio = total === 0 ? 0 : (paginaActual - 1) * CLIENTES_POR_PAGINA + 1;
  const fin = Math.min(paginaActual * CLIENTES_POR_PAGINA, total);
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

pag.addEventListener('click', (e) => {
  const btn = e.target.closest('.page-link');
  if (!btn || btn.classList.contains('disabled')) {return;}
  const pagina = Number(btn.dataset.page);
  if (!pagina || pagina === paginaActual) {return;}
  paginaActual = pagina;
  renderTabla();
});

function fmtFecha(iso) {
  if (!iso) {return '<span style="color:var(--text-muted)">-</span>';}
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** Pill de deuda: monto (dato principal, JetBrains Mono) + conteo de recibos pendientes como badge dentro. Sin deuda ni pendientes, pill "Al dia" en vez de un guion huerfano. */
function deudaHtml(c) {
  const pen = Number(c.deudaPen ?? 0);
  const usd = Number(c.deudaUsd ?? 0);
  if (c.boletasPendientes === 0 || (pen <= 0 && usd <= 0)) {
    return '<span class="debt-badge debt-badge--ok">Al dia</span>';
  }
  const montos = [];
  if (pen > 0) {montos.push(`S/. ${fmtMonto(pen)}`);}
  if (usd > 0) {montos.push(`$ ${fmtMonto(usd)}`);}
  return `
    <span class="debt-badge">
      <span>${montos.join(' · ')}</span>
      <span class="count-badge" title="${c.boletasPendientes} recibo${c.boletasPendientes === 1 ? '' : 's'} pendiente${c.boletasPendientes === 1 ? '' : 's'}">${c.boletasPendientes}</span>
    </span>`;
}

function renderBadgeCorporativos() {
  const badge = document.getElementById('kpi-corporativos');
  badge.textContent = `${clientes.length} corporativo${clientes.length === 1 ? '' : 's'}`;
}

function renderTabla() {
  const items = visibles();
  if (items.length === 0) {
    rows.innerHTML = '<tr><td colspan="7">Sin clientes para mostrar.</td></tr>';
    pag.hidden = true;
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(items.length / CLIENTES_POR_PAGINA));
  paginaActual = Math.min(Math.max(paginaActual, 1), totalPaginas);
  const inicio = (paginaActual - 1) * CLIENTES_POR_PAGINA;
  const paginaItems = items.slice(inicio, inicio + CLIENTES_POR_PAGINA);

  rows.innerHTML = paginaItems
    .map(
      (c) => `
        <tr data-id="${c.id}"${c.activo ? '' : ' style="opacity:.6"'}>
          <td class="cell-strong"><a class="cell-link" href="cliente.html?id=${c.id}">${escapeHtml(c.nombre)}</a>${c.activo ? '' : ' <span class="status status-muted" title="Cliente deshabilitado">Inactivo</span>'}</td>
          <td>${escapeHtml(c.titular) || '<span style="color:var(--text-muted)">-</span>'}</td>
          <td>
            ${c.correo ? `<div style="font-size:12.5px">${escapeHtml(c.correo)}</div>` : ''}
            ${c.celular ? `<div class="cell-mono" style="font-size:12px;color:var(--text-muted)">${escapeHtml(c.celular)}</div>` : ''}
            ${!c.correo && !c.celular ? '<span style="color:var(--text-muted)">-</span>' : ''}
          </td>
          <td>${fmtFecha(c.ultimoPago)}</td>
          <td>${deudaHtml(c)}</td>
          <td class="cell-mono">${c.totalPuertos}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn icon-btn--accent" data-ver-puertos data-id="${c.id}" title="Ver puertos" aria-label="Ver puertos">${ICONO_PUERTOS}</button>
              <button class="icon-btn icon-btn--accent" data-editar-cliente data-id="${c.id}" title="Editar cliente" aria-label="Editar cliente">${ICONO_EDITAR}</button>
              <button class="icon-btn" data-toggle-activo-cliente data-id="${c.id}" title="${c.activo ? 'Deshabilitar cliente' : 'Habilitar cliente'}" aria-label="${c.activo ? 'Deshabilitar cliente' : 'Habilitar cliente'}">${ICONO_POWER}</button>
            </div>
          </td>
        </tr>`
    )
    .join('');
  renderPaginacion(items.length);
}

async function cargar() {
  clientes = await getCacheado('/corporativos');
  renderTabla();
  renderBadgeCorporativos();
}

function tarifaTexto(t) {
  if (!t) {return '<span style="color:var(--text-muted)">Sin tarifa</span>';}
  const simbolo = t.moneda === 'USD' ? '$' : 'S/';
  const sufijo = t.tipoCobro === 'fijo' ? '/mes fijo' : '/Mbps';
  return `${simbolo} ${fmtMonto(t.valorTarifa)} ${sufijo} desde ${t.fechaDesde}`;
}

/** Texto de tarifa cuando el CLIENTE (no el puerto) es de cobro fijo total: el monto viene del corporativo, igual para todos sus puertos. */
function tarifaTextoFijoTotal(cliente) {
  const simbolo = cliente.monedaFijo === 'USD' ? '$' : 'S/';
  return `${simbolo} ${fmtMonto(cliente.montoFijoMensual)} /mes fijo desde ${cliente.fechaDesdeFijo}`;
}

async function abrirModalPuertos(cliente) {
  const esFijoTotal = cliente.tipoCobro === 'fijo_total';
  const modal = showModal({ title: `Puertos — ${cliente.nombre}`, body: 'Cargando...', size: 'xl' });
  try {
    const puertos = await api.get(`/corporativos/${cliente.id}/puertos`);
    const filas = puertos.length
      ? puertos
        .map(
          (p) => `
              <tr>
                ${portRowCells(p)}
                <td>${esFijoTotal ? tarifaTextoFijoTotal(cliente) : tarifaTexto(p.tarifaVigente)}</td>
                <td style="white-space:nowrap">
                  ${
  esFijoTotal
    ? '<button class="btn btn-outline btn-sm" disabled title="Cliente con cobro fijo total: el monto se edita en \'Editar cliente\'">Bloqueado</button>'
    : `<button class="btn btn-outline btn-sm" data-editar-tarifa data-port-id="${p.id}" data-port-nombre="${escapeHtml(portNombreVisible(p))}" data-port-tipo-cobro="${p.tarifaVigente?.tipoCobro ?? 'variable'}">${p.tarifaVigente ? 'Cambiar' : 'Asignar'}</button>`
}
                  <button class="btn btn-outline btn-sm" data-editar-alias data-port-id="${p.id}" data-port-nombre-tecnico="${escapeHtml(p.nombrePuerto)}" data-port-alias="${escapeHtml(p.alias ?? '')}">Alias</button>
                  <button class="btn btn-outline btn-sm" data-toggle-activo-puerto data-port-id="${p.id}" data-port-activo="${p.activo}">${p.activo ? 'Deshabilitar' : 'Habilitar'}</button>
                </td>
              </tr>`
        )
        .join('')
      : '<tr><td colspan="6">Este cliente no tiene puertos vinculados.</td></tr>';
    modal.body.innerHTML = `
      ${
  esFijoTotal
    ? '<p style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">Este cliente tiene cobro fijo total — la tarifa por puerto esta bloqueada, edita el monto desde "Editar cliente".</p>'
    : ''
}
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Puerto</th><th>Dispositivo</th><th>Servicio</th><th>Estado</th><th>Tarifa</th><th></th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;

    modal.body.addEventListener('click', async (e) => {
      const tarifaBtn = e.target.closest('[data-editar-tarifa]');
      const aliasBtn = e.target.closest('[data-editar-alias]');
      const activoBtn = e.target.closest('[data-toggle-activo-puerto]');
      if (tarifaBtn) {
        abrirModalTarifa(
          Number(tarifaBtn.dataset.portId),
          tarifaBtn.dataset.portNombre,
          tarifaBtn.dataset.portTipoCobro,
          () => abrirModalPuertos(cliente)
        );
      } else if (aliasBtn) {
        abrirModalAlias(
          Number(aliasBtn.dataset.portId),
          aliasBtn.dataset.portNombreTecnico,
          aliasBtn.dataset.portAlias,
          () => abrirModalPuertos(cliente)
        );
      } else if (activoBtn) {
        const activo = activoBtn.dataset.portActivo !== 'true';
        try {
          await api.patch(`/ports/${activoBtn.dataset.portId}/activo`, { activo });
          showToast(activo ? 'Puerto habilitado' : 'Puerto deshabilitado', { variant: 'success' });
          await abrirModalPuertos(cliente);
        } catch (err) {
          showToast(err.message || 'No se pudo cambiar el estado del puerto', { variant: 'error' });
        }
      }
    });
  } catch (err) {
    modal.body.innerHTML = `<p>No se pudieron cargar los puertos (${escapeHtml(err.message)}).</p>`;
  }
}

async function abrirModalTarifa(portId, portNombre, tipoCobroActual, onSaved) {
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
      <p style="font-size:11.5px;color:var(--text-muted);margin-top:8px">
        Cierra la tarifa vigente anterior (si existe) en esta fecha y crea una nueva.
        Con cobro <strong>Fijo</strong>, el trafico se sigue midiendo (percentil 95) solo como referencia — no afecta el monto de la boleta.
      </p>
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
            await onSaved();
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

function abrirModalAlias(portId, nombreTecnico, aliasActual, onSaved) {
  showModal({
    title: `Alias de puerto — ${nombreTecnico}`,
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="al-alias">Alias</label>
          <input type="text" id="al-alias" maxlength="150" value="${escapeHtml(aliasActual ?? '')}" placeholder="${escapeHtml(nombreTecnico)}">
        </div>
      </form>
      <p style="font-size:11.5px;color:var(--text-muted);margin-top:8px">
        Nombre amigable para mostrar en vez de "${escapeHtml(nombreTecnico)}". Dejar vacio para quitar el alias.
      </p>
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
            await onSaved();
          } catch (err) {
            showToast(err.message || 'No se pudo guardar el alias', { variant: 'error' });
          }
        }
      }
    ]
  });
}

function abrirModalEditar(cliente) {
  const esFijoTotal = cliente.tipoCobro === 'fijo_total';
  const modal = showModal({
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
        <div class="modal-form-row">
          <label for="ec-tipo-cobro">Tipo de cobro del cliente</label>
          <select id="ec-tipo-cobro">
            <option value="variable" ${cliente.tipoCobro === 'variable' || !cliente.tipoCobro ? 'selected' : ''}>Variable (cada puerto por su consumo en Mbps)</option>
            <option value="fijo_parcial" ${cliente.tipoCobro === 'fijo_parcial' ? 'selected' : ''}>Fijo parcial (cada puerto con su propio monto fijo)</option>
            <option value="fijo_total" ${esFijoTotal ? 'selected' : ''}>Fijo total (un monto mensual por toda la cuenta)</option>
            <option value="libre" ${cliente.tipoCobro === 'libre' ? 'selected' : ''}>Libre (paga en temporadas al azar, sin boleta mensual)</option>
          </select>
        </div>
        <div id="ec-fijo-row" class="modal-form-row" style="display:${esFijoTotal ? '' : 'none'}">
          <label for="ec-monto-fijo">Monto fijo mensual (toda la cuenta)</label>
          <input type="number" id="ec-monto-fijo" step="0.01" min="0" value="${cliente.montoFijoMensual ?? ''}">
        </div>
        <div id="ec-fijo-moneda-row" class="modal-form-row" style="display:${esFijoTotal ? '' : 'none'}">
          <label for="ec-moneda-fijo">Moneda</label>
          <select id="ec-moneda-fijo">
            <option value="PEN" ${(cliente.monedaFijo ?? 'PEN') === 'PEN' ? 'selected' : ''}>PEN</option>
            <option value="USD" ${cliente.monedaFijo === 'USD' ? 'selected' : ''}>USD</option>
          </select>
        </div>
        <div class="modal-form-row">
          <label for="ec-dia-vencimiento">Dia de vencimiento (override)</label>
          <input type="number" id="ec-dia-vencimiento" min="1" max="28" placeholder="Usa el default global" value="${cliente.diaVencimiento ?? ''}">
        </div>
      </form>
      <p style="font-size:11.5px;color:var(--text-muted);margin-top:8px">
        Titular/Correo/Celular se vuelven a sincronizar desde LibreNMS (bill_notes) en cada ciclo —
        una edicion manual aqui se pisa en el proximo sync si LibreNMS trae otro valor.<br>
        <strong>Fijo parcial</strong>: asigna el monto fijo de cada puerto desde "Ver puertos" (igual que hoy).
        <strong>Fijo total</strong>: la boleta siempre cobra este monto unico, y los puertos quedan bloqueados para editar tarifa
        (igual necesitan una tarifa asignada para que el consumo se siga midiendo como referencia).<br>
        <strong>Dia de vencimiento</strong>: la boleta vence ese dia del mes siguiente al periodo facturado. Vacio = usa el
        default global (Configuracion General → Vencimientos).<br>
        <strong>Libre</strong>: no genera boleta ni consumo mensual, solo se registran los pagos cuando el cliente paga
        (Facturacion → Facturas del perfil del cliente).
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
          const tipoCobro = body.querySelector('#ec-tipo-cobro').value;
          const montoFijoMensual = body.querySelector('#ec-monto-fijo').value;
          const monedaFijo = body.querySelector('#ec-moneda-fijo').value;
          const diaVencimientoRaw = body.querySelector('#ec-dia-vencimiento').value;

          if (tipoCobro === 'fijo_total' && !montoFijoMensual) {
            showToast('Ingresa el monto fijo mensual', { variant: 'error' });
            return false;
          }
          if (diaVencimientoRaw && (Number(diaVencimientoRaw) < 1 || Number(diaVencimientoRaw) > 28)) {
            showToast('El dia de vencimiento debe estar entre 1 y 28', { variant: 'error' });
            return false;
          }
          try {
            await api.patch(`/corporativos/${cliente.id}`, {
              titular: titular || null,
              correo: correo || null,
              celular: celular || null,
              tipoCobro,
              montoFijoMensual: tipoCobro === 'fijo_total' ? montoFijoMensual : null,
              monedaFijo: tipoCobro === 'fijo_total' ? monedaFijo : null,
              diaVencimiento: diaVencimientoRaw ? Number(diaVencimientoRaw) : null
            });
            showToast('Cliente actualizado', { variant: 'success' });
            invalidarCache('/corporativos');
            close();
            await cargar();
          } catch (err) {
            showToast(err.message || 'No se pudo actualizar el cliente', { variant: 'error' });
          }
        }
      }
    ]
  });

  modal.body.querySelector('#ec-tipo-cobro').addEventListener('change', (e) => {
    const mostrar = e.target.value === 'fijo_total';
    modal.body.querySelector('#ec-fijo-row').style.display = mostrar ? '' : 'none';
    modal.body.querySelector('#ec-fijo-moneda-row').style.display = mostrar ? '' : 'none';
  });
}

document.getElementById('clientes-search').addEventListener('input', (e) => {
  filtroTexto = e.target.value;
  paginaActual = 1;
  renderTabla();
});

filtroEstadoSelect.addEventListener('change', (e) => {
  filtroEstado = e.target.value;
  paginaActual = 1;
  renderTabla();
});

filtroTipoCobroSelect.addEventListener('change', (e) => {
  filtroTipoCobro = e.target.value;
  paginaActual = 1;
  renderTabla();
});

rows.addEventListener('click', (e) => {
  const verBtn = e.target.closest('[data-ver-puertos]');
  const editarBtn = e.target.closest('[data-editar-cliente]');
  const activoBtn = e.target.closest('[data-toggle-activo-cliente]');

  if (verBtn) {
    const cliente = clientes.find((c) => c.id === Number(verBtn.dataset.id));
    if (cliente) {abrirModalPuertos(cliente);}
  } else if (editarBtn) {
    const cliente = clientes.find((c) => c.id === Number(editarBtn.dataset.id));
    if (cliente) {abrirModalEditar(cliente);}
  } else if (activoBtn) {
    const cliente = clientes.find((c) => c.id === Number(activoBtn.dataset.id));
    if (cliente) {toggleActivoCliente(cliente);}
  }
});

/**
 * Deshabilitar cascadea a todos los puertos del cliente (ver
 * CorporativosService.actualizarActivo) -- no se toca LibreNMS, es
 * reversible desde este mismo menu.
 */
async function toggleActivoCliente(cliente) {
  const activo = !cliente.activo;
  try {
    await api.patch(`/corporativos/${cliente.id}/activo`, { activo });
    showToast(activo ? 'Cliente habilitado' : 'Cliente deshabilitado (todos sus puertos tambien)', { variant: 'success' });
    invalidarCache('/corporativos');
    await cargar();
  } catch (err) {
    showToast(err.message || 'No se pudo cambiar el estado del cliente', { variant: 'error' });
  }
}

cargar().catch(() => {
  rows.innerHTML = '<tr><td colspan="7">No se pudo conectar con la API.</td></tr>';
});
