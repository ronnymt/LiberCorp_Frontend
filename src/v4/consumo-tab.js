// Componente reusable "Consumo" -- calculo/recalculo de periodo, total
// facturado y percentil 95 por puerto. Se monta dentro de la pestana
// "Trafico" de la ficha de cliente (cliente.html) -- unico lugar que lo usa
// (existio una pagina standalone consumo.html, se elimino por redundante:
// mismo componente, dos URLs para lo mismo).
//
// A proposito NO incluye su propio header/breadcrumb/topbar: el caller decide
// que chrome lo rodea (la ficha de cliente reusa el que ya esta puesto arriba
// de las tabs).

import { tienePermiso } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { showToast } from './toast.js';
import { showModal } from './modal.js';
import { escapeHtml } from '../lib/ports-table.js';
import { fmtMonto } from '../lib/format.js';

const ESTADO_BOLETA_CLS = { pendiente: 'status-red', parcial: 'status-yellow', pagado: 'status-green' };
const ESTADO_PAGO_CLS = { pendiente: 'status-red', parcial: 'status-yellow', pagado: 'status-green' };

function svgAImgSrc(svg) {
  if (!svg) {return null;}
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${b64}`;
}

/** Convierte el SVG archivado del periodo a PNG (via canvas) y dispara la descarga -- PNG en vez de SVG crudo para que se pueda compartir/pegar directo (WhatsApp, Word, etc). */
function descargarGraficaComoPng(svg, nombreArchivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 980;
      canvas.height = img.naturalHeight || 300;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('No se pudo generar la imagen'));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${nombreArchivo}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('No se pudo cargar la grafica'));
    img.src = svgAImgSrc(svg);
  });
}

function mesActualMenosUno() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodoAFecha(periodoMes) {
  return `${periodoMes}-01`;
}

export function fmtPeriodoLargo(periodoMes) {
  const [year, month] = periodoMes.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}

function fmtFechaHora(iso) {
  if (!iso) {return '-';}
  return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const CALC_TECLAS = [
  'C', 'back', '%', '/',
  '7', '8', '9', '*',
  '4', '5', '6', '-',
  '1', '2', '3', '+',
  '0', '.', '='
];

function calcPuertoNombre(linea) {
  return escapeHtml(linea.port?.alias || linea.port?.nombrePuerto || 'Puerto');
}

function calcPuertosMarkup(puertos) {
  if (puertos.length === 0) {
    return '<p style="font-size:12px;color:var(--text-muted);margin:0">Sin puertos calculados para este periodo todavia.</p>';
  }
  const filas = puertos
    .map(
      (p) => `
        <tr>
          <td>${calcPuertoNombre(p)}</td>
          <td class="cell-mono">${p.valorMedido !== null && p.valorMedido !== undefined ? Number(p.valorMedido).toFixed(4) : '-'}</td>
          <td class="cell-mono">${p.tipoCobro === 'fijo' ? '-' : `${escapeHtml(p.moneda)} ${fmtMonto(p.tarifaAplicada)}`}</td>
          <td><button type="button" class="btn btn-outline btn-sm" data-calc-usar="${p.id}" title="Poner el percentil en la pantalla">Usar</button></td>
        </tr>`
    )
    .join('');
  return `
    <div class="table-responsive" style="max-height:160px;overflow-y:auto">
      <table class="table" style="font-size:12px">
        <thead><tr><th>Puerto</th><th>Percentil (Mbps)</th><th>Costo/Mbps</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

function calcMarkup(puertos) {
  const botones = CALC_TECLAS.map((t) => {
    const etiqueta = { back: '⌫', '/': '÷', '*': '×' }[t] ?? t;
    const claseExtra = t === '=' ? ' btn-primary' : ' btn-outline';
    const spanExtra = t === '0' ? 'grid-column:span 2;' : '';
    return `<button type="button" class="btn btn-sm${claseExtra}" data-calc="${t}" style="${spanExtra}">${etiqueta}</button>`;
  }).join('');

  const opcionesPuertos = puertos
    .map((p) => `<option value="${p.id}">${calcPuertoNombre(p)}</option>`)
    .join('');

  return `
    <div class="modal-form-row">
      <label for="calc-decimales">Decimales</label>
      <input type="number" id="calc-decimales" min="0" max="6" value="2" style="width:70px">
    </div>
    <div id="calc-display" style="background:var(--body-bg);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:10px 12px;text-align:right;font-family:var(--font-mono);font-size:22px;margin-bottom:10px;overflow-x:auto;white-space:nowrap">0</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:16px">${botones}</div>

    <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px">Percentil y costo por puerto (periodo actual)</div>
    <div id="calc-puertos" style="margin-bottom:16px">${calcPuertosMarkup(puertos)}</div>

    ${
  puertos.length > 0
    ? `<div class="modal-form-row">
             <label for="calc-puerto-registrar">Registrar resultado como percentil corregido de</label>
             <select id="calc-puerto-registrar">
               <option value="">Selecciona un puerto</option>
               ${opcionesPuertos}
             </select>
           </div>
           <button type="button" class="btn btn-primary btn-sm" id="calc-registrar-btn" style="width:100%;margin-bottom:16px">Registrar</button>`
    : ''
}

    <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px">Historial</div>
    <div id="calc-historial" style="max-height:110px;overflow-y:auto;font-size:12px;font-family:var(--font-mono);color:var(--text-muted)">Sin calculos todavia.</div>
  `;
}

/**
 * Calculadora compacta para montos, con decimales configurables (redondea
 * SOLO el resultado mostrado tras un calculo, nunca lo que se esta tecleando),
 * historial de la sesion, y referencia rapida del percentil/costo por Mbps de
 * cada puerto del periodo actual -- para cuando hay que recalcular a mano
 * (ej. verificar un percentil sospechoso) y despues registrar la correccion
 * sin salir del modal. Estado 100% local a cada apertura.
 *
 * @param {Array} puertos Lineas de detalle del periodo actual (mismo shape que `detalle` en cargarPeriodo).
 * @param {(detalleId: number, valor: string) => void} onRegistrar Guarda el valor mostrado como percentil corregido de un puerto.
 */
function abrirCalculadora(puertos, onRegistrar) {
  let acumulador = null;
  let operador = null;
  let actual = '';
  let reiniciarAlEscribir = false;
  const historial = [];

  const modal = showModal({ title: 'Calculadora', body: calcMarkup(puertos), actions: [{ label: 'Cerrar', variant: 'outline' }] });
  const displayEl = modal.body.querySelector('#calc-display');
  const decimalesEl = modal.body.querySelector('#calc-decimales');
  const historialEl = modal.body.querySelector('#calc-historial');
  const registrarSelect = modal.body.querySelector('#calc-puerto-registrar');
  const registrarBtn = modal.body.querySelector('#calc-registrar-btn');

  function decimales() {
    const n = Number(decimalesEl.value);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? n : 2;
  }

  function operar(a, b, op) {
    if (op === '+') {return a + b;}
    if (op === '-') {return a - b;}
    if (op === '*') {return a * b;}
    if (op === '/') {return b === 0 ? NaN : a / b;}
    if (op === '%') {return b === 0 ? NaN : a % b;}
    return b;
  }

  /** Lo que se registra es SIEMPRE lo que se ve en pantalla (ya redondeado a "Decimales" si viene de un calculo), nunca la precision interna sin redondear. */
  function valorMostrado() {
    const texto = displayEl.textContent;
    return texto !== '' && texto !== 'Error' && !Number.isNaN(Number(texto)) ? texto : null;
  }

  function actualizarDisplay() {
    if (actual !== '') {
      displayEl.textContent = actual;
    } else if (acumulador !== null) {
      displayEl.textContent = Number.isNaN(acumulador) ? 'Error' : acumulador.toFixed(decimales());
    } else {
      displayEl.textContent = '0';
    }
  }

  function renderHistorial() {
    historialEl.innerHTML = historial.length
      ? historial
        .map((h, i) => `<div data-historial="${i}" style="cursor:pointer;padding:2px 0" title="Click para reusar el resultado">${escapeHtml(h.texto)}</div>`)
        .join('')
      : 'Sin calculos todavia.';
  }

  function pulsar(tecla) {
    if (tecla >= '0' && tecla <= '9') {
      if (reiniciarAlEscribir) {
        actual = '';
        reiniciarAlEscribir = false;
      }
      actual += tecla;
    } else if (tecla === '.') {
      if (reiniciarAlEscribir) {
        actual = '';
        reiniciarAlEscribir = false;
      }
      if (!actual.includes('.')) {actual += actual ? '.' : '0.';}
    } else if (tecla === 'back') {
      actual = actual.slice(0, -1);
    } else if (tecla === 'C') {
      acumulador = null;
      operador = null;
      actual = '';
      reiniciarAlEscribir = false;
    } else if (tecla === '=') {
      if (operador && actual !== '') {
        const expresion = `${acumulador ?? 0} ${operador}`;
        acumulador = operar(acumulador ?? 0, Number(actual), operador);
        historial.unshift({
          texto: `${expresion} ${actual} = ${Number.isNaN(acumulador) ? 'Error' : acumulador.toFixed(decimales())}`,
          valor: acumulador
        });
        renderHistorial();
        operador = null;
        actual = '';
      }
      reiniciarAlEscribir = true;
    } else {
      // operador: + - * / %
      const valor = actual !== '' ? Number(actual) : null;
      if (acumulador === null) {
        acumulador = valor ?? 0;
      } else if (valor !== null && operador) {
        acumulador = operar(acumulador, valor, operador);
      }
      operador = tecla;
      actual = '';
      reiniciarAlEscribir = false;
    }
    actualizarDisplay();
  }

  modal.body.querySelector('div[style*="grid-template-columns"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-calc]');
    if (btn) {pulsar(btn.dataset.calc);}
  });
  decimalesEl.addEventListener('change', actualizarDisplay);

  historialEl.addEventListener('click', (e) => {
    const item = e.target.closest('[data-historial]');
    if (!item) {return;}
    const entrada = historial[Number(item.dataset.historial)];
    if (!entrada || Number.isNaN(entrada.valor)) {return;}
    acumulador = entrada.valor;
    operador = null;
    actual = '';
    reiniciarAlEscribir = true;
    actualizarDisplay();
  });

  modal.body.querySelector('#calc-puertos')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-calc-usar]');
    if (!btn) {return;}
    const puerto = puertos.find((p) => p.id === Number(btn.dataset.calcUsar));
    if (!puerto || puerto.valorMedido === null || puerto.valorMedido === undefined) {
      showToast('Este puerto no tiene percentil calculado', { variant: 'error' });
      return;
    }
    acumulador = null;
    operador = null;
    actual = String(Number(puerto.valorMedido));
    reiniciarAlEscribir = false;
    actualizarDisplay();
  });

  registrarBtn?.addEventListener('click', () => {
    const detalleId = Number(registrarSelect.value);
    const valor = valorMostrado();
    if (!detalleId) {
      showToast('Selecciona a que puerto registrar el resultado', { variant: 'error' });
      return;
    }
    if (valor === null) {
      showToast('No hay un resultado valido para registrar', { variant: 'error' });
      return;
    }
    onRegistrar(detalleId, valor);
  });
}

