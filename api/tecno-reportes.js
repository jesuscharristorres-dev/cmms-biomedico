// api/tecno-reportes.js
// Fuente de verdad COMPARTIDA de los reportes trimestrales de Tecnovigilancia, organizados
// por empresa · sede · año · trimestre. Forma: { [empresaKey]: { [sede]: { [anio]: { [trimestre]: valor } } } }.
// El PATCH solo toca una hoja del árbol a la vez (read-modify-write en el servidor).

import { kv } from '@vercel/kv';

const KV_KEY = 'cmms:tecnoReportes';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = (await kv.get(KV_KEY)) || {};
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const { empresaKey, sede, anio, trimestre, valor } = req.body || {};
      if (!empresaKey || !sede || !anio || !trimestre) {
        return res.status(400).json({ error: 'Falta empresaKey, sede, anio o trimestre.' });
      }
      const data = (await kv.get(KV_KEY)) || {};
      const emp = data[empresaKey] || {};
      const sedeObj = emp[sede] || {};
      const anioObj = sedeObj[anio] || {};
      const actualizado = {
        ...data,
        [empresaKey]: { ...emp, [sede]: { ...sedeObj, [anio]: { ...anioObj, [trimestre]: valor } } },
      };
      await kv.set(KV_KEY, actualizado);
      return res.status(200).json({ data: actualizado });
    }

    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error('[api/tecno-reportes] Error:', err);
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida de reportes de tecnovigilancia.' });
  }
}
