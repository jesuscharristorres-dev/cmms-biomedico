// tests/production-upgrade.test.js
// Simula el paso a Production: un KV con los datos tal como los dejó la versión ANTERIOR
// (monoempresa, claves `cmms:*` sin prefijo, sesiones { role: 'admin' }) recibe la versión
// multiempresa con VERCEL_ENV=production. Verifica que:
//   - todas las claves existentes quedan byte a byte iguales (nada se borra, sobrescribe ni reasigna);
//   - las migraciones solo AGREGAN claves nuevas y son idempotentes;
//   - el administrador histórico (AUTH_USER/AUTH_PASSWORD_HASH) entra como SUPER_ADMIN y ve todo;
//   - las sesiones del esquema anterior dejan de valer (documentado: hay que volver a iniciar sesión);
//   - los registros con empresa desconocida quedan listados "sin empresa", sin asignarse solos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryKv, setKvForTests } from '../lib/db.js';
import { resetEnsureSchemaForTests, runPending } from '../lib/migrations.js';
import { hashPassword } from '../lib/password.js';
import { call, cookieFrom } from './helpers.js';
import login from '../api/login.js';
import admin from '../api/admin.js';
import equipos from '../api/equipos.js';
import personal from '../api/personal.js';
import reportes from '../api/reportes-falla.js';
import planes from '../api/planes-programas.js';
import tecnoTransversal from '../api/tecno-transversal.js';
import capacitaciones from '../api/capacitaciones.js';

const EMPRESAS = ['MACROMED', 'MEIDE', 'NP MEDICAL', 'DIAGNOSTIK', 'AUNAR SALUD'];
const OLD_TOKEN = 'a'.repeat(64);

function produccionAnterior() {
  const equiposData = EMPRESAS.flatMap((e, i) => [0, 1, 2].map(n => ({
    id: `eq${i}${n}`, empresa: e, sede: 'S', equipo: `Equipo ${e} ${n}`,
    preventivos: [{ fecha: '2026-01-10', estado: 'Realizado' }], correctivos: [{ fecha: '2026-03-01' }],
    calibraciones: [{ fecha: '2026-02-02', certificadoUrl: 'https://x/cert.pdf' }], documentos: [{ nombre: 'manual.pdf' }],
    bajas: [], observaciones: `obs ${n}`,
  })));
  equiposData.push({ id: 'eq_legacy', empresa: 'EMPRESA ANTIGUA', sede: 'X', equipo: 'Sin empresa válida' });
  return {
    'cmms:equipos': equiposData,
    'cmms:personal': EMPRESAS.map((e, i) => ({ id: `per${i}`, empresa: e, nombreCompleto: `Persona ${i}` })),
    'cmms:reportesFalla': EMPRESAS.map((e, i) => ({ id: `rf${i}`, empresa: e, sede: 'S', equipoId: `eq${i}0`, estado: 'Reportado' })),
    'cmms:planesProgramas': Object.fromEntries(EMPRESAS.map(e => [e, { programaMantenimiento: `https://x/${e}` }])),
    'cmms:tecnoTransversal': { invima: 'https://global/invima.pdf', manual: { MACROMED: 'https://m/macro' } },
    'cmms:tecnoReportes': { MEIDE: { S: { 2026: { 1: 'https://t/1' } } } },
    'cmms:limpiezaDesinfeccion': { DIAGNOSTIK: { S: { 2026: { 0: { url: 'https://l/0' } } } } },
    'cmms:limpiezaPlantillas': { 'AUNAR SALUD': { nombre: 'plantilla.pdf', archivoDatos: 'data:application/pdf;base64,AAAA' } },
    'cmms:capacitaciones': { records: [{ id: 'c1', empresa: 'MACROMED' }, { id: 'c2', empresa: 'OTRAS' }], errores: [], capacitacionesConfiguradas: [] },
    'cmms:alertEmails': ['alertas@empresa.com'],
    [`session:${OLD_TOKEN}`]: { role: 'admin', createdAt: 1 },
  };
}