function markup() {
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-bottom:16px">
      <input type="month" data-el="periodo-input" class="form-control" style="width:160px" aria-label="Periodo">
      <button class="btn btn-primary" data-el="cerrar-periodo-btn">Calcular / recalcular periodo</button>
      <a class="btn btn-outline" data-el="ver-pagos-link" href="#">Ver pagos</a>
      <button class="btn btn-outline" type="button" data-el="calculadora-btn">Calculadora</button>
    </div>
    <div data-el="tarifa-warning"></div>
    <div class="row col-1" style="margin-bottom:16px">
      <div class="card"><div class="card-body" style="display:flex;align-items:center;gap:24px">
        <div style="flex:1;min-width:0">
          <span class="stat-label">Total del periodo</span>
          <div class="stat-value" data-el="resumen-total">-</div>
          <div data-el="resumen-nota" style="font-size:12px;color:var(--text-muted);margin-top:4px"></div>
        </div>
        <div style="width:1px;align-self:stretch;background:var(--border-color)"></div>
        <div style="flex:1;text-align:right">
          <div data-el="resumen-periodo" style="font-size:20px;font-weight:700;color:var(--text)"></div>
        </div>
      </div></div>
    </div>
    <div data-el="detalle-container"><p>Selecciona un periodo para ver el consumo.</p></div>
  `;
}

/**
 * `linea.svgGrafica` ya NO viene en la carga inicial de `/consumo/corporativos/:id`
 * (hallazgo de auditoria de rendimiento: la respuesta pesaba cientos de KB
 * porque traia la grafica de cada puerto de entrada, generando ademas un
 * salto de layout grande al insertarlas todas de golpe) -- este slot reserva
 * el mismo alto/ancho que tendria la imagen (980x300) desde el primer
 * render, y `cargarGraficaLinea` la pide aparte y la inserta sin mover nada
 * a su alrededor.
 */
function graficaSlotHtml(linea) {
  const src = svgAImgSrc(linea.svgGrafica);
  if (src) {
    return `<img src="${src}" alt="Grafica de trafico" width="980" height="300" style="width:100%;height:auto;border-radius:var(--radius);border:1px solid var(--border-color)">`;
  }
  return `<div data-grafica-slot="${linea.id}" style="aspect-ratio:980/300;width:100%;border-radius:var(--radius);border:1px solid var(--border-color);background:var(--bg-surface-secondary);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12.5px">Cargando grafica…</div>`;
}

function renderDetalleLinea(linea, cliente) {
  const src = svgAImgSrc(linea.svgGrafica);
  const esManual = linea.origen === 'manual';

  return `
    <div class="card" style="margin-bottom:16px" data-detalle-card="${linea.id}">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(linea.port?.nombrePuerto ?? 'Puerto')}</div>
          <div class="card-subtitle">${escapeHtml(linea.tipoServicio?.nombre ?? '')}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;row-gap:6px">
          <span style="font-size:11.5px;color:var(--text-muted)" title="Ultima vez que se refresco la grafica/percentil de este puerto (cron diario o 'Calcular / recalcular periodo')">Actualizado: ${fmtFechaHora(linea.fechaActualizacion)}</span>
          <span class="status ${ESTADO_PAGO_CLS[linea.estadoPago] ?? 'status-red'}" title="Estado del pago de esta linea">Pago ${escapeHtml(linea.estadoPago)}</span>
          <span class="status ${esManual ? 'status-yellow' : 'status-blue'}" title="${esManual ? 'El percentil 95 de esta linea fue corregido a mano, no viene del calculo automatico de LibreNMS' : 'El percentil 95 de esta linea viene del calculo automatico de LibreNMS (rate_95th_out)'}">${esManual ? 'Percentil editado manualmente' : 'Percentil automatico (LibreNMS)'}</span>
        </div>
      </div>
      <div class="card-body">
        ${
  linea.tieneDiscrepancia
    ? `<div class="alert alert-warning" style="margin-bottom:12px">
                <svg class="alert-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2L1 14h14L8 2z"/><path d="M8 6v3M8 11v.01"/></svg>
                <div class="alert-body"><strong>Revisar.</strong> rate_95th_out y graphdata.rate_95th no coincidieron al momento del cierre (verificacion: ${escapeHtml(linea.rate95thVerificacion ?? '-')} Mbps).</div>
              </div>`
    : ''
}
        <div class="row col-8-4">
          <div>
            ${graficaSlotHtml(linea)}
          </div>
          <div>
            ${
  cliente?.tipoCobro === 'fijo_total'
    ? '<div class="status status-blue" style="margin-bottom:8px">Cliente con cobro fijo total — el consumo medido abajo es solo referencial, el monto se cobra a nivel de cliente</div>'
    : linea.tipoCobro === 'fijo'
      ? '<div class="status status-blue" style="margin-bottom:8px">Cobro fijo mensual — el consumo medido abajo es solo referencial, no afecta el subtotal</div>'
      : ''
}
            <div class="modal-form-row">
              <label for="valor-medido-${linea.id}">Percentil 95 (Mbps)</label>
              <input type="number" step="0.0001" id="valor-medido-${linea.id}" class="valor-medido-input" data-detalle-id="${linea.id}" value="${linea.valorMedido ?? ''}">
            </div>
            <button class="btn btn-primary btn-sm" data-guardar-valor data-detalle-id="${linea.id}">Guardar correccion</button>
            <button class="btn btn-outline btn-sm" data-descargar-grafica data-detalle-id="${linea.id}" data-puerto="${escapeHtml(linea.port?.nombrePuerto ?? 'puerto')}" ${src ? '' : 'disabled'}>Descargar imagen</button>
            ${
  linea.motivoAjuste
    ? `<div style="margin-top:8px;font-size:12.5px;color:var(--text-muted)"><strong>Motivo del cambio manual:</strong> ${escapeHtml(linea.motivoAjuste)}</div>`
    : ''
}
            ${
  cliente?.tipoCobro === 'fijo_total'
    ? `<div style="margin-top:12px;font-size:12.5px;color:var(--text-muted)">Tarifa por puerto no aplica (cobro fijo del cliente) · Pagado: ${linea.moneda} ${fmtMonto(linea.montoPagado)}</div>`
    : `<div style="margin-top:12px;font-size:12.5px;color:var(--text-muted)">
              Tarifa: ${linea.moneda} ${fmtMonto(linea.tarifaAplicada)}${linea.tipoCobro === 'fijo' ? '/mes' : '/Mbps'} · Subtotal: ${linea.moneda} ${fmtMonto(linea.subtotal)} · Pagado: ${linea.moneda} ${fmtMonto(linea.montoPagado)}
            </div>`
}
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * Monta el componente de Consumo dentro de `container` (reemplaza su
 * contenido). Idempotente: llamar de nuevo simplemente vuelve a montar desde
 * cero -- el caller es responsable de no montarlo dos veces si no quiere
 * perder el estado en pantalla (ver cliente.js, que lo monta una sola vez por
 * carga de pagina).
 *
 * @param {HTMLElement} container
 * @param {number} clienteId
 * @param {{ periodoInicial?: string }} [opts]
 *   `periodoInicial` ("YYYY-MM") precarga el selector de mes -- usado para
 *   deep-links desde otras paginas (ej. "Reportes Generales" cuando no hay
 *   boleta calculada para el mes que se estaba buscando).
 */
