import { requireAuth, tienePermiso } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { getCacheado, invalidarCache } from '../lib/api-cache.js';
import { showToast } from '../v4/toast.js';
import { showModal } from '../v4/modal.js';
import { escapeHtml } from '../lib/ports-table.js';

requireAuth();

const puedeEditar = tienePermiso('configuracion.editar');

const rows = document.getElementById('tc-rows');
const agregarBtn = document.getElementById('tc-agregar-btn');

let lista = [];

function fmtPeriodo(periodo) {
  const [year, month] = periodo.slice(0, 7).split('-');
  const texto = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function filaHtml(tc) {
  return `
    <tr data-id="${tc.id}">
      <td class="cell-strong" style="text-transform:capitalize">${escapeHtml(fmtPeriodo(tc.periodo))}</td>
      <td class="cell-mono">S/ ${Number(tc.valor).toFixed(4)}</td>
      <td style="white-space:nowrap;text-align:right">
        ${
  puedeEditar
    ? `<button class="btn btn-outline btn-sm" data-editar data-id="${tc.id}">Editar</button>
               <button class="btn btn-outline btn-sm" data-eliminar data-id="${tc.id}">Eliminar</button>`
    : ''
}
      </td>
    </tr>`;
}

function render() {
  rows.innerHTML = lista.length ? lista.map(filaHtml).join('') : '<tr><td colspan="3">No hay tipos de cambio registrados.</td></tr>';
}

async function cargar() {
  try {
    lista = (await getCacheado('/tipo-cambio')).sort((a, b) => b.periodo.localeCompare(a.periodo));
    render();
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="3">No se pudo cargar (${escapeHtml(err.message)}).</td></tr>`;
  }
}

function abrirModal(tc) {
  const esEdicion = Boolean(tc);
  showModal({
    title: esEdicion ? `Editar tipo de cambio — ${fmtPeriodo(tc.periodo)}` : 'Agregar tipo de cambio',
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="tc-periodo">Periodo</label>
          <input type="month" id="tc-periodo" value="${tc ? tc.periodo.slice(0, 7) : ''}" ${esEdicion ? 'disabled' : ''}>
        </div>
        <div class="modal-form-row">
          <label for="tc-valor">Valor (S/ por US$1)</label>
          <input type="number" id="tc-valor" step="0.0001" min="0" value="${tc ? Number(tc.valor) : ''}" placeholder="ej. 3.4500">
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
          const periodoMes = esEdicion ? tc.periodo.slice(0, 7) : body.querySelector('#tc-periodo').value;
          const valor = body.querySelector('#tc-valor').value;
          if (!periodoMes || !valor) {
            showToast('Completa periodo y valor', { variant: 'error' });
            return;
          }
          try {
            await api.post('/tipo-cambio', { periodo: `${periodoMes}-01`, valor });
            showToast(esEdicion ? 'Tipo de cambio actualizado' : 'Tipo de cambio agregado', { variant: 'success' });
            invalidarCache('/tipo-cambio');
            close();
            await cargar();
          } catch (err) {
            showToast(err.message || 'No se pudo guardar', { variant: 'error' });
          }
        }
      }
    ]
  });
}

function confirmarEliminar(tc) {
  showModal({
    title: 'Eliminar tipo de cambio',
    body: `<p>¿Eliminar el tipo de cambio de <strong>${escapeHtml(fmtPeriodo(tc.periodo))}</strong> (S/ ${Number(tc.valor).toFixed(4)})? Los reportes de ese periodo pasaran a usar el tipo de cambio mas cercano disponible.</p>`,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Eliminar',
        variant: 'danger',
        closeOnAction: false,
        action: async ({ close }) => {
          try {
            await api.delete(`/tipo-cambio/${tc.id}`);
            showToast('Tipo de cambio eliminado', { variant: 'success' });
            invalidarCache('/tipo-cambio');
            close();
            await cargar();
          } catch (err) {
            showToast(err.message || 'No se pudo eliminar', { variant: 'error' });
          }
        }
      }
    ]
  });
}

if (puedeEditar) {
  agregarBtn.hidden = false;
  agregarBtn.addEventListener('click', () => abrirModal(null));

  rows.addEventListener('click', (e) => {
    const editarBtn = e.target.closest('[data-editar]');
    const eliminarBtn = e.target.closest('[data-eliminar]');
    if (editarBtn) {
      const tc = lista.find((t) => t.id === Number(editarBtn.dataset.id));
      if (tc) abrirModal(tc);
    } else if (eliminarBtn) {
      const tc = lista.find((t) => t.id === Number(eliminarBtn.dataset.id));
      if (tc) confirmarEliminar(tc);
    }
  });
}

cargar();
