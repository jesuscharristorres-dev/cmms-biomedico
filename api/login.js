// api/login.js
// Verifica las credenciales EN EL SERVIDOR (antes se comparaban en el navegador contra
// constantes hardcodeadas en el bundle JS — cualquiera podía leerlas con "ver código
// fuente"). Requiere las variables de entorno AUTH_USER y AUTH_PASSWORD_HASH en Vercel
// (Project Settings → Environment Variables). Genera el hash con:
//   node scripts/hash-password.mjs "tu-contraseña"
//
// GET  → { authenticated: boolean } — para que el frontend sepa si hay sesión sin
//        depender de localStorage (que cualquiera puede falsificar).
// POST → { user, pass, remember } — crea la sesión y setea la cookie HttpOnly si las
//        credenciales son correctas.

import { getSession, createSession, isLoginLocked, recordFailedLogin, resetFailedLogins, verifyPassword, getClientIp } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const session = await getSession(req);
    return res.status(200).json({ authenticated: !!session });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const { user, pass, remember } = req.body || {};
  if (!user || !pass) {
    return res.status(400).json({ error: 'Usuario o contraseña incorrectos' });
  }

  const ip = getClientIp(req);
  try {
    if (await isLoginLocked(user, ip)) {
      return res.status(429).json({ error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' });
    }

    const expectedUser = process.env.AUTH_USER;
    const expectedHash = process.env.AUTH_PASSWORD_HASH;
    if (!expectedUser || !expectedHash) {
      console.error('[api/login] Faltan las variables de entorno AUTH_USER / AUTH_PASSWORD_HASH.');
      return res.status(500).json({ error: 'El servidor no tiene configurado el acceso. Contacta al administrador.' });
    }

    const userMatches = user.trim().toLowerCase() === expectedUser.trim().toLowerCase();
    const passMatches = verifyPassword(pass, expectedHash);

    if (!userMatches || !passMatches) {
      await recordFailedLogin(user, ip);
      // Mensaje genérico a propósito: no revela si falló el usuario o la contraseña.
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    await resetFailedLogins(user, ip);
    await createSession(req, res, { remember: !!remember });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/login] Error:', err);
    return res.status(500).json({ error: 'Error inesperado del servidor al iniciar sesión.' });
  }
}