export function initConsumoTab(container, clienteId, opts = {}) {
  const { periodoInicial } = opts;
  container.innerHTML = markup();

  const periodoInput = container.querySelector('[data-el="periodo-input"]');
  const cerrarBtn = container.querySelector('[data-el="cerrar-periodo-btn"]');
  const resumenTotal = container.querySelector('[data-el="resumen-total"]');
  const resumenNota = container.querySelector('[data-el="resumen-nota"]');
  const resumenPeriodo = container.querySelector('[data-el="resumen-periodo"]');
  const detalleContainer = container.querySelector('[data-el="detalle-container"]');
  const tarifaWarning = container.querySelector('[data-el="tarifa-warning"]');
  const verPagosLink = container.querySelector('[data-el="ver-pagos-link"]');
  const calculadoraBtn = container.querySelector('[data-el="calculadora-btn"]');

  calculadoraBtn.addEventListener('click', () => abrirCalculadora(detalleActual, registrarDesdeCalculadora));

  let cliente = null;
  let boletaActual = null;
  let detalleActual = [];

  function avisarEstado() {
    if (periodoInput.value) {
      const texto = fmtPeriodoLargo(periodoInput.value);
      resumenPeriodo.textContent = `Periodo ${texto.charAt(0).toUpperCase()}${texto.slice(1)}`;
    } else {
      resumenPeriodo.textContent = '';
    }
  }

  /**
   * El boton "Calcular/recalcular periodo" se bloquea SIEMPRE (sin excepcion
   * de permisos, ni siquiera admin) si el periodo ya fue cerrado por el cron
   * automatico (boleta.cerrada) -- corregido 2026-08-26: LibreNMS no expone
   * el rate_95th HISTORICO de un mes pasado, asi que recalcular aca pisaria
   * el consumo real de ese mes con el consumo EN VIVO de hoy (bug real, paso
   * con TELDRA). Para corregir un puerto puntual de un periodo ya cerrado,
   * usar la correccion manual por linea (ver corregirValorMedido/
   * abrirModalMotivoCambioManual), que SI sigue permitiendo cambio manual con
   * consumo.cambio_manual -- esa es una correccion puntual del usuario, no
   * un re-fetch de LibreNMS.
   */
  function actualizarBotonCierre() {
    if (boletaActual?.cerrada) {
      cerrarBtn.textContent = 'Periodo cerrado';
      cerrarBtn.disabled = true;
      cerrarBtn.title = 'Este periodo ya fue cerrado automaticamente. LibreNMS no permite traer el consumo historico de un mes pasado -- para corregir un puerto puntual, usa "Guardar correccion" en su linea.';
    } else {
      cerrarBtn.textContent = 'Calcular / recalcular periodo';
      cerrarBtn.disabled = false;
      cerrarBtn.title = '';
    }
  }

  async function cargarPeriodo() {
    const periodoMes = periodoInput.value;
    if (!periodoMes) {return;}

    avisarEstado();
    detalleContainer.innerHTML = '<p>Cargando...</p>';
    try {
      const { boleta, detalle } = await api.get(`/consumo/corporativos/${clienteId}?periodo=${periodoAFecha(periodoMes)}`);
      boletaActual = boleta;
      actualizarBotonCierre();

      detalleActual = [];
      if (!boleta) {
        if (cliente?.tipoCobro === 'fijo_total') {
          const simbolo = cliente.monedaFijo === 'USD' ? '$' : 'S/';
          resumenTotal.textContent = `${cliente.monedaFijo ?? 'PEN'} ${fmtMonto(cliente.montoFijoMensual)}`;
          detalleContainer.innerHTML = `<p>Costo total del corporativo: <strong>${simbolo} ${fmtMonto(cliente.montoFijoMensual)}</strong> (fijo, no depende del consumo). Usa "Calcular / recalcular periodo" para registrar el trafico de cada puerto.</p>`;
        } else {
          resumenTotal.textContent = '-';
          detalleContainer.innerHTML = '<p>No hay boleta calculada para este periodo todavia. Usa "Calcular / recalcular periodo".</p>';
        }
        return;
      }

      resumenTotal.innerHTML = `${escapeHtml(boleta.moneda)} ${fmtMonto(boleta.montoTotal)} <span class="status ${ESTADO_BOLETA_CLS[boleta.estado] ?? 'status-red'}" style="font-size:12px;vertical-align:middle">${escapeHtml(boleta.estado)}</span>`;
      const candado = boleta.cerrada
        ? `<div class="alert alert-info" style="margin-bottom:16px">
            <svg class="alert-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V4.5a3 3 0 016 0V7"/></svg>
            <div class="alert-body">
              <strong>Periodo cerrado.</strong> Este consumo ya fue calculado por el cierre automatico y no deberia cambiar
              salvo que sea necesario (promocion, averia, etc.)${tienePermiso('consumo.cambio_manual') ? ' — puedes corregir un puerto puntual con "Guardar correccion" en su linea.' : '.'}
            </div>
          </div>`
        : '';
      const detalleOrdenado = [...detalle].sort((a, b) => (Number(b.valorMedido) || -Infinity) - (Number(a.valorMedido) || -Infinity));
      detalleActual = detalleOrdenado;
      detalleContainer.innerHTML =
        candado + (detalleOrdenado.length ? detalleOrdenado.map((l) => renderDetalleLinea(l, cliente)).join('') : '<p>Esta boleta no tiene lineas de detalle.</p>');
      // En paralelo, nunca bloquea el render de arriba -- cada tarjeta ya reservo el espacio de su imagen (ver graficaSlotHtml).
      detalleOrdenado.forEach((l) => cargarGraficaLinea(l.id));
    } catch (err) {
      detalleContainer.innerHTML = `<p>No se pudo cargar el consumo (${escapeHtml(err.message)}).</p>`;
    }
  }

  async function cargarGraficaLinea(detalleId) {
    let svgGrafica = null;
    try {
      ({ svgGrafica } = await api.get(`/consumo/detalle/${detalleId}/grafica`));
    } catch {
      // slot se queda mostrando el mensaje de error de abajo
    }
    const linea = detalleActual.find((l) => l.id === detalleId);
    if (linea) {linea.svgGrafica = svgGrafica;}

    const slot = detalleContainer.querySelector(`[data-grafica-slot="${detalleId}"]`);
    if (!slot) {return;} // el usuario ya cambio de periodo/puerto -- este slot ni existe mas
    const src = svgAImgSrc(svgGrafica);
    if (src) {
      slot.outerHTML = `<img src="${src}" alt="Grafica de trafico" width="980" height="300" style="width:100%;height:auto;border-radius:var(--radius);border:1px solid var(--border-color)">`;
      const btn = detalleContainer.querySelector(`[data-descargar-grafica][data-detalle-id="${detalleId}"]`);
      if (btn) {btn.disabled = false;}
    } else {
      slot.textContent = 'Grafica no disponible para este periodo.';
    }
  }

  async function cargarCliente() {
    cliente = await api.get(`/corporativos/${clienteId}`);
    avisarEstado();
    resumenNota.textContent = cliente.tipoCobro === 'fijo_total' ? 'Fijo total del corporativo — no depende del consumo de los puertos individuales.' : '';
  }

  /**
   * Avisa si algun puerto del cliente no tiene tarifa asignada — sin esto
   * "Calcular periodo" omite ese puerto en silencio. No aplica a clientes
   * Fijo total: sus puertos estan bloqueados (no se les puede asignar tarifa
   * por puerto) y el cierre igual los trackea sin necesitarla.
   */
  async function verificarTarifas() {
    if (cliente?.tipoCobro === 'fijo_total') {
      tarifaWarning.innerHTML = '';
      return;
    }
    try {
      const puertos = await api.get(`/corporativos/${clienteId}/puertos`);
      const sinTarifa = puertos.filter((p) => !p.tarifaVigente);
      if (sinTarifa.length === 0) {
        tarifaWarning.innerHTML = '';
        return;
      }
      const nombres = sinTarifa.map((p) => escapeHtml(p.alias || p.nombrePuerto)).join(', ');
      tarifaWarning.innerHTML = `
        <div class="alert alert-warning" style="margin-bottom:16px">
          <svg class="alert-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2L1 14h14L8 2z"/><path d="M8 6v3M8 11v.01"/></svg>
          <div class="alert-body">
            <strong>${sinTarifa.length} puerto(s) sin tarifa asignada:</strong> ${nombres}.
            El consumo de esos puertos no se calcula hasta asignarles una tarifa (costo por Mbps) en
            <a href="clientes.html">Clientes → Ver puertos → Asignar tarifa</a>.
          </div>
        </div>`;
    } catch {
      // si falla la verificacion, simplemente no se muestra el aviso
    }
  }

  async function guardarValorMedido(detalleId, valorMedido, motivo) {
    await api.patch(`/consumo/detalle/${detalleId}`, { valorMedido, motivo });
    showToast('Valor corregido', { variant: 'success' });
    await cargarPeriodo();
  }

  /** Registra un resultado de la Calculadora como percentil corregido de un puerto -- mismo camino que "Guardar correccion" (respeta el bloqueo de periodo cerrado). */
  function registrarDesdeCalculadora(detalleId, valorMedido) {
    if (boletaActual?.cerrada) {
      abrirModalMotivoCambioManual(detalleId, valorMedido);
      return;
    }
    guardarValorMedido(detalleId, valorMedido, undefined).catch((err) => {
      showToast(err.message || 'No se pudo guardar', { variant: 'error' });
    });
  }

  /** Periodo cerrado: pide un motivo (opcional) antes de aplicar el cambio manual, para dejar constancia del por que. */
  function abrirModalMotivoCambioManual(detalleId, valorMedido) {
    showModal({
      title: 'Cambio manual — periodo cerrado',
      body: `
        <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:12px">
          Este periodo ya fue cerrado automaticamente. El motivo es opcional, pero ayuda a dejar registro
          de por que se corrigio (ej. promocion, averia, reclamo).
        </p>
        <form class="modal-form" novalidate>
          <div class="modal-form-row">
            <label for="cm-motivo">Motivo (opcional)</label>
            <textarea id="cm-motivo" rows="2" placeholder="ej. Averia del 15/07, se descuenta 3 dias de consumo"></textarea>
          </div>
        </form>
      `,
      actions: [
        { label: 'Cancelar', variant: 'outline' },
        {
          label: 'Guardar cambio manual',
          variant: 'primary',
          closeOnAction: false,
          action: async ({ body, close }) => {
            const motivo = body.querySelector('#cm-motivo').value.trim();
            try {
              await guardarValorMedido(detalleId, valorMedido, motivo || undefined);
              close();
            } catch (err) {
              showToast(err.message || 'No se pudo guardar', { variant: 'error' });
            }
          }
        }
      ]
    });
  }

  // periodoInicial: deep-link desde otro reporte (ej. "Reportes Generales",
  // cuando no hay boleta calculada para el mes que se estaba buscando) --
  // formato "YYYY-MM", validado para no aceptar cualquier cosa de la URL.
  periodoInput.value = periodoInicial && /^\d{4}-\d{2}$/.test(periodoInicial) ? periodoInicial : mesActualMenosUno();
  avisarEstado();
  periodoInput.addEventListener('change', cargarPeriodo);

  cerrarBtn.addEventListener('click', async () => {
    const periodoMes = periodoInput.value;
    if (!periodoMes) {return;}
    const [year, month] = periodoMes.split('-').map(Number);
    cerrarBtn.disabled = true;
    try {
      const resultado = await api.post('/consumo/cierre', { corporativoId: clienteId, year, month });
      if (resultado.facturados === 0) {
        showToast(resultado.omitidos[0] || 'No se calculo ningun puerto (revisa las tarifas asignadas)', { variant: 'error' });
      } else if (resultado.omitidos.length > 0) {
        showToast(`Periodo calculado. ${resultado.omitidos.length} puerto(s) omitido(s) — revisa las tarifas.`, { variant: 'info' });
      } else {
        showToast('Periodo calculado', { variant: 'success' });
      }
      await cargarPeriodo();
    } catch (err) {
      showToast(err.message || 'No se pudo calcular el periodo', { variant: 'error' });
    } finally {
      cerrarBtn.disabled = false;
    }
  });

  detalleContainer.addEventListener('click', async (e) => {
    const guardarBtn = e.target.closest('[data-guardar-valor]');
    const descargarBtn = e.target.closest('[data-descargar-grafica]');

    if (guardarBtn) {
      const detalleId = guardarBtn.dataset.detalleId;
      const input = detalleContainer.querySelector(`.valor-medido-input[data-detalle-id="${detalleId}"]`);
      const valorMedido = input.value;
      if (!valorMedido) {
        showToast('Ingresa un valor', { variant: 'error' });
        return;
      }
      if (boletaActual?.cerrada) {
        abrirModalMotivoCambioManual(detalleId, valorMedido);
        return;
      }
      guardarBtn.disabled = true;
      try {
        await guardarValorMedido(detalleId, valorMedido, undefined);
      } catch (err) {
        showToast(err.message || 'No se pudo guardar', { variant: 'error' });
      } finally {
        guardarBtn.disabled = false;
      }
    } else if (descargarBtn) {
      const detalleId = Number(descargarBtn.dataset.detalleId);
      const linea = detalleActual.find((d) => d.id === detalleId);
      if (!linea?.svgGrafica) {return;}
      const puerto = descargarBtn.dataset.puerto || 'puerto';
      const nombre = `trafico_${puerto}_${periodoInput.value || ''}`.replace(/[^a-z0-9_-]+/gi, '-');
      try {
        await descargarGraficaComoPng(linea.svgGrafica, nombre);
      } catch (err) {
        showToast(err.message || 'No se pudo descargar la imagen', { variant: 'error' });
      }
    }
  });

  if (!clienteId) {
    detalleContainer.innerHTML = '<p>Falta el parametro "cliente".</p>';
    return;
  }

  verPagosLink.href = `cliente.html?id=${clienteId}&tab=facturacion&subtab=transacciones`;
  cargarCliente()
    .catch(() => {
      avisarEstado();
    })
    .then(() => {
      if (cliente?.tipoCobro === 'libre') {
        // Cliente Libre: nunca pasa por cerrarPeriodo (ver ConsumoCierreService),
        // no hay boleta/percentil que calcular o mostrar aqui.
        periodoInput.style.display = 'none';
        cerrarBtn.style.display = 'none';
        resumenTotal.textContent = '-';
        resumenNota.textContent = 'Cliente Libre: paga en montos variables, sin boleta mensual.';
        detalleContainer.innerHTML =
          '<p>Este cliente es de tipo <strong>Libre</strong>: no se calcula consumo ni se genera boleta mensual. Los puertos se siguen monitoreando en vivo (Dashboard/Puertos). Los pagos se registran directamente desde Facturación → Facturas.</p>';
        return;
      }
      verificarTarifas();
      cargarPeriodo();
    });
}
