// tests/checklist-dotacion.test.js
// Pruebas del endpoint de checklist de inventario de dotación por consultorio
// (api/checklist-dotacion.js): un enlace externo por empresa (mismo mecanismo que
// api/limpieza-plantillas.js), con la regla extra de que MACROMED queda excluida. El
// aislamiento cruzado genérico ya se cubre en tests/multitenant.test.js.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import admin from '../api/admin.js';
import checklistDotacion from '../api/checklist-dotacion.js';
import { setupStore, call, cookieFrom } from './helpers.js';

async function loginAs(user, pass) {
  const r = await call(login, { method: 'POST', body: { user, pass } });
  return cookieFrom(r);
}

describe('Checklist de inventario de dotación por consultorio (api/checklist-dotacion.js)', () => {
  let superCookie;

  before(async () => {
    setupStore();
    superCookie = await loginAs('jesus.charris', 'ClaveSuperAdmin-2026');
  });

  test('GET sin datos devuelve un objeto vacío (no hay checklists sembrados)', async () => {
    const r = await call(checklistDotacion, { cookie: superCookie });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data, {});
  });

  test('MACROMED queda excluida: el SUPER_ADMIN no puede guardar un enlace para ella', async () => {
    const r = await call(checklistDotacion, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MACROMED', url: 'https://drive.example/checklist' } });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /MACROMED/);
    const get = await call(checklistDotacion, { cookie: superCookie });
    assert.equal(get.body.data.MACROMED, undefined, 'no se guardó nada para MACROMED');
  });

  test('guarda y reemplaza el enlace de una empresa permitida', async () => {
    const r = await call(checklistDotacion, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MEIDE', url: 'https://drive.example/meide-v1' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.MEIDE, 'https://drive.example/meide-v1');

    const r2 = await call(checklistDotacion, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MEIDE', url: 'https://drive.example/meide-v2' } });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.data.MEIDE, 'https://drive.example/meide-v2', 'reemplaza, no duplica');
  });

  test('rechaza un enlace sin esquema http(s)', async () => {
    const r = await call(checklistDotacion, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'DIAGNOSTIK', url: 'drive.example/sin-esquema' } });
    assert.equal(r.status, 400);
    const r2 = await call(checklistDotacion, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'DIAGNOSTIK', url: 'javascript:alert(1)' } });
    assert.equal(r2.status, 400);
  });

  test('guardar con url vacío limpia el enlace sin eliminar la clave de la empresa', async () => {
    await call(checklistDotacion, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'NP MEDICAL', url: 'https://drive.example/np' } });
    const r = await call(checklistDotacion, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'NP MEDICAL', url: '' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data['NP MEDICAL'], '');
  });

  test('aislamiento: un usuario de empresa no puede guardar en otra empresa, ni para MACROMED', async () => {
    const creado = await call(admin, {
      method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie,
      body: { nombre: 'Usuario DIAGNOSTIK', email: 'diagnostik@checklist.test', password: 'ClaveEmpresa-123', role: 'EMPRESA', empresa_id: 'DIAGNOSTIK', estado: 'activo' },
    });
    assert.equal(creado.status, 201);
    const cookie = await loginAs('diagnostik@checklist.test', 'ClaveEmpresa-123');
    assert.ok(cookie);

    const propio = await call(checklistDotacion, { method: 'PATCH', cookie, body: { empresaKey: 'DIAGNOSTIK', url: 'https://drive.example/propio' } });
    assert.equal(propio.status, 200);

    const ajeno = await call(checklistDotacion, { method: 'PATCH', cookie, body: { empresaKey: 'AUNAR SALUD', url: 'https://drive.example/ajeno' } });
    assert.equal(ajeno.status, 403);

    const macromed = await call(checklistDotacion, { method: 'PATCH', cookie, body: { empresaKey: 'MACROMED', url: 'https://drive.example/x' } });
    assert.equal(macromed.status, 403);

    const get = await call(checklistDotacion, { cookie });
    assert.deepEqual(Object.keys(get.body.data), ['DIAGNOSTIK']);
  });

  test('sin sesión → 401', async () => {
    const r = await call(checklistDotacion, {});
    assert.equal(r.status, 401);
  });
});
