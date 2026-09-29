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
// Importante: `kv` es un binding "vivo" (export let) — quien lo importe ve siempre la
// implementación vigente, también después de setKvForTests().

import { kv as vercelKv } from '@vercel/kv';

const PRODUCTION = 'production';
const NAMESPACE_RE = /^[a-z0-9_-]{1,32}$/;

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

/** Envuelve un cliente KV para que todas las claves vayan al namespace del entorno actual. */
export function namespaced(raw) {
  const k = (key) => `${keyPrefix()}${key}`;
  return {
    get: (key) => raw.get(k(key)),
    set: (key, value, opts) => (opts ? raw.set(k(key), value, opts) : raw.set(k(key), value)),
    del: (...keys) => raw.del(...keys.map(k)),
    sadd: (key, ...members) => raw.sadd(k(key), ...members),
    smembers: (key) => raw.smembers(k(key)),
    srem: (key, ...members) => raw.srem(k(key), ...members),
  };
}

export let rawKv = vercelKv;
export let kv = namespaced(rawKv);

/** Solo para tests: reemplaza el cliente KV por una implementación en memoria. */
export function setKvForTests(impl) {
  rawKv = impl;
  kv = namespaced(impl);
}

/**
 * Implementación mínima en memoria con la misma interfaz que usa este proyecto
 * (get/set/del/sadd/smembers/srem). La usan los tests (tests/*.test.js).
 */
export function createMemoryKv(initial = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  return {
    store,
    async get(key) { return store.has(key) ? structuredClone(store.get(key)) : null; },
    async set(key, value) { store.set(key, structuredClone(value)); return 'OK'; },
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
  };
}
