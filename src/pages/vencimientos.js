import { requireAuth, tienePermiso } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { invalidarCache } from '../lib/api-cache.js';
import { showToast } from '../v4/toast.js';
import { showModal } from '../v4/modal.js';

requireAuth();

const puedeVer = tienePermiso('configuracion.ver');
const puedeEditar = tienePermiso('configuracion.editar');

const diaDefaultInput = document.getElementById('vc-dia-default');
const diasCrearFacturaInput = document.getElementById('vc-dias-crear-factura');
const diasGraciaInput = document.getElementById('vc-dias-gracia');
const guardarDefaultBtn = document.getElementById('vc-guardar-default');
const diaMasivoInput = document.getElementById('vc-dia-masivo');
const diasCrearFacturaMasivoInput = document.getElementById('vc-dias-crear-factura-masivo');
const diasGraciaMasivoInput = document.getElementById('vc-dias-gracia-masivo');
const aplicarMasivoBtn = document.getElementById('vc-aplicar-masivo');

function validarDia(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= 28;
}

/** "Dia de pago": dia del mes 1-28. */
function llenarDiasDelMes(select) {
  select.innerHTML = Array.from({ length: 28 }, (_, i) => i + 1)
    .map((d) => `<option value="${d}">${String(d).padStart(2, '0')}</option>`)
    .join('');
}

/** "Crear factura"/"Dias de gracia": cantidad de dias 0-30. */
function llenarCantidadDias(select, sufijo, etiquetaCero) {
  select.innerHTML = Array.from({ length: 31 }, (_, i) => i)
    .map((d) => `<option value="${d}">${d === 0 ? etiquetaCero : `${d} ${sufijo}`}</option>`)
    .join('');
}

/** Version "masiva" de las de arriba: agrega "No cambiar" (vacio) al principio para poder dejar un campo intacto. */
function llenarConNoCambiar(select, llenador, ...args) {
  const noCambiar = '<option value="">No cambiar</option>';
  llenador(select, ...args);
  select.innerHTML = noCambiar + select.innerHTML;
}

llenarDiasDelMes(diaDefaultInput);
llenarCantidadDias(diasCrearFacturaInput, 'Dias antes', 'El mismo dia');
llenarCantidadDias(diasGraciaInput, 'Dias', 'Sin gracia');
llenarConNoCambiar(diaMasivoInput, llenarDiasDelMes);
llenarConNoCambiar(diasCrearFacturaMasivoInput, llenarCantidadDias, 'Dias antes', 'El mismo dia');
llenarConNoCambiar(diasGraciaMasivoInput, llenarCantidadDias, 'Dias', 'Sin gracia');

async function cargar() {
  if (!puedeVer) {
    document.querySelector('.page-wrapper').innerHTML = '<p>No tienes permiso para ver esta seccion.</p>';
    return;
  }
  try {
    const config = await api.get('/configuracion');
    diaDefaultInput.value = config.diaVencimientoDefault ?? 15;
    diasCrearFacturaInput.value = config.diasAntesCrearFacturaDefault ?? 5;
    diasGraciaInput.value = config.diasGraciaDefault ?? 0;
  } catch (err) {
    showToast(err.message || 'No se pudo cargar la configuracion', { variant: 'error' });
  }
  if (!puedeEditar) {
    for (const el of [
      diaDefaultInput,
      diasCrearFacturaInput,
      diasGraciaInput,
      guardarDefaultBtn,
      diaMasivoInput,
      diasCrearFacturaMasivoInput,
      diasGraciaMasivoInput,
      aplicarMasivoBtn
    ]) el.disabled = true;
  }
}

guardarDefaultBtn.addEventListener('click', async () => {
  if (!validarDia(diaDefaultInput.value)) {
    showToast('El dia de pago debe estar entre 1 y 28', { variant: 'error' });
    return;
  }
  try {
    await api.patch('/configuracion/vencimiento', {
      diaVencimientoDefault: Number(diaDefaultInput.value),
      diasAntesCrearFacturaDefault: Number(diasCrearFacturaInput.value),
      diasGraciaDefault: Number(diasGraciaInput.value)
    });
    showToast('Configuracion de facturacion guardada', { variant: 'success' });
  } catch (err) {
    showToast(err.message || 'No se pudo guardar', { variant: 'error' });
  }
});

aplicarMasivoBtn.addEventListener('click', () => {
  const cambios = {};
  if (diaMasivoInput.value) cambios.diaVencimiento = Number(diaMasivoInput.value);
  if (diasCrearFacturaMasivoInput.value) cambios.diasAntesCrearFactura = Number(diasCrearFacturaMasivoInput.value);
  if (diasGraciaMasivoInput.value) cambios.diasGracia = Number(diasGraciaMasivoInput.value);

  if (Object.keys(cambios).length === 0) {
    showToast('Elige al menos un campo para aplicar (deja "No cambiar" en los que no quieras tocar)', { variant: 'error' });
    return;
  }

  const resumen = [
    cambios.diaVencimiento !== undefined ? `dia de pago a <strong>${cambios.diaVencimiento}</strong>` : null,
    cambios.diasAntesCrearFactura !== undefined ? `crear factura a <strong>${cambios.diasAntesCrearFactura} dias antes</strong>` : null,
    cambios.diasGracia !== undefined ? `dias de gracia a <strong>${cambios.diasGracia}</strong>` : null
  ].filter(Boolean).join(', ');

  showModal({
    title: 'Aplicar configuracion a todos los clientes',
    body: `
      <p>Esto va a pisar ${resumen} de <strong>todos</strong> los clientes, incluidos los que ya tenian un valor
      distinto configurado a mano. No afecta boletas ya calculadas, solo las que se generen de aqui en adelante.</p>
      <p style="color:var(--text-muted);font-size:12.5px;margin-top:8px">Esta accion no se puede deshacer con un click -- tendrias que volver a configurar cada override manualmente.</p>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Si, aplicar a todos',
        variant: 'danger',
        closeOnAction: false,
        action: async ({ close }) => {
          try {
            const resultado = await api.patch('/corporativos/facturacion-masiva', cambios);
            showToast(`Configuracion actualizada en ${resultado.actualizados} cliente(s)`, { variant: 'success' });
            invalidarCache('/corporativos');
            close();
          } catch (err) {
            showToast(err.message || 'No se pudo aplicar el cambio masivo', { variant: 'error' });
          }
        },
      },
    ],
  });
});

cargar();
