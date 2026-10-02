// tests/supabase/migracion.test.js
// Migración Redis → Supabase contra un Postgres/PostgREST LOCAL (nunca Producción):
//   1. Se arma un "respaldo" con el flujo real de la app sobre Redis (en memoria): migraciones,
//      empresas, usuarios, equipos con historial, documentos y firmas en base64, plantillas...
//   2. importar() + verificar(): todo coincide; repetir la importación no duplica nada.
//   3. Prueba diferencial: el MISMO guion de ~40 llamadas a la API se ejecuta con
//      DATA_BACKEND=redis y con DATA_BACKEND=supabase; las respuestas deben ser iguales.
//
//   npm run test:supabase   (requiere el entorno de scripts/migracion/entorno-prueba-local.sh)

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { disponible, vaciarSupabase, iniciarStorageFalso, configurarSupabase } from './entorno.js';
import { setupStore, call, cookieFrom, datosHeredados, ADMIN_USER, ADMIN_PASS } from '../helpers.js';
import login from '../../api/login.js';
import admin from '../../api/admin.js';
import equipos from '../../api/equipos.js';
import personal from '../../api/personal.js';
import reportesFalla from '../../api/reportes-falla.js';
import planes from '../../api/planes-programas.js';
import tecnoReportes from '../../api/tecno-reportes.js';
import tecnoTransversal from '../../api/tecno-transversal.js';
import limpieza from '../../api/limpieza-desinfeccion.js';
import plantillas from '../../api/limpieza-plantillas.js';
import capacitaciones from '../../api/capacitaciones.js';
import archivos from '../../api/archivos.js';
import { importar, verificar, validar, conteosSupabase, exportar, leerRespaldo } from '../../lib/datos/migracion.js';
import { resetCacheSupabaseForTests } from '../../lib/datos/supabase.js';
import { igualesJson, sinVacios } from '../../lib/datos/mapeo.js';

