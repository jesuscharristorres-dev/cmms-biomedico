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
