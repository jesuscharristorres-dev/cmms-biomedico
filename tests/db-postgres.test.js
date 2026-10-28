// tests/db-postgres.test.js
// Pruebas de lib/db-postgres.js: la implementación de la interfaz `kv`
// (get/set/del/sadd/smembers/srem) sobre PostgreSQL, pensada para el despliegue fuera de
// Vercel (ver el plan de migración). Usa un `pool` simulado en memoria en vez de una conexión
// real — las consultas SQL exactas (el SET NX con expiración, en particular) ya se validaron a
// mano contra un proyecto Postgres real (Supabase) antes de escribir este archivo; lo que este
// archivo prueba es que `createPostgresKv` arma esas consultas y lee sus resultados bien.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createPostgresKv } from '../lib/db-postgres.js';

/**
 * Pool falso que entiende exactamente las 6 formas de consulta que usa createPostgresKv,
 * con la misma semántica que se validó contra Postgres real: SET NX solo entra si la clave no
 * existe o ya venció; get() ignora claves vencidas; sadd solo cuenta los miembros nuevos.
 */
function fakePool({ now = () => Date.now(), onCreateTables } = {}) {
  const store = new Map(); // key -> { value, expiresAt: number|null }
  const sets = new Map(); // key -> Set<string>

  async function query(text, params) {
    const t = now();

    if (text.includes('CREATE TABLE')) {
      onCreateTables?.();
      return { rows: [], rowCount: 0 };
    }

    if (text.includes('SELECT value FROM kv_store')) {
      const [key] = params;
      const row = store.get(key);
      if (!row || (row.expiresAt != null && row.expiresAt <= t)) return { rows: [], rowCount: 0 };
      return { rows: [{ value: row.value }], rowCount: 1 };
    }

    if (text.includes('INSERT INTO kv_store') && text.includes('RETURNING key')) {
      const [key, valueJson, exSecs] = params;
      const existing = store.get(key);
      const vigente = existing && (existing.expiresAt == null || existing.expiresAt > t);
      if (vigente) return { rows: [], rowCount: 0 };
      store.set(key, { value: JSON.parse(valueJson), expiresAt: exSecs != null ? t + exSecs * 1000 : null });
      return { rows: [{ key }], rowCount: 1 };
    }

    if (text.includes('INSERT INTO kv_store')) {
      const [key, valueJson, exSecs] = params;
      store.set(key, { value: JSON.parse(valueJson), expiresAt: exSecs != null ? t + exSecs * 1000 : null });
      return { rows: [], rowCount: 1 };
    }

    if (text.includes('DELETE FROM kv_store')) {
      const [keys] = params;
      let n = 0;
      keys.forEach(k => { if (store.delete(k)) n++; });
      return { rows: [], rowCount: n };
    }

    if (text.includes('INSERT INTO kv_sets')) {
      const [key, members] = params;
      const s = sets.get(key) || new Set();
      const added = [];
      members.forEach(m => { if (!s.has(m)) { s.add(m); added.push(m); } });
      sets.set(key, s);
      return { rows: added.map(m => ({ member: m })), rowCount: added.length };
    }

    if (text.includes('SELECT member FROM kv_sets')) {
      const [key] = params;
      const s = sets.get(key) || new Set();
      return { rows: [...s].map(m => ({ member: m })), rowCount: s.size };
    }

    if (text.includes('DELETE FROM kv_sets')) {
      const [key, members] = params;
      const s = sets.get(key) || new Set();
      let n = 0;
      members.forEach(m => { if (s.delete(m)) n++; });
      return { rows: [], rowCount: n };
    }

    throw new Error(`fakePool: consulta no reconocida: ${text}`);
  }

  return { query, store, sets };
}

describe('createPostgresKv — crea las tablas sola en el primer uso', () => {
  test('no crea las tablas al construir el objeto, solo en la primera operación real', async () => {
    let llamadas = 0;
    const kv = createPostgresKv(fakePool({ onCreateTables: () => { llamadas++; } }));
    assert.equal(llamadas, 0, 'construir createPostgresKv(pool) no debe tocar la base');
    await kv.get('algo');
    assert.equal(llamadas, 1);
  });

  test('solo ejecuta el CREATE TABLE una vez, aunque se llame get/set/sadd varias veces', async () => {
    let llamadas = 0;
    const kv = createPostgresKv(fakePool({ onCreateTables: () => { llamadas++; } }));
    await kv.set('a', 1);
    await kv.get('a');
    await kv.sadd('s', 'm1');
    await kv.del('a');
    assert.equal(llamadas, 1, 'memoizado: un despliegue nuevo no repite el CREATE TABLE en cada operación');
  });
});

