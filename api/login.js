// api/login.js
// Autenticación multiempresa — verifica credenciales EN EL SERVIDOR contra los usuarios
// guardados en Vercel KV (lib/usuarios.js), con contraseñas hasheadas (scrypt).
//
// GET                     → { authenticated, user, empresas } — quién es el usuario de la
//                            sesión actual (rol y empresa_id los decide el servidor) y las
//                            empresas que puede ver (una sola si es usuario de empresa).
// POST                    → { user, pass, remember } — inicia sesión (cookie HttpOnly).
//                            `user` acepta email o nombre de usuario.
// POST ?action=logout     → cierra la sesión en el servidor y borra la cookie.
//                            (/api/logout se reescribe aquí vía vercel.json por compatibilidad.)
//
// Primer despliegue: si todavía no existe ningún SUPER_ADMIN, la migración 002 lo crea a
// partir de SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD_HASH, o de las variables históricas
// AUTH_USER + AUTH_PASSWORD_HASH (así el administrador actual sigue entrando igual).

import {
  getAuthContext, createSession, destroySession, clearSessionCookie,
  isLoginLocked, recordFailedLogin, resetFailedLogins, getClientIp,
} from '../lib/auth.js';
import { verifyPassword, DUMMY_HASH } from '../lib/password.js';
import { findUsuarioByLogin, usuarioPublico } from '../lib/usuarios.js';
import { getEmpresa, listEmpresas } from '../lib/empresas.js';
import { ensureSchema } from '../lib/migrations.js';
import { sendError, methodNotAllowed } from '../lib/http.js';
import { currentNamespace } from '../lib/db.js';

const CREDENCIALES_INVALIDAS = 'Usuario o contraseña incorrectos';

async function logout(req, res) {
  try {
    await destroySession(req);
  } catch (err) {
    console.error('[api/login] Error cerrando sesión:', err);
  }
  // Aunque falle borrar en KV, igual limpiamos la cookie del navegador.
  clearSessionCookie(req, res);
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const ctx = await getAuthContext(req);
      if (!ctx) return res.status(200).json({ authenticated: false });
      const empresas = ctx.isSuperAdmin ? await listEmpresas() : [ctx.empresa];
      // `entorno`: namespace de datos activo (production / preview / ...), para que la UI avise
      // cuando NO se está trabajando sobre los datos reales.
      return res.status(200).json({ authenticated: true, user: usuarioPublico(ctx.user), empresas, entorno: currentNamespace() });
    } catch (err) {
      console.error('[api/login] Error verificando sesión (GET):', err);
      return res.status(200).json({ authenticated: false });
    }
  }

  if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  if (req.query?.action === 'logout') return logout(req, res);

  const { user, pass, remember } = req.body || {};
  if (typeof user !== 'string' || typeof pass !== 'string' || !user.trim() || !pass) {
    return sendError(res, 400, CREDENCIALES_INVALIDAS);
  }
  const identificador = user.trim().slice(0, 160);

  const ip = getClientIp(req);
  try {
    await ensureSchema();
    if (await isLoginLocked(identificador, ip)) {
      return sendError(res, 429, 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.');
    }

    const usuario = await findUsuarioByLogin(identificador);
    // Siempre se ejecuta scrypt (con un hash señuelo si el usuario no existe) para que el
    // tiempo de respuesta no revele qué emails existen.
    const passOk = verifyPassword(pass, usuario?.password_hash || DUMMY_HASH);
    if (!usuario || !passOk) {
      await recordFailedLogin(identificador, ip);
      return sendError(res, 401, CREDENCIALES_INVALIDAS);
    }

    // Credenciales correctas, pero el acceso puede estar bloqueado por estado.
    if (usuario.estado !== 'activo') {
      return sendError(res, 403, 'Tu usuario está inactivo. Contacta al administrador.');
    }
    if (usuario.role !== 'SUPER_ADMIN') {
      const empresa = await getEmpresa(usuario.empresa_id);
      if (!empresa || empresa.estado !== 'activo') {
        return sendError(res, 403, 'Tu empresa no está activa. Contacta al administrador.');
      }
    }

    await resetFailedLogins(identificador, ip);
    await createSession(req, res, usuario.id, { remember: !!remember });
    return res.status(200).json({ ok: true, user: usuarioPublico(usuario) });
  } catch (err) {
    console.error('[api/login] Error:', err);
    return sendError(res, 500, 'Error inesperado del servidor al iniciar sesión.');
  }
}
