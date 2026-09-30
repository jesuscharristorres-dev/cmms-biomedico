// tests/payload.test.js
// Contrato de tamaño de las ESCRITURAS (reducción de Vercel Fast Origin Transfer): POST/PATCH/
// DELETE de equipos, reportes de falla y personal devuelven solo lo afectado, nunca la
// colección completa — y sin perder el aislamiento entre empresas.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import login from '../api/login.js';
import admin from '../api/admin.js';
import equipos from '../api/equipos.js';
import reportes from '../api/reportes-falla.js';
import personal from '../api/personal.js';
import { setupStore, call, cookieFrom, ADMIN_USER, ADMIN_PASS } from './helpers.js';

let sa;
let ua;
const bytes = (r) => Buffer.byteLength(JSON.stringify(r.body));

before(async () => {
  setupStore();
  sa = cookieFrom(await call(login, { method: 'POST', body: { user: ADMIN_USER, pass: ADMIN_PASS } }));
  await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: sa, body: { nombre: 'A', email: 'a@a.co', password: 'Clave-Payload-1', role: 'EMPRESA', empresa_id: 'MACROMED' } });
  ua = cookieFrom(await call(login, { method: 'POST', body: { user: 'a@a.co', pass: 'Clave-Payload-1' } }));
});

test('equipos: POST/PATCH/DELETE devuelven solo lo afectado', async () => {
  const total = (await call(equipos, { cookie: sa })).body.equipos.length;
  assert.ok(total > 5);
  const p = await call(equipos, { method: 'POST', cookie: ua, body: { equipo: { id: 'pl1', equipo: 'X', sede: 'Bogotá' } } });
  assert.deepEqual(Object.keys(p.body).sort(), ['creados', 'ok']);
  assert.deepEqual(p.body.creados.map(e => e.id), ['pl1']);
  const again = await call(equipos, { method: 'POST', cookie: ua, body: { equipo: { id: 'pl1', equipo: 'X' } } });
  assert.deepEqual(again.body.creados, [], 'reintento idempotente: nada nuevo');
  const u = await call(equipos, { method: 'PATCH', cookie: ua, body: { id: 'pl1', patch: { marca: 'M' } } });
  assert.deepEqual(Object.keys(u.body), ['equipo']);
  assert.equal(u.body.equipo.marca, 'M');
  assert.equal(u.body.equipo.empresa, 'MACROMED');
  const d = await call(equipos, { method: 'DELETE', cookie: ua, body: { id: 'pl1' } });
  assert.deepEqual(d.body, { ok: true, id: 'pl1' });
  // El PATCH de un solo equipo pesa mucho menos que la colección que antes devolvía.
  const get = await call(equipos, { cookie: sa });
  const up = await call(equipos, { method: 'PATCH', cookie: sa, body: { id: 'eq_0_1', patch: { marca: 'Z' } } });
  assert.ok(bytes(up) * 5 < bytes(get), `${bytes(up)} vs ${bytes(get)}`);
});

test('equipos: la respuesta mínima no abre ninguna vía entre empresas', async () => {
  assert.equal((await call(equipos, { method: 'PATCH', cookie: ua, body: { id: 'eq_1_1', patch: { marca: 'H' } } })).status, 404);
  assert.equal((await call(equipos, { method: 'DELETE', cookie: ua, body: { id: 'eq_1_1' } })).status, 404);
  assert.equal((await call(equipos, { method: 'POST', cookie: ua, body: { equipo: { id: 'eq_1_2' } } })).status, 409);
  assert.equal((await call(equipos, { method: 'POST', cookie: ua, body: { equipo: { id: 'x9', empresa: 'MEIDE' } } })).status, 403);
});

test('reportes de falla y personal: escrituras sin colección', async () => {
  const r = await call(reportes, { method: 'PATCH', cookie: ua, body: { id: 'rf_0', patch: { visto: true } } });
  assert.deepEqual(Object.keys(r.body), ['reporte']);
  assert.equal(r.body.reporte.visto, true);
  const rd = await call(reportes, { method: 'DELETE', cookie: ua, query: { id: 'rf_0' } });
  assert.deepEqual(rd.body, { ok: true, id: 'rf_0' });
  const vac = await call(reportes, { method: 'DELETE', cookie: sa });
  assert.equal(vac.body.ok, true);
  assert.equal(vac.body.reportes, undefined);
  const pc = await call(personal, { method: 'POST', cookie: ua, body: { record: { id: 'pp1', nombreCompleto: 'N' } } });
  assert.deepEqual(Object.keys(pc.body), ['record']);
  const pu = await call(personal, { method: 'PATCH', cookie: ua, body: { id: 'pp1', patch: { cargo: 'C' } } });
  assert.deepEqual(Object.keys(pu.body), ['record']);
  assert.equal(pu.body.record.cargo, 'C');
  assert.equal((await call(personal, { method: 'PATCH', cookie: ua, body: { id: 'per_1', patch: { cargo: 'H' } } })).status, 404);
});