describe('createPostgresKv — get/set', () => {
  test('set + get hacen roundtrip con JSON anidado', async () => {
    const kv = createPostgresKv(fakePool());
    await kv.set('cmms:equipos', [{ id: 'eq_1', preventivos: [{ id: 'p1' }] }]);
    assert.deepEqual(await kv.get('cmms:equipos'), [{ id: 'eq_1', preventivos: [{ id: 'p1' }] }]);
  });

  test('get de una clave que no existe devuelve null', async () => {
    const kv = createPostgresKv(fakePool());
    assert.equal(await kv.get('no-existe'), null);
  });

  test('set reemplaza (upsert), no duplica', async () => {
    const kv = createPostgresKv(fakePool());
    await kv.set('k', { a: 1 });
    await kv.set('k', { a: 2 });
    assert.deepEqual(await kv.get('k'), { a: 2 });
  });

  test('set con { ex } expira: get dejar de devolver valor después del TTL', async () => {
    let t = 1_000_000;
    const pool = fakePool({ now: () => t });
    const kv = createPostgresKv(pool);
    await kv.set('sesion:tok', { userId: 'u1' }, { ex: 10 });
    assert.deepEqual(await kv.get('sesion:tok'), { userId: 'u1' });
    t += 10_001; // pasó el TTL de 10s
    assert.equal(await kv.get('sesion:tok'), null);
  });
});

describe('createPostgresKv — set con { nx } (candado de migraciones)', () => {
  test('nx en una clave nueva: toma el candado y guarda el valor', async () => {
    const kv = createPostgresKv(fakePool());
    const r = await kv.set('lock', 1, { nx: true, ex: 30 });
    assert.equal(r, 'OK');
    assert.equal(await kv.get('lock'), 1);
  });

  test('nx en una clave vigente: no toma el candado ni toca el valor', async () => {
    const kv = createPostgresKv(fakePool());
    await kv.set('lock', 1, { nx: true, ex: 30 });
    const r = await kv.set('lock', 2, { nx: true, ex: 30 });
    assert.equal(r, null);
    assert.equal(await kv.get('lock'), 1, 'el valor no cambia cuando nx falla');
  });

  test('nx en una clave ya vencida: vuelve a tomar el candado', async () => {
    let t = 0;
    const pool = fakePool({ now: () => t });
    const kv = createPostgresKv(pool);
    await kv.set('lock', 1, { nx: true, ex: 30 });
    t += 30_001; // venció
    const r = await kv.set('lock', 2, { nx: true, ex: 30 });
    assert.equal(r, 'OK');
    assert.equal(await kv.get('lock'), 2);
  });
});

describe('createPostgresKv — del', () => {
  test('borra varias claves de una vez y cuenta cuántas existían', async () => {
    const kv = createPostgresKv(fakePool());
    await kv.set('a', 1);
    await kv.set('b', 2);
    const n = await kv.del('a', 'b', 'no-existe');
    assert.equal(n, 2);
    assert.equal(await kv.get('a'), null);
  });

  test('del sin claves no hace ninguna consulta y devuelve 0', async () => {
    const kv = createPostgresKv(fakePool());
    assert.equal(await kv.del(), 0);
  });
});

describe('createPostgresKv — sadd/smembers/srem (sesiones por usuario)', () => {
  test('sadd solo cuenta los miembros nuevos (sin duplicar)', async () => {
    const kv = createPostgresKv(fakePool());
    assert.equal(await kv.sadd('sess:u1', 'tok-a', 'tok-b'), 2);
    assert.equal(await kv.sadd('sess:u1', 'tok-a', 'tok-c'), 1, 'tok-a ya estaba');
    assert.deepEqual(new Set(await kv.smembers('sess:u1')), new Set(['tok-a', 'tok-b', 'tok-c']));
  });

  test('srem quita solo los miembros indicados', async () => {
    const kv = createPostgresKv(fakePool());
    await kv.sadd('sess:u1', 'tok-a', 'tok-b');
    const n = await kv.srem('sess:u1', 'tok-a', 'no-existe');
    assert.equal(n, 1);
    assert.deepEqual(await kv.smembers('sess:u1'), ['tok-b']);
  });

  test('smembers de una clave vacía devuelve []', async () => {
    const kv = createPostgresKv(fakePool());
    assert.deepEqual(await kv.smembers('vacia'), []);
  });
});
