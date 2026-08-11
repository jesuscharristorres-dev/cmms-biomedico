// api/personal.js
// Fuente de verdad COMPARTIDA de las hojas de vida del personal. Antes vivía solo en
// localStorage. Mismo patrón que api/reportes-falla.js: crear UNO, actualizar UNO por id.

import { kv } from '@vercel/kv';

const KV_KEY = 'cmms:personal';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const personal = (await kv.get(KV_KEY)) || [];
      return res.status(200).json({ personal });
    }

    if (req.method === 'POST') {
      const { record } = req.body || {};
      if (!record || !record.id) {
        return res.status(400).json({ error: 'Falta el registro a crear (con id).' });
      }
      const personal = (await kv.get(KV_KEY)) || [];
      if (personal.some(p => p.id === record.id)) {
        return res.status(200).json({ record, personal });
      }
      const actualizados = [...personal, record];
      await kv.set(KV_KEY, actualizados);
      return res.status(200).json({ record, personal: actualizados });
    }

    if (req.method === 'PATCH') {
      const { id, patch } = req.body || {};
      if (!id || !patch) {
        return res.status(400).json({ error: 'Falta id o patch para actualizar el registro.' });
      }
      const personal = (await kv.get(KV_KEY)) || [];
      const idx = personal.findIndex(p => p.id === id);
      if (idx === -1) {
        return res.status(404).json({ error: 'No existe un registro con ese id.' });
      }
      const actualizado = { ...personal[idx], ...patch };
      const actualizados = [...personal];
      actualizados[idx] = actualizado;
      await kv.set(KV_KEY, actualizados);
      return res.status(200).json({ record: actualizado, personal: actualizados });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error('[api/personal] Error:', err);
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida de personal.' });
  }
}
