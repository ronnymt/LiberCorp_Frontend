import { api } from './api.js';

/**
 * Lee el "exp" (segundos epoch) del payload de un JWT sin verificar la firma
 * -- alcanza para decidir del lado del cliente si vencio, sin esperar a que
 * el backend responda 401. Si el token viene corrupto/no es un JWT valido,
 * se trata como vencido (mejor pedir login de nuevo que arriesgar dejarlo
 * pasar con un token ilegible).
 */
function tokenVencido(token) {
  try {
    const payload = JSON.parse(window.atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !payload.exp || Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

/**
 * Redirige a login.html si no hay sesion O si el token ya vencio (revisado
 * aca mismo, sin ida y vuelta al backend) -- antes solo miraba si el token
 * EXISTIA, asi que una sesion vencida de verdad seguia mostrando el
 * dashboard un instante hasta que la primera llamada a la API devolvia 401.
 * Ojo: que el backend este lento/reiniciando NO es lo mismo que una sesion
 * vencida -- en ese caso el token sigue siendo valido y esta funcion debe
 * dejar pasar igual (la pagina se encarga de mostrar el error de red en sus
 * propias llamadas a la API, no hay que desloguear a nadie por eso).
 */
export function requireAuth() {
  const token = localStorage.getItem('accessToken');
  if (!token || tokenVencido(token)) {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
  }
}

export function getUsuario() {
  const raw = localStorage.getItem('usuario');
  return raw ? JSON.parse(raw) : null;
}

export function tienePermiso(codigo) {
  return getUsuario()?.permisos?.includes(codigo) ?? false;
}

export async function login(correo, contrasena) {
  const data = await api.post('/auth/login', { correo, contrasena });
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('usuario', JSON.stringify(data.usuario));
  return data.usuario;
}

/**
 * Invalida el token del lado del servidor (ver AuthService.logout) ANTES de
 * borrarlo localmente -- si el POST falla (red caida, backend abajo) se
 * limpia igual y se redirige, para no dejar al usuario trabado sin poder
 * salir de su sesion.
 */
export async function logout() {
  try {
    await api.post('/auth/logout');
  } catch {
    // sin conexion al backend -- igual se limpia la sesion local abajo
  }
  localStorage.removeItem('accessToken');
  localStorage.removeItem('usuario');
  window.location.href = 'login.html';
}