test('paso a Production: datos históricos intactos, migraciones aditivas e idempotentes', async () => {
  const inicial = produccionAnterior();
  const raw = createMemoryKv(inicial);
  setKvForTests(raw, { strict: true }); // igual que el cliente real
  const prevNs = process.env.KV_NAMESPACE;
  delete process.env.KV_NAMESPACE; // como en Vercel: no existe KV_NAMESPACE
  process.env.VERCEL_ENV = 'production';
  process.env.AUTH_USER = 'admin.historico';
  process.env.AUTH_PASSWORD_HASH = hashPassword('ClaveHistorica-123');
  delete process.env.SUPERADMIN_EMAIL;
  delete process.env.SUPERADMIN_PASSWORD_HASH;
  resetEnsureSchemaForTests();
  try {
    // 1. Entorno visible sin sesión.
    assert.deepEqual((await call(login, {})).body, { authenticated: false, entorno: 'production' });

    // 2. La sesión del esquema anterior ya no vale (hay que volver a iniciar sesión).
    assert.equal((await call(equipos, { cookie: `cmms_session=${OLD_TOKEN}` })).status, 401);

    // 3. El administrador histórico entra con sus mismas credenciales y es SUPER_ADMIN.
    const l = await call(login, { method: 'POST', body: { user: 'admin.historico', pass: 'ClaveHistorica-123' } });
    assert.equal(l.status, 200);
    assert.equal(l.body.user.role, 'SUPER_ADMIN');
    const sa = cookieFrom(l);

    // 4. Ve TODOS los datos históricos, sin cambios.
    const eq = await call(equipos, { cookie: sa });
    assert.deepEqual(eq.body.equipos, inicial['cmms:equipos']);
    assert.deepEqual((await call(personal, { cookie: sa })).body.personal, inicial['cmms:personal']);
    assert.deepEqual((await call(reportes, { cookie: sa })).body.reportes, inicial['cmms:reportesFalla']);
    assert.deepEqual((await call(planes, { cookie: sa })).body.data, inicial['cmms:planesProgramas']);
    assert.deepEqual((await call(tecnoTransversal, { cookie: sa })).body.data, inicial['cmms:tecnoTransversal']);
    assert.deepEqual((await call(capacitaciones, { cookie: sa })).body.data, inicial['cmms:capacitaciones']);

    // 5. Las 5 empresas existen y el registro con empresa desconocida queda "sin empresa", sin asignar.
    const emp = await call(admin, { query: { resource: 'empresas' }, cookie: sa });
    assert.deepEqual(emp.body.empresas.map(e => e.id), EMPRESAS);
    const sin = await call(admin, { query: { resource: 'sin-empresa' }, cookie: sa });
    assert.deepEqual(sin.body.informe.items.map(i => i.id), ['eq_legacy']);
    assert.equal(sin.body.informe.items[0].empresaActual, 'EMPRESA ANTIGUA');

    // 6. Migraciones idempotentes: correr de nuevo no cambia nada.
    const tras1 = JSON.stringify([...raw.store.entries()]);
    await runPending();
    await runPending();
    assert.equal(JSON.stringify([...raw.store.entries()]), tras1);

    // 7. Byte a byte: ninguna clave preexistente cambió ni desapareció. Solo se agregaron claves.
    for (const [k, v] of Object.entries(inicial)) {
      assert.deepEqual(await raw.get(k), v, `la clave ${k} no debe cambiar`);
    }
    const nuevas = [...raw.store.keys()].filter(k => !(k in inicial)).sort();
    // `<clave>:version`: contadores pequeños de la caché por versión (lib/coleccion.js).
    assert.ok(nuevas.every(k => /^(cmms:(empresas|usuarios|schema_migrations|migracion:sin_empresa)(:version)?|cmms:[A-Za-z]+:version|session:[0-9a-f]{64}|user_sessions:usr_[0-9a-f]+|login_fail:.*)$/.test(k)), nuevas.join(', '));
    assert.ok(!nuevas.some(k => k.startsWith('preview:')), 'Production nunca escribe en preview:*');
    assert.equal((await raw.get('cmms:usuarios')).filter(u => u.role === 'SUPER_ADMIN').length, 1);
  } finally {
    process.env.KV_NAMESPACE = prevNs;
    delete process.env.VERCEL_ENV;
  }
});
