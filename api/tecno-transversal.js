// api/tecno-transversal.js
// Fuente de verdad COMPARTIDA de la documentación de Tecnovigilancia (ABC-Tecnovigilancia-
// INVIMA, Manual de Tecnovigilancia, etc). Cada documento tiene una URL distinta POR
// EMPRESA. Forma: { [docKey]: { [empresaKey]: valor } }. El PATCH solo toca una hoja del
// árbol a la vez (read-modify-write en el servidor), igual que api/tecno-reportes.js.
//
// Compatibilidad: antes de diferenciar por empresa, cada doc guardaba un único valor plano
// ({ [docKey]: valor }, sin empresaKey) — un PATCH sin empresaKey todavía escribe ese
// formato viejo (solo lo sigue usando la migración puntual desde localStorage, ver
// loadTecnoTransversal en App.jsx); el cliente lo trata como el valor por defecto para
// cualquier empresa que aún no tenga su propia URL configurada.

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
      const { docKey, empresaKey, valor } = req.body || {};
      if (!docKey) return res.status(400).json({ error: 'Falta docKey.' });
      const data = (await kv.get(KV_KEY)) || {};
      let actualizado;
      if (empresaKey) {
        const docObj = (data[docKey] && typeof data[docKey] === 'object') ? data[docKey] : {};
        actualizado = { ...data, [docKey]: { ...docObj, [empresaKey]: valor } };
      } else {
        actualizado = { ...data, [docKey]: valor };
      }
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
