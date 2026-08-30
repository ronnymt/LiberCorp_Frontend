import { requireAuth, tienePermiso } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { showToast } from '../v4/toast.js';
import { showModal } from '../v4/modal.js';
import { escapeHtml } from '../lib/ports-table.js';

requireAuth();

const container = document.getElementById('backups-container');
const puedeBackup = tienePermiso('configuracion.backup');

/** true solo despues de "Validar" exitoso -- se resetea al recargar la pagina o al descartar/aplicar. */
let validacion = null; // { ok: boolean, log: string } | null

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

function renderDrive(config) {
  return `
    <div class="card" style="max-width:520px;margin-bottom:16px">
      <div class="card-header">
        <div class="card-title">Conexion con Google Drive</div>
      </div>
      <div class="card-body">
        <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:16px">
          Para una cuenta de Gmail personal (sin Google Workspace), el backup tiene que subirse con OAuth usando tu
          propia cuenta -- las cuentas de servicio no tienen almacenamiento propio fuera de Unidades compartidas.
          Corre <code>node backend/scripts/generar-refresh-token-drive.js &lt;CLIENT_ID&gt; &lt;CLIENT_SECRET&gt;</code>
          una vez para obtener el Refresh Token (instrucciones en el encabezado del script). Client Secret y
          Refresh Token nunca se vuelven a mostrar una vez guardados.
        </p>
        <form class="modal-form" novalidate>
          <div class="modal-form-row">
            <label for="dr-oauth-client-id">OAuth Client ID</label>
            <input type="text" id="dr-oauth-client-id" value="${escapeHtml(config.driveOauthClientId ?? '')}" placeholder="ej. 123456-abc.apps.googleusercontent.com">
          </div>
          <div class="modal-form-row">
            <label for="dr-oauth-client-secret">OAuth Client Secret</label>
            <input type="text" id="dr-oauth-client-secret" placeholder="${config.driveConfigurado ? 'Configurado ✓ -- deja vacio para no cambiarlo' : 'Pega aqui el Client Secret'}">
          </div>
          <div class="modal-form-row">
            <label for="dr-oauth-refresh-token">OAuth Refresh Token</label>
            <input type="text" id="dr-oauth-refresh-token" placeholder="${config.driveConfigurado ? 'Configurado ✓ -- deja vacio para no cambiarlo' : 'Pega aqui el Refresh Token'}">
          </div>
          <div class="modal-form-row">
            <label for="dr-folder">ID de la carpeta de Drive</label>
            <input type="text" id="dr-folder" value="${escapeHtml(config.driveFolderId ?? '')}" placeholder="ej. 1AbCdEfGhIjKlMnOpQrStUvWxYz">
          </div>
          <details style="margin-top:8px">
            <summary style="font-size:12px;color:var(--text-muted);cursor:pointer">Metodo anterior (cuenta de servicio, solo si tienes Google Workspace)</summary>
            <div class="modal-form-row" style="margin-top:8px">
              <label for="dr-json">Credencial (JSON de la cuenta de servicio)</label>
              <textarea id="dr-json" rows="4" placeholder="Pega aqui el JSON completo"></textarea>
            </div>
          </details>
        </form>
        <hr>
        <p style="font-size:12.5px;color:var(--text-muted);margin:12px 0">
          Backup automatico semanal: genera el backup y lo sube a Drive solo, sin intervencion (necesita la cuenta
          de servicio y la carpeta configuradas arriba).
        </p>
        <form class="modal-form" novalidate>
          <div class="modal-form-row">
            <label><input type="checkbox" id="dr-auto-activo" ${config.backupAutomaticoActivo ? 'checked' : ''}> Activar backup automatico</label>
          </div>
          <div class="row col-6-6">
            <div class="modal-form-row">
              <label for="dr-auto-dia">Dia de la semana</label>
              <select id="dr-auto-dia">
                ${DIAS_SEMANA.map((nombre, i) => `<option value="${i}" ${config.backupDiaSemana === i ? 'selected' : ''}>${nombre}</option>`).join('')}
              </select>
            </div>
            <div class="modal-form-row">
              <label for="dr-auto-hora">Hora</label>
              <input type="time" id="dr-auto-hora" value="${escapeHtml((config.backupHora ?? '03:00:00').slice(0, 5))}">
            </div>
          </div>
        </form>
        <button class="btn btn-primary btn-sm" id="dr-guardar" style="margin-top:16px">Guardar</button>
      </div>
    </div>`;
}

