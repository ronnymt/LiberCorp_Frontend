import { requireAuth, tienePermiso } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { showToast } from '../v4/toast.js';
import { escapeHtml } from '../lib/ports-table.js';

requireAuth();

const container = document.getElementById('int-container');
const puedeVer = tienePermiso('configuracion.ver');
const puedeEditar = tienePermiso('configuracion.editar');

let numeros = [];

/** Estado de expandido/colapsado de cada panel, persistido entre renders (un Set de ids abiertos) -- sin esto, guardar cualquier campo re-renderiza todo y colapsaria el panel que se estaba editando. */
const panelesAbiertos = new Set();

/**
 * Fila de acordeon (mismo criterio que "Servidores SMS" de MikroWISP): header
 * clickeable con el nombre + un pill de estado siempre visible (para ver de
 * un vistazo si esta activa sin tener que expandir), cuerpo colapsado por
 * defecto. Con pocas integraciones (3 hoy) una sola columna alcanza -- no
 * hace falta el grid de 2 columnas del ejemplo, que tiene sentido con
 * catalogos de 10+ proveedores.
 */
function renderPanel(id, titulo, pillHtml, bodyHtml) {
  const abierto = panelesAbiertos.has(id);
  return `
    <div class="card" style="margin-bottom:12px">
      <button type="button" class="card-header" data-toggle-panel="${id}" style="cursor:pointer;width:100%;text-align:left;background:none;border:none;font:inherit;color:inherit;display:flex;justify-content:space-between;align-items:center;gap:12px">
        <span class="card-title">${titulo}</span>
        <span style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          ${pillHtml}
          <span data-chevron="${id}" style="display:inline-block;transition:transform .15s;transform:rotate(${abierto ? '180deg' : '0deg'})">▾</span>
        </span>
      </button>
      <div class="card-body" data-panel-body="${id}" ${abierto ? '' : 'hidden'}>${bodyHtml}</div>
    </div>`;
}

function renderTwilio(config) {
  return `
    <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:16px">
      Credenciales de conexion para llamadas de voz de alerta (no SMS). Cuando un puerto se confirma
      caido (dos chequeos seguidos, ~5-10 min), se llama a los numeros activos de la lista de abajo.
    </p>
    <form class="modal-form" novalidate>
      <div class="modal-form-row">
        <label for="tw-activo">
          <input type="checkbox" id="tw-activo" ${config.twilioActivo ? 'checked' : ''} ${puedeEditar ? '' : 'disabled'} style="width:auto;margin-right:6px">
          Integracion activa
        </label>
      </div>
      <div class="modal-form-row">
        <label for="tw-sid">Account SID</label>
        <input type="text" id="tw-sid" value="${escapeHtml(config.twilioAccountSid ?? '')}" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" ${puedeEditar ? '' : 'disabled'}>
      </div>
      <div class="modal-form-row">
        <label for="tw-token">Auth Token</label>
        <input type="password" id="tw-token" placeholder="${config.twilioAuthToken ? `Guardado: ${escapeHtml(config.twilioAuthToken)} (dejar vacio para no cambiar)` : 'Sin configurar'}" ${puedeEditar ? '' : 'disabled'}>
      </div>
      <div class="modal-form-row">
        <label for="tw-numero">Numero Twilio (desde)</label>
        <input type="tel" id="tw-numero" value="${escapeHtml(config.twilioNumeroDesde ?? '')}" placeholder="+15005550006" ${puedeEditar ? '' : 'disabled'}>
      </div>
    </form>
    ${puedeEditar ? '<button class="btn btn-primary btn-sm" id="tw-guardar" style="margin-top:16px">Guardar</button>' : '<p style="font-size:12.5px;color:var(--text-muted);margin-top:16px">Solo un administrador puede cambiar esta integracion.</p>'}`;
}

const CODIGOS_PAIS = [
  { codigo: '51', nombre: 'Peru' },
  { codigo: '57', nombre: 'Colombia' },
  { codigo: '593', nombre: 'Ecuador' },
  { codigo: '591', nombre: 'Bolivia' },
  { codigo: '56', nombre: 'Chile' },
  { codigo: '54', nombre: 'Argentina' },
  { codigo: '52', nombre: 'Mexico' },
  { codigo: '34', nombre: 'España' },
  { codigo: '1', nombre: 'Estados Unidos' },
  { codigo: '58', nombre: 'Venezuela' },
  { codigo: '55', nombre: 'Brasil' }
];

