// lib/db.js
// Punto ÚNICO de acceso al almacenamiento (Vercel KV / Upstash Redis) para todo el backend.
// Todos los endpoints de api/* y los helpers de lib/* importan `kv` desde aquí, nunca desde
// '@vercel/kv' directamente. Así:
//   1) la capa de acceso a datos queda centralizada (una sola puerta para aplicar reglas
//      multiempresa, ver lib/tenancy.js), y
//   2) los tests pueden reemplazar el cliente real por uno en memoria (setKvForTests) sin
//      tocar el código de los endpoints.
//
// Importante: `kv` es un binding "vivo" (export let) — quien lo importe ve siempre la
// implementación vigente, también después de setKvForTests().

import { kv as vercelKv } from '@vercel/kv';

export let kv = vercelKv;

/** Solo para tests: reemplaza el cliente KV por una implementación en memoria. */
export function setKvForTests(impl) {
  kv = impl;
}

/**
 * Implementación mínima en memoria con la misma interfaz que usa este proyecto
 * (get/set/del/sadd/smembers/srem). La usan los tests (tests/*.test.js) y el script
 * de migración en modo --dry-run.
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
