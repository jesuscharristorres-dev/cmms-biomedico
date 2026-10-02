// tests/login-errores.test.js
// Inicio de sesión cuando la base de datos (Vercel KV / Upstash) rechaza comandos por haber
// alcanzado el límite de su plan — el error real visto en Production:
//   "UpstashError: ERR This database has reached current Fixed plan limits. ..."
// El login debe responder 503 con un mensaje claro (no un 500 genérico), sin exponer
// detalles internos, y seguir funcionando con normalidad cuando la base de datos responde.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import equipos from '../api/equipos.js';
import { setupStore, call, cookieFrom, ADMIN_USER, ADMIN_PASS } from './helpers.js';
import { setKvForTests } from '../lib/db.js';
import { ensureSchema, resetEnsureSchemaForTests } from '../lib/migrations.js';
import { esLimiteBaseDatos } from '../lib/http.js';

const ERROR_UPSTASH = 'ERR This database has reached current Fixed plan limits. Please upgrade manually or enable auto upgrade on Upstash Console, command was: [["set","x"]]';
const ESCRITURAS = new Set(['set', 'del', 'sadd', 'srem']);

// Envuelve el KV en memoria para simular a Upstash rechazando comandos.
function kvLimitado(store, { soloEscrituras }) {
  const llamadas = [];
  const proxy = new Proxy(store, {
    get(target, prop) {
      const v = target[prop];
      if (typeof v !== 'function') return v;
      return (...args) => {
        llamadas.push([prop, args[0]]);
        if (!soloEscrituras || ESCRITURAS.has(prop)) {
          const err = new Error(ERROR_UPSTASH);
          err.name = 'UpstashError';
          return Promise.reject(err);
        }
        return v.apply(target, args);
      };
    },
  });
  return { proxy, llamadas };
}

describe('Login frente a errores de la base de datos', () => {
  let store;

  beforeEach(async () => {
    store = setupStore();
    // Primer login: aplica las migraciones (crea el SUPER_ADMIN desde AUTH_USER/AUTH_PASSWORD_HASH).
    const r = await call(login, { method: 'POST', body: { user: ADMIN_USER, pass: ADMIN_PASS } });
    assert.equal(r.status, 200);
    resetEnsureSchemaForTests(); // simula una instancia serverless nueva
  });

  test('flujo normal: credenciales válidas → sesión → GET /api/login autenticado', async () => {
    const r = await call(login, { method: 'POST', body: { user: ADMIN_USER, pass: ADMIN_PASS } });
    assert.equal(r.status, 200);
    const cookie = cookieFrom(r);
    assert.ok(cookie.startsWith('cmms_session='));
    const s = await call(login, { method: 'GET', cookie });
    assert.equal(s.body.authenticated, true);
    assert.equal(s.body.user.role, 'SUPER_ADMIN');
    assert.equal(s.body.user.password_hash, undefined);
  });

  test('contraseña incorrecta → 401 con mensaje genérico', async () => {
    const r = await call(login, { method: 'POST', body: { user: ADMIN_USER, pass: 'otra-clave' } });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'Usuario o contraseña incorrectos');
  });

  test('Upstash rechaza escrituras por límite del plan → 503 con mensaje claro, nunca 500', async () => {
    const { proxy } = kvLimitado(store, { soloEscrituras: true });
    setKvForTests(proxy);
    const r = await call(login, { method: 'POST', body: { user: ADMIN_USER, pass: ADMIN_PASS } });
    assert.equal(r.status, 503);
    assert.match(r.body.error, /límite de su plan/);
    // Sin detalles internos: ni el texto de Upstash, ni comandos, ni claves de KV.
    assert.doesNotMatch(JSON.stringify(r.body), /Upstash Console|command was|cmms:/);
  });

  test('Upstash rechaza todos los comandos → 503 también en el login y en las APIs', async () => {
    const { proxy } = kvLimitado(store, { soloEscrituras: false });
    setKvForTests(proxy);
    const r = await call(login, { method: 'POST', body: { user: ADMIN_USER, pass: ADMIN_PASS } });
    assert.equal(r.status, 503);
    const e = await call(equipos, { method: 'GET', cookie: 'cmms_session=x' });
    assert.equal(e.status, 503);
    assert.match(e.body.error, /límite de su plan/);
  });

  test('con todas las migraciones aplicadas, revisar el esquema no escribe en la base de datos', async () => {
    const { proxy, llamadas } = kvLimitado(store, { soloEscrituras: true });
    setKvForTests(proxy);
    await ensureSchema(); // no lanza: solo lee la lista de migraciones aplicadas
    assert.deepEqual(llamadas.filter(([m]) => ESCRITURAS.has(m)), []);
  });

  test('esLimiteBaseDatos reconoce los mensajes de límite de Upstash y nada más', () => {
    assert.equal(esLimiteBaseDatos(new Error(ERROR_UPSTASH)), true);
    assert.equal(esLimiteBaseDatos(new Error('ERR max requests limit exceeded. Limit: 10000, Usage: 10000')), true);
    assert.equal(esLimiteBaseDatos(new Error('ECONNRESET')), false);
    assert.equal(esLimiteBaseDatos(new Error('Usuario o contraseña incorrectos')), false);
  });
});
