import { requireAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { getCacheado } from '../lib/api-cache.js';
import { showToast } from '../v4/toast.js';
import { showModal } from '../v4/modal.js';
import { escapeHtml } from '../lib/ports-table.js';
import { fmtMonto } from '../lib/format.js';

requireAuth();

const tipoCobroSelect = document.getElementById('em-tipocobro');
const clienteToggle = document.getElementById('em-cliente-toggle');
const clienteMenu = document.getElementById('em-cliente-menu');
const plantillaSelect = document.getElementById('em-plantilla');
const badgeEl = document.getElementById('em-cliente-badge');
const vacioAviso = document.getElementById('em-vacio-aviso');
const fijoTotalBlock = document.getElementById('em-fijo-total-block');
const montoFijoInput = document.getElementById('em-monto-fijo');
const puertosBlock = document.getElementById('em-puertos-block');
const puertosRows = document.getElementById('em-puertos-rows');
const tipoCambioInput = document.getElementById('em-tipo-cambio');
const cuentaDestinoSelect = document.getElementById('em-cuenta-destino');
const mensajeInput = document.getElementById('em-mensaje');
const chipsEl = document.getElementById('em-chips');
const previewEl = document.getElementById('em-preview');
const totalBoxEl = document.getElementById('em-total-box');
const totalLabelEl = document.getElementById('em-total-label');
const totalAmtEl = document.getElementById('em-total-amt');
const canalEl = document.getElementById('em-canal');
const enviarBtn = document.getElementById('em-enviar-btn');

const TIPO_COBRO_TEXTO = { variable: 'Variable', fijo_parcial: 'Fijo parcial', fijo_total: 'Fijo total' };
const CANAL_TEXTO = { sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp' };
const TODOS_SENTINEL = '__todos__';

// "Plantillas guardadas" -- no hay backend de plantillas todavia, se guardan
// aqui como punto de partida editable. El usuario puede escribir su propio
// mensaje igual, la plantilla solo precarga el textarea.
const PLANTILLAS = [
  {
    nombre: 'Recordatorio de consumo por puerto',
    texto:
      'Hola {titular}, este es el detalle de tu consumo del periodo:\n\n{puertos_detalle}\n\nPuedes realizar el pago a:\nSoles: {cuenta_soles}\nDolares: {cuenta_dolares}\n\nGracias por tu preferencia.'
  },
  {
    nombre: 'Recordatorio de monto fijo',
    texto:
      'Hola {titular}, tu monto a pagar este mes es {total_consolidado}.\n\nCuenta soles: {cuenta_soles}\nCuenta dolares: {cuenta_dolares}\n\nGracias por tu preferencia.'
  }
];

const VARIABLES = [
  { key: 'titular', label: '{titular}' },
  { key: 'puertos_detalle', label: '{puertos_detalle}' },
  { key: 'total_consolidado', label: '{total_consolidado}' },
  { key: 'cuenta_soles', label: '{cuenta_soles}' },
  { key: 'cuenta_dolares', label: '{cuenta_dolares}' }
];

let clientes = [];
let clientesFiltrados = [];
let cuentas = [];
/** IDs (number) de los clientes marcados en el dropdown de checkboxes. */
let seleccionIds = new Set();
let canalActual = 'sms';
/** Solo se usa en modo "un cliente": una fila editable por puerto {id, nombre, dispositivo, moneda, consumo, tarifa}. */
let puertosState = [];

function fmtMoneda(moneda, valor) {
  return `${moneda} ${fmtMonto(Number(valor) || 0)}`;
}

function cuentaTexto(cuenta) {
  return cuenta ? `${cuenta.nombreCuenta} - ${cuenta.banco} - ${cuenta.numeroCuenta}` : '(sin cuenta configurada)';
}

function getCuentaSoles() {
  const destino = cuentas.find((c) => c.id === Number(cuentaDestinoSelect.value));
  if (destino && destino.moneda === 'PEN') {return cuentaTexto(destino);}
  return cuentaTexto(cuentas.find((c) => c.moneda === 'PEN' && c.activa));
}
function getCuentaDolares() {
  const destino = cuentas.find((c) => c.id === Number(cuentaDestinoSelect.value));
  if (destino && destino.moneda === 'USD') {return cuentaTexto(destino);}
  return cuentaTexto(cuentas.find((c) => c.moneda === 'USD' && c.activa));
}

function clientesSeleccionados() {
  return clientesFiltrados.filter((c) => seleccionIds.has(c.id));
}

// ===================== Dropdown de clientes (checkboxes + "Seleccionar todos") =====================

function actualizarTextoToggle() {
  const n = seleccionIds.size;
  if (n === 0) {clienteToggle.textContent = 'Selecciona uno o mas clientes';}
  else if (n === clientesFiltrados.length) {clienteToggle.textContent = `Todos los clientes (${n})`;}
  else if (n === 1) {clienteToggle.textContent = clientesSeleccionados()[0].nombre;}
  else {clienteToggle.textContent = `${n} clientes seleccionados`;}
}

function renderMenuClientes() {
  if (clientesFiltrados.length === 0) {
    clienteMenu.innerHTML = '<div class="em-ms-empty">No hay clientes con ese tipo de cobro.</div>';
    return;
  }
  const todosMarcados = seleccionIds.size === clientesFiltrados.length;
  const opcionesHtml = clientesFiltrados
    .map((c) => `
      <label class="em-ms-option">
        <input type="checkbox" value="${c.id}" ${seleccionIds.has(c.id) ? 'checked' : ''}>
        ${escapeHtml(c.nombre)}
      </label>`)
    .join('');
  clienteMenu.innerHTML = `
    <label class="em-ms-option all">
      <input type="checkbox" value="${TODOS_SENTINEL}" ${todosMarcados ? 'checked' : ''}>
      Seleccionar todos
    </label>
    ${opcionesHtml}
  `;
}

clienteMenu.addEventListener('change', (e) => {
  const input = e.target.closest('input[type="checkbox"]');
  if (!input) {return;}
  if (input.value === TODOS_SENTINEL) {
    seleccionIds = input.checked ? new Set(clientesFiltrados.map((c) => c.id)) : new Set();
  } else {
    const id = Number(input.value);
    if (input.checked) {seleccionIds.add(id);}
    else {seleccionIds.delete(id);}
  }
  renderMenuClientes();
  actualizarTextoToggle();
  onSeleccionCambio();
});

clienteToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const abrir = clienteMenu.hidden;
  clienteMenu.hidden = !abrir;
  clienteToggle.setAttribute('aria-expanded', String(abrir));
});
document.addEventListener('click', (e) => {
  if (!clienteMenu.hidden && !e.target.closest('#em-cliente-ms')) {
    clienteMenu.hidden = true;
    clienteToggle.setAttribute('aria-expanded', 'false');
  }
});

