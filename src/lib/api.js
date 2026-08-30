// Cliente HTTP hacia el backend NestJS. Vanilla fetch, sin dependencias.

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

function authHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options.headers
    }
  });

  if (res.status === 401) {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
    return Promise.reject(new Error('No autenticado'));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Error ${res.status}`);
  }

  if (res.status === 204) {return null;}
  return res.json();
}

/** Descarga binaria (Excel/PDF) -- fetch en vez de <a href> directo porque el endpoint exige el Bearer token. */
async function download(path, filename) {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Error ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Sube un archivo (multipart/form-data) -- sin Content-Type manual, el navegador arma el boundary solo. */
async function upload(path, formData) {
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders(), body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Error ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  download,
  upload
};
