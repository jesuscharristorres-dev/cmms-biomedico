// tests/tecno-comites.test.js
// Pruebas del endpoint de comités de tecnovigilancia (api/tecno-comites.js): validación de
// campos, persistencia, ausencia de duplicados y aislamiento multiempresa básico (el
// aislamiento cruzado completo ya se cubre en tests/multitenant.test.js).

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import tecnoComites from '../api/tecno-comites.js';
import admin from '../api/admin.js';
import { setupStore, call, cookieFrom } from './helpers.js';

async function loginAs(user, pass) {
  const r = await call(login, { method: 'POST', body: { user, pass } });
  return cookieFrom(r);
}

describe('Comités de tecnovigilancia (api/tecno-comites.js)', () => {
  let superCookie;

  before(async () => {
    setupStore();
    superCookie = await loginAs('jesus.charris', 'ClaveSuperAdmin-2026');
  });

  test('GET devuelve el registro sembrado (empresa · año · trimestre)', async () => {
    const r = await call(tecnoComites, { cookie: superCookie });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.MACROMED['2026'].t1.estado, 'Realizado');
    assert.ok(r.body.data.MACROMED['2026'].t1.url.startsWith('https://'));
  });

  test('rechaza año, trimestre y URL inválidos', async () => {
    const malAnio = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MACROMED', anio: 1999, trimestre: 't1', url: 'https://x.co' } });
    assert.equal(malAnio.status, 400);
    const sinAnio = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MACROMED', trimestre: 't1', url: 'https://x.co' } });
    assert.equal(sinAnio.status, 400);
    const malTrimestre = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MACROMED', anio: 2026, trimestre: 'q5', url: 'https://x.co' } });
    assert.equal(malTrimestre.status, 400);
    const malUrl = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MACROMED', anio: 2026, trimestre: 't2', url: 'javascript:alert(1)' } });
    assert.equal(malUrl.status, 400);
    const urlSinEsquema = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MACROMED', anio: 2026, trimestre: 't2', url: 'meet.google.com/abc' } });
    assert.equal(urlSinEsquema.status, 400);
  });

  test('registra un comité nuevo con estado por defecto "Pendiente" si no se envía', async () => {
    const r = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MEIDE', anio: 2026, trimestre: 't2', url: 'https://meet.example/meide-q2' } });
    assert.equal(r.status, 200);
    const reg = r.body.data.MEIDE['2026'].t2;
    assert.equal(reg.url, 'https://meet.example/meide-q2');
    assert.equal(reg.estado, 'Pendiente');
    assert.ok(reg.updatedAt);
  });

  test('actualizar (upsert) la misma empresa+año+trimestre reemplaza el registro, sin duplicarlo', async () => {
    await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'DIAGNOSTIK', anio: 2026, trimestre: 't3', url: 'https://meet.example/v1', estado: 'Programado', nombreComite: 'Comité inicial' } });
    const r2 = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'DIAGNOSTIK', anio: 2026, trimestre: 't3', url: 'https://meet.example/v2', estado: 'Realizado', nombreComite: 'Comité actualizado' } });
    assert.equal(r2.status, 200);
    const trimestres = r2.body.data.DIAGNOSTIK['2026'];
    // DIAGNOSTIK·2026 ya trae un t1 sembrado (ver helpers.js) — lo relevante es que t3 sea
    // UNA sola entrada que se sobrescribe, no dos (p. ej. por una clave numérica vs. string).
    assert.deepEqual(Object.keys(trimestres).sort(), ['t1', 't3']);
    assert.equal(trimestres.t3.url, 'https://meet.example/v2');
    assert.equal(trimestres.t3.estado, 'Realizado');
    assert.equal(trimestres.t3.nombreComite, 'Comité actualizado');
  });

  test('ignora un estado fuera del enum y usa "Pendiente"', async () => {
    const r = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'NP MEDICAL', anio: 2026, trimestre: 't4', url: 'https://meet.example/np', estado: 'Cancelado' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data['NP MEDICAL']['2026'].t4.estado, 'Pendiente');
  });

  test('rechaza una fecha de reunión con formato inválido', async () => {
    const r = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MACROMED', anio: 2026, trimestre: 't2', fechaReunion: '15-03-2026' } });
    assert.equal(r.status, 400);
    const r2 = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MACROMED', anio: 2026, trimestre: 't2', fechaReunion: '2026-02-30' } });
    assert.equal(r2.status, 400, 'el 30 de febrero no existe');
  });

  test('un registro puede existir sin URL (solo programado con fecha, sin enlace todavía)', async () => {
    const r = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'AUNAR SALUD', anio: 2027, trimestre: 't1', fechaReunion: '2027-01-20', estado: 'Programado' } });
    assert.equal(r.status, 200);
    const reg = r.body.data['AUNAR SALUD']['2027'].t1;
    assert.equal(reg.url, '');
    assert.equal(reg.estado, 'Programado');
    assert.equal(reg.fechaReunion, '2027-01-20');
  });

  test('DELETE elimina solo ese trimestre, sin afectar los demás de la misma empresa/año', async () => {
    await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'MACROMED', anio: 2026, trimestre: 't3', url: 'https://meet.example/macro-q3' } });
    const antes = await call(tecnoComites, { cookie: superCookie });
    assert.ok(antes.body.data.MACROMED['2026'].t1 && antes.body.data.MACROMED['2026'].t3);
    const del = await call(tecnoComites, { method: 'DELETE', cookie: superCookie, body: { empresaKey: 'MACROMED', anio: 2026, trimestre: 't3' } });
    assert.equal(del.status, 200);
    assert.equal(del.body.data.MACROMED['2026'].t3, undefined);
    assert.ok(del.body.data.MACROMED['2026'].t1, 'el t1 sembrado sigue intacto');
  });

  test('DELETE de un trimestre que no existe no falla (idempotente)', async () => {
    const r = await call(tecnoComites, { method: 'DELETE', cookie: superCookie, body: { empresaKey: 'MEIDE', anio: 2099, trimestre: 't4' } });
    assert.equal(r.status, 200);
  });

  test('aislamiento: un usuario de empresa solo ve y escribe la suya', async () => {
    // Se crea un usuario de empresa real para esta prueba puntual (independiente del fixture
    // compartido de multitenant.test.js, que no corre en este archivo).
    const creado = await call(admin, {
      method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie,
      body: { nombre: 'Usuario MACROMED', email: 'macromed@tecno-comites.test', password: 'ClaveEmpresa-123', role: 'EMPRESA', empresa_id: 'MACROMED', estado: 'activo' },
    });
    assert.equal(creado.status, 201);
    const cookie = await loginAs('macromed@tecno-comites.test', 'ClaveEmpresa-123');
    assert.ok(cookie);
    const propio = await call(tecnoComites, { method: 'PATCH', cookie, body: { empresaKey: 'MACROMED', anio: 2026, trimestre: 't4', url: 'https://meet.example/propio' } });
    assert.equal(propio.status, 200);
    const ajeno = await call(tecnoComites, { method: 'PATCH', cookie, body: { empresaKey: 'MEIDE', anio: 2026, trimestre: 't4', url: 'https://meet.example/ajeno' } });
    assert.equal(ajeno.status, 403);
    const get = await call(tecnoComites, { cookie });
    assert.deepEqual(Object.keys(get.body.data), ['MACROMED']);
  });

  test('sin sesión → 401; SUPER_ADMIN puede escribir en cualquier empresa existente', async () => {
    const sinSesion = await call(tecnoComites, {});
    assert.equal(sinSesion.status, 401);
    const comoSuper = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'AUNAR SALUD', anio: 2026, trimestre: 't2', url: 'https://meet.example/super' } });
    assert.equal(comoSuper.status, 200);
    const empresaInexistente = await call(tecnoComites, { method: 'PATCH', cookie: superCookie, body: { empresaKey: 'NO EXISTE', anio: 2026, trimestre: 't2', url: 'https://x.co' } });
    assert.equal(empresaInexistente.status, 422);
  });
});
