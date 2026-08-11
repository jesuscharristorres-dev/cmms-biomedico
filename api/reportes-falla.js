// api/reportes-falla.js
// Fuente de verdad COMPARTIDA de los reportes de falla — reemplaza el uso de localStorage
// como almacenamiento principal. Corre en el servidor (Vercel serverless + Vercel KV), así
// que cualquier usuario, desde cualquier computador, lee y escribe siempre el mismo dato.
//
// A propósito NO recibe nunca el arreglo completo desde el cliente para sobrescribirlo:
// eso es lo que causaba (con localStorage) que un reporte creado en un computador solo
// existiera ahí. Aquí cada operación es puntual (crear UNO, actualizar UNO por id) y el
// servidor hace el read-modify-write sobre KV, así dos usuarios guardando casi al mismo
// tiempo desde computadores distintos no se pisan ni se pierden reportes entre sí.
//
// Requiere Vercel KV conectado al proyecto (Vercel dashboard → Storage → Create Database → KV),
// igual que api/sync-data.js.

import { kv } from '@vercel/kv';

const KV_KEY = 'cmms:reportesFalla';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const reportes = (await kv.get(KV_KEY)) || [];
      return res.status(200).json({ reportes });
    }

    if (req.method === 'POST') {
      const { reporte } = req.body || {};
      if (!reporte || !reporte.id) {
        return res.status(400).json({ error: 'Falta el reporte a crear (con id).' });
      }
      const reportes = (await kv.get(KV_KEY)) || [];
      // Idempotencia: si por un reintento de red llega el mismo id dos veces, no se duplica.
      if (reportes.some(r => r.id === reporte.id)) {
        return res.status(200).json({ reporte, reportes });
      }
      const actualizados = [...reportes, reporte];
      await kv.set(KV_KEY, actualizados);
      return res.status(200).json({ reporte, reportes: actualizados });
    }

    if (req.method === 'PATCH') {
      const { id, patch } = req.body || {};
      if (!id || !patch) {
        return res.status(400).json({ error: 'Falta id o patch para actualizar el reporte.' });
      }
      const reportes = (await kv.get(KV_KEY)) || [];
      const idx = reportes.findIndex(r => r.id === id);
      if (idx === -1) {
        return res.status(404).json({ error: 'No existe un reporte con ese id.' });
      }
      const actualizado = { ...reportes[idx], ...patch };
      const actualizados = [...reportes];
      actualizados[idx] = actualizado;
      await kv.set(KV_KEY, actualizados);
      return res.status(200).json({ reporte: actualizado, reportes: actualizados });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error('[api/reportes-falla] Error:', err);
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida de reportes.' });
  }
}
