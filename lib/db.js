// lib/db.js
// Punto ÚNICO de acceso al almacenamiento (Vercel KV / Upstash Redis) para todo el backend.
// Todos los endpoints de api/* y los helpers de lib/* importan `kv` desde aquí, nunca desde
// '@vercel/kv' directamente. Así:
//   1) la capa de acceso a datos queda centralizada (una sola puerta para aplicar reglas
//      multiempresa, ver lib/tenancy.js);
//   2) cada ENTORNO de Vercel trabaja en su propio espacio de claves (ver "Namespaces"); y
//   3) los tests pueden reemplazar el cliente real por uno en memoria (setKvForTests).
//
// NAMESPACES — separación Preview / Production
// ---------------------------------------------
// Auditado en Vercel (2026-09-29): KV_URL, KV_REST_API_URL, KV_REST_API_TOKEN,
// KV_REST_API_READ_ONLY_TOKEN y REDIS_URL del proyecto apuntan al MISMO store para
// Production y Preview. Sin esta capa, cualquier login o cambio hecho en una URL de Preview
// escribía directamente sobre los datos reales de Production.
//
// Cada clave se prefija según el entorno:
//   production  → sin prefijo       (las claves históricas `cmms:*` de siempre: 100 % compatible)
//   preview     → `preview:cmms:*`
//   development → `development:cmms:*`   (vercel dev)
//   sin VERCEL_ENV (scripts/tests locales) → `local:cmms:*`
// KV_NAMESPACE (opcional) fuerza el namespace: "production" = sin prefijo; cualquier otro
// valor [a-z0-9_-] = ese prefijo. Aunque Preview y Production compartan base de datos, sus
// datos, usuarios, sesiones y contadores de login quedan completamente separados.
//
// FALLA CERRADO: con el cliente REAL de KV, si no hay ni KV_NAMESPACE ni VERCEL_ENV (p. ej. si
// alguien desactiva "Automatically expose System Environment Variables" en Vercel), toda
// operación lanza un error en vez de caer en silencio a un namespace equivocado — Production
// y Preview nunca pueden terminar compartiendo el mismo espacio de claves por accidente.
//
// Importante: `kv` es un binding "vivo" (export let) — quien lo importe ve siempre la
// implementación vigente, también después de setKvForTests().

import { kv as vercelKv } from '@vercel/kv';

const PRODUCTION = 'production';
const NAMESPACE_RE = /^[a-z0-9_-]{1,32}$/;

/** true si el entorno se puede determinar explícitamente (KV_NAMESPACE o VERCEL_ENV conocido). */
export function namespaceExplicito(env = process.env) {
  if ((env.KV_NAMESPACE || '').trim()) return true;
  return ['production', 'preview', 'development'].includes((env.VERCEL_ENV || '').trim().toLowerCase());
}

/** Nombre del namespace activo ("production", "preview", "development", "local" u otro). */
export function currentNamespace(env = process.env) {
  const explicito = (env.KV_NAMESPACE || '').trim().toLowerCase();
  if (explicito) {
    if (!NAMESPACE_RE.test(explicito)) throw new Error('KV_NAMESPACE no es válido (usa solo a-z, 0-9, "_" o "-").');
    return explicito;
  }
  const vercelEnv = (env.VERCEL_ENV || '').trim().toLowerCase();
  if (vercelEnv === 'production' || vercelEnv === 'preview' || vercelEnv === 'development') return vercelEnv;
  return 'local';
}

export function keyPrefix(env = process.env) {
  const ns = currentNamespace(env);
  return ns === PRODUCTION ? '' : `${ns}:`;
}

/**
 * Envuelve un cliente KV para que todas las claves vayan al namespace del entorno actual.
 * `strict` (cliente real): exige que el entorno esté determinado explícitamente.
 */
