// tests/checklist-dotacion.test.js
// Pruebas del endpoint de checklist de inventario de dotación por consultorio
// (api/checklist-dotacion.js): mismo mecanismo que api/limpieza-plantillas.js (un archivo real
// en base64 por empresa), pero con la regla extra de que MACROMED queda excluida. El
// aislamiento cruzado genérico ya se cubre en tests/multitenant.test.js.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import admin from '../api/admin.js';
import checklistDotacion from '../api/checklist-dotacion.js';
import { setupStore, call, cookieFrom } from './helpers.js';

const PDF_DATA_URI = 'data:application/pdf;base64,JVBERi0xLjQK';

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

  test('MACROMED queda excluida: el SUPER_ADMIN no puede cargar un checklist para ella', async () => {
    const r = await call(checklistDotacion, {
      method: 'PATCH', cookie: superCookie,
      body: { empresaKey: 'MACROMED', nombre: 'checklist.pdf', tipo: 'application/pdf', archivoDatos: PDF_DATA_URI },
    });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /MACROMED/);
    const get = await call(checklistDotacion, { cookie: superCookie });
    assert.equal(get.body.data.MACROMED, undefined, 'no se guardó nada para MACROMED');
  });

  test('carga, reemplaza y lee un checklist para una empresa permitida', async () => {
    const r = await call(checklistDotacion, {
      method: 'PATCH', cookie: superCookie,
      body: { empresaKey: 'MEIDE', nombre: 'checklist-dotacion.pdf', tipo: 'application/pdf', archivoDatos: PDF_DATA_URI },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.MEIDE.nombre, 'checklist-dotacion.pdf');
    assert.equal(r.body.data.MEIDE.archivoDatos, PDF_DATA_URI);
    assert.ok(r.body.data.MEIDE.updatedAt);

    const r2 = await call(checklistDotacion, {
      method: 'PATCH', cookie: superCookie,
      body: { empresaKey: 'MEIDE', nombre: 'checklist-v2.pdf', tipo: 'application/pdf', archivoDatos: PDF_DATA_URI },
    });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.data.MEIDE.nombre, 'checklist-v2.pdf', 'reemplaza, no duplica');
  });

  test('rechaza tipo de archivo no permitido y archivo inválido', async () => {
    const tipoMalo = await call(checklistDotacion, {
      method: 'PATCH', cookie: superCookie,
      body: { empresaKey: 'DIAGNOSTIK', nombre: 'virus.exe', tipo: 'application/x-msdownload', archivoDatos: PDF_DATA_URI },
    });
    assert.equal(tipoMalo.status, 400);
    const sinDatos = await call(checklistDotacion, {
      method: 'PATCH', cookie: superCookie,
      body: { empresaKey: 'DIAGNOSTIK', nombre: 'a.pdf', tipo: 'application/pdf', archivoDatos: 'no-es-data-uri' },
    });
    assert.equal(sinDatos.status, 400);
    const sinNombre = await call(checklistDotacion, {
      method: 'PATCH', cookie: superCookie,
      body: { empresaKey: 'DIAGNOSTIK', tipo: 'application/pdf', archivoDatos: PDF_DATA_URI },
    });
    assert.equal(sinNombre.status, 400);
  });

  test('DELETE elimina el checklist de una empresa sin afectar las demás', async () => {
    await call(checklistDotacion, {
      method: 'PATCH', cookie: superCookie,
      body: { empresaKey: 'NP MEDICAL', nombre: 'np.pdf', tipo: 'application/pdf', archivoDatos: PDF_DATA_URI },
    });
    const del = await call(checklistDotacion, { method: 'DELETE', cookie: superCookie, body: { empresaKey: 'MEIDE' } });
    assert.equal(del.status, 200);
    assert.equal(del.body.data.MEIDE, undefined);
    assert.ok(del.body.data['NP MEDICAL'], 'NP MEDICAL sigue con su checklist');
  });

  test('aislamiento: un usuario de empresa no puede cargar en otra empresa, ni para MACROMED', async () => {
    const creado = await call(admin, {
      method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie,
      body: { nombre: 'Usuario DIAGNOSTIK', email: 'diagnostik@checklist.test', password: 'ClaveEmpresa-123', role: 'EMPRESA', empresa_id: 'DIAGNOSTIK', estado: 'activo' },
    });
    assert.equal(creado.status, 201);
    const cookie = await loginAs('diagnostik@checklist.test', 'ClaveEmpresa-123');
    assert.ok(cookie);

    const propio = await call(checklistDotacion, {
      method: 'PATCH', cookie, body: { empresaKey: 'DIAGNOSTIK', nombre: 'propio.pdf', tipo: 'application/pdf', archivoDatos: PDF_DATA_URI },
    });
    assert.equal(propio.status, 200);

    const ajeno = await call(checklistDotacion, {
      method: 'PATCH', cookie, body: { empresaKey: 'AUNAR SALUD', nombre: 'ajeno.pdf', tipo: 'application/pdf', archivoDatos: PDF_DATA_URI },
    });
    assert.equal(ajeno.status, 403);

    const macromed = await call(checklistDotacion, {
      method: 'PATCH', cookie, body: { empresaKey: 'MACROMED', nombre: 'x.pdf', tipo: 'application/pdf', archivoDatos: PDF_DATA_URI },
    });
    assert.equal(macromed.status, 403);

    const get = await call(checklistDotacion, { cookie });
    assert.deepEqual(Object.keys(get.body.data), ['DIAGNOSTIK']);
  });

  test('sin sesión → 401', async () => {
    const r = await call(checklistDotacion, {});
    assert.equal(r.status, 401);
  });
});
