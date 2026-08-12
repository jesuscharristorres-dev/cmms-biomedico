// api/logout.js
// Destruye la sesión en KV (no solo borra la cookie del navegador) y limpia la cookie.
// Antes "cerrar sesión" era únicamente localStorage.removeItem — no invalidaba nada en
// el servidor, así que una sesión robada seguía siendo válida indefinidamente.

import { destroySession, clearSessionCookie } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    await destroySession(req);
    clearSessionCookie(req, res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/logout] Error:', err);
    // Aunque falle borrar en KV, igual limpiamos la cookie del navegador.
    clearSessionCookie(req, res);
    return res.status(200).json({ ok: true });
  }
}