function aplicarFiltroTipoCobro() {
  const filtro = tipoCobroSelect.value;
  clientesFiltrados = filtro ? clientes.filter((c) => c.tipoCobro === filtro) : clientes;
  seleccionIds = new Set();
  renderMenuClientes();
  actualizarTextoToggle();
  onSeleccionCambio();
}

tipoCobroSelect.addEventListener('change', aplicarFiltroTipoCobro);

// ===================== Calculos por cliente =====================

function calcularTotalesPuertos(puertos) {
  const tc = Number(tipoCambioInput.value) || 0;
  let totalPen = 0;
  let totalUsd = 0;
  for (const p of puertos) {
    const subtotal = (Number(p.consumo) || 0) * (Number(p.tarifa) || 0);
    if (p.moneda === 'USD') {
      totalUsd += subtotal;
      totalPen += subtotal * tc;
    } else {
      totalPen += subtotal;
      totalUsd += tc > 0 ? subtotal / tc : 0;
    }
  }
  return { totalPen, totalUsd };
}

// ===================== Modo "un cliente" (igual que antes: mini-tabla editable) =====================

function variablesPlanas(cliente) {
  return {
    titular: cliente?.titular || cliente?.nombre || '(cliente sin titular)',
    total_consolidado: totalConsolidadoTexto(cliente),
    cuenta_soles: getCuentaSoles(),
    cuenta_dolares: getCuentaDolares()
  };
}

