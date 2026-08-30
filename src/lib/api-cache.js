// Cache-aside simple para catalogos que casi no cambian (corporativos, cuentas
// bancarias, tipo de cambio) pero que hoy se piden enteros de nuevo en CADA
// pagina -- esta es una app multi-pagina (navegacion real entre .html, no un
// router de SPA), asi que un cache en memoria (una variable de modulo) se
// perderia en cada navegacion; por eso esto usa sessionStorage (sobrevive
// entre paginas de la misma pestana, se limpia solo al cerrarla).
//
// TTL corto (3 min) como red de seguridad, y ademas invalidacion explicita
// desde cualquier pantalla que escriba sobre estos catalogos (ver
// invalidarCache) -- asi alguien que edita un cliente ve su propio cambio
// reflejado de inmediato en esa misma pestana, sin esperar el TTL.
import { api } from './api.js';

const TTL_MS = 3 * 60 * 1000;

function claveCache(path) {
  return `apicache:${path}`;
}

/** Igual que api.get(path), pero sirve de sessionStorage si hay una copia sin vencer. */
export async function getCacheado(path) {
  const clave = claveCache(path);
  try {
    const crudo = sessionStorage.getItem(clave);
    if (crudo) {
      const { data, ts } = JSON.parse(crudo);
      if (Date.now() - ts < TTL_MS) { return data; }
    }
  } catch {
    // sessionStorage no disponible o valor corrupto -- se sigue de largo y se pide fresco
  }

  const data = await api.get(path);
  try {
    sessionStorage.setItem(clave, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // storage lleno/deshabilitado -- no es critico, el proximo getCacheado simplemente vuelve a pedir
  }
  return data;
}

/** Llamar despues de crear/editar/borrar algo que afecte a `path` (ver usos en clientes.js, cuentas-bancarias.js, tipo-cambio.js, etc.). */
export function invalidarCache(path) {
  try {
    sessionStorage.removeItem(claveCache(path));
  } catch {
    // nada que limpiar si sessionStorage no esta disponible
  }
}
