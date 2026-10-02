// api/salud.js
// Verificación de salud + "latido" diario (Vercel Cron, ver vercel.json → crons).
//
// Con DATA_BACKEND=supabase hace UNA consulta mínima (la versión del inventario, ~50 bytes):
// los proyectos gratuitos de Supabase se pausan tras 7 días sin actividad, y este latido diario
// lo evita aunque nadie use la app (vacaciones, festivos). Con Redis no consulta nada.
//
// Si existe CRON_SECRET (Vercel lo envía como "Authorization: Bearer <CRON_SECRET>" en las
// ejecuciones del cron), se exige; así nadie más puede dispararlo.

import { backend, datos } from '../lib/datos/index.js';
import { modoMantenimiento } from '../lib/mantenimiento.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers?.authorization !== `Bearer ${secreto}`) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  const b = backend();
  try {
    if (b === 'supabase') await datos.equipos.marca();
    return res.status(200).json({ ok: true, backend: b, mantenimiento: modoMantenimiento() });
  } catch (err) {
    console.error('[api/salud] La base de datos no respondió:', err);
    return res.status(503).json({ ok: false, backend: b });
  }
}