function renderBackupYRestaurar() {
  const resultado = validacion
    ? `<div class="alert ${validacion.ok ? 'alert-info' : 'alert-danger'}" style="margin:12px 0">
        <div class="alert-body">
          <strong>${validacion.ok ? 'Validado correctamente.' : 'La validacion fallo.'}</strong>
          <pre style="white-space:pre-wrap;font-size:11.5px;margin-top:8px">${escapeHtml(validacion.log)}</pre>
        </div>
      </div>
      ${
  validacion.ok
    ? `<button class="btn btn-danger btn-sm" id="rs-aplicar-completo">Aplicar TODO (reemplaza la base completa)</button>
             <button class="btn btn-outline btn-sm" id="rs-aplicar-facturacion" style="margin-left:8px">Traer solo Facturacion (agrega lo que falte)</button>
             <button class="btn btn-ghost btn-sm" id="rs-descartar" style="margin-left:8px">Descartar</button>`
    : '<button class="btn btn-ghost btn-sm" id="rs-descartar">Descartar</button>'
}`
    : '';

  return `
    <div class="card" style="max-width:600px;margin-bottom:16px">
      <div class="card-header">
        <div class="card-title">Backup y restauracion</div>
      </div>
      <div class="card-body">
        <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:16px">
          Descarga un respaldo completo de la base de datos (formato .dump de Postgres), o genera uno y subelo
          directo a la carpeta de Google Drive configurada al lado.
        </p>
        <button class="btn btn-outline btn-sm" id="bk-descargar">Descargar backup</button>
        <button class="btn btn-primary btn-sm" id="bk-subir-drive" style="margin-left:8px">Generar y subir a Drive</button>
        <p id="bk-drive-resultado" style="font-size:12.5px;margin-top:12px"></p>

        <hr style="margin:24px 0">

        <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:16px">
          Sube un archivo .dump para validarlo primero contra una base de datos TEMPORAL (no toca la base real).
          Recien despues de validar podras elegir que aplicar.
        </p>
        <div style="margin-top:12px">
          <input type="file" id="rs-archivo" accept=".dump,.sql">
          <button class="btn btn-primary btn-sm" id="rs-validar" style="margin-left:8px">Validar</button>
        </div>
        ${resultado}
      </div>
    </div>`;
}