function totalConsolidadoTexto(cliente) {
  if (cliente?.tipoCobro === 'fijo_total') {
    return fmtMoneda(cliente.monedaFijo ?? 'PEN', cliente.montoFijoMensual);
  }
  const { totalPen, totalUsd } = calcularTotalesPuertos(puertosState);
  return `PEN ${fmtMonto(totalPen)} (USD ${fmtMonto(totalUsd)} equivalente)`;
}

function puertosDetalleTexto(cliente) {
  if (!cliente) {return '';}
  if (cliente.tipoCobro === 'fijo_total') {
    return `Monto fijo mensual: ${fmtMoneda(cliente.monedaFijo ?? 'PEN', cliente.montoFijoMensual)}`;
  }
  if (puertosState.length === 0) {return '(este cliente no tiene puertos facturables)';}
  const lineas = puertosState.map((p) => {
    const subtotal = (Number(p.consumo) || 0) * (Number(p.tarifa) || 0);
    return `- ${p.nombre} (${p.dispositivo}): ${p.consumo || 0} Mbps x ${fmtMoneda(p.moneda, p.tarifa)} = ${fmtMoneda(p.moneda, subtotal)}`;
  });
  const { totalPen, totalUsd } = calcularTotalesPuertos(puertosState);
  lineas.push('', `Total a cobrar: PEN ${fmtMonto(totalPen)} (USD ${fmtMonto(totalUsd)} equivalente)`);
  return lineas.join('\n');
}

function puertosDetalleHtml(cliente) {
  if (!cliente) {return '';}
  if (cliente.tipoCobro === 'fijo_total') {
    return `<p style="margin:8px 0">Monto a cobrar: <strong>${escapeHtml(fmtMoneda(cliente.monedaFijo ?? 'PEN', cliente.montoFijoMensual))}</strong></p>`;
  }
  if (puertosState.length === 0) {
    return '<p style="color:var(--text-muted);font-size:12.5px">Este cliente no tiene puertos facturables.</p>';
  }
  return puertosState
    .map((p) => {
      const subtotal = (Number(p.consumo) || 0) * (Number(p.tarifa) || 0);
      const tc = Number(tipoCambioInput.value) || 0;
      const enOtraMoneda = p.moneda === 'USD' ? fmtMoneda('PEN', subtotal * tc) : fmtMoneda('USD', tc > 0 ? subtotal / tc : 0);
      return `
        <div class="em-port-block">
          <div class="em-port-block-head"><span>${escapeHtml(p.nombre)}</span><span class="n">${escapeHtml(p.dispositivo)}</span></div>
          <div class="em-port-block-rows">
            <div class="em-port-block-row"><span>Consumo</span><span class="val">${p.consumo || 0} Mbps</span></div>
            <div class="em-port-block-row"><span>Tarifa</span><span class="val">${escapeHtml(fmtMoneda(p.moneda, p.tarifa))}/Mbps</span></div>
            <div class="em-port-block-row sub"><span>Subtotal</span><span class="val">${escapeHtml(fmtMoneda(p.moneda, subtotal))} &middot; ${escapeHtml(enOtraMoneda)}</span></div>
          </div>
        </div>`;
    })
    .join('');
}

function actualizarTotalBoxUnCliente(cliente) {
  totalBoxEl.hidden = false;
  if (cliente.tipoCobro === 'fijo_total') {
    totalLabelEl.textContent = 'Monto a cobrar';
    totalAmtEl.textContent = fmtMoneda(cliente.monedaFijo ?? 'PEN', cliente.montoFijoMensual);
    return;
  }
  const n = puertosState.length;
  const { totalPen, totalUsd } = calcularTotalesPuertos(puertosState);
  totalLabelEl.textContent = `Total a cobrar (${n} puerto${n === 1 ? '' : 's'})`;
  totalAmtEl.textContent = `PEN ${fmtMonto(totalPen)} · USD ${fmtMonto(totalUsd)}`;
}

