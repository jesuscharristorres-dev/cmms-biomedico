// tests/mantenimiento.test.js
// Modo solo lectura (MODO_MANTENIMIENTO) y modos de lectura por demanda del inventario.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import equipos from '../api/equipos.js';
import reportesFalla from '../api/reportes-falla.js';
import admin from '../api/admin.js';
import planes from '../api/planes-programas.js';
import { setupStore, call, cookieFrom, ADMIN_USER, ADMIN_PASS } from './helpers.js';

async function entrar() {
  return cookieFrom(await call(login, { method: 'POST', body: { user: ADMIN_USER, pass: ADMIN_PASS } }));
}

describe('Modo mantenimiento (solo lectura)', () => {
  let store, cookie;
  beforeEach(async () => {
    store = setupStore();
    cookie = await entrar();
    process.env.MODO_MANTENIMIENTO = '1';
  });
  afterEach(() => { delete process.env.MODO_MANTENIMIENTO; delete process.env.MENSAJE_MANTENIMIENTO; });

  test('bloquea toda escritura con 503 y no toca los datos', async () => {
    const antes = JSON.stringify([...store.store.entries()].filter(([k]) => k.startsWith('cmms:')));
    const r1 = await call(equipos, { method: 'PATCH', cookie, body: { id: 'eq_0_1', patch: { marca: 'X' } } });
    assert.equal(r1.status, 503);
    assert.match(r1.body.error, /mantenimiento/);
    assert.equal((await call(equipos, { method: 'POST', cookie, body: { equipo: { id: 'n', empresa: 'MEIDE' } } })).status, 503);
    assert.equal((await call(equipos, { method: 'DELETE', cookie, body: { id: 'eq_0_1' } })).status, 503);
    assert.equal((await call(planes, { method: 'PATCH', cookie, body: { empresaKey: 'MEIDE', campo: 'x', valor: 'y' } })).status, 503);
    assert.equal((await call(admin, { method: 'POST', cookie, query: { resource: 'empresas' }, body: { nombre: 'Nueva' } })).status, 503);
    const publico = await call(reportesFalla, { method: 'POST', body: { reporte: { id: 'rf_x', empresa: 'MEIDE', sede: 'La Dorada', equipoId: 'eq_1_1', personaReporta: 'A', descripcion: 'B' } } });
    assert.equal(publico.status, 503);
    assert.equal(JSON.stringify([...store.store.entries()].filter(([k]) => k.startsWith('cmms:'))), antes);
  });

  test('las lecturas, el login y el cierre de sesión siguen funcionando', async () => {
    assert.equal((await call(equipos, { cookie })).status, 200);
    assert.equal((await call(reportesFalla, { query: { catalogo: '1' } })).status, 200);
    assert.equal((await call(admin, { cookie, query: { resource: 'empresas' } })).status, 200);
    assert.ok(await entrar());
    assert.equal((await call(login, { method: 'POST', cookie, query: { action: 'logout' } })).status, 200);
  });

  test('GET /api/login informa el modo y su mensaje (solo mientras está activo)', async () => {
    process.env.MENSAJE_MANTENIMIENTO = 'Migración en curso hasta las 8 p. m.';
    const r = await call(login, { cookie });
    assert.deepEqual(r.body.mantenimiento, { activo: true, mensaje: 'Migración en curso hasta las 8 p. m.' });
    delete process.env.MODO_MANTENIMIENTO;
    assert.equal((await call(login, { cookie })).body.mantenimiento, undefined);
    assert.equal((await call(equipos, { method: 'PATCH', cookie, body: { id: 'eq_0_1', patch: { marca: 'X' } } })).status, 200);
  });
});

describe('Inventario por demanda (para la migración del frontend)', () => {
  let cookie;
  beforeEach(async () => { setupStore(); cookie = await entrar(); });

  test('vista=resumen: solo columnas del listado, paginado y con total', async () => {
    const r = await call(equipos, { cookie, query: { vista: 'resumen', desde: '1', cantidad: '4' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.equipos.length, 4);
    assert.ok(r.body.total >= 10);
    assert.deepEqual(Object.keys(r.body.equipos[0]).sort(), ['empresa', 'equipo', 'estado', 'id', 'inventario', 'marca', 'modelo', 'numeroSerie', 'sede']);
    assert.ok(r.headers.etag);
  });

  test('?id: la hoja de vida completa de un equipo; 404 si es de otra empresa o no existe', async () => {
    const r = await call(equipos, { cookie, query: { id: 'eq_1_1' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.equipo.id, 'eq_1_1');
    assert.ok(Array.isArray(r.body.equipo.preventivos));
    assert.equal((await call(equipos, { cookie, query: { id: 'no-existe' } })).status, 404);
  });
});

describe('Latido diario (api/salud)', () => {
  test('responde ok; con CRON_SECRET exige el encabezado de Vercel Cron', async () => {
    const salud = (await import('../api/salud.js')).default;
    setupStore();
    assert.deepEqual((await call(salud, {})).body, { ok: true, backend: 'redis', mantenimiento: false });
    process.env.CRON_SECRET = 'secreto-cron';
    try {
      assert.equal((await call(salud, {})).status, 401);
      assert.equal((await call(salud, { headers: { authorization: 'Bearer secreto-cron' } })).status, 200);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});
