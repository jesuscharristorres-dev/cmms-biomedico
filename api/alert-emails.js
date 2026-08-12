// api/alert-emails.js
// Fuente de verdad COMPARTIDA de los correos que reciben el resumen diario de alertas
// (Configuración). Antes se guardaban solo en localStorage y se subían a Vercel KV
// "a ciegas" (sin nunca leerlos de vuelta), así que un correo agregado en un computador
// no se veía en otro. Usa la misma clave que ya leía api/daily-alerts.js ('cmms:alertEmails').

import { kv } from '@vercel/kv';
import { requireAdmin } from '../lib/auth.js';

const KV_KEY = 'cmms:alertEmails';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const emails = (await kv.get(KV_KEY)) || [];
      return res.status(200).json({ emails });
    }

    // Toda escritura requiere sesión de admin — el modo invitado solo puede leer (GET).
    if (!(await requireAdmin(req, res))) return;

    if (req.method === 'POST') {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ error: 'Falta el correo a agregar.' });
      const emails = (await kv.get(KV_KEY)) || [];
      const actualizados = emails.includes(email) ? emails : [...emails, email];
      await kv.set(KV_KEY, actualizados);
      return res.status(200).json({ emails: actualizados });
    }

    if (req.method === 'DELETE') {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ error: 'Falta el correo a eliminar.' });
      const emails = (await kv.get(KV_KEY)) || [];
      const actualizados = emails.filter(e => e !== email);
      await kv.set(KV_KEY, actualizados);
      return res.status(200).json({ emails: actualizados });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error('[api/alert-emails] Error:', err);
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida de correos de alerta.' });
  }
}