export function namespaced(raw, { strict = false } = {}) {
  const k = (key) => {
    if (strict && !namespaceExplicito()) {
      throw new Error('[lib/db] No se pudo determinar el entorno (falta VERCEL_ENV y KV_NAMESPACE): se bloquea el acceso a KV para no mezclar datos de Preview y Production.');
    }
    return `${keyPrefix()}${key}`;
  };
  return {
    get: async (key) => raw.get(k(key)),
    set: async (key, value, opts) => (opts ? raw.set(k(key), value, opts) : raw.set(k(key), value)),
    del: async (...keys) => raw.del(...keys.map(k)),
    sadd: async (key, ...members) => raw.sadd(k(key), ...members),
    smembers: async (key) => raw.smembers(k(key)),
    srem: async (key, ...members) => raw.srem(k(key), ...members),
    strlen: async (key) => raw.strlen(k(key)),
    expire: async (key, seconds) => raw.expire(k(key), seconds),
    exists: async (key) => raw.exists(k(key)),
    // Escritura condicional de una colección versionada (ver lib/coleccion.js): guarda `json`
    // en `key` e incrementa `versionKey` SOLO si la versión y el tamaño actuales siguen siendo
    // los esperados. Devuelve { version, len } o null si otro proceso escribió entretanto.
    casSet: async (key, versionKey, version, len, json) => {
      const r = typeof raw.casSet === 'function'
        ? await raw.casSet(k(key), k(versionKey), String(version), Number(len), json)
        : await raw.eval(LUA_CAS_SET, [k(key), k(versionKey)], [String(version), String(len), json]);
      if (!Array.isArray(r) || Number(r[0]) < 0) return null;
      return { version: String(r[0]), len: Number(r[1]) };
    },
  };
}

// Compara versión (GET de la clave pequeña, "0" si no existe) y tamaño (STRLEN) y, si no
// cambiaron, hace SET + INCR atómicamente. El valor se guarda con exactamente los mismos bytes
// que kv.set(key, objeto) (JSON.stringify), así que el formato de la clave no cambia.
const LUA_CAS_SET = `
local v = redis.call('GET', KEYS[2])
if not v then v = '0' end
if v ~= ARGV[1] then return {-1, 0} end
if redis.call('STRLEN', KEYS[1]) ~= tonumber(ARGV[2]) then return {-1, 0} end
redis.call('SET', KEYS[1], ARGV[3])
local nv = redis.call('INCR', KEYS[2])
return {nv, string.len(ARGV[3])}
`;

export let rawKv = vercelKv;
export let kv = namespaced(rawKv, { strict: true });

/** Solo para tests: reemplaza el cliente KV por una implementación en memoria. */
export function setKvForTests(impl, { strict = false } = {}) {
  rawKv = impl;
  kv = namespaced(impl, { strict });
}

/**
 * Implementación mínima en memoria con la misma interfaz que usa este proyecto
 * (get/set/del/sadd/smembers/srem/strlen/expire/exists/casSet). La usan los tests (tests/*.test.js).
 */
export function createMemoryKv(initial = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  const ttls = new Map(); // solo registro de EXPIRE para los tests (no expira nada)
  return {
    store,
    async get(key) { return store.has(key) ? structuredClone(store.get(key)) : null; },
    async set(key, value, opts) {
      if (opts?.nx && store.has(key)) return null; // SET NX, igual que Redis
      store.set(key, structuredClone(value));
      return 'OK';
    },
    async del(...keys) { let n = 0; keys.forEach(k => { if (store.delete(k)) n++; }); return n; },
    async sadd(key, ...members) {
      const s = new Set(store.get(key) || []);
      members.forEach(m => s.add(m));
      store.set(key, [...s]);
      return members.length;
    },
    async smembers(key) { return [...(store.get(key) || [])]; },
    async srem(key, ...members) {
      const s = new Set(store.get(key) || []);
      members.forEach(m => s.delete(m));
      store.set(key, [...s]);
      return members.length;
    },
    // Tamaño en bytes del valor tal como lo guardaría @vercel/kv (JSON.stringify).
    async strlen(key) { return store.has(key) ? Buffer.byteLength(JSON.stringify(store.get(key))) : 0; },
    async expire(key, seconds) { if (!store.has(key)) return 0; ttls.set(key, seconds); return 1; },
    async exists(key) { return store.has(key) ? 1 : 0; },
    async incr(key) { const n = Number(store.get(key) || 0) + 1; store.set(key, n); return n; },
    ttls,
    async casSet(key, versionKey, version, len, json) {
      const actual = String(store.get(versionKey) ?? '0');
      if (actual !== version || (await this.strlen(key)) !== len) return [-1, 0];
      store.set(key, JSON.parse(json));
      return [await this.incr(versionKey), Buffer.byteLength(json)];
    },
  };
}
