// lib/auth.js
// Autenticación y autorización centralizadas para las funciones serverless de api/*.
// Vive FUERA de api/ a propósito: Vercel convierte cada archivo dentro de api/ en una
// ruta pública, así que un helper ahí quedaría expuesto como endpoint sin querer.
//
// Modelo de sesión (sin cambios de tecnología respecto a la versión anterior): cookie
// HttpOnly + Secure + SameSite=Lax con un token opaco (crypto.randomBytes); el estado real
// vive en Vercel KV bajo `session:<token>`. Lo nuevo es que la sesión guarda SOLO el
// `userId`: en CADA petición se vuelve a leer el usuario de KV, así que rol, empresa_id y
// estado siempre son los vigentes. Si el SUPER_ADMIN desactiva, elimina o cambia de empresa
// a un usuario, el cambio aplica en la siguiente petición de ese usuario — no hay
// privilegios "congelados" dentro de la sesión.
//
// Flujo de autorización:
//   cookie → sesión → usuario (activo) → rol → empresa asignada (activa) → contexto `ctx`
// Los endpoints NUNCA usan un empresa_id enviado por el cliente para decidir acceso: usan
// `ctx` (ver lib/tenancy.js).

import crypto from 'node:crypto';
import { kv } from './db.js';
import { HttpError } from './http.js';
import { getUsuario } from './usuarios.js';
import { getEmpresa } from './empresas.js';
import { ensureSchema } from './migrations.js';

export { hashPassword, verifyPassword } from './password.js';

const SESSION_COOKIE = 'cmms_session';
const SESSION_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 1 día — sesión "no recordada"
const REMEMBER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 días — "Mantener sesión iniciada"

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  });
  return out;
}

function isProdRequest(req) {
  if (process.env.VERCEL_ENV === 'production') return true;
  if (process.env.VERCEL) return true; // cualquier despliegue en Vercel es HTTPS
  return req.headers?.['x-forwarded-proto'] === 'https';
}

function cookieString(req, name, value, { maxAge, clear } = {}) {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (isProdRequest(req)) parts.push('Secure');
  parts.push(clear ? 'Max-Age=0' : `Max-Age=${maxAge}`);
  return parts.join('; ');
}

/** Crea una sesión para `userId` y setea la cookie en la respuesta. */
export async function createSession(req, res, userId, { remember = false } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const ttl = remember ? REMEMBER_TTL_SECONDS : DEFAULT_TTL_SECONDS;
  await kv.set(`${SESSION_PREFIX}${token}`, { userId, createdAt: Date.now() }, { ex: ttl });
  // Índice de sesiones por usuario — para poder cerrarlas todas al desactivar/eliminar.
  // Expira con la sesión más larga posible (cada login lo renueva) y se le quitan los tokens
  // de sesiones ya vencidas, para que no crezca indefinidamente.
  const indice = `${USER_SESSIONS_PREFIX}${userId}`;
  await limpiarSesionesVencidas(indice);
  await kv.sadd(indice, token);
  await kv.expire(indice, REMEMBER_TTL_SECONDS);
  res.setHeader('Set-Cookie', cookieString(req, SESSION_COOKIE, token, { maxAge: ttl }));
  return token;
}

/** Quita del índice user_sessions:<id> los tokens cuya sesión ya expiró (best-effort). */
async function limpiarSesionesVencidas(indice) {
  try {
    const tokens = (await kv.smembers(indice)) || [];
    if (!tokens.length) return;
    const vivas = await Promise.all(tokens.map(t => kv.exists(`${SESSION_PREFIX}${t}`)));
    const vencidas = tokens.filter((_, i) => !vivas[i]);
    if (vencidas.length) await kv.srem(indice, ...vencidas);
  } catch (err) {
    console.error('[lib/auth] No se pudo limpiar el índice de sesiones:', err);
  }
}

/** Lee la sesión asociada a la cookie de la petición, o null si no hay/expiró. */
export async function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const session = await kv.get(`${SESSION_PREFIX}${token}`);
  if (!session) return null;
  return { token, ...session };
}

/** Destruye la sesión actual en KV (logout real, no solo borrar la cookie del navegador). */
export async function destroySession(req) {
  const session = await getSession(req);
  if (!session) return;
  await kv.del(`${SESSION_PREFIX}${session.token}`);
  if (session.userId) await kv.srem(`${USER_SESSIONS_PREFIX}${session.userId}`, session.token);
}

