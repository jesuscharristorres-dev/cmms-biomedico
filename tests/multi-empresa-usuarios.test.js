// tests/multi-empresa-usuarios.test.js
// Un usuario EMPRESA/LECTURA puede tener VARIAS empresas asignadas (lib/usuarios.js →
// empresaIdsDe) y cambiar entre ellas sin volver a iniciar sesión (api/login.js →
// ?action=switch-empresa), pero cada request sigue operando sobre UNA sola a la vez — nunca
// una vista mezclada. Estas pruebas cubren justo eso: la pieza nueva. El aislamiento genérico
// entre empresas (403 cruzado, scopeArray/scopeKeyed, etc.) ya lo cubre multitenant.test.js.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import admin from '../api/admin.js';
import equipos from '../api/equipos.js';
import { setupStore, call, cookieFrom } from './helpers.js';

async function loginAs(user, pass) {
  const r = await call(login, { method: 'POST', body: { user, pass } });
  return { r, cookie: cookieFrom(r) };
}

describe('Usuarios con varias empresas asignadas', () => {
  let superCookie;

  before(async () => {
    setupStore();
    superCookie = (await loginAs('jesus.charris', 'ClaveSuperAdmin-2026')).cookie;
  });

  test('crear un usuario con empresa_ids (arreglo) asigna varias empresas', async () => {
    const r = await call(admin, {
      method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie,
      body: { nombre: 'Multi', email: 'multi@empresas.test', password: 'ClaveEmpresa-123', role: 'EMPRESA', empresa_ids: ['MACROMED', 'MEIDE'], estado: 'activo' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.usuario.empresa_ids, ['MACROMED', 'MEIDE']);
    assert.equal(r.body.usuario.empresa_id, 'MACROMED', 'empresa_id (compat) = la primera del arreglo');
  });

  test('el login arranca en la primera empresa asignada; GET /api/login lista todas', async () => {
    const { r, cookie } = await loginAs('multi@empresas.test', 'ClaveEmpresa-123');
    assert.equal(r.status, 200);
    assert.equal(r.body.user.empresa_id, 'MACROMED');

    const sesion = await call(login, { cookie });
    assert.equal(sesion.body.user.empresa_id, 'MACROMED');
    assert.deepEqual(sesion.body.empresas.map(e => e.id).sort(), ['MACROMED', 'MEIDE']);

    const eq = await call(equipos, { cookie });
    assert.ok(eq.body.equipos.length > 0 && eq.body.equipos.every(e => e.empresa === 'MACROMED'));
  });

  test('switch-empresa cambia la empresa activa sin volver a iniciar sesión', async () => {
    const { cookie } = await loginAs('multi@empresas.test', 'ClaveEmpresa-123');
    const sw = await call(login, { method: 'POST', query: { action: 'switch-empresa' }, cookie, body: { empresa_id: 'MEIDE' } });
    assert.equal(sw.status, 200);
    assert.equal(sw.body.user.empresa_id, 'MEIDE');

    // La MISMA cookie, sin volver a loguear, ahora ve MEIDE — nunca las dos mezcladas.
    const eq = await call(equipos, { cookie });
    assert.ok(eq.body.equipos.length > 0 && eq.body.equipos.every(e => e.empresa === 'MEIDE'));

    const sesion = await call(login, { cookie });
    assert.equal(sesion.body.user.empresa_id, 'MEIDE');
  });

  test('switch-empresa a una empresa que NO tiene asignada → 403, y no cambia nada', async () => {
    const { cookie } = await loginAs('multi@empresas.test', 'ClaveEmpresa-123');
    const sw = await call(login, { method: 'POST', query: { action: 'switch-empresa' }, cookie, body: { empresa_id: 'DIAGNOSTIK' } });
    assert.equal(sw.status, 403);
    const sesion = await call(login, { cookie });
    assert.equal(sesion.body.user.empresa_id, 'MACROMED', 'sigue en la empresa activa de antes, sin cambios');
    const ajeno = await call(equipos, { method: 'PATCH', cookie, body: { id: 'eq_3_1', patch: { marca: 'HACK' } } });
    assert.equal(ajeno.status, 404, 'tampoco puede tocar datos de DIAGNOSTIK de ninguna forma');
  });

  test('las escrituras aterrizan en la empresa activa en ese momento, nunca en otra de sus empresas', async () => {
    const { cookie } = await loginAs('multi@empresas.test', 'ClaveEmpresa-123');
    const crear1 = await call(equipos, { method: 'POST', cookie, body: { equipo: { id: 'eq_multi_1', equipo: 'En MACROMED' } } });
    assert.equal(crear1.status, 200);
    assert.equal(crear1.body.creados[0].empresa, 'MACROMED');

    await call(login, { method: 'POST', query: { action: 'switch-empresa' }, cookie, body: { empresa_id: 'MEIDE' } });
    const crear2 = await call(equipos, { method: 'POST', cookie, body: { equipo: { id: 'eq_multi_2', equipo: 'En MEIDE' } } });
    assert.equal(crear2.status, 200);
    assert.equal(crear2.body.creados[0].empresa, 'MEIDE');
  });

  test('SUPER_ADMIN no tiene empresa activa que cambiar', async () => {
    const sw = await call(login, { method: 'POST', query: { action: 'switch-empresa' }, cookie: superCookie, body: { empresa_id: 'MACROMED' } });
    assert.equal(sw.status, 400);
  });

  test('quitarle una empresa desde Administración invalida sus sesiones abiertas', async () => {
    const { cookie } = await loginAs('multi@empresas.test', 'ClaveEmpresa-123');
    assert.equal((await call(equipos, { cookie })).status, 200);

    const lista = await call(admin, { query: { resource: 'usuarios' }, cookie: superCookie });
    const yo = lista.body.usuarios.find(u => u.email === 'multi@empresas.test');
    const ed = await call(admin, { method: 'PATCH', query: { resource: 'usuarios', id: yo.id }, cookie: superCookie, body: { empresa_ids: ['MEIDE'] } });
    assert.equal(ed.status, 200);
    assert.deepEqual(ed.body.usuario.empresa_ids, ['MEIDE']);

    assert.equal((await call(equipos, { cookie })).status, 401, 'la sesión vieja quedó invalidada');
    const { cookie: cookie2 } = await loginAs('multi@empresas.test', 'ClaveEmpresa-123');
    const sesion = await call(login, { cookie: cookie2 });
    assert.deepEqual(sesion.body.empresas.map(e => e.id), ['MEIDE'], 'ya solo tiene MEIDE');
  });

  test('filtrar usuarios por empresa (?empresa=) encuentra a quien la tenga entre varias', async () => {
    await call(admin, {
      method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie,
      body: { nombre: 'Multi2', email: 'multi2@empresas.test', password: 'ClaveEmpresa-123', role: 'LECTURA', empresa_ids: ['DIAGNOSTIK', 'AUNAR SALUD'], estado: 'activo' },
    });
    const r = await call(admin, { query: { resource: 'usuarios', empresa: 'AUNAR SALUD' }, cookie: superCookie });
    assert.ok(r.body.usuarios.some(u => u.email === 'multi2@empresas.test'));
    const r2 = await call(admin, { query: { resource: 'usuarios', empresa: 'NP MEDICAL' }, cookie: superCookie });
    assert.ok(!r2.body.usuarios.some(u => u.email === 'multi2@empresas.test'));
  });

  test('si todas sus empresas quedan inactivas, no puede ni iniciar sesión ni seguir una sesión abierta', async () => {
    const { cookie } = await loginAs('multi2@empresas.test', 'ClaveEmpresa-123');
    assert.equal((await call(login, { cookie })).body.authenticated, true);

    await call(admin, { method: 'PATCH', query: { resource: 'empresas', id: 'DIAGNOSTIK' }, cookie: superCookie, body: { estado: 'inactivo' } });
    await call(admin, { method: 'PATCH', query: { resource: 'empresas', id: 'AUNAR SALUD' }, cookie: superCookie, body: { estado: 'inactivo' } });

    assert.equal((await call(login, { cookie })).body.authenticated, false);
    const fallo = await loginAs('multi2@empresas.test', 'ClaveEmpresa-123');
    assert.equal(fallo.r.status, 403);

    // Se reactivan para no afectar otras pruebas si este archivo llegara a compartir store.
    await call(admin, { method: 'PATCH', query: { resource: 'empresas', id: 'DIAGNOSTIK' }, cookie: superCookie, body: { estado: 'activo' } });
    await call(admin, { method: 'PATCH', query: { resource: 'empresas', id: 'AUNAR SALUD' }, cookie: superCookie, body: { estado: 'activo' } });
  });

  test('compatibilidad: crear/editar con empresa_id (string suelto) sigue funcionando igual que antes', async () => {
    const r = await call(admin, {
      method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie,
      body: { nombre: 'Legado', email: 'legado@empresas.test', password: 'ClaveEmpresa-123', role: 'EMPRESA', empresa_id: 'NP MEDICAL', estado: 'activo' },
    });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.usuario.empresa_ids, ['NP MEDICAL']);
    assert.equal(r.body.usuario.empresa_id, 'NP MEDICAL');
    const { r: loginR } = await loginAs('legado@empresas.test', 'ClaveEmpresa-123');
    assert.equal(loginR.status, 200);
    assert.equal(loginR.body.user.empresa_id, 'NP MEDICAL');
  });
});
