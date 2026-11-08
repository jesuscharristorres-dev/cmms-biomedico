// lib/reportes-falla.js
// Almacenamiento de los reportes de falla: UN reporte por clave, igual que lib/equipos.js —
// ver ese archivo para el porqué (límite de 10 MB por escritura de Upstash/Vercel KV). Este
// histórico crece sin límite (cada falla reportada queda ahí para siempre), así que es de los
// más propensos a toparse con ese límite si se siguiera guardando como un solo arreglo.
// La migración 006_reportes_falla_por_clave (lib/migrations.js) copia los datos del formato
// anterior (arreglo bajo `cmms:reportesFalla`) a este, sin tocar la clave vieja.

import { kv } from './db.js';

export const REPORTES_FALLA_IDS_KEY = 'cmms:reportesFalla:ids';
export const reporteFallaItemKey = (id) => `cmms:reportesFalla:item:${id}`;

export async function listReportesFalla() {
  const ids = await kv.smembers(REPORTES_FALLA_IDS_KEY);
  if (!ids.length) return [];
  const valores = await kv.mget(...ids.map(reporteFallaItemKey));
  return valores.filter(Boolean);
}

export async function getReporteFalla(id) {
  return (await kv.get(reporteFallaItemKey(id))) || null;
}

export async function setReporteFalla(reporte) {
  await kv.set(reporteFallaItemKey(reporte.id), reporte);
  await kv.sadd(REPORTES_FALLA_IDS_KEY, reporte.id);
}

/** Borra varios reportes a la vez (vaciar histórico, total o por empresa). */
export async function deleteReportesFalla(ids) {
  if (!ids.length) return;
  await kv.del(...ids.map(reporteFallaItemKey));
  await kv.srem(REPORTES_FALLA_IDS_KEY, ...ids);
}
