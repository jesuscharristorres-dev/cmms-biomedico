// api/tecno-transversal.js
// Fuente de verdad COMPARTIDA de la documentación transversal de Tecnovigilancia (única,
// no depende de la empresa: ABC-Tecnovigilancia-INVIMA, Manual de Tecnovigilancia, etc).
// Forma: { [docKey]: valor }. Antes vivía solo en localStorage.

import { kv } from '@vercel/kv';
import { requireAdmin } from '../lib/auth.js';

const KV_KEY = 'cmms:tecnoTransversal';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = (await kv.get(KV_KEY)) || {};
      return res.status(200).json({ data });
    }

    // Toda escritura requiere sesión de admin — el modo invitado solo puede leer (GET).
    if (!(await requireAdmin(req, res))) return;

    if (req.method === 'PATCH') {
      const { docKey, valor } = req.body || {};
      if (!docKey) return res.status(400).json({ error: 'Falta docKey.' });
      const data = (await kv.get(KV_KEY)) || {};
      const actualizado = { ...data, [docKey]: valor };
      await kv.set(KV_KEY, actualizado);
      return res.status(200).json({ data: actualizado });
    }

    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error('[api/tecno-transversal] Error:', err);
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida de tecnovigilancia.' });
  }
}
