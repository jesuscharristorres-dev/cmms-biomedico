// tests/limpieza-plantillas.test.js
// Pruebas del endpoint de la plantilla del formato de limpieza y desinfección
// (api/limpieza-plantillas.js): un enlace externo por empresa. Antes de este cambio el
// endpoint guardaba el archivo real como Data URI base64 — estas pruebas también verifican
// que un registro con esa forma antigua sigue intacto hasta que se guarda una URL nueva.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import admin from '../api/admin.js';
import plantillas from '../api/limpieza-plantillas.js';
import { setupStore, call, cookieFrom, datosHeredados } from './helpers.js';

async function loginAs(user, pass) {
  const r = await call(login, { method: 'POST', body: { user, pass } });
  return cookieFrom(r);
}

describe('Plantilla de limpieza y desinfección (api/limpieza-plantillas.js)', () => {
  let superCookie;

  before(async () => {
    setupStore();
    superCookie = await loginAs('jesus.charris', 'ClaveSuperAdmin-2026');
  });

  test('guarda y reemplaza el enlace de una empresa', async () => {
    const r = await call(plantillas, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MEIDE', url: 'https://drive.example/formato-v1' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.MEIDE, 'https://drive.example/formato-v1');

    const r2 = await call(plantillas, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MEIDE', url: 'https://drive.example/formato-v2' } });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.data.MEIDE, 'https://drive.example/formato-v2', 'reemplaza, no duplica');
  });

  test('rechaza un enlace sin esquema http(s)', async () => {
    const r = await call(plantillas, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'DIAGNOSTIK', url: 'sin-esquema.example' } });
    assert.equal(r.status, 400);
  });

  test('un registro con la forma antigua (archivo subido) se conserva tal cual hasta que se guarda una URL nueva', async () => {
    const legacy = {
      'cmms:limpiezaPlantillas': {
        MACROMED: { nombre: 'formato-viejo.pdf', tipo: 'application/pdf', tamano: 1234, archivoDatos: 'data:application/pdf;base64,AAAA', updatedAt: '2026-01-01T00:00:00.000Z' },
      },
    };
    setupStore({ ...datosHeredados(), ...legacy });
    const cookie = await loginAs('jesus.charris', 'ClaveSuperAdmin-2026');

    const antes = await call(plantillas, { cookie });
    assert.deepEqual(antes.body.data.MACROMED, legacy['cmms:limpiezaPlantillas'].MACROMED, 'el registro viejo no se toca solo por leerlo');

    const r = await call(plantillas, { method: 'PATCH', cookie, body: { empresaKey: 'MACROMED', url: 'https://drive.example/formato-nuevo' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.MACROMED, 'https://drive.example/formato-nuevo', 'guardar una URL nueva reemplaza el registro viejo por el nuevo formato');
  });

  test('aislamiento: un usuario de empresa no puede guardar en otra empresa', async () => {
    setupStore();
    const sa = await loginAs('jesus.charris', 'ClaveSuperAdmin-2026');
    await call(admin, {
      method: 'POST', query: { resource: 'usuarios' }, cookie: sa,
      body: { nombre: 'Usuario MEIDE', email: 'meide@plantillas.test', password: 'ClaveEmpresa-123', role: 'EMPRESA', empresa_id: 'MEIDE', estado: 'activo' },
    });
    const cookie = await loginAs('meide@plantillas.test', 'ClaveEmpresa-123');
    assert.ok(cookie);

    const propio = await call(plantillas, { method: 'PATCH', cookie, body: { empresaKey: 'MEIDE', url: 'https://drive.example/propio' } });
    assert.equal(propio.status, 200);

    const ajeno = await call(plantillas, { method: 'PATCH', cookie, body: { empresaKey: 'DIAGNOSTIK', url: 'https://drive.example/ajeno' } });
    assert.equal(ajeno.status, 403);
  });

  test('sin sesión → 401', async () => {
    const r = await call(plantillas, {});
    assert.equal(r.status, 401);
  });
});
