// tests/security.test.js
// Checklist de seguridad multiempresa (los 15 escenarios exigidos) + separación de entornos
// Preview/Production, contra los handlers REALES de api/*.js. Empresa A = MACROMED,
// empresa B = MEIDE. Ejecutar con: npm test

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import admin from '../api/admin.js';
import equipos from '../api/equipos.js';
import personal from '../api/personal.js';
import reportes from '../api/reportes-falla.js';
import sendEmail from '../api/send-email.js';
import { setupStore, call, cookieFrom, ADMIN_USER, ADMIN_PASS } from './helpers.js';
import { createMemoryKv, setKvForTests, kv, currentNamespace } from '../lib/db.js';
import { resetEnsureSchemaForTests } from '../lib/migrations.js';

const A = 'MACROMED';
const B = 'MEIDE';
const PASS = 'ClaveSegura-2026';

async function loginAs(user, pass) {
  const r = await call(login, { method: 'POST', body: { user, pass } });
  return { r, cookie: cookieFrom(r) };
}

describe('Checklist de seguridad multiempresa', () => {
  let store;
  let sa; // cookie SUPER_ADMIN
  let ua; // cookie usuario empresa A
  let ub; // cookie usuario empresa B
  let idUa;

  before(async () => {
    store = setupStore();
    sa = (await loginAs(ADMIN_USER, ADMIN_PASS)).cookie;
    const crear = (email, empresa) => call(admin, {
      method: 'POST', query: { resource: 'usuarios' }, cookie: sa,
      body: { nombre: email, email, password: PASS, role: 'EMPRESA', empresa_id: empresa },
    });
    idUa = (await crear('a@empresa-a.com', A)).body.usuario.id;
    await crear('b@empresa-b.com', B);
    ua = (await loginAs('a@empresa-a.com', PASS)).cookie;
    ub = (await loginAs('b@empresa-b.com', PASS)).cookie;
  });

  test('1. SUPER_ADMIN puede ver empresa A', async () => {
    const r = await call(equipos, { cookie: sa, query: { empresa: A } });
    assert.equal(r.status, 200);
    assert.ok(r.body.equipos.length > 0 && r.body.equipos.every(e => e.empresa === A));
  });

  test('2. SUPER_ADMIN puede ver empresa B', async () => {
    const r = await call(equipos, { cookie: sa, query: { empresa: B } });
    assert.ok(r.body.equipos.length > 0 && r.body.equipos.every(e => e.empresa === B));
  });

  test('3. Usuario de A ve los datos de A', async () => {
    const r = await call(equipos, { cookie: ua });
    assert.ok(r.body.equipos.length > 0 && r.body.equipos.every(e => e.empresa === A));
  });

  test('4. Usuario de A NO ve datos de B (ni pidiéndolos)', async () => {
    assert.ok(!(await call(equipos, { cookie: ua })).body.equipos.some(e => e.empresa === B));
    assert.equal((await call(equipos, { cookie: ua, query: { empresa: B } })).status, 403);
    assert.ok(!(await call(personal, { cookie: ua })).body.personal.some(p => p.empresa === B));
    assert.ok(!(await call(reportes, { cookie: ua })).body.reportes.some(p => p.empresa === B));
  });

  test('5. Usuario de B NO ve datos de A', async () => {
    assert.ok(!(await call(equipos, { cookie: ub })).body.equipos.some(e => e.empresa === A));
    assert.equal((await call(equipos, { cookie: ub, query: { empresa: A } })).status, 403);
  });

  test('6. Usuario de A no puede modificar registros de B', async () => {
    const r = await call(equipos, { method: 'PATCH', cookie: ua, body: { id: 'eq_1_1', patch: { marca: 'HACK' } } });
    assert.equal(r.status, 404);
    assert.notEqual((await store.get('cmms:equipos')).find(e => e.id === 'eq_1_1').marca, 'HACK');
  });

  test('7. Usuario de A no puede eliminar registros de B', async () => {
    const r = await call(equipos, { method: 'DELETE', cookie: ua, body: { id: 'eq_1_1' } });
    assert.equal(r.status, 404);
    assert.ok((await store.get('cmms:equipos')).some(e => e.id === 'eq_1_1'));
  });

  test('8. Usuario de A no puede cambiar su empresa_id para volverse usuario de B', async () => {
    const r = await call(admin, { method: 'PATCH', query: { resource: 'usuarios', id: idUa }, cookie: ua, body: { empresa_id: B } });
    assert.equal(r.status, 403);
    const yo = await call(login, { cookie: ua });
    assert.equal(yo.body.user.empresa_id, A);
    // Tampoco sirve mandar empresa_id/empresa en las operaciones de datos.
    const w = await call(equipos, { method: 'POST', cookie: ua, body: { equipo: { id: 'eq_x', empresa: B, empresa_id: B } } });
    assert.equal(w.status, 403);
  });

  test('9. Usuario de A no puede convertirse en SUPER_ADMIN', async () => {
    const r = await call(admin, { method: 'PATCH', query: { resource: 'usuarios', id: idUa }, cookie: ua, body: { role: 'SUPER_ADMIN' } });
    assert.equal(r.status, 403);
    const c = await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: ua, body: { nombre: 'x', email: 'x@x.co', password: PASS, role: 'SUPER_ADMIN' } });
    assert.equal(c.status, 403);
    // Una sesión forjada con un rol en el cuerpo de la sesión no sirve: el rol se lee del usuario en KV.
    const token = 'c'.repeat(64);
    await store.set(`session:${token}`, { userId: idUa, role: 'SUPER_ADMIN' });
    const s = await call(admin, { query: { resource: 'usuarios' }, cookie: `cmms_session=${token}` });
    assert.equal(s.status, 403);
  });

  test('10. Usuario desactivado no puede autenticarse', async () => {
    const u = await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: sa, body: { nombre: 'Off', email: 'off@a.com', password: PASS, role: 'EMPRESA', empresa_id: A, estado: 'inactivo' } });
    assert.equal(u.status, 201);
    const l = await loginAs('off@a.com', PASS);
    assert.equal(l.r.status, 403);
    assert.equal(l.cookie, '');
  });

  test('11. Usuario de empresa no puede acceder a administración', async () => {
    for (const resource of ['usuarios', 'sin-empresa']) {
      assert.equal((await call(admin, { query: { resource }, cookie: ua })).status, 403);
    }
    assert.equal((await call(admin, { method: 'POST', query: { resource: 'empresas' }, cookie: ua, body: { nombre: 'Nueva' } })).status, 403);
  });

  test('12. Empresa desactivada no permite operaciones normales', async () => {
    await call(admin, { method: 'PATCH', query: { resource: 'empresas', id: B }, cookie: sa, body: { estado: 'inactivo' } });
    assert.equal((await call(equipos, { cookie: ub })).status, 401);
    assert.equal((await call(equipos, { method: 'POST', cookie: ub, body: { equipo: { id: 'eq_b_new' } } })).status, 401);
    assert.equal((await loginAs('b@empresa-b.com', PASS)).r.status, 403);
    // El SUPER_ADMIN tampoco puede crear registros nuevos en una empresa inactiva.
    assert.equal((await call(equipos, { method: 'POST', cookie: sa, body: { equipo: { id: 'eq_sa_b', empresa: B } } })).status, 422);
    // Tampoco aparece en el formulario público.
    const cat = await call(reportes, { query: { catalogo: '1' } });
    assert.ok(!cat.body.empresas.some(e => e.id === B) && !cat.body.equipos.some(e => e.empresa === B));
    await call(admin, { method: 'PATCH', query: { resource: 'empresas', id: B }, cookie: sa, body: { estado: 'activo' } });
    ub = (await loginAs('b@empresa-b.com', PASS)).cookie;
    assert.equal((await call(equipos, { cookie: ub })).status, 200);
  });

  test('13. Manipular IDs no da acceso a recursos de otra empresa (ni revela si existen)', async () => {
    const ajeno = await call(personal, { method: 'PATCH', cookie: ua, body: { id: 'per_1', patch: { nombreCompleto: 'X' } } });
    const falso = await call(personal, { method: 'PATCH', cookie: ua, body: { id: 'per_no_existe', patch: { nombreCompleto: 'X' } } });
    assert.equal(ajeno.status, 404);
    assert.deepEqual(ajeno.body, falso.body);
    const rep = await call(reportes, { method: 'DELETE', cookie: ua, query: { id: 'rf_1' } });
    assert.equal(rep.status, 404);
  });

  test('14. Endpoints públicos no exponen datos sensibles', async () => {
    const cat = await call(reportes, { query: { catalogo: '1' } });
    assert.equal(cat.status, 200);
    const texto = JSON.stringify(cat.body);
    for (const sensible of ['observaciones', 'preventivos', 'correctivos', 'calibraciones', 'password', 'nit', 'email', 'telefono']) {
      assert.ok(!texto.includes(`"${sensible}"`), `el catálogo no debe incluir ${sensible}`);
    }
    // Listados completos exigen sesión.
    assert.equal((await call(reportes, {})).status, 401);
    assert.equal((await call(equipos, {})).status, 401);
    // El reporte público no devuelve el listado de reportes.
    const post = await call(reportes, { method: 'POST', body: { reporte: { id: 'rf_pub', empresa: A, sede: 'Bogotá', equipoId: 'eq_0_1', personaReporta: 'X', descripcion: 'Y' } } });
    assert.equal(post.status, 200);
    assert.equal(post.body.reportes, undefined);
    // GET /api/login sin sesión no revela nada más que "no autenticado".
    assert.deepEqual((await call(login, {})).body, { authenticated: false });
  });

  test('14b. send-email ya no es un relay público', async () => {
    assert.equal((await call(sendEmail, { method: 'POST', body: { to: 'x@x.co', subject: 's', html: '<b>x</b>' } })).status, 401);
    assert.equal((await call(sendEmail, { method: 'POST', cookie: ua, body: { to: 'x@x.co', subject: 's', html: '<b>x</b>' } })).status, 403);
  });

  test('14c. el formulario público tiene límite de frecuencia por IP', async () => {
    let ultimo;
    for (let i = 0; i < 40; i++) {
      ultimo = await call(reportes, { method: 'POST', body: { reporte: { id: `rf_spam_${i}`, empresa: A, sede: 'Bogotá', equipoId: 'eq_0_1', personaReporta: 'X', descripcion: 'Y' } } });
      if (ultimo.status === 429) break;
    }
    assert.equal(ultimo.status, 429);
  });

  test('15. Las operaciones administrativas requieren SUPER_ADMIN', async () => {
    const ops = [
      { method: 'GET', query: { resource: 'usuarios' } },
      { method: 'POST', query: { resource: 'usuarios' }, body: { nombre: 'n', email: 'n@n.co', password: PASS, role: 'EMPRESA', empresa_id: A } },
      { method: 'PATCH', query: { resource: 'usuarios', id: idUa }, body: { estado: 'inactivo' } },
      { method: 'DELETE', query: { resource: 'usuarios', id: idUa } },
      { method: 'POST', query: { resource: 'empresas' }, body: { nombre: 'Otra' } },
      { method: 'PATCH', query: { resource: 'empresas', id: A }, body: { estado: 'inactivo' } },
      { method: 'GET', query: { resource: 'sin-empresa' } },
      { method: 'PATCH', query: { resource: 'sin-empresa' }, body: { coleccion: 'equipos', id: 'eq_huerfano', empresa: A } },
    ];
    for (const op of ops) {
      assert.equal((await call(admin, { ...op })).status, 401, `${op.method} ${op.query.resource} sin sesión`);
      assert.equal((await call(admin, { ...op, cookie: ua })).status, 403, `${op.method} ${op.query.resource} como usuario de empresa`);
    }
    assert.equal((await call(admin, { query: { resource: 'usuarios' }, cookie: sa })).status, 200);
  });
});

