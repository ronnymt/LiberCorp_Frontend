import { requireAuth, tienePermiso } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { showToast } from '../v4/toast.js';
import { escapeHtml } from '../lib/ports-table.js';

requireAuth();

const container = document.getElementById('config-container');
const puedeVer = tienePermiso('configuracion.ver');
const puedeEditar = tienePermiso('configuracion.editar');

function soloHoraMinuto(horaCierreDiario) {
  return (horaCierreDiario ?? '06:00:00').slice(0, 5);
}

function renderCierreDiario(config) {
  return `
    <div class="card" style="max-width:480px;margin-bottom:16px">
      <div class="card-header">
        <div class="card-title">Cierre diario automatico</div>
      </div>
      <div class="card-body">
        <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:16px">
          Hora (America/Lima) a la que corren las 3 tareas diarias: cerrar el consumo del mes
          anterior de los bills que hoy tocan, crear por adelantado la boleta de clientes de cobro
          fijo, y refrescar la grafica/consumo de boletas del mes actual que siguen abiertas
          (disparadas a mano). Al cambiarla se reprograma sin reiniciar el servidor.
        </p>
        <form class="modal-form" novalidate>
          <div class="modal-form-row">
            <label for="cfg-hora">Hora de cierre diario</label>
            <input type="time" id="cfg-hora" value="${escapeHtml(soloHoraMinuto(config.horaCierreDiario))}" ${puedeEditar ? '' : 'disabled'}>
          </div>
        </form>
        ${puedeEditar ? '<button class="btn btn-primary btn-sm" id="cfg-guardar" style="margin-top:16px">Guardar</button>' : '<p style="font-size:12.5px;color:var(--text-muted);margin-top:16px">Solo un administrador puede cambiar esta hora.</p>'}
      </div>
    </div>`;
}

function renderDatosFacturacion(config) {
  return `
    <div class="card" style="max-width:480px;margin-bottom:16px">
      <div class="card-header">
        <div class="card-title">Datos de facturacion (reportes)</div>
      </div>
      <div class="card-body">
        <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:16px">
          Encabezado que aparece en el "Reporte de deuda por cliente" (Reportes). Las cuentas bancarias del pie de
          pago se administran en Configuracion General → Cuentas. Si se deja vacio, el reporte simplemente omite
          lo que falte.
        </p>
        <form class="modal-form" novalidate>
          <div class="modal-form-row">
            <label for="df-empresa">Nombre de la empresa</label>
            <input type="text" id="df-empresa" value="${escapeHtml(config.empresaNombre ?? '')}" placeholder="ej. AXESSXPLORA EIRL" ${puedeEditar ? '' : 'disabled'}>
          </div>
          <div class="modal-form-row">
            <label for="df-representante">Representante</label>
            <input type="text" id="df-representante" value="${escapeHtml(config.representante ?? '')}" ${puedeEditar ? '' : 'disabled'}>
          </div>
          <div class="row col-6-6">
            <div class="modal-form-row">
              <label for="df-celular">Celular</label>
              <input type="tel" id="df-celular" value="${escapeHtml(config.celular ?? '')}" placeholder="+51987654321" ${puedeEditar ? '' : 'disabled'}>
            </div>
            <div class="modal-form-row">
              <label for="df-direccion">Direccion</label>
              <input type="text" id="df-direccion" value="${escapeHtml(config.direccion ?? '')}" ${puedeEditar ? '' : 'disabled'}>
            </div>
          </div>
        </form>
        ${puedeEditar ? '<button class="btn btn-primary btn-sm" id="df-guardar" style="margin-top:16px">Guardar</button>' : '<p style="font-size:12.5px;color:var(--text-muted);margin-top:16px">Solo un administrador puede cambiar estos datos.</p>'}
      </div>
    </div>`;
}

function render(config) {
  container.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap">${renderCierreDiario(config)}${renderDatosFacturacion(config)}</div>`;

  if (!puedeEditar) {
    return;
  }

  document.getElementById('cfg-guardar').addEventListener('click', async () => {
    const hora = document.getElementById('cfg-hora').value;
    if (!hora) {
      showToast('Selecciona una hora', { variant: 'error' });
      return;
    }
    try {
      const actualizado = await api.patch('/configuracion', { horaCierreDiario: `${hora}:00` });
      showToast('Hora de cierre actualizada', { variant: 'success' });
      render(actualizado);
    } catch (err) {
      showToast(err.message || 'No se pudo guardar', { variant: 'error' });
    }
  });

  document.getElementById('df-guardar').addEventListener('click', async () => {
    const valores = {
      empresaNombre: document.getElementById('df-empresa').value.trim() || null,
      representante: document.getElementById('df-representante').value.trim() || null,
      celular: document.getElementById('df-celular').value.trim() || null,
      direccion: document.getElementById('df-direccion').value.trim() || null
    };
    try {
      const actualizado = await api.patch('/configuracion/facturacion', valores);
      showToast('Datos de facturacion guardados', { variant: 'success' });
      render(actualizado);
    } catch (err) {
      showToast(err.message || 'No se pudo guardar', { variant: 'error' });
    }
  });
}

async function cargar() {
  if (!puedeVer) {
    container.innerHTML = '<p>No tienes permiso para ver la configuracion general.</p>';
    return;
  }
  try {
    const config = await api.get('/configuracion');
    render(config);
  } catch (err) {
    container.innerHTML = `<p>No se pudo cargar la configuracion (${escapeHtml(err.message)}).</p>`;
  }
}

cargar();