function escapeAndBr(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function sustituirTexto(segmento, vars) {
  let out = segmento;
  for (const [key, val] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(val);
  }
  return out;
}

/** Texto final para UN cliente (sin variables sin reemplazar) -- lo que se "envia" a ese cliente. */
function resolverTextoPlanoPara(cliente, puertosDeEseCliente) {
  const puertosDetalle =
    cliente.tipoCobro === 'fijo_total'
      ? `Monto fijo mensual: ${fmtMoneda(cliente.monedaFijo ?? 'PEN', cliente.montoFijoMensual)}`
      : puertosDeEseCliente === puertosState
        ? puertosDetalleTexto(cliente)
        : '(consulta el consumo de este cliente individualmente en el Editor de mensajes)';
  const vars = {
    titular: cliente.titular || cliente.nombre,
    total_consolidado: cliente.tipoCobro === 'fijo_total' ? fmtMoneda(cliente.monedaFijo ?? 'PEN', cliente.montoFijoMensual) : '(revisar individualmente)',
    cuenta_soles: getCuentaSoles(),
    cuenta_dolares: getCuentaDolares(),
    puertos_detalle: puertosDetalle
  };
  return sustituirTexto(mensajeInput.value, vars);
}

function renderPuertosTabla() {
  if (puertosState.length === 0) {
    puertosRows.innerHTML = '<div class="em-port-row" style="grid-template-columns:1fr;color:var(--text-muted)">Este cliente no tiene puertos facturables.</div>';
    return;
  }
  puertosRows.innerHTML = puertosState
    .map((p, i) => {
      const subtotal = (Number(p.consumo) || 0) * (Number(p.tarifa) || 0);
      return `
        <div class="em-port-row">
          <span class="em-port-name">${escapeHtml(p.nombre)}<span class="dev">${escapeHtml(p.dispositivo)}</span></span>
          <input type="number" step="0.0001" min="0" data-field="consumo" data-idx="${i}" value="${p.consumo}">
          <input type="number" step="0.0001" min="0" data-field="tarifa" data-idx="${i}" value="${p.tarifa}">
          <span class="em-subtotal-mini" data-idx="${i}">${escapeHtml(fmtMoneda(p.moneda, subtotal))}</span>
        </div>`;
    })
    .join('');
}

puertosRows.addEventListener('input', (e) => {
  const input = e.target.closest('input[data-field]');
  if (!input) {return;}
  const idx = Number(input.dataset.idx);
  const field = input.dataset.field;
  puertosState[idx][field] = input.value;
  const subtotal = (Number(puertosState[idx].consumo) || 0) * (Number(puertosState[idx].tarifa) || 0);
  const cell = puertosRows.querySelector(`.em-subtotal-mini[data-idx="${idx}"]`);
  if (cell) {cell.textContent = fmtMoneda(puertosState[idx].moneda, subtotal);}
  renderPreview();
});

async function cargarPuertosDeUnCliente(cliente) {
  puertosRows.innerHTML = '<div class="em-port-row" style="grid-template-columns:1fr">Cargando puertos...</div>';
  try {
    const puertos = await api.get(`/corporativos/${cliente.id}/puertos`);
    puertosState = puertos
      .filter((p) => p.activo)
      .map((p) => ({
        id: p.id,
        nombre: p.alias || p.nombrePuerto,
        dispositivo: p.device?.nombre ?? '-',
        moneda: p.tarifaVigente?.moneda ?? 'PEN',
        consumo: 0,
        tarifa: p.tarifaVigente ? Number(p.tarifaVigente.valorTarifa).toFixed(4) : '0'
      }));
    renderBadge();
    renderPuertosTabla();
    renderPreview();
  } catch (err) {
    puertosRows.innerHTML = `<div class="em-port-row" style="grid-template-columns:1fr">No se pudieron cargar los puertos (${escapeHtml(err.message)}).</div>`;
  }
}

// ===================== Badge =====================

function renderBadge() {
  const seleccion = clientesSeleccionados();
  if (seleccion.length === 0) {
    badgeEl.style.display = 'none';
    vacioAviso.style.display = '';
    return;
  }
  vacioAviso.style.display = 'none';
  badgeEl.style.display = 'inline-flex';

  if (seleccion.length === 1) {
    const cliente = seleccion[0];
    const texto = TIPO_COBRO_TEXTO[cliente.tipoCobro] ?? cliente.tipoCobro;
    const detallePuertos = cliente.tipoCobro !== 'fijo_total' ? ` &middot; ${puertosState.length} puerto${puertosState.length === 1 ? '' : 's'} detectado${puertosState.length === 1 ? '' : 's'}` : '';
    badgeEl.innerHTML = `<span class="dot"></span>Tipo de cobro: ${escapeHtml(texto)}${detallePuertos}`;
    return;
  }

  const tiposDistintos = new Set(seleccion.map((c) => c.tipoCobro));
  const tipoTexto = tiposDistintos.size === 1 ? TIPO_COBRO_TEXTO[[...tiposDistintos][0]] : 'mixto';
  badgeEl.innerHTML = `<span class="dot"></span>${seleccion.length} clientes &middot; Tipo de cobro: ${escapeHtml(tipoTexto)}`;
}

// ===================== Orquestacion segun cuantos clientes hay seleccionados =====================

async function onSeleccionCambio() {
  const seleccion = clientesSeleccionados();

  if (seleccion.length === 0) {
    puertosState = [];
    fijoTotalBlock.hidden = true;
    puertosBlock.hidden = true;
    renderBadge();
    renderPreview();
    return;
  }

  if (seleccion.length === 1) {
    const cliente = seleccion[0];
    renderBadge();
    if (cliente.tipoCobro === 'fijo_total') {
      puertosState = [];
      fijoTotalBlock.hidden = false;
      puertosBlock.hidden = true;
      montoFijoInput.value = fmtMoneda(cliente.monedaFijo ?? 'PEN', cliente.montoFijoMensual);
      renderPreview();
    } else {
      fijoTotalBlock.hidden = true;
      puertosBlock.hidden = false;
      await cargarPuertosDeUnCliente(cliente);
    }
    return;
  }

  // 2+ clientes: modo masivo -- no tiene sentido editar consumo/tarifa por
  // puerto de varios clientes distintos a la vez, asi que se oculta esa
  // parte del editor y el mensaje se personaliza por cliente al enviar.
  puertosState = [];
  fijoTotalBlock.hidden = true;
  puertosBlock.hidden = true;
  renderBadge();
  renderPreview();
}

// ===================== Vista previa =====================

function renderPreviewUnCliente(cliente) {
  actualizarTotalBoxUnCliente(cliente);
  const raw = mensajeInput.value;
  if (!raw.trim()) {
    previewEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px;margin:0">Escribe un mensaje (o elige una plantilla) para ver la vista previa.</p>';
    return;
  }
  const vars = variablesPlanas(cliente);
  const varsEscapadas = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)]));

  let html;
  if (raw.includes('{puertos_detalle}')) {
    const [antes, ...resto] = raw.split('{puertos_detalle}');
    const despues = resto.join('{puertos_detalle}');
    html = sustituirTexto(escapeAndBr(antes), varsEscapadas) + puertosDetalleHtml(cliente) + sustituirTexto(escapeAndBr(despues), varsEscapadas);
  } else {
    html = sustituirTexto(escapeAndBr(raw), varsEscapadas);
  }
  previewEl.innerHTML = html;
}

