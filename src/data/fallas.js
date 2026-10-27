// src/data/fallas.js
// Constantes del dominio de reportes de falla, compartidas por el formulario público
// "Reportar falla" (ReporteFallaForm/EquipoSearchSelect) y la página interna "Reportes de
// falla" — y también por el Dashboard, que desglosa fallas por estado.

export const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Crítica'];
export const PRIORIDAD_HEX = { Baja: '#22C55E', Media: '#F59E0B', Alta: '#F97316', 'Crítica': '#EF4444' };
export const REPORTE_ESTADOS = ['Reportado', 'En revisión', 'En proceso', 'Finalizado'];
export const REPORTE_ESTADO_HEX = { Reportado: '#EF4444', 'En revisión': '#F59E0B', 'En proceso': '#0EA5E9', Finalizado: '#22C55E' };

// Identifica un equipo por su nombre — marca — modelo — S/N. Compartida por el formulario
// público "Reportar falla" y la sección "Reporte de fallas" de la interfaz principal, para
// que ambas pantallas identifiquen el mismo equipo de la misma forma. Cualquier dato
// ausente se omite en vez de mostrar "undefined" o un separador vacío.
export function equipoLabelCompleto(e) {
  const partes = [e.equipo, e.marca, e.modelo].filter(Boolean);
  if (e.numeroSerie) partes.push(`S/N: ${e.numeroSerie}`);
  return partes.join(' — ') || 'Equipo sin datos';
}
