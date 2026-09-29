// tests/isolation-suite.test.js
// Ejecuta la MISMA suite que se lanza contra el Preview real (scripts/isolation-suite.js),
// pero contra los handlers de api/*.js en proceso, en el namespace "preview" y compartiendo el
// KV con datos de "production" — así `npm test` garantiza que la suite pasa antes de usarla
// contra un deployment, y que Preview no toca Production.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/isolation-suite.js';
import { setupStore, call, cookieFrom, ADMIN_USER, ADMIN_PASS } from './helpers.js';
import { resetEnsureSchemaForTests } from '../lib/migrations.js';

const HANDLERS = {};
async function handlerDe(ruta) {
  const nombre = ruta.slice('/api/'.length);
  if (!HANDLERS[nombre]) HANDLERS[nombre] = (await import(`../api/${nombre}.js`)).default;
  return HANDLERS[nombre];
}

test('suite de aislamiento (la misma que se ejecuta en Preview): 100 % correcta', async () => {
  const store = setupStore(); // datos "de production" (claves sin prefijo)
  const produccionAntes = JSON.stringify([...store.store.entries()]);
  process.env.KV_NAMESPACE = 'preview';
  resetEnsureSchemaForTests();

  const jars = {};
  const http = async (method, path, { body, as = 'anon' } = {}) => {
    const url = new URL(path, 'http://x');
    const r = await call(await handlerDe(url.pathname), {
      method, body, query: Object.fromEntries(url.searchParams), cookie: as !== 'anon' ? jars[as] : '',
    });
    const c = cookieFrom(r);
    if (c && as !== 'anon') jars[as] = c.endsWith('=') ? '' : c;
    return { status: r.status, body: r.body || {} };
  };
  const login = (as, user, pass, extra = {}) => { jars[as] = ''; return http('POST', '/api/login', { as, body: { user, pass, ...extra } }); };
  const logout = async (as) => { if (jars[as]) await http('POST', '/api/login?action=logout', { as }); jars[as] = ''; };

  const { runSuite } = globalThis.cmmsIsolationSuite;
  // Estado previo como el del Preview real: SUPER_ADMIN y 5 empresas ya creados.
  assert.equal((await login('sa', ADMIN_USER, ADMIN_PASS)).status, 200);
  const out = await runSuite({ http, login, logout, adminUser: ADMIN_USER, adminPass: ADMIN_PASS, log: () => {} });
  const fallos = out.resultados.filter(r => !r.ok).map(r => `[${r.grupo}] ${r.nombre} ${r.detalle}`);
  assert.deepEqual(fallos, []);
  assert.ok(out.resultados.length >= 100);

  // Segunda corrida: idempotente.
  const out2 = await runSuite({ http, login, logout, adminUser: ADMIN_USER, adminPass: ADMIN_PASS, log: () => {} });
  assert.ok(out2.ok);

  // Production intacto: ninguna clave sin prefijo cambió.
  const produccionDespues = JSON.stringify([...store.store.entries()].filter(([k]) => !k.startsWith('preview:')));
  assert.equal(produccionDespues, produccionAntes);
  process.env.KV_NAMESPACE = 'production';
});

test('la suite se niega a correr contra production', async () => {
  setupStore();
  const http = async () => ({ status: 200, body: { authenticated: false, entorno: 'production' } });
  const { runSuite } = globalThis.cmmsIsolationSuite;
  await assert.rejects(() => runSuite({ http, login: async () => { throw new Error('no debe llegar'); }, logout: async () => {}, adminUser: 'x', adminPass: 'y', log: () => {} }), /PRODUCTION/);
});