function renderWaboxapp(config) {
  const opcionesPais = CODIGOS_PAIS
    .map((p) => `<option value="${p.codigo}" ${config.waboxappCodigoPais === p.codigo ? 'selected' : ''}>${p.nombre} (+${p.codigo})</option>`)
    .join('');

  return `
    <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:16px">
      Envia mensaje via WhatsApp utilizando WhatsApp Web. Mas detalles
      <a href="https://www.waboxapp.com/" target="_blank" rel="noopener">https://www.waboxapp.com/</a>
    </p>
    <form class="modal-form" novalidate>
      <div class="modal-form-row">
        <label for="wb-token">Clave API</label>
        <input type="password" id="wb-token" placeholder="${config.waboxappToken ? `Guardado: ${escapeHtml(config.waboxappToken)} (dejar vacio para no cambiar)` : 'Sin configurar'}" ${puedeEditar ? '' : 'disabled'}>
      </div>
      <div class="modal-form-row">
        <label for="wb-uid">Nº whatsapp <span style="font-weight:400;color:var(--text-muted)">Ejm: 5198767654 (formato internacional)</span></label>
        <input type="tel" id="wb-uid" value="${escapeHtml(config.waboxappUid ?? '')}" placeholder="51987654321" ${puedeEditar ? '' : 'disabled'}>
      </div>
      <div class="row col-6-6">
        <div class="modal-form-row">
          <label for="wb-limite">Limite caracteres</label>
          <input type="number" id="wb-limite" min="1" value="${config.waboxappLimiteCaracteres}" ${puedeEditar ? '' : 'disabled'}>
        </div>
        <div class="modal-form-row">
          <label for="wb-pausa">Pausa entre mensaje (segundos)</label>
          <input type="number" id="wb-pausa" min="0" value="${config.waboxappPausaSegundos}" ${puedeEditar ? '' : 'disabled'}>
        </div>
      </div>
      <div class="modal-form-row">
        <label for="wb-pais">Codigo pais</label>
        <select id="wb-pais" ${puedeEditar ? '' : 'disabled'}>${opcionesPais}</select>
      </div>
      <div class="modal-form-row">
        <label for="wb-activo">
          <input type="checkbox" id="wb-activo" ${config.waboxappActivo ? 'checked' : ''} ${puedeEditar ? '' : 'disabled'} style="width:auto;margin-right:6px">
          Activar Gateway
        </label>
      </div>
    </form>
    ${
  puedeEditar
    ? `<div style="display:flex;gap:8px;margin-top:16px">
            <button class="btn btn-primary btn-sm" id="wb-guardar">Guardar cambios</button>
            <button class="btn btn-outline btn-sm" id="wb-prueba">Enviar prueba</button>
          </div>
          <div class="modal-form-row" style="margin-top:12px;max-width:260px">
            <label for="wb-prueba-numero">Numero para la prueba</label>
            <input type="tel" id="wb-prueba-numero" placeholder="51987654321">
          </div>`
    : '<p style="font-size:12.5px;color:var(--text-muted);margin-top:16px">Solo un administrador puede cambiar esta integracion.</p>'
}`;
}

const YCLOUD_ESTADO_TEXTO = {
  APPROVED: { texto: 'Aprobada', clase: 'status-green' },
  PENDING: { texto: 'Pendiente de Meta', clase: 'status-yellow' },
  REJECTED: { texto: 'Rechazada', clase: 'status-red' },
  PAUSED: { texto: 'Pausada', clase: 'status-yellow' },
  DISABLED: { texto: 'Deshabilitada', clase: 'status-red' }
};

function ycloudBadge(estadoPlantilla) {
  return estadoPlantilla?.status
    ? YCLOUD_ESTADO_TEXTO[estadoPlantilla.status] ?? { texto: estadoPlantilla.status, clase: 'status-muted' }
    : null;
}

