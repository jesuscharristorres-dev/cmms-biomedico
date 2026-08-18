// api/limpieza-desinfeccion.js
// Fuente de verdad COMPARTIDA de los formatos de limpieza y desinfección, organizados por
// empresa · sede · año · mes. Forma: { [empresaKey]: { [sede]: { [anio]: { [mes]: { url, updatedAt } } } } }.
// Solo se guardan metadatos mínimos (sede/año/mes van en la ruta; url y updatedAt en la hoja) —
// el documento en sí vive en un servicio externo (Drive/OneDrive/SharePoint), nunca aquí.

import { kv } from '@vercel/kv';
import { requireAdmin } from '../lib/auth.js';

const KV_KEY = 'cmms:limpiezaDesinfeccion';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = (await kv.get(KV_KEY)) || {};
      return res.status(200).json({ data });
    }

    // Toda escritura requiere sesión de admin — el modo invitado solo puede leer (GET).
    if (!(await requireAdmin(req, res))) return;

    if (req.method === 'PATCH') {
      const { empresaKey, sede, anio, mes, url } = req.body || {};
      if (!empresaKey || !sede || anio === undefined || anio === null || mes === undefined || mes === null) {
        return res.status(400).json({ error: 'Falta empresaKey, sede, anio o mes.' });
      }
      const data = (await kv.get(KV_KEY)) || {};
      const emp = data[empresaKey] || {};
      const sedeObj = emp[sede] || {};
      const anioObj = { ...(sedeObj[anio] || {}) };
      const limpio = typeof url === 'string' ? url.trim() : '';
      if (limpio) {
        // La fecha de actualización se calcula en el servidor — no se confía en el reloj del cliente.
        anioObj[mes] = { url: limpio, updatedAt: new Date().toISOString() };
      } else {
        delete anioObj[mes];
      }
      const actualizado = {
        ...data,
        [empresaKey]: { ...emp, [sede]: { ...sedeObj, [anio]: anioObj } },
      };
      await kv.set(KV_KEY, actualizado);
      return res.status(200).json({ data: actualizado });
    }

    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error('[api/limpieza-desinfeccion] Error:', err);
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida de limpieza y desinfección.' });
  }
}
