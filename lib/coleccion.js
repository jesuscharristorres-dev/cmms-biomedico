// lib/coleccion.js
// Colecciones GRANDES guardadas en una sola clave de Redis (cmms:equipos ~2,4 MB,
// cmms:capacitaciones, cmms:limpiezaPlantillas) con una clave de VERSIÓN pequeña al lado
// (`<clave>:version`, un entero que se incrementa en cada escritura).
//
// Objetivo: dejar de transferir la colección completa desde Redis cuando no cambió.
//   - Caché en memoria por instancia serverless: antes de usarla se comprueba la "marca" de la
//     clave con dos comandos diminutos (GET de la versión + STRLEN del valor). Solo si la marca
//     cambió se vuelve a leer el valor completo.
//   - ETag: el GET de la API responde 304 sin cuerpo (y sin leer la colección) si el navegador
//     ya tiene la misma versión. El navegador revalida solo (Cache-Control: no-cache).
//   - Escrituras sin lectura previa de la colección cuando la caché está al día, y con control
//     de concurrencia: el SET es condicional (Lua atómico en lib/db.js → casSet). Si otro
//     usuario escribió entre la lectura y la escritura, se relee y se reintenta; nunca se
//     sobrescribe un cambio ajeno.
//
// COMPATIBILIDAD: el formato y el nombre de la clave de negocio no cambian (mismos bytes que
// kv.set). La marca incluye STRLEN además de la versión, así que si algo escribe la clave sin
// incrementar la versión (un despliegue anterior tras un rollback, un script, la consola de
// Upstash), el tamaño cambia y la caché se descarta igual. Borrar `<clave>:version` es seguro:
// equivale a la versión 0 y todo se vuelve a leer una vez.

import crypto from 'node:crypto';
import { kv } from './db.js';
import { HttpError } from './http.js';

const cache = new Map(); // clave → { version, len, data }
const MAX_INTENTOS = 3;

export const versionKey = (key) => `${key}:version`;

/** Marca actual de la clave: { version: '0'|'1'|..., len: bytes }. Dos comandos de pocos bytes. */
export async function marca(key) {
  const [version, len] = await Promise.all([kv.get(versionKey(key)), kv.strlen(key)]);
  return { version: String(version ?? '0'), len: Number(len) || 0 };
}

// En los tests se congela lo que devuelve la caché para detectar cualquier mutación accidental
// (la caché se comparte entre peticiones de la misma instancia).
function congelar(v) {
  if (process.env.CMMS_FREEZE_CACHE !== '1' || !v || typeof v !== 'object' || Object.isFrozen(v)) return v;
  Object.values(v).forEach(congelar);
  return Object.freeze(v);
}

/**
 * Lee la colección usando la caché de la instancia si la marca coincide.
 * Devuelve { data, version, len }. `data` es compartido: NO se debe mutar.
 */
export async function leer(key, vacio, m = null) {
  const actual = m || (await marca(key));
  const c = cache.get(key);
  if (c && c.version === actual.version && c.len === actual.len) return { data: c.data, ...actual };
  const valor = await kv.get(key);
  const data = congelar(valor ?? vacio());
  cache.set(key, { data, ...actual });
  return { data, ...actual };
}

/**
 * Lee → aplica `fn(data)` → guarda condicionalmente. `fn` devuelve:
 *   { nuevo, respuesta } para guardar `nuevo`, o { respuesta } si no hay nada que guardar.
 * `fn` puede ejecutarse más de una vez (reintento por concurrencia) y no debe mutar `data`.
 */
export async function mutar(key, vacio, fn) {
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const base = await leer(key, vacio);
    const r = await fn(base.data);
    if (!r || !Object.prototype.hasOwnProperty.call(r, 'nuevo')) return r?.respuesta;
    const json = JSON.stringify(r.nuevo);
    const guardado = await kv.casSet(key, versionKey(key), base.version, base.len, json);
    if (guardado) {
      cache.set(key, { data: congelar(r.nuevo), version: guardado.version, len: guardado.len });
      return r.respuesta;
    }
    cache.delete(key); // otro proceso escribió entretanto: releer y reintentar
  }
  throw new HttpError(409, 'Otro usuario modificó estos datos al mismo tiempo. Vuelve a intentarlo.');
}

/**
 * ETag de una respuesta GET: depende de la marca de la clave, de lo que el usuario puede ver
 * (`alcance`: usuario, rol, empresa, filtro) y del despliegue (un despliegue nuevo invalida
 * todas las copias del navegador, por si cambió la forma de la respuesta).
 */
export function etag(key, m, alcance) {
  const despliegue = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || '';
  const h = crypto.createHash('sha256').update(JSON.stringify([key, m.version, m.len, alcance, despliegue])).digest('base64url').slice(0, 27);
  return `W/"${h}"`;
}

function normalizarEtag(v) {
  return String(v || '').trim().replace(/^W\//, '');
}

/** true si la petición trae If-None-Match con este ETag (el navegador ya tiene esta versión). */
export function noModificado(req, tag) {
  const enviados = String(req.headers?.['if-none-match'] || '').split(',').map(normalizarEtag);
  return enviados.includes(normalizarEtag(tag));
}

/**
 * Responde un GET con ETag: 304 sin cuerpo si el navegador ya tiene esta versión; si no,
 * `construir(data)` → 200. `private, no-cache`: el navegador guarda la copia y la revalida en
 * cada uso; ningún CDN la comparte entre usuarios.
 */
export async function responderConEtag(req, res, key, vacio, alcance, construir) {
  const m = await marca(key);
  const tag = etag(key, m, alcance);
  res.setHeader('ETag', tag);
  res.setHeader('Cache-Control', 'private, no-cache');
  if (noModificado(req, tag)) return res.status(304).end();
  const { data } = await leer(key, vacio, m);
  return res.status(200).json(construir(data));
}

/** Solo para tests: vacía la caché en memoria (simula una instancia nueva). */
export function resetColeccionCacheForTests() {
  cache.clear();
}
