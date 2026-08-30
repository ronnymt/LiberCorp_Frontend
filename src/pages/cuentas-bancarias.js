import { requireAuth, tienePermiso } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { getCacheado, invalidarCache } from '../lib/api-cache.js';
import { showToast } from '../v4/toast.js';
import { showModal } from '../v4/modal.js';
import { escapeHtml } from '../lib/ports-table.js';

requireAuth();

const puedeEditar = tienePermiso('configuracion.editar');

const rows = document.getElementById('cb-rows');
const agregarBtn = document.getElementById('cb-agregar-btn');

let cuentas = [];

function filaHtml(c) {
  return `
    <tr data-id="${c.id}">
      <td class="cell-strong">${escapeHtml(c.nombreCuenta)}</td>
      <td>${escapeHtml(c.banco)}</td>
      <td>${escapeHtml(c.moneda)}</td>
      <td class="cell-mono">${escapeHtml(c.numeroCuenta)}</td>
      <td class="cell-mono">${escapeHtml(c.cci || '-')}</td>
      <td>
        ${
          puedeEditar
            ? `<label style="display:flex;align-items:center;gap:6px;font-size:12.5px">
                 <input type="checkbox" data-toggle-activa data-id="${c.id}" ${c.activa ? 'checked' : ''} style="width:auto">
                 ${c.activa ? 'Activa' : 'Inactiva'}
               </label>`
            : `<span class="status ${c.activa ? 'status-brand' : 'status-muted'}">${c.activa ? 'Activa' : 'Inactiva'}</span>`
        }
      </td>
      <td style="white-space:nowrap;text-align:right">
        ${puedeEditar ? `<button class="btn btn-outline btn-sm" data-editar data-id="${c.id}">Editar</button>` : ''}
      </td>
    </tr>`;
}

function render() {
  rows.innerHTML = cuentas.length ? cuentas.map(filaHtml).join('') : '<tr><td colspan="7">No hay cuentas registradas.</td></tr>';
}

async function cargar() {
  try {
    cuentas = await getCacheado('/cuentas-empresa');
    render();
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="7">No se pudieron cargar las cuentas (${escapeHtml(err.message)}).</td></tr>`;
  }
}

function abrirModalCuenta(cuenta) {
  const esEdicion = Boolean(cuenta);
  const modal = showModal({
    title: esEdicion ? `Editar cuenta — ${cuenta.nombreCuenta}` : 'Agregar banco',
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="cb-nombre">Nombre de la cuenta</label>
          <input type="text" id="cb-nombre" placeholder="ej. Cuenta Principal" value="${escapeHtml(cuenta?.nombreCuenta ?? '')}">
        </div>
        <div class="modal-form-row">
          <label for="cb-banco">Banco</label>
          <input type="text" id="cb-banco" placeholder="ej. Banco de Credito del Peru (BCP)" value="${escapeHtml(cuenta?.banco ?? '')}">
        </div>
        <div class="row col-6-6">
          <div class="modal-form-row">
            <label for="cb-moneda">Moneda</label>
            <select id="cb-moneda">
              <option value="PEN" ${(cuenta?.moneda ?? 'PEN') === 'PEN' ? 'selected' : ''}>PEN</option>
              <option value="USD" ${cuenta?.moneda === 'USD' ? 'selected' : ''}>USD</option>
            </select>
          </div>
          <div class="modal-form-row">
            <label for="cb-numero">Numero de cuenta</label>
            <input type="text" id="cb-numero" value="${escapeHtml(cuenta?.numeroCuenta ?? '')}">
          </div>
        </div>
        <div class="modal-form-row">
          <label for="cb-cci">CCI (Codigo de Cuenta Interbancaria)</label>
          <input type="text" id="cb-cci" placeholder="20 digitos" value="${escapeHtml(cuenta?.cci ?? '')}">
        </div>
      </form>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: esEdicion ? 'Guardar' : 'Agregar',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body, close }) => {
          const nombreCuenta = body.querySelector('#cb-nombre').value.trim();
          const banco = body.querySelector('#cb-banco').value.trim();
          const moneda = body.querySelector('#cb-moneda').value;
          const numeroCuenta = body.querySelector('#cb-numero').value.trim();
          const cci = body.querySelector('#cb-cci').value.trim();

          if (!nombreCuenta || !banco || !numeroCuenta) {
            showToast('Completa nombre, banco y numero de cuenta', { variant: 'error' });
            return;
          }
          try {
            const data = { nombreCuenta, banco, moneda, numeroCuenta, cci: cci || null };
            if (esEdicion) {
              await api.patch(`/cuentas-empresa/${cuenta.id}`, data);
              showToast('Cuenta actualizada', { variant: 'success' });
            } else {
              await api.post('/cuentas-empresa', data);
              showToast('Banco agregado', { variant: 'success' });
            }
            invalidarCache('/cuentas-empresa');
            close();
            await cargar();
          } catch (err) {
            showToast(err.message || 'No se pudo guardar', { variant: 'error' });
          }
        },
      },
    ],
  });
  return modal;
}

if (puedeEditar) {
  agregarBtn.hidden = false;
  agregarBtn.addEventListener('click', () => abrirModalCuenta(null));

  rows.addEventListener('click', (e) => {
    const editarBtn = e.target.closest('[data-editar]');
    if (!editarBtn) return;
    const cuenta = cuentas.find((c) => c.id === Number(editarBtn.dataset.id));
    if (cuenta) abrirModalCuenta(cuenta);
  });

  rows.addEventListener('change', async (e) => {
    const toggle = e.target.closest('[data-toggle-activa]');
    if (!toggle) return;
    try {
      await api.patch(`/cuentas-empresa/${toggle.dataset.id}`, { activa: toggle.checked });
      invalidarCache('/cuentas-empresa');
      await cargar();
    } catch (err) {
      showToast(err.message || 'No se pudo actualizar', { variant: 'error' });
    }
  });
}

cargar();