const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 manual de prueba').toString('base64')}`;
const PNG = `data:image/png;base64,${Buffer.from('firma-png-de-prueba').toString('base64')}`;
const XLSX = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${Buffer.from('plantilla').toString('base64')}`;
const EMPRESA_USER = { nombre: 'Coordinador MEIDE', email: 'coord@meide.test', password: 'ClaveMeide-2026', role: 'EMPRESA', empresa_id: 'MEIDE' };
const NEGOCIO = /^cmms:(empresas|usuarios|equipos|personal|reportesFalla|capacitaciones|planesProgramas|tecnoReportes|tecnoTransversal|limpiezaDesinfeccion|limpiezaPlantillas|alertEmails)$/;

async function entrar(user = ADMIN_USER, pass = ADMIN_PASS) {
  const r = await call(login, { method: 'POST', body: { user, pass } });
  assert.equal(r.status, 200, `login ${user}`);
  return cookieFrom(r);
}

/** Datos realistas en Redis (memoria), producidos por la propia app. Devuelve las claves de negocio. */
async function construirDatosRedis() {
  process.env.DATA_BACKEND = 'redis';
  const inicial = datosHeredados();
  const eq = inicial['cmms:equipos'].find(e => e.id === 'eq_1_1');
  eq.documentos = [{ id: 'doc1', tipo: 'Manual', nombre: 'Manual de usuario', archivoDatos: PDF }, { id: 'doc2', tipo: 'INVIMA', nombre: 'Registro', url: 'https://drive.example/x' }];
  eq.preventivos = [{ id: 'pv1', fecha: '2026-01-10', estado: 'Ejecutado', responsable: 'Ing. A', reporteTecnico: { firmaRealiza: PNG, firmaRecibe: '' } }, { id: 'pv2', fecha: '2026-07-10', estado: 'Ejecutado' }];
  eq.correctivos = [{ id: 'co1', fecha: '2026-03-01', estado: 'Cerrado', descripcion: 'Cambio de cable' }];
  inicial['cmms:limpiezaPlantillas'] = { MEIDE: { nombre: 'Formato.xlsx', tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', tamano: XLSX.length, archivoDatos: XLSX, updatedAt: '2026-09-01T00:00:00.000Z' } };
  inicial['cmms:alertEmails'] = ['alertas@cmms.test'];
  const store = setupStore(inicial);
  const cookie = await entrar(); // migraciones: empresas + SUPER_ADMIN
  // El registro huérfano se asigna con la herramienta de administración (paso previo a migrar).
  const r = await call(admin, { method: 'PATCH', cookie, query: { resource: 'sin-empresa' }, body: { coleccion: 'equipos', id: 'eq_huerfano', empresa: 'MEIDE' } });
  assert.equal(r.status, 200);
  const u = await call(admin, { method: 'POST', cookie, query: { resource: 'usuarios' }, body: EMPRESA_USER });
  assert.equal(u.status, 201);
  return Object.fromEntries([...store.store.entries()].filter(([k]) => NEGOCIO.test(k)).map(([k, v]) => [k, structuredClone(v)]));
}

// Normaliza lo que legítimamente difiere entre backends: archivos (base64 ↔ URL de Storage),
// fechas generadas en el servidor y ids aleatorios de usuarios nuevos.
function normalizar(v) {
  if (typeof v === 'string') {
    if (/^data:[^,]*;base64,/.test(v)) return `ARCHIVO:${crypto.createHash('sha256').update(Buffer.from(v.slice(v.indexOf(',') + 1), 'base64')).digest('hex')}`;
    const m = /^\/api\/archivos\?ruta=(.+)$/.exec(v);
    if (m) return `ARCHIVO:${/([0-9a-f]{64})\./.exec(decodeURIComponent(m[1]))[1]}`;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return 'FECHA';
    if (/^usr_[0-9a-f]+$/.test(v)) return 'USR';
    return v;
  }
  if (Array.isArray(v)) return v.map(normalizar);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === 'tamano') continue; // base64 (largo del Data URI) vs bytes reales
      out[k] = normalizar(x);
    }
    return out;
  }
  return v;
}

/** Sigue redirecciones de la API (y la URL firmada de Storage) y devuelve el SHA-256 del archivo. */
async function contenido(handler, opciones) {
  let r = await call(handler, opciones);
  for (let i = 0; i < 3 && r.status === 302; i++) {
    const destino = r.headers.location;
    if (destino.startsWith('/api/archivos?')) {
      r = await call(archivos, { method: 'GET', cookie: opciones.cookie, query: Object.fromEntries(new URL(destino, 'http://x').searchParams) });
    } else {
      const f = await fetch(destino);
      return { status: f.status, sha: crypto.createHash('sha256').update(Buffer.from(await f.arrayBuffer())).digest('hex') };
    }
  }
  return { status: r.status, sha: r.raw ? crypto.createHash('sha256').update(Buffer.from(r.raw)).digest('hex') : null };
}

/** El guion de la prueba diferencial: mismas llamadas, se registran las respuestas. */
async function guion() {
  const out = [];
  // En los documentos por empresa ({ data: {...} }) un objeto vacío ({ MEIDE: {} }) equivale a
  // no tenerlo: el frontend los lee con ?. y || {}. En tablas no tienen fila.
  const reg = (nombre, r) => out.push([nombre, r.status, normalizar(r.body && 'data' in r.body ? { ...r.body, data: sinVacios(r.body.data) } : r.body ?? null)]);
  const su = await entrar();
  const emp = await entrar(EMPRESA_USER.email, EMPRESA_USER.password);

  reg('equipos (super)', await call(equipos, { cookie: su }));
  reg('equipos (empresa)', await call(equipos, { cookie: emp }));
  reg('equipos ?empresa=MEIDE', await call(equipos, { cookie: su, query: { empresa: 'MEIDE' } }));
  reg('equipos resumen', await call(equipos, { cookie: su, query: { vista: 'resumen', desde: '2', cantidad: '3' } }));
  reg('equipos ?id', await call(equipos, { cookie: su, query: { id: 'eq_1_1' } }));
  reg('equipos ?id ajeno (empresa)', await call(equipos, { cookie: emp, query: { id: 'eq_0_1' } }));
  const g = await call(equipos, { cookie: su });
  reg('equipos 304', await call(equipos, { cookie: su, headers: { 'if-none-match': g.headers.etag } }));
  reg('PATCH equipo', await call(equipos, { method: 'PATCH', cookie: emp, body: { id: 'eq_1_1', patch: { marca: 'Philips', preventivos: [{ id: 'pv1', fecha: '2026-01-10', estado: 'Ejecutado' }, { id: 'pv3', fecha: '2026-09-30', estado: 'Ejecutado', reporteTecnico: { firmaRealiza: PNG } }] } } }));
  reg('PATCH equipo sin cambios', await call(equipos, { method: 'PATCH', cookie: emp, body: { id: 'eq_1_1', patch: { marca: 'Philips' } } }));
  reg('PATCH equipo ajeno', await call(equipos, { method: 'PATCH', cookie: emp, body: { id: 'eq_0_1', patch: { marca: 'X' } } }));
  reg('PATCH vaciar correctivos', await call(equipos, { method: 'PATCH', cookie: su, body: { id: 'eq_1_1', patch: { correctivos: [] } } }));
  reg('POST equipos', await call(equipos, { method: 'POST', cookie: su, body: { equipos: [{ id: 'eq_n1', empresa: 'MEIDE', sede: 'La Dorada', equipo: 'Nuevo 1', bajas: [{ fecha: '2026-01-01', motivo: 'x' }] }, { id: 'eq_n2', empresa: 'DIAGNOSTIK', sede: 'Chapinero', equipo: 'Nuevo 2' }] } }));
  reg('POST equipo repetido', await call(equipos, { method: 'POST', cookie: su, body: { equipo: { id: 'eq_n1', empresa: 'MEIDE', equipo: 'Otra vez' } } }));
  reg('POST id de otra empresa (empresa)', await call(equipos, { method: 'POST', cookie: emp, body: { equipo: { id: 'eq_n2', equipo: 'Robo' } } }));
  reg('DELETE equipo', await call(equipos, { method: 'DELETE', cookie: su, body: { id: 'eq_n2' } }));
  reg('mover equipo de empresa', await call(equipos, { method: 'PATCH', cookie: su, body: { id: 'eq_1_2', patch: { empresa: 'AUNAR SALUD', sede: 'Neiva' } } }));

  reg('personal', await call(personal, { cookie: emp }));
  reg('POST personal', await call(personal, { method: 'POST', cookie: emp, body: { record: { id: 'per_n', nombreCompleto: 'Nueva Persona', cargo: 'Ing.' } } }));
  reg('POST personal repetido', await call(personal, { method: 'POST', cookie: emp, body: { record: { id: 'per_n', nombreCompleto: 'Otra' } } }));
  reg('PATCH personal', await call(personal, { method: 'PATCH', cookie: emp, body: { id: 'per_n', patch: { cargo: 'Coordinador' } } }));

  reg('catálogo público', await call(reportesFalla, { query: { catalogo: '1' } }));
  reg('POST reporte público', await call(reportesFalla, { method: 'POST', body: { reporte: { id: 'rf_pub', empresa: 'MEIDE', sede: 'La Dorada', equipoId: 'eq_1_1', personaReporta: 'Ana', descripcion: 'No enciende', fecha: '2026-10-01' } } }));
  reg('POST reporte público repetido', await call(reportesFalla, { method: 'POST', body: { reporte: { id: 'rf_pub', empresa: 'MEIDE', sede: 'La Dorada', equipoId: 'eq_1_1', personaReporta: 'Ana', descripcion: 'No enciende', fecha: '2026-10-01' } } }));
  reg('reportes (empresa)', await call(reportesFalla, { cookie: emp }));
  reg('PATCH reporte', await call(reportesFalla, { method: 'PATCH', cookie: emp, body: { id: 'rf_pub', patch: { estado: 'En proceso' } } }));
  reg('DELETE reporte', await call(reportesFalla, { method: 'DELETE', cookie: su, query: { id: 'rf_0' } }));
  reg('DELETE reportes de empresa', await call(reportesFalla, { method: 'DELETE', cookie: su, query: { empresa: 'DIAGNOSTIK' } }));

  reg('PATCH plan', await call(planes, { method: 'PATCH', cookie: emp, body: { empresaKey: 'MEIDE', campo: 'programa', valor: 'https://p.example' } }));
  reg('planes', await call(planes, { cookie: su }));
  reg('PATCH tecno reporte', await call(tecnoReportes, { method: 'PATCH', cookie: emp, body: { empresaKey: 'MEIDE', sede: 'La Dorada', anio: '2026', trimestre: '3', valor: 'https://t.example' } }));
  reg('tecno reportes', await call(tecnoReportes, { cookie: su }));
  reg('PATCH transversal empresa', await call(tecnoTransversal, { method: 'PATCH', cookie: emp, body: { docKey: 'invima', empresaKey: 'MEIDE', valor: 'https://inv-meide' } }));
  reg('PATCH transversal global', await call(tecnoTransversal, { method: 'PATCH', cookie: su, body: { docKey: 'politica', valor: 'https://global' } }));
  reg('transversal (empresa)', await call(tecnoTransversal, { cookie: emp }));
  reg('transversal (super)', await call(tecnoTransversal, { cookie: su }));
  reg('PATCH limpieza', await call(limpieza, { method: 'PATCH', cookie: emp, body: { empresaKey: 'MEIDE', sede: 'La Dorada', anio: 2026, mes: 4, url: 'https://l.example' } }));
  reg('PATCH limpieza otro mes', await call(limpieza, { method: 'PATCH', cookie: emp, body: { empresaKey: 'MEIDE', sede: 'La Dorada', anio: 2026, mes: 5, url: 'https://l2.example' } }));
  reg('PATCH limpieza quitar', await call(limpieza, { method: 'PATCH', cookie: emp, body: { empresaKey: 'MEIDE', sede: 'La Dorada', anio: 2026, mes: 4, url: '' } }));
  reg('limpieza', await call(limpieza, { cookie: su }));

  reg('plantillas', await call(plantillas, { cookie: emp }));
  out.push(['descarga plantilla existente', ...Object.values(await contenido(plantillas, { cookie: emp, query: { archivo: 'MEIDE', descargar: '1' } }))]);
  reg('PATCH plantilla nueva', await call(plantillas, { method: 'PATCH', cookie: su, body: { empresaKey: 'DIAGNOSTIK', nombre: 'F.pdf', tipo: 'application/pdf', archivoDatos: PDF } }));
  out.push(['descarga plantilla nueva', ...Object.values(await contenido(plantillas, { cookie: su, query: { archivo: 'DIAGNOSTIK' } }))]);
  reg('descarga plantilla ajena (empresa)', await call(plantillas, { cookie: emp, query: { archivo: 'DIAGNOSTIK' } }));
  reg('DELETE plantilla', await call(plantillas, { method: 'DELETE', cookie: su, body: { empresaKey: 'DIAGNOSTIK' } }));

  reg('capacitaciones (empresa)', await call(capacitaciones, { cookie: emp }));
  reg('empresas', await call(admin, { cookie: su, query: { resource: 'empresas' } }));
  reg('PATCH empresa sedes', await call(admin, { method: 'PATCH', cookie: su, query: { resource: 'empresas', id: 'MACROMED' }, body: { sedes: ['Bogotá', 'Medellín'] } }));
  reg('POST empresa', await call(admin, { method: 'POST', cookie: su, query: { resource: 'empresas' }, body: { nombre: 'Clínica Nueva', sedes: ['Centro'] } }));
  reg('usuarios', await call(admin, { cookie: su, query: { resource: 'usuarios' } }));

  // Estado final completo visto por la app.
  reg('final equipos', await call(equipos, { cookie: su }));
  reg('final personal', await call(personal, { cookie: su }));
  reg('final reportes', await call(reportesFalla, { cookie: su }));
  reg('final empresas', await call(admin, { cookie: su, query: { resource: 'empresas' } }));
  return out;
}

describe('Migración a Supabase (entorno local)', { skip: !disponible && 'sin entorno local de Supabase (ver tests/supabase/entorno.js)' }, () => {
  let storage, datos;
  before(async () => {
    storage = await iniciarStorageFalso();
    configurarSupabase(storage.url);
    datos = await construirDatosRedis();
  });
  after(async () => {
    process.env.DATA_BACKEND = 'redis';
    await storage?.cerrar();
  });

  test('validar(): el respaldo armado no tiene problemas; uno con huérfanos sí', () => {
    assert.deepEqual(validar(datos), []);
    const malo = structuredClone(datos);
    malo['cmms:equipos'].push({ id: 'x', empresa: 'NO EXISTE' }, { id: 'x', empresa: 'MEIDE' });
    const problemas = validar(malo);
    assert.ok(problemas.some(p => /NO EXISTE/.test(p)));
    assert.ok(problemas.some(p => /duplicado/.test(p)));
  });

  test('importar → verificar: todo coincide (incluidos archivos en Storage); repetir no duplica', async () => {
    vaciarSupabase();
    resetCacheSupabaseForTests();
    process.env.DATA_BACKEND = 'supabase';
    const simulado = await importar(datos, { simular: true });
    assert.equal((await conteosSupabase()).equipos, 0, 'la simulación no escribe nada');
    const r1 = await importar(datos);
    assert.deepEqual(r1, simulado);
    assert.equal(r1.archivos, 3); // PDF del documento, firma del preventivo, plantilla xlsx
    let filas = await verificar(datos, { descargarMuestra: 3 });
    assert.ok(filas.every(f => f.ok), JSON.stringify(filas.filter(f => !f.ok)));
    const antes = await conteosSupabase();
    await importar(datos);
    assert.deepEqual(await conteosSupabase(), antes, 'la segunda importación no duplica');
    filas = await verificar(datos);
    assert.ok(filas.every(f => f.ok));
    assert.equal(storage.objetos.size, 3);
  });

  test('reversión: exportar de Supabase devuelve exactamente los datos de Redis (archivos incluidos)', async () => {
    vaciarSupabase();
    resetCacheSupabaseForTests();
    process.env.DATA_BACKEND = 'supabase';
    await importar(datos);
    const exportado = leerRespaldo(await exportar());
    for (const [clave, valor] of Object.entries(datos)) {
      const esDocumento = valor && typeof valor === 'object' && !Array.isArray(valor) && !('records' in valor);
      const esperado = esDocumento ? sinVacios(valor) : valor;
      const obtenido = esDocumento ? sinVacios(exportado[clave]) : exportado[clave];
      assert.ok(igualesJson(esperado, obtenido), `${clave} no vuelve igual`);
    }
    // Los Data URI vuelven byte a byte.
    const eq11 = exportado['cmms:equipos'].find(e => e.id === 'eq_1_1');
    assert.equal(eq11.documentos[0].archivoDatos, PDF);
    assert.equal(eq11.preventivos[0].reporteTecnico.firmaRealiza, PNG);
    assert.equal(exportado['cmms:limpiezaPlantillas'].MEIDE.archivoDatos, XLSX);
  });

  test('concurrencia en Supabase: dos ediciones simultáneas del MISMO equipo se conservan', async () => {
    vaciarSupabase();
    resetCacheSupabaseForTests();
    process.env.DATA_BACKEND = 'supabase';
    await importar(datos);
    setupStore({});
    const su = await entrar();
    const [a, b] = await Promise.all([
      call(equipos, { method: 'PATCH', cookie: su, body: { id: 'eq_2_1', patch: { marca: 'MARCA-A' } } }),
      call(equipos, { method: 'PATCH', cookie: su, body: { id: 'eq_2_1', patch: { modelo: 'MODELO-B' } } }),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const e = (await call(equipos, { cookie: su, query: { id: 'eq_2_1' } })).body.equipo;
    assert.equal(e.marca, 'MARCA-A');
    assert.equal(e.modelo, 'MODELO-B');
  });

  test('caché incremental: tras ediciones, altas y bajas trae solo lo cambiado y queda igual a una lectura completa', async () => {
    vaciarSupabase();
    resetCacheSupabaseForTests();
    process.env.DATA_BACKEND = 'supabase';
    await importar(datos);
    // Datos "viejos": la marca de agua de la copia queda un día atrás.
    // La última edición previa fue hace 1 hora (marca de agua); el resto, hace un día.
    execFileSync('psql', [process.env.SUPABASE_PRUEBAS_PG, '-q', '-c',
      "update public.equipos set updated_at = now() - interval '1 day'; update public.equipos set updated_at = now() - interval '1 hour' where id = 'eq_0_2'"]);
    setupStore({});
    const su = await entrar();
    const { repos } = await import('../../lib/datos/supabase.js');
    await repos.equipos.listar(); // carga completa
    let peticiones = 0;
    const fetchOriginal = globalThis.fetch;
    let bytes = 0;
    globalThis.fetch = async (...a) => { const r = await fetchOriginal(...a); if (String(a[0]).includes('/equipos?')) { peticiones++; bytes += (await r.clone().arrayBuffer()).byteLength; } return r; };
    try {
      await call(equipos, { method: 'PATCH', cookie: su, body: { id: 'eq_3_1', patch: { marca: 'INCREMENTAL' } } });
      await call(equipos, { method: 'DELETE', cookie: su, body: { id: 'eq_4_2' } });
      await call(equipos, { method: 'POST', cookie: su, body: { equipo: { id: 'eq_inc', empresa: 'MEIDE', sede: 'La Dorada', equipo: 'Alta incremental' } } });
      bytes = 0;
      const incremental = await repos.equipos.listar();
      assert.ok(bytes < 3000, `el refresco incremental descargó ${bytes} bytes de equipos (debería ser solo lo cambiado)`);
      resetCacheSupabaseForTests();
      const completa = await repos.equipos.listar();
      assert.ok(igualesJson(incremental, completa), 'la copia incremental difiere de una lectura completa');
      assert.equal(incremental.find(e => e.id === 'eq_3_1').marca, 'INCREMENTAL');
      assert.ok(!incremental.some(e => e.id === 'eq_4_2'));
      assert.ok(incremental.some(e => e.id === 'eq_inc'));
    } finally {
      globalThis.fetch = fetchOriginal;
    }
    assert.ok(peticiones > 0);
  });

  test('/api/archivos: exige sesión y solo entrega archivos de empresas visibles', async () => {
    process.env.DATA_BACKEND = 'supabase';
    setupStore({});
    const su = await entrar();
    const emp = await entrar(EMPRESA_USER.email, EMPRESA_USER.password);
    const doc = (await call(equipos, { cookie: su, query: { id: 'eq_1_1' } })).body.equipo.documentos[0].archivoDatos;
    assert.match(doc, /^\/api\/archivos\?ruta=MEIDE%2F[0-9a-f]{64}\.pdf$/);
    const query = Object.fromEntries(new URL(doc, 'http://x').searchParams);
    assert.equal((await call(archivos, { query })).status, 401);
    const ok = await call(archivos, { cookie: emp, query });
    assert.equal(ok.status, 302);
    assert.equal(Buffer.from(await (await fetch(ok.headers.location)).arrayBuffer()).toString(), '%PDF-1.4 manual de prueba');
    // Un usuario de otra empresa no lo ve (404, indistinguible de inexistente).
    const otro = { nombre: 'Otro', email: 'otro@np.test', password: 'ClaveNp-20261', role: 'EMPRESA', empresa_id: 'NP MEDICAL' };
    assert.equal((await call(admin, { method: 'POST', cookie: su, query: { resource: 'usuarios' }, body: otro })).status, 201);
    const np = await entrar(otro.email, otro.password);
    assert.equal((await call(archivos, { cookie: np, query })).status, 404);
    assert.equal((await call(archivos, { cookie: su, query: { ruta: '../etc/passwd' } })).status, 400);
  });

  test('prueba diferencial: la API responde igual con Redis y con Supabase', async () => {
    // Redis (en memoria) con los mismos datos.
    process.env.DATA_BACKEND = 'redis';
    setupStore(structuredClone(datos));
    const conRedis = await guion();
    // Supabase con los datos importados; sesiones y contadores en un Redis vacío.
    vaciarSupabase();
    resetCacheSupabaseForTests();
    process.env.DATA_BACKEND = 'supabase';
    await importar(datos);
    setupStore({});
    const conSupabase = await guion();

    assert.equal(conSupabase.length, conRedis.length);
    // Que la comparación no sea vacía: el guion ejerce lecturas, escrituras y errores reales.
    assert.ok(conRedis.length >= 50);
    const final = conRedis.find(r => r[0] === 'final equipos')[2].equipos;
    assert.equal(final.length, 12);
    assert.equal(final.find(e => e.id === 'eq_1_1').marca, 'Philips');
    assert.deepEqual(conRedis.find(r => r[0] === 'PATCH equipo ajeno').slice(1, 2), [404]);
    assert.deepEqual(conRedis.find(r => r[0] === 'equipos 304').slice(1, 2), [304]);
    assert.equal(new Set(conRedis.map(r => r[1])).size >= 5, true, 'varios códigos de estado distintos');
    const distintos = conRedis.filter((r, i) => !igualesJson(r, conSupabase[i])).map((r, i) => r[0] ?? i);
    for (let i = 0; i < conRedis.length; i++) {
      if (!igualesJson(conRedis[i], conSupabase[i])) {
        assert.deepEqual(conSupabase[i], conRedis[i], `"${conRedis[i][0]}" difiere entre backends`);
      }
    }
    assert.deepEqual(distintos, []);
  });
});