function renderPreviewMasivo(seleccion) {
  const filas = seleccion.map((c) => {
    const montoTexto = c.tipoCobro === 'fijo_total' ? fmtMoneda(c.monedaFijo ?? 'PEN', c.montoFijoMensual) : '(consumo pendiente -- revisar individualmente)';
    return { cliente: c, montoTexto };
  });

  const listaHtml = filas
    .map(
      (f) => `
      <div class="em-port-block-row" style="padding:5px 0">
        <span>${escapeHtml(f.cliente.nombre)}</span><span class="val">${escapeHtml(f.montoTexto)}</span>
      </div>`
    )
    .join('');

  previewEl.innerHTML = `
    <p style="margin:0 0 8px;font-weight:700">Envio masivo a ${filas.length} clientes</p>
    <div>${listaHtml}</div>
    <p style="margin-top:12px;font-size:11.5px;color:var(--text-muted)">
      El mensaje se personaliza por cliente (titular, monto, cuentas) al momento de enviar -- esta es la lista de destinatarios y su monto detectado.
    </p>
  `;

  // Los montos fijos pueden venir en PEN o USD segun cada cliente -- hay que
  // convertir todo a una sola moneda antes de sumar, si no el total mezcla
  // numeros de distinta moneda como si fueran lo mismo.
  const tc = Number(tipoCambioInput.value) || 0;
  const fijos = filas.filter((f) => f.cliente.tipoCobro === 'fijo_total');
  const sumaFijosPen = fijos.reduce((acc, f) => {
    const monto = Number(f.cliente.montoFijoMensual || 0);
    return acc + (f.cliente.monedaFijo === 'USD' ? monto * tc : monto);
  }, 0);
  if (fijos.length > 0) {
    totalBoxEl.hidden = false;
    totalLabelEl.textContent = `Total estimado (${fijos.length} con monto fijo)`;
    totalAmtEl.textContent = `PEN ${fmtMonto(sumaFijosPen)}`;
  } else {
    totalBoxEl.hidden = true;
  }
}