function render(config) {
  container.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap">${renderBackupYRestaurar()}${renderDrive(config)}</div>`;

  document.getElementById('bk-descargar').addEventListener('click', () => {
    const nombre = `backup_sistema_librenms_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.dump`;
    api.download('/backup/descargar', nombre).catch((err) => showToast(err.message || 'No se pudo descargar', { variant: 'error' }));
  });

  document.getElementById('bk-subir-drive').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const resultadoEl = document.getElementById('bk-drive-resultado');
    resultadoEl.textContent = 'Generando y subiendo...';
    try {
      const { webViewLink } = await api.post('/backup/subir-drive');
      resultadoEl.innerHTML = `Subido correctamente. <a href="${escapeHtml(webViewLink)}" target="_blank" rel="noopener">Ver en Drive</a>`;
      showToast('Backup subido a Drive', { variant: 'success' });
    } catch (err) {
      resultadoEl.textContent = '';
      showToast(err.message || 'No se pudo subir a Drive', { variant: 'error' });
    } finally {
      e.target.disabled = false;
    }
  });

  document.getElementById('dr-guardar').addEventListener('click', async () => {
    const valores = {
      driveServiceAccountJson: document.getElementById('dr-json').value.trim() || undefined,
      driveFolderId: document.getElementById('dr-folder').value.trim() || null,
      driveOauthClientId: document.getElementById('dr-oauth-client-id').value.trim() || null,
      driveOauthClientSecret: document.getElementById('dr-oauth-client-secret').value.trim() || undefined,
      driveOauthRefreshToken: document.getElementById('dr-oauth-refresh-token').value.trim() || undefined,
      backupAutomaticoActivo: document.getElementById('dr-auto-activo').checked,
      backupDiaSemana: Number(document.getElementById('dr-auto-dia').value),
      backupHora: `${document.getElementById('dr-auto-hora').value}:00`
    };
    try {
      const actualizado = await api.patch('/backup/configuracion', valores);
      showToast('Conexion con Drive y backup automatico guardados', { variant: 'success' });
      render(actualizado);
    } catch (err) {
      showToast(err.message || 'No se pudo guardar', { variant: 'error' });
    }
  });

  document.getElementById('rs-validar').addEventListener('click', async (e) => {
    const input = document.getElementById('rs-archivo');
    if (!input.files.length) {
      showToast('Selecciona un archivo .dump', { variant: 'error' });
      return;
    }
    e.target.disabled = true;
    try {
      const formData = new FormData();
      formData.append('archivo', input.files[0]);
      validacion = await api.upload('/backup/restaurar/validar', formData);
      render(await api.get('/configuracion'));
    } catch (err) {
      showToast(err.message || 'No se pudo validar el archivo', { variant: 'error' });
    } finally {
      e.target.disabled = false;
    }
  });

  const btnDescartar = document.getElementById('rs-descartar');
  if (btnDescartar) {
    btnDescartar.addEventListener('click', async () => {
      try {
        await api.delete('/backup/restaurar/validacion');
      } finally {
        validacion = null;
        render(await api.get('/configuracion'));
      }
    });
  }

  const btnCompleto = document.getElementById('rs-aplicar-completo');
  if (btnCompleto) {
    btnCompleto.addEventListener('click', () => {
      showModal({
        title: 'Confirmar restore completo',
        body: `
          <p style="font-size:12.5px;color:var(--text-danger, #d9534f);margin-bottom:12px">
            Esto REEMPLAZA la base de datos completa por el backup validado. El backend necesitara reiniciarse
            despues -- puede quedar inaccesible unos segundos. No se puede deshacer (salvo con otro backup).
          </p>
          <form class="modal-form" novalidate>
            <div class="modal-form-row">
              <label for="cm-texto">Escribe RESTAURAR para confirmar</label>
              <input type="text" id="cm-texto" autocomplete="off">
            </div>
          </form>`,
        actions: [
          { label: 'Cancelar', variant: 'ghost' },
          {
            label: 'Aplicar',
            variant: 'danger',
            action: async () => {
              const texto = document.getElementById('cm-texto').value;
              if (texto !== 'RESTAURAR') {
                showToast('Debes escribir exactamente "RESTAURAR"', { variant: 'error' });
                return false;
              }
              try {
                const res = await api.post('/backup/restaurar/aplicar-completo', { confirmacion: texto });
                showToast(res.mensaje, { variant: 'success' });
                validacion = null;
              } catch (err) {
                showToast(err.message || 'No se pudo aplicar el restore', { variant: 'error' });
              }
            }
          }
        ]
      });
    });
  }

  const btnFacturacion = document.getElementById('rs-aplicar-facturacion');
  if (btnFacturacion) {
    btnFacturacion.addEventListener('click', () => {
      showModal({
        title: 'Traer solo Facturacion',
        body: `<p style="font-size:12.5px;color:var(--text-muted)">
          Agrega las boletas/pagos del backup que todavia no existen en la base real (por id). No borra ni pisa nada existente.
        </p>`,
        actions: [
          { label: 'Cancelar', variant: 'ghost' },
          {
            label: 'Aplicar',
            variant: 'primary',
            action: async () => {
              try {
                const { insertados, omitidos } = await api.post('/backup/restaurar/aplicar-facturacion');
                const resumen = Object.keys(insertados)
                  .map((t) => `${t}: ${insertados[t]} agregadas, ${omitidos[t]} omitidas`)
                  .join(' | ');
                showToast(`Listo. ${resumen}`, { variant: 'success' });
              } catch (err) {
                showToast(err.message || 'No se pudo aplicar el restore de facturacion', { variant: 'error' });
              }
            }
          }
        ]
      });
    });
  }
}

async function cargar() {
  if (!puedeBackup) {
    container.innerHTML = '<p>No tienes permiso para administrar backups.</p>';
    return;
  }
  try {
    const config = await api.get('/configuracion');
    render(config);
  } catch (err) {
    container.innerHTML = `<p>No se pudo cargar (${escapeHtml(err.message)}).</p>`;
  }
}

cargar();
