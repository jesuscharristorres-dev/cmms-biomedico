// api/sync-data.js
// El frontend llama a este endpoint cada vez que cambian los equipos o los correos de alerta,
// para que el cron diario (que corre en el servidor, sin navegador) tenga datos reales que revisar.
// Requiere Vercel KV conectado al proyecto (Vercel dashboard → Storage → Create Database → KV).

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  const { equipos, alertEmails } = req.body || {};

  try {
    if (Array.isArray(equipos)) await kv.set('cmms:equipos', equipos);
    if (Array.isArray(alertEmails)) await kv.set('cmms:alertEmails', alertEmails);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[api/sync-data] Error guardando en Vercel KV:', err);
    return res.status(500).json({ error: 'No se pudo sincronizar con la base de datos.' });
  }
}
