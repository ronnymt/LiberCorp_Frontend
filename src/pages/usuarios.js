import { requireAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { showToast } from '../v4/toast.js';
import { showModal } from '../v4/modal.js';
import { openMenu } from '../v4/menus.js';

requireAuth();

const ROL_CLS = { admin: 'red', tecnico: 'blue', asesor: 'green' };

const MODULO_LABELS = {
  clientes: 'Clientes',
  consumo: 'Consumo',
  pagos: 'Pagos',
  reportes: 'Reportes',
  dashboard: 'Dashboard',
  configuracion: 'Configuracion',
  usuarios: 'Usuarios'
};
const ACCION_LABELS = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  exportar: 'Exportar',
  cambio_manual: 'Cambio manual (post-cierre)'
};

let usuarios = [];
let roles = [];
let filtroTexto = '';
let filtroRol = '';
let filtroEstado = '';

const rows = document.getElementById('usuarios-rows');

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function iniciales(nombre) {
  return (nombre ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function visibles() {
  const q = filtroTexto.toLowerCase();
  return usuarios.filter((u) => {
    const matchTexto = !q || u.nombre.toLowerCase().includes(q) || u.correo.toLowerCase().includes(q);
    const matchRol = !filtroRol || String(u.rolId) === filtroRol;
    const matchEstado = !filtroEstado || (filtroEstado === 'activo' ? u.activo : !u.activo);
    return matchTexto && matchRol && matchEstado;
  });
}

function renderKpis() {
  document.getElementById('kpi-total').textContent = usuarios.length;
  document.getElementById('kpi-admins').textContent = usuarios.filter((u) => u.rol?.nombre === 'admin').length;
  document.getElementById('kpi-inactivos').textContent = usuarios.filter((u) => !u.activo).length;
}

function renderFiltroRoles() {
  const select = document.getElementById('filter-rol');
  select.innerHTML =
    '<option value="">Todos los roles</option>' +
    roles.map((r) => `<option value="${r.id}">${escapeHtml(r.nombre)}</option>`).join('');
}

function renderTabla() {
  const items = visibles();
  if (items.length === 0) {
    rows.innerHTML = '<tr><td colspan="4">Sin usuarios para mostrar.</td></tr>';
    return;
  }

  rows.innerHTML = items
    .map((u) => {
      const cls = ROL_CLS[u.rol?.nombre] ?? 'blue';
      return `
        <tr data-id="${u.id}">
          <td>
            <div class="cell-customer">
              <div class="cell-avatar" style="background:var(--primary)">${escapeHtml(iniciales(u.nombre))}</div>
              <div>
                <div class="cell-strong">${escapeHtml(u.nombre)}</div>
                <div style="font-size:11.5px;color:var(--text-muted)">${escapeHtml(u.correo)}</div>
                ${u.celular ? `<div style="font-size:11.5px;color:var(--text-muted)">${escapeHtml(u.celular)}</div>` : ''}
              </div>
            </div>
          </td>
          <td><button type="button" class="role-chip role-${cls}" data-role-edit data-id="${u.id}">${escapeHtml(u.rol?.nombre ?? '-')} <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6l4 4 4-4"/></svg></button></td>
          <td><span class="status ${u.activo ? 'status-green' : 'status-red'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
          <td><button class="card-opt-btn" data-row-menu data-id="${u.id}" aria-label="Mas opciones"><svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg></button></td>
        </tr>`;
    })
    .join('');
}

async function cargar() {
  const [listaUsuarios, listaRoles] = await Promise.all([api.get('/usuarios'), api.get('/roles')]);
  usuarios = listaUsuarios;
  roles = listaRoles;
  renderKpis();
  renderFiltroRoles();
  renderTabla();
}

async function cambiarRol(usuario, rolId) {
  try {
    await api.patch(`/usuarios/${usuario.id}`, { rolId });
    showToast(`${usuario.nombre}: rol actualizado`, { variant: 'success' });
    await cargar();
  } catch (err) {
    showToast(err.message || 'No se pudo actualizar el rol', { variant: 'error' });
  }
}

async function toggleActivo(usuario) {
  try {
    await api.patch(`/usuarios/${usuario.id}`, { activo: !usuario.activo });
    showToast(`${usuario.nombre}: ${usuario.activo ? 'desactivado' : 'activado'}`, { variant: 'success' });
    await cargar();
  } catch (err) {
    showToast(err.message || 'No se pudo actualizar el estado', { variant: 'error' });
  }
}

function abrirModalPassword(usuario) {
  showModal({
    title: `Restablecer contrasena — ${usuario.nombre}`,
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="rp-pass">Nueva contrasena</label>
          <input type="password" id="rp-pass" name="contrasena" minlength="5" required autocomplete="new-password">
          <span style="font-size:11.5px;color:var(--text-muted)">Minimo 5 caracteres</span>
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
          const contrasena = body.querySelector('#rp-pass').value;
          if (!contrasena || contrasena.length < 5) {
            showToast('La contrasena debe tener al menos 5 caracteres', { variant: 'error' });
            return;
          }
          try {
            await api.patch(`/usuarios/${usuario.id}`, { contrasena });
            showToast('Contrasena actualizada', { variant: 'success' });
            close();
          } catch (err) {
            showToast(err.message || 'No se pudo actualizar la contrasena', { variant: 'error' });
          }
        }
      }
    ]
  });
}