/** Cierra TODAS las sesiones abiertas de un usuario (al desactivarlo, eliminarlo o moverlo de empresa). */
export async function destroyUserSessions(userId) {
  const key = `${USER_SESSIONS_PREFIX}${userId}`;
  const tokens = (await kv.smembers(key)) || [];
  if (tokens.length) await kv.del(...tokens.map(t => `${SESSION_PREFIX}${t}`));
  await kv.del(key);
}

export function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', cookieString(req, SESSION_COOKIE, '', { clear: true }));
}

/**
 * Construye el contexto de autorización del usuario autenticado, o null si:
 *   - no hay sesión o expiró;
 *   - es una sesión del esquema anterior (sin userId) → obliga a iniciar sesión de nuevo;
 *   - el usuario ya no existe o está inactivo;
 *   - el usuario es de empresa y su empresa no existe o está inactiva.
 */
export async function getAuthContext(req) {
  await ensureSchema();
  const session = await getSession(req);
  if (!session || !session.userId) return null;
  const user = await getUsuario(session.userId);
  if (!user || user.estado !== 'activo') return null;

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  let empresa = null;
  if (!isSuperAdmin) {
    empresa = await getEmpresa(user.empresa_id);
    if (!empresa || empresa.estado !== 'activo') return null;
  }
  return {
    user,
    userId: user.id,
    role: user.role,
    isSuperAdmin,
    // empresaId: null SOLO para SUPER_ADMIN (acceso global). Para cualquier otro rol es
    // obligatoriamente la empresa asignada en KV — nunca un valor del cliente.
    empresaId: isSuperAdmin ? null : user.empresa_id,
    empresa,
    canWrite: isSuperAdmin || user.role === 'EMPRESA',
  };
}

/** Exige sesión válida. Con `write: true`, además exige un rol con permiso de escritura. */
export async function requireAuth(req, { write = false } = {}) {
  const ctx = await getAuthContext(req);
  if (!ctx) throw new HttpError(401, 'Se requiere haber iniciado sesión para esta operación.');
  if (write && !ctx.canWrite) throw new HttpError(403, 'Tu usuario es de solo lectura.');
  return ctx;
}

/** Exige sesión válida de SUPER_ADMIN. */
export async function requireSuperAdmin(req) {
  const ctx = await requireAuth(req);
  if (!ctx.isSuperAdmin) throw new HttpError(403);
  return ctx;
}

/* ---------------------------------------------------------------- */
/* FUERZA BRUTA — bloqueo temporal por cuenta Y por IP (no solo IP)  */
/* ---------------------------------------------------------------- */

const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60; // ventana de 15 minutos
const LOGIN_MAX_ATTEMPTS = 5;

export function getClientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export async function isLoginLocked(username, ip) {
  const [byUser, byIp] = await Promise.all([
    kv.get(`login_fail:user:${username.toLowerCase()}`),
    kv.get(`login_fail:ip:${ip}`),
  ]);
  return (typeof byUser === 'number' && byUser >= LOGIN_MAX_ATTEMPTS)
    || (typeof byIp === 'number' && byIp >= LOGIN_MAX_ATTEMPTS);
}

export async function recordFailedLogin(username, ip) {
  await Promise.all([
    bumpCounter(`login_fail:user:${username.toLowerCase()}`),
    bumpCounter(`login_fail:ip:${ip}`),
  ]);
}

export async function resetFailedLogins(username, ip) {
  await Promise.all([
    kv.del(`login_fail:user:${username.toLowerCase()}`),
    kv.del(`login_fail:ip:${ip}`),
  ]);
}

/**
 * Límite simple de frecuencia por clave (p. ej. IP) para endpoints PÚBLICOS. Devuelve true
 * si la petición se permite y la cuenta; false si ya se alcanzó `max` en la ventana.
 */
export async function allowRate(key, max, windowSeconds) {
  const k = `rate:${key}`;
  const current = (await kv.get(k)) || 0;
  if (typeof current === 'number' && current >= max) return false;
  await kv.set(k, current + 1, { ex: windowSeconds });
  return true;
}

async function bumpCounter(key) {
  const current = (await kv.get(key)) || 0;
  await kv.set(key, current + 1, { ex: LOGIN_ATTEMPT_WINDOW_SECONDS });
}
