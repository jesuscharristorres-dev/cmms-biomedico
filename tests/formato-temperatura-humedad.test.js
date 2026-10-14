// tests/formato-temperatura-humedad.test.js
// Pruebas del endpoint del formato de temperatura y humedad
// (api/formato-temperatura-humedad.js): un enlace externo por empresa, sin exclusiones (mismo
// mecanismo que api/checklist-dotacion.js, sin la regla de MACROMED). El aislamiento cruzado
// genérico ya se cubre en tests/multitenant.test.js.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import admin from '../api/admin.js';
import formatoTempHumedad from '../api/formato-temperatura-humedad.js';
import { setupStore, call, cookieFrom } from './helpers.js';

async function loginAs(user, pass) {
  const r = await call(login, { method: 'POST', body: { user, pass } });
  return cookieFrom(r);
}

describe('Formato de temperatura y humedad (api/formato-temperatura-humedad.js)', () => {
  let superCookie;

  before(async () => {
    setupStore();
    superCookie = await loginAs('jesus.charris', 'ClaveSuperAdmin-2026');
  });

  test('GET sin datos devuelve un objeto vacío', async () => {
    const r = await call(formatoTempHumedad, { cookie: superCookie });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data, {});
  });

  test('guarda y reemplaza el enlace de una empresa, incluida MACROMED (sin exclusiones)', async () => {
    const r = await call(formatoTempHumedad, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MACROMED', url: 'https://drive.example/macromed-v1' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.MACROMED, 'https://drive.example/macromed-v1');

    const r2 = await call(formatoTempHumedad, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MACROMED', url: 'https://drive.example/macromed-v2' } });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.data.MACROMED, 'https://drive.example/macromed-v2', 'reemplaza, no duplica');
  });

  test('rechaza un enlace sin esquema http(s)', async () => {
    const r = await call(formatoTempHumedad, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'DIAGNOSTIK', url: 'drive.example/sin-esquema' } });
    assert.equal(r.status, 400);
    const r2 = await call(formatoTempHumedad, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'DIAGNOSTIK', url: 'javascript:alert(1)' } });
    assert.equal(r2.status, 400);
  });

  test('guardar con url vacío limpia el enlace sin eliminar la clave de la empresa', async () => {
    await call(formatoTempHumedad, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'NP MEDICAL', url: 'https://drive.example/np' } });
    const r = await call(formatoTempHumedad, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'NP MEDICAL', url: '' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data['NP MEDICAL'], '');
  });

  test('aislamiento: un usuario de empresa no puede guardar en otra empresa', async () => {
    const creado = await call(admin, {
      method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie,
      body: { nombre: 'Usuario DIAGNOSTIK', email: 'diagnostik@temp-humedad.test', password: 'ClaveEmpresa-123', role: 'EMPRESA', empresa_id: 'DIAGNOSTIK', estado: 'activo' },
    });
    assert.equal(creado.status, 201);
    const cookie = await loginAs('diagnostik@temp-humedad.test', 'ClaveEmpresa-123');
    assert.ok(cookie);

    const propio = await call(formatoTempHumedad, { method: 'PATCH', cookie, body: { empresaKey: 'DIAGNOSTIK', url: 'https://drive.example/propio' } });
    assert.equal(propio.status, 200);

    const ajeno = await call(formatoTempHumedad, { method: 'PATCH', cookie, body: { empresaKey: 'AUNAR SALUD', url: 'https://drive.example/ajeno' } });
    assert.equal(ajeno.status, 403);

    const get = await call(formatoTempHumedad, { cookie });
    assert.deepEqual(Object.keys(get.body.data), ['DIAGNOSTIK']);
  });

  test('sin sesión → 401', async () => {
    const r = await call(formatoTempHumedad, {});
    assert.equal(r.status, 401);
  });
});