/**
 * La vista previa es una RENDERIZACION del mismo texto que se envia, no una
 * maqueta aparte: con un cliente, se parte el textarea en {puertos_detalle}
 * para inyectar ahi los bloques visuales reales. Con varios, se muestra la
 * lista de destinatarios/monto (el texto final varia por cliente, no hay un
 * unico "resuelto" que mostrar de una vez).
 */
function renderPreview() {
  const seleccion = clientesSeleccionados();

  if (seleccion.length === 0) {
    totalBoxEl.hidden = true;
    previewEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px;margin:0">Elige uno o mas clientes y escribe un mensaje para ver la vista previa.</p>';
    return;
  }
  if (!mensajeInput.value.trim() && seleccion.length === 1) {
    totalBoxEl.hidden = true;
    previewEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px;margin:0">Escribe un mensaje (o elige una plantilla) para ver la vista previa.</p>';
    return;
  }

  if (seleccion.length === 1) {renderPreviewUnCliente(seleccion[0]);}
  else {renderPreviewMasivo(seleccion);}
}

// ===================== Chips de variables =====================

function renderChips() {
  chipsEl.innerHTML = VARIABLES.map((v) => `<button type="button" class="em-var-chip" data-insert="{${v.key}}">${v.label}</button>`).join('');
}

function insertarEnCursor(texto) {
  const start = mensajeInput.selectionStart ?? mensajeInput.value.length;
  const end = mensajeInput.selectionEnd ?? mensajeInput.value.length;
  mensajeInput.value = mensajeInput.value.slice(0, start) + texto + mensajeInput.value.slice(end);
  mensajeInput.focus();
  mensajeInput.selectionStart = mensajeInput.selectionEnd = start + texto.length;
}

chipsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-insert]');
  if (!btn) {return;}
  insertarEnCursor(btn.dataset.insert);
  renderPreview();
});

plantillaSelect.addEventListener('change', () => {
  const idx = plantillaSelect.value;
  if (idx === '') {return;}
  mensajeInput.value = PLANTILLAS[Number(idx)].texto;
  renderPreview();
});

canalEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.em-chan');
  if (!btn) {return;}
  canalActual = btn.dataset.canal;
  canalEl.querySelectorAll('.em-chan').forEach((b) => b.classList.toggle('active', b === btn));
});

tipoCambioInput.addEventListener('input', renderPreview);
cuentaDestinoSelect.addEventListener('change', renderPreview);
mensajeInput.addEventListener('input', renderPreview);

