// api/planes-programas.js
// Fuente de verdad COMPARTIDA de "Planes y programas" (documentación por empresa: programa
// de mantenimiento, plan de mantenimiento, programa/plan de capacitaciones). Antes vivía
// solo en localStorage. Forma: { [empresaKey]: { [campo]: valor } }.
// El PATCH solo toca un campo de una empresa a la vez (read-modify-write en el servidor),
// así que dos usuarios editando campos distintos —o de empresas distintas— no se pisan.

import { kv } from '@vercel/kv';
import { requireAdmin } from '../lib/auth.js';

const KV_KEY = 'cmms:planesProgramas';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = (await kv.get(KV_KEY)) || {};
      return res.status(200).json({ data });
    }

    // Toda escritura requiere sesión de admin — el modo invitado solo puede leer (GET).
    if (!(await requireAdmin(req, res))) return;

    if (req.method === 'PATCH') {
      const { empresaKey, campo, valor } = req.body || {};
      if (!empresaKey || !campo) {
        return res.status(400).json({ error: 'Falta empresaKey o campo.' });
      }
      const data = (await kv.get(KV_KEY)) || {};
      const actualizado = { ...data, [empresaKey]: { ...(data[empresaKey] || {}), [campo]: valor } };
      await kv.set(KV_KEY, actualizado);
      return res.status(200).json({ data: actualizado });
    }

    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error('[api/planes-programas] Error:', err);
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida de planes y programas.' });
  }
}
