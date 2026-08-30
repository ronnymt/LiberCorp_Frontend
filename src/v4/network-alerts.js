// Campana del topbar: alertas de red (puertos caidos / recuperados).
//
// No mantiene estado propio -- lee la misma fuente que alimenta la tabla
// "Historial de caidas" de Reporteria (GET /reportes/caidas). Un puerto es
// "caida activa" cuando `enCurso` es true (sin fecha de "Fin" todavia); al
// resolverse queda visible como "Resuelto" por RETENCION_RESUELTO_HORAS para
// que el equipo vea que paso, sin desaparecer de inmediato.
//
// Sin infraestructura de websockets en el backend -- se actualiza por polling.

import { api } from '../lib/api.js';
import { tienePermiso } from '../lib/auth.js';
import { escapeHtml } from '../lib/ports-table.js';
import { openPanel } from './menus.js';

const POLL_MS = 45000;
const RETENCION_RESUELTO_HORAS = 24;
// Ventana de busqueda amplia (no solo 24h) para que una caida que empezo hace
// varios dias siga mostrando su hora de inicio real -- el endpoint recorta
// `inicio` a `desde` cuando el puerto ya estaba caido al entrar al rango.
const VENTANA_BUSQUEDA_DIAS = 7;
const MAX_ITEMS = 30;

let cache = [];
let leidos = new Set();
// Claves de filas "Resuelto" que el usuario ya descarto con "Marcar leidas" --
// se excluyen de `cache` en cada poll para que no reaparezcan solas al
// refrescar (el endpoint no tiene un concepto de "leido" que persistir; no
// hay tabla de notificaciones propia, es una vista derivada del historial de
// caidas, asi que el descarte es de sesion/cliente, no un PATCH al backend).
let descartados = new Set();
let pollTimer = null;
let panelAbierto = null;

function rangoFechas() {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - VENTANA_BUSQUEDA_DIAS * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { desde: iso(desde), hasta: iso(hasta) };
}

function claveFila(r) {
  return `${r.portId}:${r.inicio}`;
}

function relTiempo(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'hace instantes';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.round(h / 24)}d`;
}

function fmtTranscurrido(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDuracion(min) {
  if (min === null || min === undefined) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function fetchAlertas() {
  if (!tienePermiso('reportes.ver')) return [];
  const { desde, hasta } = rangoFechas();
  let filas;
  try {
    filas = await api.get(`/reportes/caidas?desde=${desde}&hasta=${hasta}`);
  } catch {
    return cache; // deja lo ultimo conocido si un poll puntual falla
  }
  const ahora = Date.now();
  return filas
    .filter((f) => f.enCurso || (f.fin && ahora - new Date(f.fin).getTime() <= RETENCION_RESUELTO_HORAS * 3600000))
    .sort((a, b) => {
      const ta = new Date(a.enCurso ? a.inicio : a.fin).getTime();
      const tb = new Date(b.enCurso ? b.inicio : b.fin).getTime();
      return tb - ta;
    })
    .slice(0, MAX_ITEMS);
}

function actualizarBadge(bell, rows) {
  const activas = rows.filter((r) => r.enCurso).length;
  let badge = bell.querySelector('.tb-alert-count');
  if (!badge) return;
  if (activas > 0) {
    badge.textContent = activas > 9 ? '9+' : String(activas);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

const ICONO_CAIDA = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v8M4.5 7l3.5 3.5L11.5 7"/></svg>';
const ICONO_RECUPERADO = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>';

function filaHtml(r) {
  const clave = claveFila(r);
  const noLeido = !leidos.has(clave);
  const corpNombre = r.corporativo || 'Sin corporativo';
  const pill = r.enCurso
    ? `<span class="status status-red status-pulse">En curso &middot; ${escapeHtml(fmtTranscurrido(r.inicio))}</span>`
    : `<span class="status status-brand">Resuelto &middot; duro ${escapeHtml(fmtDuracion(r.duracionMin))}</span>`;
  return `
    <button type="button" class="panel-row${noLeido ? ' unread' : ''}" data-clave="${escapeHtml(clave)}" data-corp-id="${r.corporativoId ?? ''}">
      <span class="panel-icon ${r.enCurso ? 'panel-icon-alert' : 'panel-icon-brand'}" aria-hidden="true">${r.enCurso ? ICONO_CAIDA : ICONO_RECUPERADO}</span>
      <span class="panel-body">
        <span class="panel-from">${escapeHtml(corpNombre)}</span>
        <span class="panel-text">${escapeHtml(r.puerto)}${r.dispositivo ? ` &mdash; ${escapeHtml(r.dispositivo)}` : ''} ${r.enCurso ? 'caido' : 'se recupero'}</span>
        <span class="panel-status-row">${pill}</span>
      </span>
      <span class="panel-time">${escapeHtml(relTiempo(r.enCurso ? r.inicio : r.fin))}</span>
    </button>`;
}

function panelHtml(rows) {
  const activas = rows.filter((r) => r.enCurso).length;
  return `
    <div class="panel-content">
      <div class="panel-header">
        <span class="panel-title">Alertas de red</span>
        ${activas ? `<span class="panel-badge panel-badge-danger">${activas} activa${activas === 1 ? '' : 's'}</span>` : ''}
        <button type="button" class="panel-action" data-action="marcar-leidas">Marcar leidas</button>
      </div>
      <div class="panel-list">
        ${rows.length ? rows.map(filaHtml).join('') : '<div class="panel-empty">Sin caidas recientes.</div>'}
      </div>
      <div class="panel-footer">
        <a href="reportes.html" class="panel-link">Ver todos los reportes de caidas &rarr;</a>
      </div>
    </div>`;
}

function refrescarPanelAbierto() {
  if (!panelAbierto || !panelAbierto.isConnected) { panelAbierto = null; return; }
  panelAbierto.innerHTML = panelHtml(cache);
}

function abrirPanel(bell) {
  const panel = document.createElement('div');
  panel.innerHTML = panelHtml(cache);
  panel.addEventListener('click', (ev) => {
    const marcarBtn = ev.target.closest('[data-action="marcar-leidas"]');
    if (marcarBtn) {
      ev.stopPropagation();
      // Las "en curso" quedan intactas -- solo se descartan las ya resueltas,
      // que es la parte de la lista que ya no requiere accion.
      const resueltas = cache.filter((r) => !r.enCurso);
      resueltas.forEach((r) => descartados.add(claveFila(r)));
      cache = cache.filter((r) => r.enCurso);
      cache.forEach((r) => leidos.add(claveFila(r)));
      actualizarBadge(bell, cache);
      panel.innerHTML = panelHtml(cache);
      return;
    }
    const row = ev.target.closest('.panel-row');
    if (row) {
      leidos.add(row.dataset.clave);
      const corpId = row.dataset.corpId;
      window.location.href = corpId ? `reportes.html?corporativoId=${encodeURIComponent(corpId)}` : 'reportes.html';
    }
  });
  openPanel(bell, panel, { className: 'panel-notifications panel-network-alerts', width: 380 });
  panelAbierto = panel;
}

async function tick(bell) {
  const fresca = await fetchAlertas();
  cache = fresca.filter((r) => !descartados.has(claveFila(r)));
  actualizarBadge(bell, cache);
  refrescarPanelAbierto();
}

/** Engancha la campana `.tb-notifications` a datos reales y arranca el polling. Llamar una vez por pagina. */
export function initNetworkAlerts() {
  const bell = document.querySelector('.tb-notifications');
  if (!bell) return;

  bell.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    abrirPanel(bell);
  });

  tick(bell);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => tick(bell), POLL_MS);
}
