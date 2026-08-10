// src/services/alertLogic.js
// Lógica de cálculo de alertas — ÚNICA fuente de verdad.
// La usa tanto el frontend (App.jsx) como el cron job del servidor (api/cron/daily-alerts.js),
// para que el correo automático de las 8am calcule EXACTAMENTE lo mismo que ves en la pantalla de Alertas.

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
  if (!equipo.aplicaPreventivo) return null;
  const pendientes = (equipo.preventivos || []).filter(p => p.estado !== 'Ejecutado' && p.fecha);
  if (pendientes.length === 0) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const withDiff = pendientes.map(p => {
    const d = new Date(p.fecha + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return { ...p, diffDays: Math.round((d - today) / 86400000) };
  }).filter(Boolean).sort((a, b) => a.diffDays - b.diffDays);
  if (withDiff.length === 0) return null;
  const nearest = withDiff[0];
  let status = 'ok';
  if (nearest.diffDays < 0) status = 'vencido';
  else if (nearest.diffDays <= PREVENTIVO_ALERTA_DIAS) status = 'proximo';
  return { ...nearest, status };
}

export function buildAlerts(equipos) {
  const alerts = [];
  (equipos || []).forEach(e => {
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