// ===================== Enviar =====================

/** Boton "Copiar mensaje", comun a los 3 canales cuando no se envia de verdad (sms/email todavia no conectados). */
function accionCopiar(texto, etiquetaExito) {
  return {
    label: 'Copiar mensaje',
    variant: 'primary',
    closeOnAction: false,
    action: async () => {
      try {
        await navigator.clipboard.writeText(texto);
        showToast(etiquetaExito, { variant: 'success' });
      } catch {
        showToast('No se pudo copiar automaticamente -- selecciona el texto a mano', { variant: 'error' });
      }
    }
  };
}

/** Envia por WhatsApp de verdad (WaboxApp) un lote de {numero, texto} y muestra el resultado por destinatario. */
async function enviarWhatsappReal(destinatarios, onResultado) {
  try {
    const resultados = await api.post('/mensajeria/whatsapp/enviar', { destinatarios });
    const exitosos = resultados.filter((r) => r.ok).length;
    if (exitosos === resultados.length) {
      showToast(`${exitosos} mensaje${exitosos === 1 ? '' : 's'} de WhatsApp enviado${exitosos === 1 ? '' : 's'}`, { variant: 'success' });
    } else if (exitosos === 0) {
      showToast(resultados[0]?.error || 'No se pudo enviar ningun mensaje', { variant: 'error' });
    } else {
      showToast(`${exitosos} de ${resultados.length} mensajes enviados -- revisa el detalle`, { variant: 'error' });
    }
    onResultado?.(resultados);
  } catch (err) {
    showToast(err.message || 'No se pudo enviar por WhatsApp', { variant: 'error' });
  }
}

