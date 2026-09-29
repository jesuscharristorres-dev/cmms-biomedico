// tests/multitenant.test.js
// Pruebas de aislamiento multiempresa contra los handlers REALES de api/*.js.
// Ejecutar con: npm test

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import admin from '../api/admin.js';
import equipos from '../api/equipos.js';
import personal from '../api/personal.js';
import reportes from '../api/reportes-falla.js';
import planes from '../api/planes-programas.js';
import tecnoTransversal from '../api/tecno-transversal.js';
import tecnoReportes from '../api/tecno-reportes.js';
import limpieza from '../api/limpieza-desinfeccion.js';
import plantillas from '../api/limpieza-plantillas.js';
import capacitaciones from '../api/capacitaciones.js';
import { setupStore, call, cookieFrom, ADMIN_USER, ADMIN_PASS, EMPRESAS, SEDES } from './helpers.js';

const PASS = 'ClaveEmpresa-123';

async function loginAs(user, pass) {
  const r = await call(login, { method: 'POST', body: { user, pass } });
  return { r, cookie: cookieFrom(r) };
}

describe('Arquitectura multiempresa', () => {
  let store;
  let superCookie;
  const cookies = {}; // empresa → cookie de su usuario
  const userIds = {};

  before(async () => {
    store = setupStore();
    const { r, cookie } = await loginAs(ADMIN_USER, ADMIN_PASS);
    assert.equal(r.status, 200, 'el administrador histórico (AUTH_USER) debe poder entrar');
    assert.equal(r.body.user.role, 'SUPER_ADMIN');
    superCookie = cookie;
    for (const [i, emp] of EMPRESAS.entries()) {
      const c = await call(admin, {
        method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie,
        body: { nombre: `Usuario ${i + 1}`, email: `user${i + 1}@empresa${i + 1}.com`, password: PASS, role: 'EMPRESA', empresa_id: emp, estado: 'activo' },
      });
      assert.equal(c.status, 201, JSON.stringify(c.body));
      userIds[emp] = c.body.usuario.id;
      cookies[emp] = (await loginAs(`user${i + 1}@empresa${i + 1}.com`, PASS)).cookie;
    }
  });

  describe('Migración / datos iniciales', () => {
    test('se crean las 5 empresas reales conservando sus claves históricas como id', async () => {
      const r = await call(admin, { query: { resource: 'empresas' }, cookie: superCookie });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.empresas.map(e => e.id).sort(), [...EMPRESAS].sort());
      assert.ok(r.body.empresas.every(e => e.estado === 'activo' && e.created_at && e.updated_at));
    });
    test('no se borra ni modifica ningún registro existente', async () => {
      const eq = await store.get('cmms:equipos');
      assert.equal(eq.length, 11);
      assert.ok(eq.find(e => e.id === 'eq_huerfano' && e.empresa === 'EMPRESA VIEJA'));
    });
    test('los registros sin empresa válida quedan listados para asignación manual', async () => {
      const r = await call(admin, { query: { resource: 'sin-empresa' }, cookie: superCookie });
      assert.equal(r.status, 200);
      assert.equal(r.body.informe.total, 1);
      assert.equal(r.body.informe.items[0].id, 'eq_huerfano');
    });
    test('las contraseñas nunca se guardan en texto plano ni salen del servidor', async () => {
      const usuarios = await store.get('cmms:usuarios');
      assert.ok(usuarios.every(u => u.password_hash && !JSON.stringify(u).includes(PASS)));
      const r = await call(admin, { query: { resource: 'usuarios' }, cookie: superCookie });
      assert.ok(r.body.usuarios.every(u => !('password_hash' in u)));
    });
  });

  describe('SUPER_ADMIN', () => {
    test('ve los equipos de las 5 empresas', async () => {
      const r = await call(equipos, { cookie: superCookie });
      assert.equal(r.status, 200);
      for (const emp of EMPRESAS) assert.ok(r.body.equipos.some(e => e.empresa === emp), emp);
    });
    test('puede filtrar por empresa', async () => {
      for (const emp of EMPRESAS) {
        const r = await call(equipos, { cookie: superCookie, query: { empresa: emp } });
        assert.ok(r.body.equipos.length === 2 && r.body.equipos.every(e => e.empresa === emp));
      }
    });
    test('crea y edita una empresa', async () => {
      const c = await call(admin, { method: 'POST', query: { resource: 'empresas' }, cookie: superCookie, body: { nombre: 'Clínica Norte', nit: '900123', email: 'a@b.co', sedes: 'Sede A, Sede B' } });
      assert.equal(c.status, 201, JSON.stringify(c.body));
      assert.equal(c.body.empresa.id, 'CLINICA NORTE');
      assert.deepEqual(c.body.empresa.sedes, ['Sede A', 'Sede B']);
      const e = await call(admin, { method: 'PATCH', query: { resource: 'empresas', id: 'CLINICA NORTE' }, cookie: superCookie, body: { telefono: '123', id: 'HACK' } });
      assert.equal(e.status, 200);
      assert.equal(e.body.empresa.id, 'CLINICA NORTE', 'el id no se puede cambiar');
      assert.equal(e.body.empresa.telefono, '123');
      const dup = await call(admin, { method: 'POST', query: { resource: 'empresas' }, cookie: superCookie, body: { nombre: 'clinica norte' } });
      assert.equal(dup.status, 409);
    });
    test('crea, edita y desactiva usuarios; valida email, rol y empresa', async () => {
      const bad = await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie, body: { nombre: 'X', email: 'no-email', password: '123', role: 'ROOT' } });
      assert.equal(bad.status, 422);
      assert.ok(bad.body.details.email && bad.body.details.password && bad.body.details.role);
      const sinEmpresa = await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie, body: { nombre: 'X', email: 'x@x.co', password: PASS, role: 'EMPRESA' } });
      assert.equal(sinEmpresa.status, 422);
      assert.ok(sinEmpresa.body.details.empresa_id);
      const empInexistente = await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie, body: { nombre: 'X', email: 'x@x.co', password: PASS, role: 'EMPRESA', empresa_id: 'NOPE' } });
      assert.equal(empInexistente.status, 422);
      const dupEmail = await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie, body: { nombre: 'X', email: 'USER1@empresa1.com', password: PASS, role: 'EMPRESA', empresa_id: 'MEIDE' } });
      assert.equal(dupEmail.status, 409);

      const c = await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie, body: { nombre: 'Temporal', email: 'temp@x.co', password: PASS, role: 'EMPRESA', empresa_id: 'MEIDE' } });
      assert.equal(c.status, 201);
      const ed = await call(admin, { method: 'PATCH', query: { resource: 'usuarios', id: c.body.usuario.id }, cookie: superCookie, body: { nombre: 'Temporal Editado' } });
      assert.equal(ed.body.usuario.nombre, 'Temporal Editado');
      const off = await call(admin, { method: 'PATCH', query: { resource: 'usuarios', id: c.body.usuario.id }, cookie: superCookie, body: { estado: 'inactivo' } });
      assert.equal(off.body.usuario.estado, 'inactivo');
      const del = await call(admin, { method: 'DELETE', query: { resource: 'usuarios', id: c.body.usuario.id }, cookie: superCookie });
      assert.equal(del.status, 200);
    });
    test('no puede desactivarse ni eliminarse a sí mismo', async () => {
      const me = (await call(login, { cookie: superCookie })).body.user;
      const off = await call(admin, { method: 'PATCH', query: { resource: 'usuarios', id: me.id }, cookie: superCookie, body: { estado: 'inactivo' } });
      assert.equal(off.status, 409);
      const del = await call(admin, { method: 'DELETE', query: { resource: 'usuarios', id: me.id }, cookie: superCookie });
      assert.equal(del.status, 409);
    });
    test('asigna empresa a un registro huérfano (reversible: guarda el valor anterior)', async () => {
      const r = await call(admin, { method: 'PATCH', query: { resource: 'sin-empresa' }, cookie: superCookie, body: { coleccion: 'equipos', id: 'eq_huerfano', empresa: 'MACROMED' } });
      assert.equal(r.status, 200);
      assert.equal(r.body.informe.total, 0);
      const eq = (await store.get('cmms:equipos')).find(e => e.id === 'eq_huerfano');
      assert.equal(eq.empresa, 'MACROMED');
      assert.equal(eq.empresa_anterior, 'EMPRESA VIEJA');
    });
  });

  describe('Usuario de empresa — aislamiento', () => {
    test('GET /api/login identifica automáticamente su empresa_id', async () => {
      for (const emp of EMPRESAS) {
        const r = await call(login, { cookie: cookies[emp] });
        assert.equal(r.body.user.empresa_id, emp);
        assert.equal(r.body.user.role, 'EMPRESA');
        assert.deepEqual(r.body.empresas.map(e => e.id), [emp], 'solo ve su propia empresa');
      }
    });
    test('solo ve equipos, personal, reportes y documentos de su empresa', async () => {
      for (const emp of EMPRESAS) {
        const c = cookies[emp];
        const eq = await call(equipos, { cookie: c });
        assert.ok(eq.body.equipos.length >= 2 && eq.body.equipos.every(e => e.empresa === emp), `equipos ${emp}`);
        const pe = await call(personal, { cookie: c });
        assert.ok(pe.body.personal.every(p => p.empresa === emp));
        const rf = await call(reportes, { cookie: c });
        assert.ok(rf.body.reportes.length === 1 && rf.body.reportes[0].empresa === emp);
        for (const h of [planes, tecnoReportes, limpieza]) {
          const d = await call(h, { cookie: c });
          assert.deepEqual(Object.keys(d.body.data), [emp]);
        }
        const tt = await call(tecnoTransversal, { cookie: c });
        const inv = tt.body.data.invima;
        assert.ok(inv === 'https://global.example/doc' || inv?._default === 'https://global.example/doc', 'los documentos globales siguen visibles');
        assert.deepEqual(Object.keys(tt.body.data.manual), [emp]);
        const cap = await call(capacitaciones, { cookie: c });
        assert.ok(cap.body.data.records.every(r => r.empresa === emp));
        assert.deepEqual(cap.body.data.errores, []);
      }
    });
    test('manipular ?empresa= para ver otra empresa → 403', async () => {
      for (const h of [equipos, personal, reportes, planes, tecnoReportes, limpieza, plantillas, tecnoTransversal]) {
        const r = await call(h, { cookie: cookies.MACROMED, query: { empresa: 'MEIDE' } });
        assert.equal(r.status, 403, h.name);
      }
    });
    test('crea registros para su empresa (la empresa la decide el servidor)', async () => {
      const r = await call(equipos, { method: 'POST', cookie: cookies.MACROMED, body: { equipo: { id: 'eq_nuevo_m', equipo: 'Nuevo', sede: 'Bogotá' } } });
      assert.equal(r.status, 200);
      assert.ok(r.body.equipos.every(e => e.empresa === 'MACROMED'));
      assert.equal((await store.get('cmms:equipos')).find(e => e.id === 'eq_nuevo_m').empresa, 'MACROMED');
    });
    test('no puede crear registros en otra empresa manipulando el body → 403', async () => {
      const r = await call(equipos, { method: 'POST', cookie: cookies.MACROMED, body: { equipo: { id: 'eq_intruso', empresa: 'MEIDE' } } });
      assert.equal(r.status, 403);
      const lote = await call(equipos, { method: 'POST', cookie: cookies.MACROMED, body: { equipos: [{ id: 'ok1', empresa: 'MACROMED' }, { id: 'bad1', empresa: 'DIAGNOSTIK' }] } });
      assert.equal(lote.status, 403);
      const all = await store.get('cmms:equipos');
      assert.ok(!all.some(e => ['eq_intruso', 'ok1', 'bad1'].includes(e.id)), 'un lote con un solo registro ajeno se rechaza completo');
      const per = await call(personal, { method: 'POST', cookie: cookies.MACROMED, body: { record: { id: 'per_x', empresa: 'AUNAR SALUD' } } });
      assert.equal(per.status, 403);
    });
    test('edita registros de su empresa', async () => {
      const r = await call(equipos, { method: 'PATCH', cookie: cookies.MACROMED, body: { id: 'eq_0_1', patch: { marca: 'Philips' } } });
      assert.equal(r.status, 200);
      assert.equal(r.body.equipo.marca, 'Philips');
    });
    test('IDOR: un registro de otra empresa pedido por id es indistinguible de uno inexistente (404)', async () => {
      const antes = JSON.stringify(await store.get('cmms:equipos'));
      const inexistente = await call(equipos, { method: 'PATCH', cookie: cookies.MACROMED, body: { id: 'no-existe', patch: { marca: 'HACK' } } });
      const p = await call(equipos, { method: 'PATCH', cookie: cookies.MACROMED, body: { id: 'eq_1_1', patch: { marca: 'HACK' } } });
      assert.equal(p.status, 404);
      assert.deepEqual(p.body, inexistente.body, 'misma respuesta: no se puede inferir que el id existe');
      const d = await call(equipos, { method: 'DELETE', cookie: cookies.MACROMED, body: { id: 'eq_1_1' } });
      assert.equal(d.status, 404);
      assert.equal(JSON.stringify(await store.get('cmms:equipos')), antes, 'nada cambió');
      const rp = await call(reportes, { method: 'PATCH', cookie: cookies.MACROMED, body: { id: 'rf_1', patch: { estado: 'Finalizado' } } });
      assert.equal(rp.status, 404);
      const rd = await call(reportes, { method: 'DELETE', cookie: cookies.MACROMED, query: { id: 'rf_1' } });
      assert.equal(rd.status, 404);
      const pp = await call(personal, { method: 'PATCH', cookie: cookies.MACROMED, body: { id: 'per_1', patch: { nombreCompleto: 'X' } } });
      assert.equal(pp.status, 404);
      assert.equal((await store.get('cmms:personal')).find(x => x.id === 'per_1').nombreCompleto, 'Persona MEIDE');
    });
    test('crear un registro reutilizando el id de otra empresa no lo sobrescribe ni lo mueve (409)', async () => {
      const r = await call(equipos, { method: 'POST', cookie: cookies.MACROMED, body: { equipo: { id: 'eq_1_2', equipo: 'Suplantado' } } });
      assert.equal(r.status, 409);
      const r2 = await call(personal, { method: 'POST', cookie: cookies.MACROMED, body: { record: { id: 'per_2', nombreCompleto: 'X' } } });
      assert.equal(r2.status, 409);
      const eq = (await store.get('cmms:equipos')).filter(e => e.id === 'eq_1_2');
      assert.equal(eq.length, 1);
      assert.equal(eq[0].empresa, 'MEIDE');
    });
    test('mass assignment: no puede mover un registro propio a otra empresa ni cambiar su id', async () => {
      const r = await call(equipos, { method: 'PATCH', cookie: cookies.MACROMED, body: { id: 'eq_0_2', patch: { empresa: 'MEIDE', id: 'otro' } } });
      assert.equal(r.status, 403);
      const r2 = await call(equipos, { method: 'PATCH', cookie: cookies.MACROMED, body: { id: 'eq_0_2', patch: { id: 'otro', marca: 'Z' } } });
      assert.equal(r2.status, 200);
      assert.equal(r2.body.equipo.id, 'eq_0_2');
    });
    test('documentos por empresa: no puede escribir en otra empresa → 403', async () => {
      const a = await call(planes, { method: 'PATCH', cookie: cookies.MACROMED, body: { empresaKey: 'MEIDE', campo: 'plan', valor: 'x' } });
      assert.equal(a.status, 403);
      const b = await call(tecnoReportes, { method: 'PATCH', cookie: cookies.MACROMED, body: { empresaKey: 'MEIDE', sede: 's', anio: 2026, trimestre: 1, valor: 'x' } });
      assert.equal(b.status, 403);
      const c = await call(limpieza, { method: 'PATCH', cookie: cookies.MACROMED, body: { empresaKey: 'MEIDE', sede: 's', anio: 2026, mes: 1, url: 'https://x.co' } });
      assert.equal(c.status, 403);
      const d = await call(plantillas, { method: 'DELETE', cookie: cookies.MACROMED, body: { empresaKey: 'MEIDE' } });
      assert.equal(d.status, 403);
      const e = await call(tecnoTransversal, { method: 'PATCH', cookie: cookies.MACROMED, body: { docKey: 'manual', empresaKey: 'MEIDE', valor: 'x' } });
      assert.equal(e.status, 403);
      const g = await call(tecnoTransversal, { method: 'PATCH', cookie: cookies.MACROMED, body: { docKey: 'invima', valor: 'x' } });
      assert.equal(g.status, 403, 'un documento global solo lo edita el SUPER_ADMIN');
      const ok = await call(planes, { method: 'PATCH', cookie: cookies.MACROMED, body: { empresaKey: 'MACROMED', campo: 'plan', valor: 'https://nuevo' } });
      assert.equal(ok.status, 200);
      assert.deepEqual(Object.keys(ok.body.data), ['MACROMED']);
    });
    test('escribir la URL de su empresa no borra un documento global compartido', async () => {
      const r = await call(tecnoTransversal, { method: 'PATCH', cookie: cookies['NP MEDICAL'], body: { docKey: 'invima', empresaKey: 'NP MEDICAL', valor: 'https://np/propio' } });
      assert.equal(r.status, 200);
      const guardado = (await store.get('cmms:tecnoTransversal')).invima;
      assert.equal(guardado._default, 'https://global.example/doc');
      assert.equal(guardado['NP MEDICAL'], 'https://np/propio');
      const otra = await call(tecnoTransversal, { cookie: cookies.MACROMED });
      assert.deepEqual(otra.body.data.invima, { _default: 'https://global.example/doc' }, 'otra empresa sigue viendo el global y no la URL ajena');
    });
    test('vaciar historial de fallas solo borra los de su empresa', async () => {
      const r = await call(reportes, { method: 'DELETE', cookie: cookies.DIAGNOSTIK });
      assert.equal(r.status, 200);
      const all = await store.get('cmms:reportesFalla');
      assert.ok(!all.some(x => x.empresa === 'DIAGNOSTIK'));
      assert.equal(all.length, 4);
    });
    test('no accede a endpoints de administración → 403', async () => {
      const u = await call(admin, { query: { resource: 'usuarios' }, cookie: cookies.MACROMED });
      assert.equal(u.status, 403);
      const ce = await call(admin, { method: 'POST', query: { resource: 'empresas' }, cookie: cookies.MACROMED, body: { nombre: 'Mía' } });
      assert.equal(ce.status, 403);
      const pe = await call(admin, { method: 'PATCH', query: { resource: 'empresas', id: 'MEIDE' }, cookie: cookies.MACROMED, body: { estado: 'inactivo' } });
      assert.equal(pe.status, 403);
      const cu = await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: cookies.MACROMED, body: { nombre: 'Yo', email: 'yo@x.co', password: PASS, role: 'SUPER_ADMIN' } });
      assert.equal(cu.status, 403, 'escalamiento de privilegios bloqueado');
      const se = await call(admin, { query: { resource: 'sin-empresa' }, cookie: cookies.MACROMED });
      assert.equal(se.status, 403);
      const cap = await call(capacitaciones, { method: 'POST', cookie: cookies.MACROMED });
      assert.equal(cap.status, 403);
      const emp = await call(admin, { query: { resource: 'empresas' }, cookie: cookies.MACROMED });
      assert.deepEqual(emp.body.empresas.map(e => e.id), ['MACROMED']);
    });
  });

  describe('Sesiones, estados y cambios de empresa', () => {
    test('sin sesión no hay acceso a ningún dato → 401', async () => {
      for (const h of [equipos, personal, reportes, planes, tecnoTransversal, tecnoReportes, limpieza, plantillas, capacitaciones]) {
        const r = await call(h, {});
        assert.equal(r.status, 401, h.name);
      }
      const r = await call(admin, { query: { resource: 'empresas' } });
      assert.equal(r.status, 401);
    });
    test('cookie falsificada o sesión del esquema anterior → 401', async () => {
      const fake = await call(equipos, { cookie: 'cmms_session=' + 'a'.repeat(64) });
      assert.equal(fake.status, 401);
      const token = 'b'.repeat(64);
      await store.set(`session:${token}`, { role: 'admin', createdAt: Date.now() }); // formato viejo
      const legacy = await call(equipos, { cookie: `cmms_session=${token}` });
      assert.equal(legacy.status, 401);
    });
    test('cambio de empresa: el usuario pierde acceso a la anterior y pasa a la nueva', async () => {
      const i = await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie, body: { nombre: 'Juan Pérez', email: 'juan@empresa1.com', password: PASS, role: 'EMPRESA', empresa_id: 'MACROMED' } });
      const id = i.body.usuario.id;
      const s1 = (await loginAs('juan@empresa1.com', PASS)).cookie;
      assert.ok((await call(equipos, { cookie: s1 })).body.equipos.every(e => e.empresa === 'MACROMED'));
      const mv = await call(admin, { method: 'PATCH', query: { resource: 'usuarios', id }, cookie: superCookie, body: { empresa_id: 'NP MEDICAL' } });
      assert.equal(mv.body.usuario.empresa_id, 'NP MEDICAL');
      // La sesión vieja quedó invalidada.
      assert.equal((await call(equipos, { cookie: s1 })).status, 401);
      const s2 = (await loginAs('juan@empresa1.com', PASS)).cookie;
      const eq = await call(equipos, { cookie: s2 });
      assert.ok(eq.body.equipos.length > 0 && eq.body.equipos.every(e => e.empresa === 'NP MEDICAL'));
      const ajeno = await call(equipos, { method: 'PATCH', cookie: s2, body: { id: 'eq_0_1', patch: { marca: 'x' } } });
      assert.equal(ajeno.status, 404, 'ya no puede tocar MACROMED');
    });
    test('usuario desactivado: no inicia sesión y sus sesiones abiertas dejan de servir', async () => {
      const c = cookies.MEIDE;
      assert.equal((await call(equipos, { cookie: c })).status, 200);
      await call(admin, { method: 'PATCH', query: { resource: 'usuarios', id: userIds.MEIDE }, cookie: superCookie, body: { estado: 'inactivo' } });
      assert.equal((await call(equipos, { cookie: c })).status, 401);
      const l = await loginAs('user2@empresa2.com', PASS);
      assert.equal(l.r.status, 403);
      assert.equal(l.cookie, '');
      await call(admin, { method: 'PATCH', query: { resource: 'usuarios', id: userIds.MEIDE }, cookie: superCookie, body: { estado: 'activo' } });
      cookies.MEIDE = (await loginAs('user2@empresa2.com', PASS)).cookie;
      assert.equal((await call(equipos, { cookie: cookies.MEIDE })).status, 200);
    });
    test('usuario eliminado: su sesión deja de servir', async () => {
      const i = await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie, body: { nombre: 'Borrar', email: 'borrar@x.co', password: PASS, role: 'EMPRESA', empresa_id: 'MEIDE' } });
      const s = (await loginAs('borrar@x.co', PASS)).cookie;
      await call(admin, { method: 'DELETE', query: { resource: 'usuarios', id: i.body.usuario.id }, cookie: superCookie });
      assert.equal((await call(equipos, { cookie: s })).status, 401);
      assert.equal((await loginAs('borrar@x.co', PASS)).r.status, 401);
    });
    test('empresa desactivada: sus usuarios pierden acceso; no se le pueden asignar usuarios nuevos', async () => {
      await call(admin, { method: 'PATCH', query: { resource: 'empresas', id: 'AUNAR SALUD' }, cookie: superCookie, body: { estado: 'inactivo' } });
      assert.equal((await call(equipos, { cookie: cookies['AUNAR SALUD'] })).status, 401);
      const n = await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie, body: { nombre: 'N', email: 'n@x.co', password: PASS, role: 'EMPRESA', empresa_id: 'AUNAR SALUD' } });
      assert.equal(n.status, 422);
      await call(admin, { method: 'PATCH', query: { resource: 'empresas', id: 'AUNAR SALUD' }, cookie: superCookie, body: { estado: 'activo' } });
      assert.equal((await call(equipos, { cookie: cookies['AUNAR SALUD'] })).status, 200);
    });
    test('rol LECTURA: ve su empresa pero no puede escribir → 403', async () => {
      await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: superCookie, body: { nombre: 'Lector', email: 'lector@x.co', password: PASS, role: 'LECTURA', empresa_id: 'DIAGNOSTIK' } });
      const c = (await loginAs('lector@x.co', PASS)).cookie;
      const g = await call(equipos, { cookie: c });
      assert.ok(g.body.equipos.every(e => e.empresa === 'DIAGNOSTIK'));
      const w = await call(equipos, { method: 'PATCH', cookie: c, body: { id: 'eq_3_1', patch: { marca: 'x' } } });
      assert.equal(w.status, 403);
    });
    test('fuerza bruta: se bloquea tras 5 intentos fallidos', async () => {
      for (let i = 0; i < 5; i++) await loginAs('user5@empresa5.com', 'mala');
      const r = await loginAs('user5@empresa5.com', PASS);
      assert.equal(r.r.status, 429);
    });
    test('logout invalida la sesión en el servidor', async () => {
      const s = (await loginAs('user4@empresa4.com', PASS)).cookie;
      await call(login, { method: 'POST', query: { action: 'logout' }, cookie: s });
      assert.equal((await call(equipos, { cookie: s })).status, 401);
    });
  });

  describe('Formulario público de reporte de falla', () => {
    test('el catálogo público solo expone datos mínimos', async () => {
      const r = await call(reportes, { query: { catalogo: '1' } });
      assert.equal(r.status, 200);
      const eq = r.body.equipos[0];
      assert.deepEqual(Object.keys(eq).sort(), ['empresa', 'equipo', 'id', 'inventario', 'marca', 'modelo', 'numeroSerie', 'sede'].sort());
      assert.ok(r.body.empresas.every(e => !('nit' in e) && !('email' in e)));
    });
    test('crea el reporte solo si el equipo pertenece a la empresa y sede', async () => {
      const bad = await call(reportes, { method: 'POST', body: { reporte: { id: 'rf_pub_bad', empresa: 'MACROMED', sede: 'Bogotá', equipoId: 'eq_1_1', personaReporta: 'A', descripcion: 'B' } } });
      assert.equal(bad.status, 422);
      const ok = await call(reportes, { method: 'POST', body: { reporte: { id: 'rf_pub_ok', empresa: 'MACROMED', sede: SEDES.MACROMED, equipoId: 'eq_0_1', personaReporta: 'A', descripcion: 'B', estado: 'Finalizado', visto: true } } });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.reporte.estado, 'Reportado', 'el cliente no puede fijar el estado');
      assert.equal(ok.body.reporte.visto, false);
      assert.equal(ok.body.reportes, undefined, 'la respuesta pública no lista reportes');
    });
  });
});
