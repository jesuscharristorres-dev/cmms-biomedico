// src/services/alertLogic.js
// Lógica de cálculo de alertas — ÚNICA fuente de verdad, usada por la pantalla de Alertas.
//
// El estado y la fecha del preventivo NO se calculan aquí: se delega por completo a
// preventivoSchedule.js (misma fuente que usa Inventario para pintar sus puntos), para que
// un equipo vencido en Inventario siempre pueda generar la alerta correspondiente y
// viceversa. Antes existía una segunda fórmula aquí mismo, basada en buscar en
// `equipo.preventivos` un registro con estado distinto de 'Ejecutado' — pero la Hoja de
// Vida solo permite crear registros ya 'Ejecutado' (no hay forma de registrar uno
// "Programado" desde la UI), así que esa lista de pendientes siempre estaba vacía y las
// alertas de preventivo nunca se generaban, sin importar qué tan vencido estuviera un
// equipo en Inventario.
import { estadoActualPreventivo } from './preventivoSchedule';

export const PREVENTIVO_ALERTA_DIAS = 15;
export const CALIBRACION_ALERTA_DIAS = 15;

export function calibStatus(equipo) {
  if (!equipo.aplicaCalibracion || !equipo.fechaUltimaCalibracion) return { status: 'sin_dato', diffDays: null, next: null };
  const last = new Date(equipo.fechaUltimaCalibracion + 'T00:00:00');
  if (isNaN(last.getTime())) return { status: 'sin_dato', diffDays: null, next: null };
  const next = new Date(last); next.setFullYear(next.getFullYear() + 1);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((next - today) / 86400000);
  let status = 'vigente';
  if (diffDays < 0) status = 'vencido'; else if (diffDays <= CALIBRACION_ALERTA_DIAS) status = 'proximo';
  return { status, diffDays, next };
}

export function preventivoAlertStatus(equipo) {
  const r = estadoActualPreventivo(equipo, new Date(), { diasAviso: PREVENTIVO_ALERTA_DIAS });
  if (r.status !== 'vencido' && r.status !== 'proximo') return null;
  return { status: r.status, diffDays: r.diffDays, fecha: r.fecha ? r.fecha.toISOString().slice(0, 10) : '' };
}

export function buildAlerts(equipos) {
  const alerts = [];
  // Un equipo dado de baja (equipo.estado === 'Dado de baja') nunca genera alertas — se
  // valida directamente contra ese estado, sin tocar su historial, calibraciones ni
  // preventivos: el registro sigue intacto, solo deja de contarse aquí.
  (equipos || []).filter(e => e.estado !== 'Dado de baja').forEach(e => {
    const cal = calibStatus(e);
    if (cal.status === 'proximo' || cal.status === 'vencido') {
      alerts.push({
        equipoId: e.id, equipo: e.equipo, empresa: e.empresa, sede: e.sede,
        tipo: 'Calibración', status: cal.status, diffDays: cal.diffDays,
        fecha: cal.next ? cal.next.toISOString().slice(0, 10) : '',
      });
    }
    const prev = preventivoAlertStatus(e);
    if (prev && (prev.status === 'proximo' || prev.status === 'vencido')) {
      alerts.push({
        equipoId: e.id, equipo: e.equipo, empresa: e.empresa, sede: e.sede,
        tipo: 'Preventivo', status: prev.status, diffDays: prev.diffDays, fecha: prev.fecha,
      });
    }
  });
  return alerts.sort((a, b) => a.diffDays - b.diffDays);
}
