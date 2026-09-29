// api/capacitaciones.js
// Dashboard de capacitaciones del personal. Las respuestas reales viven en formularios de
// Google Forms/Sheets, compartidos por enlace — ver lib/capacitaciones.js para el porqué la
// lista de hojas vive en una variable de entorno y no en el código. Este endpoint las trae,
// normaliza y cachea en Vercel KV: el frontend nunca llama a Google directamente.
//
// MULTIEMPRESA:
//   GET  → exige sesión. SUPER_ADMIN recibe todos los registros; un usuario de empresa solo
//          los registros cuya `empresa` es la suya (los registros "OTRAS" no son de ninguna
//          empresa del CMMS y solo los ve el SUPER_ADMIN).
//   POST → fuerza una sincronización nueva contra Google Sheets. Es una operación global
//          (trae las hojas de todas las empresas), así que solo SUPER_ADMIN.

import { kv } from '../lib/db.js';
import { requireAuth, requireSuperAdmin } from '../lib/auth.js';
import { buildCapacitacionesSnapshot } from '../lib/capacitaciones.js';
import { scopeArray } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';

const KV_KEY = 'cmms:capacitaciones';

function scopeSnapshot(ctx, data) {
  if (!data || ctx.isSuperAdmin) return data;
  return { ...data, records: scopeArray(ctx, data.records), errores: [] };
}

export default withErrors('api/capacitaciones', 'No se pudo sincronizar las capacitaciones.', async (req, res) => {
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const data = (await kv.get(KV_KEY)) || null;
    return res.status(200).json({ data: scopeSnapshot(ctx, data) });
  }

  if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

  await requireSuperAdmin(req);
  const snapshot = await buildCapacitacionesSnapshot();
  if (snapshot.capacitacionesConfiguradas.length === 0) {
    throw new HttpError(500, 'No hay formularios de capacitaciones configurados. Falta la variable de entorno CAPACITACIONES_SHEETS en Vercel.');
  }
  const data = { ...snapshot, updatedAt: new Date().toISOString() };
  await kv.set(KV_KEY, data);
  return res.status(200).json({ data });
});