function renderYcloud(config, estadoPlantilla) {
  const badge = ycloudBadge(estadoPlantilla);

  return `
    <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:16px">
      BSP sobre la API oficial de WhatsApp Business (Meta Cloud API). Notificaciones proactivas (fuera de la
      ventana de 24h) via plantilla aprobada por Meta, con imagen + variables. Mas detalles
      <a href="https://docs.ycloud.com/" target="_blank" rel="noopener">https://docs.ycloud.com/</a>
    </p>
    <form class="modal-form" novalidate>
      <div class="modal-form-row">
        <label for="yc-token">API Key</label>
        <input type="password" id="yc-token" placeholder="${config.ycloudApiKey ? `Guardado: ${escapeHtml(config.ycloudApiKey)} (dejar vacio para no cambiar)` : 'Sin configurar'}" ${puedeEditar ? '' : 'disabled'}>
      </div>
      <div class="row col-6-6">
        <div class="modal-form-row">
          <label for="yc-waba">WABA ID</label>
          <input type="text" id="yc-waba" value="${escapeHtml(config.ycloudWabaId ?? '')}" ${puedeEditar ? '' : 'disabled'}>
        </div>
        <div class="modal-form-row">
          <label for="yc-numero">Nº emisor (E.164 sin '+')</label>
          <input type="tel" id="yc-numero" value="${escapeHtml(config.ycloudNumeroEmisor ?? '')}" placeholder="51987654321" ${puedeEditar ? '' : 'disabled'}>
        </div>
      </div>
      <div class="row col-6-6">
        <div class="modal-form-row">
          <label for="yc-plantilla">Nombre de plantilla</label>
          <input type="text" id="yc-plantilla" value="${escapeHtml(config.ycloudPlantillaNombre ?? 'consumo_librenms')}" ${puedeEditar ? '' : 'disabled'}>
        </div>
        <div class="modal-form-row">
          <label for="yc-idioma">Idioma</label>
          <input type="text" id="yc-idioma" value="${escapeHtml(config.ycloudIdioma ?? 'es')}" ${puedeEditar ? '' : 'disabled'}>
        </div>
      </div>
      <div class="modal-form-row">
        <label for="yc-webhook-secret">Webhook signing secret</label>
        <input type="password" id="yc-webhook-secret" placeholder="${config.ycloudWebhookSecret ? `Guardado: ${escapeHtml(config.ycloudWebhookSecret)} (dejar vacio para no cambiar)` : 'Pegar el secreto que YCloud genera al crear el webhook'}" ${puedeEditar ? '' : 'disabled'}>
        <p style="font-size:12px;color:var(--text-muted);margin-top:4px">
          En el dashboard de YCloud (Developer &gt; Webhooks), crea un endpoint con URL
          <code>{URL PUBLICA DEL BACKEND}/api/mensajeria/ycloud/webhook</code> (la misma base que
          <code>PUBLIC_BASE_URL</code> en el backend), marca el evento <code>whatsapp.message.updated</code>,
          y pega aqui el secreto que te muestre.
        </p>
      </div>
      <div class="modal-form-row">
        <label for="yc-activo">
          <input type="checkbox" id="yc-activo" ${config.ycloudActivo ? 'checked' : ''} ${puedeEditar ? '' : 'disabled'} style="width:auto;margin-right:6px">
          Activar Gateway
        </label>
      </div>
    </form>
    ${
  badge
    ? `<p style="font-size:12.5px;margin:8px 0"><strong>Plantilla "${escapeHtml(config.ycloudPlantillaNombre)}":</strong> <span class="status ${badge.clase}">${escapeHtml(badge.texto)}</span></p>`
    : ''
}
    ${
  puedeEditar
    ? `<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="yc-guardar">Guardar cambios</button>
            <button class="btn btn-outline btn-sm" id="yc-crear-plantilla">Crear plantilla</button>
            <button class="btn btn-outline btn-sm" id="yc-verificar-plantilla">Verificar estado</button>
          </div>`
    : '<p style="font-size:12.5px;color:var(--text-muted);margin-top:16px">Solo un administrador puede cambiar esta integracion.</p>'
}`;
}

