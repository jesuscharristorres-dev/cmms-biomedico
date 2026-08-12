// lib/auth.js
// Helpers de autenticación/sesión compartidos por las funciones serverless en api/*.
// Vive FUERA de api/ a propósito: Vercel convierte cada archivo dentro de api/ en una
// ruta pública, así que un helper ahí quedaría expuesto como endpoint sin querer.
//
// Modelo de sesión: cookie HttpOnly + Secure + SameSite=Lax con un token opaco
// (crypto.randomBytes), cuyo estado real (rol, expiración) vive en Vercel KV bajo
// `session:<token>`. Esto permite invalidar sesiones server-side (logout real, no solo
// borrar la cookie) y no depende de que el navegador "confíe" en nada — el servidor es
// quien decide si el token sigue siendo válido en cada petición.

import crypto from 'node:crypto';
import { kv } from '@vercel/kv';

const SESSION_COOKIE = 'cmms_session';
const SESSION_PREFIX = 'session:';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 1 día — sesión "no recordada"
const REMEMBER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 días — checkbox "Mantener sesión iniciada"

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function isProdRequest(req) {
  // VERCEL_ENV distingue production/preview/development; también aceptamos que la
  // petición ya venga por https (x-forwarded-proto, que Vercel siempre setea).
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

/** Crea una sesión de admin en KV y setea la cookie en la respuesta. */
export async function createSession(req, res, { remember = false } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const ttl = remember ? REMEMBER_TTL_SECONDS : DEFAULT_TTL_SECONDS;
  await kv.set(`${SESSION_PREFIX}${token}`, { role: 'admin', createdAt: Date.now() }, { ex: ttl });
  res.setHeader('Set-Cookie', cookieString(req, SESSION_COOKIE, token, { maxAge: ttl }));
  return token;
}

/** Lee la sesión asociada a la cookie de la petición, o null si no hay/expiró. */
export async function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = await kv.get(`${SESSION_PREFIX}${token}`);
  if (!session) return null;
  return { token, ...session };
}

/** Destruye la sesión en KV (logout real, no solo borrar la cookie del navegador). */
export async function destroySession(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) await kv.del(`${SESSION_PREFIX}${token}`);
}

export function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', cookieString(req, SESSION_COOKIE, '', { clear: true }));
}

/**
 * Guard para endpoints que solo pueden ejecutar operaciones de escritura si hay una
 * sesión de admin válida. Si no la hay, ya responde 401 y devuelve null — el handler
 * que llama a esto debe simplemente `return` cuando reciba null.
 */
export async function requireAdmin(req, res) {
  const session = await getSession(req);
  if (!session || session.role !== 'admin') {
    res.status(401).json({ error: 'Se requiere haber iniciado sesión para esta operación.' });
    return null;
  }
  return session;
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

/** true si la cuenta o la IP ya superaron el máximo de intentos fallidos en la ventana. */
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

async function bumpCounter(key) {
  const current = (await kv.get(key)) || 0;
  await kv.set(key, current + 1, { ex: LOGIN_ATTEMPT_WINDOW_SECONDS });
}

/* ---------------------------------------------------------------- */
/* CONTRASEÑA — scrypt con salt, sin dependencias nuevas             */
/* ---------------------------------------------------------------- */

/** Genera "salt:hash" en hex — esto es lo que va en la variable de entorno AUTH_PASSWORD_HASH. */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Compara en tiempo constante — evita filtrar por timing cuánto del hash coincide. */
export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  let hashBuffer;
  let candidateBuffer;
  try {
    hashBuffer = Buffer.from(hash, 'hex');
    candidateBuffer = crypto.scryptSync(password, salt, 64);
  } catch {
    return false;
  }
  if (hashBuffer.length !== candidateBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, candidateBuffer);
}