function checklistPermisosHtml(porModulo, idsActivos) {
  return [...porModulo.entries()]
    .map(
      ([modulo, permisos]) => `
    <div style="margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">${escapeHtml(MODULO_LABELS[modulo] ?? modulo)}</div>
      ${permisos
    .map(
      (p) => `
        <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px">
          <input type="checkbox" class="rp-permiso-check" value="${p.id}" ${idsActivos.has(p.id) ? 'checked' : ''} style="width:auto">
          ${escapeHtml(ACCION_LABELS[p.accion] ?? p.accion)}
        </label>`
    )
    .join('')}
    </div>`
    )
    .join('');
}

/**
 * Editor de permisos por rol -- el admin no aparece (siempre tiene todos los
 * permisos, protegido en el backend). Un solo modal para tecnico/asesor: el
 * select cambia el rol mostrado sin cerrar/reabrir, y el checklist se
 * cachea por rol para no refetchear al ir y volver.
 */
async function abrirModalRolesPermisos() {
  const permisosCatalogo = await api.get('/roles/permisos');
  const rolesEditables = roles.filter((r) => r.nombre !== 'admin');
  if (rolesEditables.length === 0) {
    showToast('No hay roles editables', { variant: 'error' });
    return;
  }

  const porModulo = new Map();
  for (const p of permisosCatalogo) {
    if (!porModulo.has(p.modulo)) {porModulo.set(p.modulo, []);}
    porModulo.get(p.modulo).push(p);
  }

  const cachePorRol = new Map();

  const { body } = showModal({
    title: 'Roles y permisos',
    size: 'md',
    body: `
      <div class="modal-form-row">
        <label for="rp-rol-select">Rol a editar</label>
        <select id="rp-rol-select" class="form-control">
          ${rolesEditables.map((r) => `<option value="${r.id}">${escapeHtml(r.nombre)}</option>`).join('')}
        </select>
      </div>
      <p style="font-size:11.5px;color:var(--text-muted);margin:4px 0 12px">
        El rol admin no aparece aca -- siempre mantiene todos los permisos. Los usuarios con el rol editado
        van a tener que volver a iniciar sesion para que el cambio aplique.
      </p>
      <div id="rp-checklist">Cargando…</div>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Guardar',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body: b, close }) => {
          const rolId = Number(b.querySelector('#rp-rol-select').value);
          const permisoIds = [...b.querySelectorAll('.rp-permiso-check:checked')].map((el) => Number(el.value));
          try {
            await api.patch(`/roles/${rolId}/permisos`, { permisoIds });
            showToast('Permisos actualizados. Los usuarios de ese rol deberan volver a iniciar sesion.', { variant: 'success' });
            close();
          } catch (err) {
            showToast(err.message || 'No se pudo actualizar los permisos', { variant: 'error' });
          }
        }
      }
    ]
  });

  const select = body.querySelector('#rp-rol-select');
  const checklist = body.querySelector('#rp-checklist');

  async function renderParaRol(rolId) {
    checklist.innerHTML = 'Cargando…';
    if (!cachePorRol.has(rolId)) {
      cachePorRol.set(rolId, await api.get(`/roles/${rolId}/permisos`));
    }
    const idsActivos = new Set(cachePorRol.get(rolId).map((p) => p.id));
    checklist.innerHTML = checklistPermisosHtml(porModulo, idsActivos);
  }

  select.addEventListener('change', () => renderParaRol(Number(select.value)));
  await renderParaRol(Number(select.value));
}

function abrirModalEditar(usuario) {
  showModal({
    title: `Editar usuario — ${usuario.nombre}`,
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="eu-nombre">Nombre</label>
          <input type="text" id="eu-nombre" name="nombre" value="${escapeHtml(usuario.nombre)}" required>
        </div>
        <div class="modal-form-row">
          <label for="eu-correo">Correo</label>
          <input type="email" id="eu-correo" name="correo" value="${escapeHtml(usuario.correo)}" required>
        </div>
        <div class="modal-form-row">
          <label for="eu-celular">Celular <span style="color:var(--text-muted);font-weight:400">(opcional)</span></label>
          <input type="tel" id="eu-celular" name="celular" value="${escapeHtml(usuario.celular ?? '')}" placeholder="+51 999 999 999">
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
          const nombre = body.querySelector('#eu-nombre').value.trim();
          const correo = body.querySelector('#eu-correo').value.trim();
          const celular = body.querySelector('#eu-celular').value.trim();

          if (!nombre || !correo) {
            showToast('Nombre y correo son obligatorios', { variant: 'error' });
            return;
          }
          try {
            await api.patch(`/usuarios/${usuario.id}`, { nombre, correo, celular: celular || null });
            showToast('Usuario actualizado', { variant: 'success' });
            close();
            await cargar();
          } catch (err) {
            showToast(err.message || 'No se pudo actualizar el usuario', { variant: 'error' });
          }
        }
      }
    ]
  });
}

function abrirModalNuevoUsuario() {
  showModal({
    title: 'Nuevo usuario',
    body: `
      <form class="modal-form" novalidate>
        <div class="modal-form-row">
          <label for="nu-nombre">Nombre</label>
          <input type="text" id="nu-nombre" name="nombre" required>
        </div>
        <div class="modal-form-row">
          <label for="nu-correo">Correo</label>
          <input type="email" id="nu-correo" name="correo" required>
        </div>
        <div class="modal-form-row">
          <label for="nu-pass">Contrasena</label>
          <input type="password" id="nu-pass" name="contrasena" minlength="5" required autocomplete="new-password">
          <span style="font-size:11.5px;color:var(--text-muted)">Minimo 5 caracteres</span>
        </div>
        <div class="modal-form-row">
          <label for="nu-celular">Celular <span style="color:var(--text-muted);font-weight:400">(opcional)</span></label>
          <input type="tel" id="nu-celular" name="celular" placeholder="+51 999 999 999">
        </div>
        <div class="modal-form-row">
          <label for="nu-rol">Rol</label>
          <select id="nu-rol" name="rolId">
            ${roles.map((r) => `<option value="${r.id}">${escapeHtml(r.nombre)}</option>`).join('')}
          </select>
        </div>
      </form>
    `,
    actions: [
      { label: 'Cancelar', variant: 'outline' },
      {
        label: 'Crear usuario',
        variant: 'primary',
        closeOnAction: false,
        action: async ({ body, close }) => {
          const nombre = body.querySelector('#nu-nombre').value.trim();
          const correo = body.querySelector('#nu-correo').value.trim();
          const contrasena = body.querySelector('#nu-pass').value;
          const celular = body.querySelector('#nu-celular').value.trim();
          const rolId = Number(body.querySelector('#nu-rol').value);

          if (!nombre || !correo || contrasena.length < 5) {
            showToast('Completa nombre, correo y una contrasena de al menos 5 caracteres', { variant: 'error' });
            return;
          }
          try {
            await api.post('/usuarios', { nombre, correo, contrasena, rolId, celular: celular || undefined });
            showToast(`Usuario ${nombre} creado`, { variant: 'success' });
            close();
            await cargar();
          } catch (err) {
            showToast(err.message || 'No se pudo crear el usuario', { variant: 'error' });
          }
        }
      }
    ]
  });
}

document.getElementById('usuarios-search').addEventListener('input', (e) => {
  filtroTexto = e.target.value;
  renderTabla();
});
document.getElementById('filter-rol').addEventListener('change', (e) => {
  filtroRol = e.target.value;
  renderTabla();
});
document.getElementById('filter-estado').addEventListener('change', (e) => {
  filtroEstado = e.target.value;
  renderTabla();
});

document.getElementById('nuevo-usuario-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  abrirModalNuevoUsuario();
});

document.getElementById('editar-roles-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  abrirModalRolesPermisos().catch((err) => {
    showToast(err.message || 'No se pudo cargar roles y permisos', { variant: 'error' });
  });
});

rows.addEventListener('click', (e) => {
  const roleBtn = e.target.closest('[data-role-edit]');
  const moreBtn = e.target.closest('[data-row-menu]');

  if (roleBtn) {
    e.stopPropagation();
    const usuario = usuarios.find((u) => u.id === Number(roleBtn.dataset.id));
    if (!usuario) {return;}
    openMenu(
      roleBtn,
      roles.map((r) => ({
        label: r.nombre + (r.id === usuario.rolId ? ' ✓' : ''),
        action: () => cambiarRol(usuario, r.id)
      }))
    );
  } else if (moreBtn) {
    e.stopPropagation();
    const usuario = usuarios.find((u) => u.id === Number(moreBtn.dataset.id));
    if (!usuario) {return;}
    openMenu(moreBtn, [
      { label: 'Editar datos', action: () => abrirModalEditar(usuario) },
      { label: 'Restablecer contrasena', action: () => abrirModalPassword(usuario) },
      { label: usuario.activo ? 'Desactivar' : 'Activar', action: () => toggleActivo(usuario) }
    ]);
  }
});

cargar().catch(() => {
  rows.innerHTML = '<tr><td colspan="4">No se pudo conectar con la API.</td></tr>';
});