enviarBtn.addEventListener('click', () => {
  const seleccion = clientesSeleccionados();
  if (seleccion.length === 0) {
    showToast('Elige uno o mas clientes', { variant: 'error' });
    return;
  }
  if (!mensajeInput.value.trim()) {
    showToast('Escribe un mensaje', { variant: 'error' });
    return;
  }
  const canalTexto = CANAL_TEXTO[canalActual];
  const esWhatsapp = canalActual === 'whatsapp';

  if (seleccion.length === 1) {
    const cliente = seleccion[0];
    const textoFinal = resolverTextoPlanoPara(cliente, puertosState);
    const destino = canalActual === 'email' ? cliente.correo : cliente.celular;
    showModal({
      title: `Enviar por ${canalTexto}`,
      size: 'md',
      body: `
        <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px">Destino: <strong>${escapeHtml(destino || '(sin dato de contacto)')}</strong></p>
        <pre style="white-space:pre-wrap;font-family:var(--font);font-size:13px;color:var(--text);background:var(--bg-surface-secondary);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:12px;max-height:320px;overflow:auto">${escapeHtml(textoFinal)}</pre>
        ${
  esWhatsapp
    ? '<p style="font-size:11.5px;color:var(--text-muted);margin-top:10px">Este mensaje ya tiene todas las variables resueltas. Se enviara por WhatsApp de verdad al numero de arriba.</p>'
    : `<p style="font-size:11.5px;color:var(--text-muted);margin-top:10px">Este mensaje ya tiene todas las variables resueltas. El envio real por ${canalTexto} todavia no esta conectado a un proveedor -- por ahora puedes copiarlo.</p>`
}
      `,
      actions: esWhatsapp
        ? [
          { label: 'Cerrar', variant: 'ghost' },
          {
            label: 'Enviar por WhatsApp',
            variant: 'primary',
            closeOnAction: true,
            action: async () => {
              if (!destino) {
                showToast('Este cliente no tiene numero de celular registrado', { variant: 'error' });
                return;
              }
              await enviarWhatsappReal([{ numero: destino, texto: textoFinal, corporativoId: cliente.id }]);
            }
          }
        ]
        : [{ label: 'Cerrar', variant: 'ghost' }, accionCopiar(textoFinal, 'Mensaje copiado al portapapeles')]
    });
    return;
  }

  // Varios clientes: un mensaje resuelto distinto por cada uno.
  const mensajes = seleccion.map((cliente) => ({
    cliente,
    destino: canalActual === 'email' ? cliente.correo : cliente.celular,
    texto: resolverTextoPlanoPara(cliente, null)
  }));
  const textoTodos = mensajes.map((m) => `=== ${m.cliente.nombre} (${m.destino || 'sin contacto'}) ===\n${m.texto}`).join('\n\n');
  const sinContacto = mensajes.filter((m) => !m.destino).length;

  showModal({
    title: `Enviar por ${canalTexto} a ${mensajes.length} clientes`,
    size: 'lg',
    body: `
      <p style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px">
        ${
  esWhatsapp
    ? `Un mensaje personalizado por cliente, enviado por WhatsApp de verdad.${sinContacto > 0 ? ` ${sinContacto} cliente(s) sin celular registrado se van a omitir.` : ''}`
    : `Un mensaje personalizado por cliente. El envio real por ${canalTexto} todavia no esta conectado a un proveedor -- por ahora puedes copiar todo el lote.`
}
      </p>
      <div style="max-height:380px;overflow:auto;display:flex;flex-direction:column;gap:10px">
        ${mensajes
    .map(
      (m) => `
          <div style="border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:10px" data-msj-destino="${escapeHtml(m.destino || '')}">
            <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px">${escapeHtml(m.cliente.nombre)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">${escapeHtml(m.destino || '(sin dato de contacto)')}</div>
            <pre style="white-space:pre-wrap;font-family:var(--font);font-size:12px;color:var(--text);margin:0">${escapeHtml(m.texto)}</pre>
          </div>`
    )
    .join('')}
      </div>
    `,
    actions: esWhatsapp
      ? [
        { label: 'Cerrar', variant: 'ghost' },
        {
          label: `Enviar a ${mensajes.length - sinContacto} clientes`,
          variant: 'primary',
          closeOnAction: true,
          action: async () => {
            const destinatarios = mensajes.filter((m) => m.destino).map((m) => ({ numero: m.destino, texto: m.texto, corporativoId: m.cliente.id }));
            if (destinatarios.length === 0) {
              showToast('Ningun cliente seleccionado tiene celular registrado', { variant: 'error' });
              return;
            }
            await enviarWhatsappReal(destinatarios);
          }
        }
      ]
      : [{ label: 'Cerrar', variant: 'ghost' }, { ...accionCopiar(textoTodos, `${mensajes.length} mensajes copiados al portapapeles`), label: 'Copiar todos' }]
  });
});

// ===================== Carga inicial =====================

async function init() {
  plantillaSelect.innerHTML =
    '<option value="">Sin plantilla (mensaje en blanco)</option>' +
    PLANTILLAS.map((p, i) => `<option value="${i}">${escapeHtml(p.nombre)}</option>`).join('');
  renderChips();
  renderPreview();

  const [clientesRes, cuentasRes, tipoCambioRes] = await Promise.allSettled([
    getCacheado('/corporativos'),
    getCacheado('/cuentas-empresa'),
    getCacheado('/tipo-cambio')
  ]);

  if (clientesRes.status === 'fulfilled') {
    clientes = clientesRes.value.filter((c) => c.activo);
    aplicarFiltroTipoCobro();
  } else {
    showToast('No se pudo cargar la lista de clientes', { variant: 'error' });
  }

  if (cuentasRes.status === 'fulfilled') {
    cuentas = cuentasRes.value.filter((c) => c.activa);
    cuentaDestinoSelect.innerHTML =
      '<option value="">Selecciona una cuenta</option>' +
      cuentas.map((c) => `<option value="${c.id}">${escapeHtml(c.nombreCuenta)} - ${escapeHtml(c.banco)} (${escapeHtml(c.moneda)})</option>`).join('');
  }

  if (tipoCambioRes.status === 'fulfilled' && tipoCambioRes.value.length > 0) {
    tipoCambioInput.value = Number(tipoCambioRes.value[0].valor).toFixed(4);
  }
}

init();