function renderNumeros() {
  const filas = numeros.length
    ? numeros
      .map(
        n => `
            <tr data-id="${n.id}">
              <td>${escapeHtml(n.nombre)}</td>
              <td>${escapeHtml(n.numero)}</td>
              <td>
                <label style="display:flex;align-items:center;gap:6px;font-size:12.5px">
                  <input type="checkbox" data-toggle-activo data-id="${n.id}" ${n.activo ? 'checked' : ''} ${puedeEditar ? '' : 'disabled'} style="width:auto">
                  ${n.activo ? 'Activo' : 'Inactivo'}
                </label>
              </td>
              <td style="white-space:nowrap;text-align:right">
                ${puedeEditar ? `<button class="btn btn-outline btn-sm" data-prueba data-id="${n.id}">Prueba</button>` : ''}
                ${puedeEditar ? `<button class="btn btn-outline btn-sm" data-eliminar data-id="${n.id}">Eliminar</button>` : ''}
              </td>
            </tr>`
      )
      .join('')
    : '<tr><td colspan="4">Sin numeros de alerta configurados.</td></tr>';

  return `
    <div class="card" style="max-width:640px">
      <div class="card-header">
        <div class="card-title">Numeros de alerta</div>
      </div>
      <div class="card-body">
        <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:16px">
          A quien se llama cuando un puerto se confirma caido. No necesitan ser usuarios del sistema.
        </p>
        <div class="table-responsive">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Numero</th><th>Estado</th><th></th></tr></thead>
            <tbody id="num-alerta-rows">${filas}</tbody>
          </table>
        </div>
        ${
  puedeEditar
    ? `<form class="modal-form" novalidate style="margin-top:12px">
                <div class="row col-6-6">
                  <div class="modal-form-row">
                    <label for="na-nombre">Nombre</label>
                    <input type="text" id="na-nombre" placeholder="ej. Ronny - Soporte">
                  </div>
                  <div class="modal-form-row">
                    <label for="na-numero">Numero</label>
                    <input type="tel" id="na-numero" placeholder="+51987654321">
                  </div>
                </div>
              </form>
              <button class="btn btn-primary btn-sm" id="na-agregar" style="margin-top:16px">Agregar numero</button>`
    : ''
}
      </div>
    </div>`;
}

function pillActivo(activo) {
  return `<span class="status ${activo ? 'status-green' : 'status-muted'}">${activo ? 'Activo' : 'Inactivo'}</span>`;
}

