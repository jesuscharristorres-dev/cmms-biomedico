// src/services/apiFetch.js
// Envoltorio de fetch para la API de datos: si el servidor responde 401 (sesión expirada,
// usuario desactivado/eliminado o movido de empresa), avisa a AppInner para volver al login
// en vez de dejar la app mostrando datos que ya no se pueden refrescar.
export async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) window.dispatchEvent(new Event('cmms:unauthorized'));
  return res;
}
