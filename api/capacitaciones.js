// api/capacitaciones.js
// Dashboard de capacitaciones del personal. Las respuestas reales viven en formularios de
// Google Forms/Sheets (biomedicosmacromed@gmail.com), compartidos por enlace — ver
// lib/capacitaciones.js para el porqué la lista de hojas vive en una variable de entorno y
// no en el código. Este endpoint las trae, normaliza y cachea en Vercel KV: el frontend
// nunca llama a Google directamente.
//
// GET  → sirve la última sincronización cacheada (rápido, no depende de que Google
//        responda en cada carga de página). Disponible en modo invitado (solo lectura).
// POST → fuerza una sincronización nueva contra Google Sheets y actualiza la caché — es lo
//        que dispara el botón "Actualizar" del dashboard. Solo admin (igual que cualquier
//        escritura en este CMMS).

import { kv } from '@vercel/kv';
import { requireAdmin } from '../lib/auth.js';
import { buildCapacitacionesSnapshot } from '../lib/capacitaciones.js';

const KV_KEY = 'cmms:capacitaciones';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = (await kv.get(KV_KEY)) || null;
      return res.status(200).json({ data });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Método no permitido.' });
    }

    if (!(await requireAdmin(req, res))) return;

    const snapshot = await buildCapacitacionesSnapshot();
    if (snapshot.capacitacionesConfiguradas.length === 0) {
      return res.status(500).json({
        error: 'No hay formularios de capacitaciones configurados. Falta la variable de entorno CAPACITACIONES_SHEETS en Vercel.',
      });
    }
    const data = { ...snapshot, updatedAt: new Date().toISOString() };
    await kv.set(KV_KEY, data);
    return res.status(200).json({ data });
  } catch (err) {
    console.error('[api/capacitaciones] Error:', err);
    return res.status(500).json({ error: 'No se pudo sincronizar las capacitaciones.' });
  }
}
