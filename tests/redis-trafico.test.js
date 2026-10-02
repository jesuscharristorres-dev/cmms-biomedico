// tests/redis-trafico.test.js
// El inventario completo vive en UNA clave de Redis ('cmms:equipos', ~2,4 MB en Production):
// cada escritura cuesta ese ancho de banda. Un PATCH que no cambia nada no debe reescribirla.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import equipos from '../api/equipos.js';
import { setupStore, call, cookieFrom, ADMIN_USER, ADMIN_PASS } from './helpers.js';
import { setKvForTests } from '../lib/db.js';

test('PATCH sin cambios reales no reescribe cmms:equipos; con cambios sí, y se conserva todo', async () => {
  const store = setupStore();
  const r = await call(login, { method: 'POST', body: { user: ADMIN_USER, pass: ADMIN_PASS } });
  const cookie = cookieFrom(r);
  const escrituras = [];
  setKvForTests(new Proxy(store, {
    get(t, p) {
      const v = t[p];
      if (typeof v !== 'function') return v;
      return (...a) => { if (p === 'set') escrituras.push(a[0]); return v.apply(t, a); };
    },
  }));
  const antes = await store.get('cmms:equipos');
  const actual = antes.find(e => e.id === 'eq_0_1');

  const igual = await call(equipos, { method: 'PATCH', cookie, body: { id: 'eq_0_1', patch: { ...actual } } });
  assert.equal(igual.status, 200);
  assert.deepEqual(igual.body.equipo, actual);
  assert.equal(escrituras.filter(k => k === 'cmms:equipos').length, 0);

  const cambio = await call(equipos, { method: 'PATCH', cookie, body: { id: 'eq_0_1', patch: { ...actual, marca: 'Philips' } } });
  assert.equal(cambio.status, 200);
  assert.equal(escrituras.filter(k => k === 'cmms:equipos').length, 1);
  const despues = await store.get('cmms:equipos');
  assert.equal(despues.length, antes.length);
  assert.equal(despues.find(e => e.id === 'eq_0_1').marca, 'Philips');
  assert.deepEqual(despues.filter(e => e.id !== 'eq_0_1'), antes.filter(e => e.id !== 'eq_0_1'));
});