describe('Separación de entornos (Preview / Production) sobre un mismo KV', () => {
  test('cada entorno usa su propio namespace de claves', () => {
    assert.equal(currentNamespace({ VERCEL_ENV: 'production' }), 'production');
    assert.equal(currentNamespace({ VERCEL_ENV: 'preview' }), 'preview');
    assert.equal(currentNamespace({ VERCEL_ENV: 'development' }), 'development');
    assert.equal(currentNamespace({}), 'local');
    assert.equal(currentNamespace({ VERCEL_ENV: 'production', KV_NAMESPACE: 'staging' }), 'staging');
    assert.throws(() => currentNamespace({ KV_NAMESPACE: 'x:y' }));
  });

  test('un login y cambios en Preview no tocan los datos de Production', async () => {
    const raw = createMemoryKv({ 'cmms:equipos': [{ id: 'eq_real', empresa: A, equipo: 'Real' }] });
    setKvForTests(raw);
    const prevNs = process.env.KV_NAMESPACE;
    try {
      // Simula un deployment de Preview compartiendo el mismo store.
      process.env.KV_NAMESPACE = 'preview';
      resetEnsureSchemaForTests();
      const s = (await loginAs(ADMIN_USER, ADMIN_PASS)).cookie;
      assert.ok(s, 'Preview crea su propio SUPER_ADMIN desde AUTH_USER/AUTH_PASSWORD_HASH');
      const w = await call(equipos, { method: 'POST', cookie: s, body: { equipo: { id: 'eq_preview', empresa: A } } });
      assert.equal(w.status, 200);
      assert.ok(!w.body.equipos.some(e => e.id === 'eq_real'), 'Preview no ve los datos de Production');
      await call(admin, { method: 'POST', query: { resource: 'usuarios' }, cookie: s, body: { nombre: 'Test', email: 'test@preview.co', password: PASS, role: 'EMPRESA', empresa_id: A } });

      // Production intacto: mismas claves de siempre, sin usuarios/empresas/migraciones de Preview.
      assert.deepEqual(await raw.get('cmms:equipos'), [{ id: 'eq_real', empresa: A, equipo: 'Real' }]);
      assert.equal(await raw.get('cmms:usuarios'), null);
      assert.equal(await raw.get('cmms:empresas'), null);
      assert.equal(await raw.get('cmms:schema_migrations'), null);
      assert.ok([...raw.store.keys()].filter(k => k !== 'cmms:equipos').every(k => k.startsWith('preview:')));

      // Una cookie de sesión de Preview no sirve en Production.
      process.env.KV_NAMESPACE = 'production';
      resetEnsureSchemaForTests();
      assert.equal((await call(equipos, { cookie: s })).status, 401);
      assert.equal(await kv.get('cmms:equipos').then(x => x.length), 1);
    } finally {
      process.env.KV_NAMESPACE = prevNs;
    }
  });
});
