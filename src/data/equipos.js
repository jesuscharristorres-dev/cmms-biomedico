// src/data/equipos.js
// Constantes del dominio de equipos compartidas por varias páginas (Dashboard, Inventario,
// la hoja de vida del equipo, Reportes de falla...) — viven en su propio módulo para que
// cualquier página extraída de App.jsx pueda importarlas sin crear un import circular.

export const MONTHS = [
  { k: 'ene', l: 'Ene', full: 'Enero', idx: 0 }, { k: 'feb', l: 'Feb', full: 'Febrero', idx: 1 }, { k: 'mar', l: 'Mar', full: 'Marzo', idx: 2 },
  { k: 'abr', l: 'Abr', full: 'Abril', idx: 3 }, { k: 'may', l: 'May', full: 'Mayo', idx: 4 }, { k: 'jun', l: 'Jun', full: 'Junio', idx: 5 },
  { k: 'jul', l: 'Jul', full: 'Julio', idx: 6 }, { k: 'ago', l: 'Ago', full: 'Agosto', idx: 7 }, { k: 'sep', l: 'Sep', full: 'Septiembre', idx: 8 },
  { k: 'oct', l: 'Oct', full: 'Octubre', idx: 9 }, { k: 'nov', l: 'Nov', full: 'Noviembre', idx: 10 }, { k: 'dic', l: 'Dic', full: 'Diciembre', idx: 11 },
];

export const CLASIFICACIONES = ['I', 'IIA', 'IIB', 'III', 'N/A'];
export const ESTADOS_EQUIPO = ['Operativo', 'Fuera de servicio', 'En mantenimiento', 'Dado de baja'];
// La vista "Mantenimientos preventivos" solo ofrece estos dos — "Dado de baja" únicamente
// aparece seleccionable en un equipo cuando ya tiene un reporte de baja (mismo campo
// equipo.estado de siempre; no es una lógica nueva, solo se acortan las opciones visibles aquí).
export const ESTADOS_MANTENIMIENTOS = ['Operativo', 'Dado de baja'];

// Semáforo semántico compartido — mantenimientos y calibraciones usan el mismo
// significado de color (verde=bien, ámbar=próximo, rojo=vencido, gris=sin dato),
// antes duplicado como dos mapas hex idénticos con llaves distintas.
export const SEMANTIC_HEX = { ok: '#22C55E', warn: '#F59E0B', danger: '#EF4444', neutral: '#475569' };
export const STATUS_HEX = { realizado: SEMANTIC_HEX.ok, programado: SEMANTIC_HEX.warn, vencido: SEMANTIC_HEX.danger, no_aplica: SEMANTIC_HEX.neutral };
export const STATUS_LABEL = { realizado: 'Realizado', programado: 'Programado', vencido: 'Vencido', no_aplica: 'No aplica' };
export const CAL_HEX = { vigente: SEMANTIC_HEX.ok, proximo: SEMANTIC_HEX.warn, vencido: SEMANTIC_HEX.danger, sin_dato: SEMANTIC_HEX.neutral };