function render(config) {
  const ycloudBadgeInfo = ycloudBadge(estadoPlantillaActual);
  const ycloudPill = `${pillActivo(config.ycloudActivo)}${ycloudBadgeInfo ? `<span class="status ${ycloudBadgeInfo.clase}">${escapeHtml(ycloudBadgeInfo.texto)}</span>` : ''}`;

  container.innerHTML =
    renderPanel('twilio', 'Integracion Twilio', pillActivo(config.twilioActivo), renderTwilio(config)) +
    renderPanel('waboxapp', 'Integracion WaboxApp (WhatsApp)', pillActivo(config.waboxappActivo), renderWaboxapp(config)) +
    renderPanel('ycloud', 'Integracion YCloud (WhatsApp API oficial)', ycloudPill, renderYcloud(config, estadoPlantillaActual)) +
    renderNumeros();

  container.querySelectorAll('[data-toggle-panel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.togglePanel;
      const body = container.querySelector(`[data-panel-body="${id}"]`);
      const chevron = container.querySelector(`[data-chevron="${id}"]`);
      const abrir = body.hidden;
      body.hidden = !abrir;
      chevron.style.transform = `rotate(${abrir ? '180deg' : '0deg'})`;
      if (abrir) {panelesAbiertos.add(id);}
      else {panelesAbiertos.delete(id);}
    });
  });

  if (puedeEditar) {
    document.getElementById('yc-guardar').addEventListener('click', async () => {
      const ycloudActivo = document.getElementById('yc-activo').checked;
      const ycloudApiKey = document.getElementById('yc-token').value.trim();
      const ycloudWabaId = document.getElementById('yc-waba').value.trim();
      const ycloudNumeroEmisor = document.getElementById('yc-numero').value.trim();
      const ycloudPlantillaNombre = document.getElementById('yc-plantilla').value.trim() || 'consumo_librenms';
      const ycloudIdioma = document.getElementById('yc-idioma').value.trim() || 'es';
      const ycloudWebhookSecret = document.getElementById('yc-webhook-secret').value.trim();

      try {
        const actualizado = await api.patch('/configuracion/ycloud', {
          ycloudActivo,
          ...(ycloudApiKey ? { ycloudApiKey } : {}),
          ycloudWabaId: ycloudWabaId || null,
          ycloudNumeroEmisor: ycloudNumeroEmisor || null,
          ycloudPlantillaNombre,
          ycloudIdioma,
          ...(ycloudWebhookSecret ? { ycloudWebhookSecret } : {})
        });
        showToast('Integracion YCloud guardada', { variant: 'success' });
        configActual = actualizado;
        render(actualizado);
      } catch (err) {
        showToast(err.message || 'No se pudo guardar', { variant: 'error' });
      }
    });

    document.getElementById('yc-crear-plantilla').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Creando...';
      try {
        await api.post('/mensajeria/ycloud/plantilla', {});
        showToast('Plantilla creada -- queda pendiente de aprobacion de Meta', { variant: 'success' });
        estadoPlantillaActual = await api.get('/mensajeria/ycloud/plantilla');
        render(configActual);
      } catch (err) {
        showToast(err.message || 'No se pudo crear la plantilla', { variant: 'error' });
      } finally {
        btn.disabled = false;
        btn.textContent = 'Crear plantilla';
      }
    });

    document.getElementById('yc-verificar-plantilla').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Verificando...';
      try {
        estadoPlantillaActual = await api.get('/mensajeria/ycloud/plantilla');
        showToast(estadoPlantillaActual.status ? `Estado: ${estadoPlantillaActual.status}` : 'La plantilla todavia no existe en Meta', { variant: estadoPlantillaActual.status === 'APPROVED' ? 'success' : 'error' });
        render(configActual);
      } catch (err) {
        showToast(err.message || 'No se pudo verificar el estado', { variant: 'error' });
      } finally {
        btn.disabled = false;
        btn.textContent = 'Verificar estado';
      }
    });
  }

  if (!puedeEditar) {
    return;
  }

  document.getElementById('wb-guardar').addEventListener('click', async () => {
    const waboxappActivo = document.getElementById('wb-activo').checked;
    const waboxappToken = document.getElementById('wb-token').value.trim();
    const waboxappUid = document.getElementById('wb-uid').value.trim();
    const waboxappLimiteCaracteres = Number(document.getElementById('wb-limite').value) || 1000;
    const waboxappPausaSegundos = Number(document.getElementById('wb-pausa').value) || 0;
    const waboxappCodigoPais = document.getElementById('wb-pais').value;

    try {
      const actualizado = await api.patch('/configuracion/waboxapp', {
        waboxappActivo,
        ...(waboxappToken ? { waboxappToken } : {}),
        waboxappUid: waboxappUid || null,
        waboxappLimiteCaracteres,
        waboxappPausaSegundos,
        waboxappCodigoPais
      });
      showToast('Integracion WaboxApp guardada', { variant: 'success' });
      configActual = actualizado;
      render(actualizado);
    } catch (err) {
      showToast(err.message || 'No se pudo guardar', { variant: 'error' });
    }
  });

  document.getElementById('wb-prueba').addEventListener('click', async (e) => {
    const numero = document.getElementById('wb-prueba-numero').value.trim();
    if (!numero) {
      showToast('Escribe un numero para la prueba', { variant: 'error' });
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const resultado = await api.post('/mensajeria/whatsapp/prueba', { numero });
      if (resultado.ok) {
        showToast(`Mensaje de prueba enviado a ${resultado.numero}`, { variant: 'success' });
      } else {
        showToast(resultado.error || 'WaboxApp no pudo enviar el mensaje', { variant: 'error' });
      }
    } catch (err) {
      showToast(err.message || 'No se pudo enviar la prueba', { variant: 'error' });
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar prueba';
    }
  });

  document.getElementById('tw-guardar').addEventListener('click', async () => {
    const twilioActivo = document.getElementById('tw-activo').checked;
    const twilioAccountSid = document.getElementById('tw-sid').value.trim();
    const twilioAuthToken = document.getElementById('tw-token').value.trim();
    const twilioNumeroDesde = document.getElementById('tw-numero').value.trim();

    try {
      const actualizado = await api.patch('/configuracion/twilio', {
        twilioActivo,
        twilioAccountSid: twilioAccountSid || null,
        ...(twilioAuthToken ? { twilioAuthToken } : {}),
        twilioNumeroDesde: twilioNumeroDesde || null
      });
      showToast('Integracion Twilio guardada', { variant: 'success' });
      configActual = actualizado;
      render(actualizado);
    } catch (err) {
      showToast(err.message || 'No se pudo guardar', { variant: 'error' });
    }
  });

  document.getElementById('na-agregar').addEventListener('click', async () => {
    const nombre = document.getElementById('na-nombre').value.trim();
    const numero = document.getElementById('na-numero').value.trim();
    if (!nombre || !numero) {
      showToast('Completa nombre y numero', { variant: 'error' });
      return;
    }
    try {
      await api.post('/configuracion/numeros-alerta', { nombre, numero });
      showToast('Numero agregado', { variant: 'success' });
      await cargarNumeros();
    } catch (err) {
      showToast(err.message || 'No se pudo agregar', { variant: 'error' });
    }
  });

  document.getElementById('num-alerta-rows').addEventListener('click', async e => {
    const pruebaBtn = e.target.closest('[data-prueba]');
    const eliminarBtn = e.target.closest('[data-eliminar]');

    if (pruebaBtn) {
      pruebaBtn.disabled = true;
      pruebaBtn.textContent = 'Llamando...';
      try {
        await api.post(`/configuracion/numeros-alerta/${pruebaBtn.dataset.id}/prueba`, {});
        showToast('Llamada de prueba iniciada', { variant: 'success' });
      } catch (err) {
        showToast(err.message || 'No se pudo llamar', { variant: 'error' });
      } finally {
        pruebaBtn.disabled = false;
        pruebaBtn.textContent = 'Prueba';
      }
    } else if (eliminarBtn) {
      try {
        await api.delete(`/configuracion/numeros-alerta/${eliminarBtn.dataset.id}`);
        showToast('Numero eliminado', { variant: 'success' });
        await cargarNumeros();
      } catch (err) {
        showToast(err.message || 'No se pudo eliminar', { variant: 'error' });
      }
    }
  });

  document.getElementById('num-alerta-rows').addEventListener('change', async e => {
    const toggle = e.target.closest('[data-toggle-activo]');
    if (!toggle) {
      return;
    }
    try {
      await api.patch(`/configuracion/numeros-alerta/${toggle.dataset.id}`, {
        activo: toggle.checked
      });
      await cargarNumeros();
    } catch (err) {
      showToast(err.message || 'No se pudo actualizar', { variant: 'error' });
    }
  });
}

let configActual = null;
let estadoPlantillaActual = null;

async function cargarNumeros() {
  numeros = await api.get('/configuracion/numeros-alerta');
  render(configActual);
}

async function cargar() {
  if (!puedeVer) {
    container.innerHTML = '<p>No tienes permiso para ver las integraciones.</p>';
    return;
  }
  try {
    const [config, listaNumeros] = await Promise.all([
      api.get('/configuracion'),
      api.get('/configuracion/numeros-alerta')
    ]);
    configActual = config;
    numeros = listaNumeros;
    // No bloquea el render si YCloud aun no tiene credenciales guardadas --
    // en ese caso el endpoint de estado devuelve 400 y simplemente no se
    // muestra el pill de estado de la plantilla todavia.
    if (config.ycloudApiKey && config.ycloudWabaId) {
      estadoPlantillaActual = await api.get('/mensajeria/ycloud/plantilla').catch(() => null);
    }
    render(config);
  } catch (err) {
    container.innerHTML = `<p>No se pudo cargar las integraciones (${escapeHtml(err.message)}).</p>`;
  }
}

cargar();
