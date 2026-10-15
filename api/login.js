// api/login.js
// Autenticación multiempresa — verifica credenciales EN EL SERVIDOR contra los usuarios
// guardados en Vercel KV (lib/usuarios.js), con contraseñas hasheadas (scrypt).
//
// GET                     → { authenticated, user, empresas } — quién es el usuario de la
//                            sesión actual (rol y empresa_id los decide el servidor) y las
//                            empresas que puede ver. Un usuario EMPRESA/LECTURA puede tener
//                            VARIAS empresas asignadas (lib/usuarios.js → empresaIdsDe);
//                            `empresas` las lista todas, y `user.empresa_id` es cuál de ellas
//                            está ACTIVA en esta sesión (nunca mezcladas entre sí).
// POST                    → { user, pass, remember } — inicia sesión (cookie HttpOnly).
//                            `user` acepta email o nombre de usuario.
// POST ?action=logout     → cierra la sesión en el servidor y borra la cookie.
//                            (/api/logout se reescribe aquí vía vercel.json por compatibilidad.)
// POST ?action=switch-empresa → { empresa_id } cambia la empresa activa de la sesión, entre
//                            las asignadas al usuario (403 si pide una que no es suya).
//
// Primer despliegue: si todavía no existe ningún SUPER_ADMIN, la migración 002 lo crea a
// partir de SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD_HASH, o de las variables históricas
// AUTH_USER + AUTH_PASSWORD_HASH (así el administrador actual sigue entrando igual).

import {
  getAuthContext, createSession, destroySession, clearSessionCookie, setActiveEmpresa,
  isLoginLocked, recordFailedLogin, resetFailedLogins, getClientIp,
} from '../lib/auth.js';
import { verifyPassword, DUMMY_HASH } from '../lib/password.js';
import { findUsuarioByLogin, usuarioPublico, empresaIdsDe } from '../lib/usuarios.js';
import { getEmpresa, listEmpresas } from '../lib/empresas.js';
import { ensureSchema } from '../lib/migrations.js';
import { sendError, methodNotAllowed } from '../lib/http.js';
import { currentNamespace, namespaceExplicito } from '../lib/db.js';

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
    // `entorno` también va en la respuesta SIN sesión: permite comprobar, antes de iniciar
    // sesión, contra qué datos trabaja un deployment (production / preview). No es sensible.
    let entorno;
    try {
      if (!namespaceExplicito()) throw new Error('entorno no determinado');
      entorno = currentNamespace();
    } catch (err) {
      console.error('[api/login] Entorno de datos no determinado:', err.message);
      return sendError(res, 500, 'El servidor no pudo determinar su entorno de datos. No inicies sesión y revisa la configuración.');
    }
    try {
      const ctx = await getAuthContext(req);
      if (!ctx) return res.status(200).json({ authenticated: false, entorno });
      // Para un usuario con varias empresas asignadas, `empresas` lista TODAS (para el
      // selector) — `user.empresa_id` reporta cuál es la ACTIVA de esta sesión en particular
      // (ver getAuthContext), no simplemente la primera del arreglo.
      const empresas = ctx.isSuperAdmin ? await listEmpresas() : await Promise.all(ctx.empresaIds.map(getEmpresa));
      const user = { ...usuarioPublico(ctx.user), empresa_id: ctx.empresaId };
      // `entorno`: namespace de datos activo (production / preview / ...), para que la UI avise
      // cuando NO se está trabajando sobre los datos reales.
      return res.status(200).json({ authenticated: true, user, empresas, entorno });
    } catch (err) {
      console.error('[api/login] Error verificando sesión (GET):', err);
      return res.status(200).json({ authenticated: false, entorno });
    }
  }

  if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  if (req.query?.action === 'logout') return logout(req, res);
  if (req.query?.action === 'switch-empresa') return switchEmpresa(req, res);

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
    // La sesión arranca en la PRIMERA de sus empresas asignadas que siga existiendo y
    // activa (puede tener varias — ver empresaIdsDe); si ninguna lo está, no puede entrar.
    let primeraEmpresaActiva = null;
    if (usuario.role !== 'SUPER_ADMIN') {
      const asignadas = empresaIdsDe(usuario);
      const empresasValidas = (await Promise.all(asignadas.map(id => getEmpresa(id)))).filter(e => e && e.estado === 'activo');
      if (!empresasValidas.length) {
        return sendError(res, 403, 'Tu empresa no está activa. Contacta al administrador.');
      }
      primeraEmpresaActiva = empresasValidas[0].id;
    }

    await resetFailedLogins(identificador, ip);
    await createSession(req, res, usuario.id, { remember: !!remember, activeEmpresaId: primeraEmpresaActiva });
    const user = { ...usuarioPublico(usuario), empresa_id: primeraEmpresaActiva ?? usuarioPublico(usuario).empresa_id };
    return res.status(200).json({ ok: true, user });
  } catch (err) {
    console.error('[api/login] Error:', err);
    return sendError(res, 500, 'Error inesperado del servidor al iniciar sesión.');
  }
}

/**
 * Cambia la empresa "activa" de la sesión actual, entre las que el usuario tiene asignadas
 * (lib/auth.js → setActiveEmpresa). Exige sesión; valida la pertenencia aquí mismo, nunca
 * confiando en lo que mande el cliente sin verificar — igual principio que el resto de la app
 * (lib/tenancy.js), solo que aquí decide cuál de las empresas PROPIAS queda activa, no si
 * puede acceder a una ajena.
 */
async function switchEmpresa(req, res) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return sendError(res, 401);
    if (ctx.isSuperAdmin) return sendError(res, 400, 'El SUPER_ADMIN no tiene una empresa activa que cambiar.');
    const { empresa_id: empresaId } = req.body || {};
    if (typeof empresaId !== 'string' || !ctx.empresaIds.includes(empresaId)) {
      return sendError(res, 403, 'Esa empresa no está entre las asignadas a tu usuario.');
    }
    await setActiveEmpresa(req, empresaId);
    const user = { ...usuarioPublico(ctx.user), empresa_id: empresaId };
    return res.status(200).json({ ok: true, user });
  } catch (err) {
    console.error('[api/login] Error cambiando de empresa activa:', err);
    return sendError(res, 500, 'No se pudo cambiar de empresa.');
  }
}
