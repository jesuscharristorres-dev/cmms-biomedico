// src/utils/fechas.js
// ÚNICA función de la app para mostrarle una fecha al usuario (ej. "24/08/2026") — todo
// componente que necesite pintar una fecha en pantalla, tabla, PDF o exportación debe
// pasar por aquí, en vez de interpolar `equipo.fecha` (AAAA-MM-DD) directamente. Acepta
// tanto un string ISO ("AAAA-MM-DD" o con hora) como un objeto Date ya construido (p. ej.
// `calibStatus(...).next`). Ancla los strings de solo fecha a medianoche LOCAL — sin esto,
// `new Date('2026-08-24')` se interpreta como medianoche UTC, que en Colombia (UTC-5) cae
// la tarde/noche del día 23, mostrando la fecha equivocada.
export function formatFechaCorta(fecha) {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha.length === 10 ? `${fecha}T00:00:00` : fecha);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Fecha de HOY en formato AAAA-MM-DD, usando el reloj LOCAL del navegador. A propósito
// no usa `new Date().toISOString()` (que da la fecha en UTC): Colombia es UTC-5, así que
// entre las 7:00 p. m. y la medianoche locales, el UTC ya cayó en el día siguiente — con
// toISOString(), cualquier registro nuevo (preventivo, correctivo, reporte de falla, etc.)
// creado en esa ventana horaria se guardaba fechado un día por delante.
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
