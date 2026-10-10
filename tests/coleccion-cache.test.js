// tests/coleccion-cache.test.js
// Caché por versión de las colecciones grandes (lib/coleccion.js) y demás medidas para reducir
// el ancho de banda con Redis SIN cambiar el formato de las claves de negocio.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import login from '../api/login.js';
import equipos from '../api/equipos.js';
import reportesFalla from '../api/reportes-falla.js';
import capacitaciones from '../api/capacitaciones.js';
import plantillas from '../api/limpieza-plantillas.js';
import { setupStore, call, cookieFrom, ADMIN_USER, ADMIN_PASS } from './helpers.js';
import { setKvForTests } from '../lib/db.js';
import { resetColeccionCacheForTests } from '../lib/coleccion.js';

// Cuenta los comandos que llegan al KV, por comando y clave.
function espiar(store) {
  const log = [];
  setKvForTests(new Proxy(store, {
    get(t, p) {
      const v = t[p];
      if (typeof v !== 'function') return v;
      return (...a) => { log.push([p, a[0]]); return v.apply(t, a); };
    },
  }));
  return {
    log,
    lecturasCompletas: (k) => log.filter(([c, key]) => c === 'get' && key === k).length,
    escrituras: (k) => log.filter(([c, key]) => (c === 'set' || c === 'casSet') && key === k).length,
    limpiar: () => { log.length = 0; },
  };
}

async function entrar() {
  const r = await call(login, { method: 'POST', body: { user: ADMIN_USER, pass: ADMIN_PASS } });
  return cookieFrom(r);
}

describe('Inventario con caché por versión', () => {
  let store, cookie, spy;
  beforeEach(async () => {
    store = setupStore();
    cookie = await entrar();
    resetColeccionCacheForTests();
    spy = espiar(store);
  });

  test('el formato de cmms:equipos no cambia: sigue siendo el mismo arreglo', async () => {
    const antes = structuredClone(store.store.get('cmms:equipos'));
    const r = await call(equipos, { method: 'PATCH', cookie, body: { id: 'eq_0_1', patch: { marca: 'Philips' } } });
    assert.equal(r.status, 200);
    const despues = store.store.get('cmms:equipos');
    assert.ok(Array.isArray(despues));
    assert.equal(despues.length, antes.length);
    assert.deepEqual(despues.find(e => e.id === 'eq_0_1'), { ...antes.find(e => e.id === 'eq_0_1'), marca: 'Philips' });
    assert.equal(store.store.get('cmms:equipos:version'), 1);
  });

  test('GET repetido: lee la colección completa una sola vez por versión', async () => {
    await call(equipos, { method: 'GET', cookie });
    await call(equipos, { method: 'GET', cookie });
    await call(equipos, { method: 'GET', cookie });
    assert.equal(spy.lecturasCompletas('cmms:equipos'), 1);
  });

  test('ETag: el navegador con la misma versión recibe 304 sin cuerpo y sin leer la colección', async () => {
    const r1 = await call(equipos, { method: 'GET', cookie });
    assert.equal(r1.status, 200);
    assert.equal(r1.headers['cache-control'], 'private, no-cache');
    const tag = r1.headers.etag;
    assert.match(tag, /^W\/".+"$/);
    resetColeccionCacheForTests(); // instancia nueva: aun así no hace falta leer la colección
    spy.limpiar();
    const r2 = await call(equipos, { method: 'GET', cookie, headers: { 'if-none-match': tag } });
    assert.equal(r2.status, 304);
    assert.equal(r2.body, undefined);
    assert.equal(spy.lecturasCompletas('cmms:equipos'), 0);
    // Tras una escritura el ETag cambia y se descarga de nuevo.
    await call(equipos, { method: 'PATCH', cookie, body: { id: 'eq_0_1', patch: { marca: 'GE' } } });
    const r3 = await call(equipos, { method: 'GET', cookie, headers: { 'if-none-match': tag } });
    assert.equal(r3.status, 200);
    assert.notEqual(r3.headers.etag, tag);
    assert.equal(r3.body.equipos.find(e => e.id === 'eq_0_1').marca, 'GE');
  });

  test('el ETag depende del usuario y del filtro (nunca se reutiliza la copia de otro alcance)', async () => {
    const todos = await call(equipos, { method: 'GET', cookie });
    const filtrado = await call(equipos, { method: 'GET', cookie, query: { empresa: 'MEIDE' }, headers: { 'if-none-match': todos.headers.etag } });
    assert.equal(filtrado.status, 200);
    assert.ok(filtrado.body.equipos.every(e => e.empresa === 'MEIDE'));
  });

  test('escritura con caché al día: no vuelve a leer los 2,4 MB antes de guardar', async () => {
    await call(equipos, { method: 'GET', cookie });
    spy.limpiar();
    const r = await call(equipos, { method: 'PATCH', cookie, body: { id: 'eq_0_1', patch: { marca: 'Philips' } } });
    assert.equal(r.status, 200);
    assert.equal(spy.lecturasCompletas('cmms:equipos'), 0);
    assert.equal(spy.escrituras('cmms:equipos'), 1);
  });

  test('concurrencia: si otro proceso escribió entre la lectura y el guardado, se relee y no se pisa su cambio', async () => {
    await call(equipos, { method: 'GET', cookie }); // caché de esta instancia en la versión 0
    // Otra instancia guarda un cambio (incrementa la versión) sin que esta lo sepa.
    const lista = structuredClone(store.store.get('cmms:equipos'));
    lista.find(e => e.id === 'eq_1_1').modelo = 'CAMBIO-DE-OTRO';
    const json = JSON.stringify(lista);
    const len = await store.strlen('cmms:equipos');
    let primera = true;
    const casOriginal = store.casSet.bind(store);
    store.casSet = async (...a) => {
      if (primera) { primera = false; await casOriginal('cmms:equipos', 'cmms:equipos:version', '0', len, json); }
      return casOriginal(...a);
    };
    const r = await call(equipos, { method: 'PATCH', cookie, body: { id: 'eq_0_1', patch: { marca: 'MIO' } } });
    assert.equal(r.status, 200);
    const final = store.store.get('cmms:equipos');
    assert.equal(final.find(e => e.id === 'eq_1_1').modelo, 'CAMBIO-DE-OTRO');
    assert.equal(final.find(e => e.id === 'eq_0_1').marca, 'MIO');
    assert.equal(store.store.get('cmms:equipos:version'), 2);
  });

  test('una escritura externa SIN versión (p. ej. tras un rollback) se detecta por el tamaño', async () => {
    await call(equipos, { method: 'GET', cookie });
    const lista = structuredClone(store.store.get('cmms:equipos'));
    lista.push({ id: 'eq_externo', empresa: 'MEIDE', sede: 'La Dorada', equipo: 'Agregado por código anterior' });
    store.store.set('cmms:equipos', lista); // como kv.set del código anterior: no toca la versión
    const r = await call(equipos, { method: 'GET', cookie });
    assert.ok(r.body.equipos.some(e => e.id === 'eq_externo'));
    // Y una escritura nueva no lo pierde.
    await call(equipos, { method: 'PATCH', cookie, body: { id: 'eq_0_1', patch: { marca: 'X1' } } });
    assert.ok(store.store.get('cmms:equipos').some(e => e.id === 'eq_externo'));
  });

  test('POST y DELETE conservan el resto del inventario', async () => {
    const antes = structuredClone(store.store.get('cmms:equipos'));
    const nuevo = { id: 'eq_nuevo', empresa: 'MEIDE', sede: 'La Dorada', equipo: 'Nuevo' };
    const c = await call(equipos, { method: 'POST', cookie, body: { equipo: nuevo } });
    assert.equal(c.status, 200);
    assert.equal(c.body.creados.length, 1);
    assert.equal(store.store.get('cmms:equipos').length, antes.length + 1);
    const d = await call(equipos, { method: 'DELETE', cookie, body: { id: 'eq_nuevo' } });
    assert.equal(d.status, 200);
    assert.deepEqual(store.store.get('cmms:equipos'), antes);
  });

  test('PATCH de un equipo inexistente: 404 y no escribe', async () => {
    const r = await call(equipos, { method: 'PATCH', cookie, body: { id: 'no-existe', patch: { marca: 'X' } } });
    assert.equal(r.status, 404);
    assert.equal(spy.escrituras('cmms:equipos'), 0);
  });
});

describe('Catálogo público del reporte de falla', () => {
  let store, spy;
  beforeEach(async () => {
    store = setupStore();
    await entrar(); // aplica migraciones (crea empresas)
    resetColeccionCacheForTests();
    spy = espiar(store);
  });

  test('cacheable en el CDN, solo campos de identificación y sin releer el inventario', async () => {
    const r1 = await call(reportesFalla, { method: 'GET', query: { catalogo: '1' } });
    assert.equal(r1.status, 200);
    assert.match(r1.headers['cache-control'], /public.*s-maxage=300/);
    const campos = new Set(r1.body.equipos.flatMap(e => Object.keys(e)));
    assert.deepEqual([...campos].sort(), ['empresa', 'equipo', 'id', 'inventario', 'marca', 'modelo', 'numeroSerie', 'sede']);
    await call(reportesFalla, { method: 'GET', query: { catalogo: '1' } });
    assert.equal(spy.lecturasCompletas('cmms:equipos'), 1);
  });

  test('límite de frecuencia por IP; el 429 no se cachea', async () => {
    store.store.set('rate:catalogo:10.0.0.1', 120);
    const r = await call(reportesFalla, { method: 'GET', query: { catalogo: '1' } });
    assert.equal(r.status, 429);
    assert.equal(r.headers['cache-control'], 'no-store');
  });

  test('el POST público valida el equipo con la caché (sin descargar el inventario otra vez)', async () => {
    await call(reportesFalla, { method: 'GET', query: { catalogo: '1' } });
    spy.limpiar();
    const reporte = { id: 'rf_nuevo', empresa: 'MEIDE', sede: 'La Dorada', equipoId: 'eq_1_1', personaReporta: 'Ana', descripcion: 'No enciende' };
    const r = await call(reportesFalla, { method: 'POST', body: { reporte } });
    assert.equal(r.status, 200);
    assert.equal(spy.lecturasCompletas('cmms:equipos'), 0);
    const malo = await call(reportesFalla, { method: 'POST', body: { reporte: { ...reporte, id: 'rf_2', equipoId: 'eq_0_1' } } });
    assert.equal(malo.status, 422);
  });
});

describe('Colecciones medianas y sesiones', () => {
  let store, cookie;
  beforeEach(async () => {
    store = setupStore();
    cookie = await entrar();
    resetColeccionCacheForTests();
  });

  test('capacitaciones: ETag y 304', async () => {
    const r1 = await call(capacitaciones, { method: 'GET', cookie });
    assert.equal(r1.status, 200);
    assert.ok(r1.body.data.records.length > 0);
    const r2 = await call(capacitaciones, { method: 'GET', cookie, headers: { 'if-none-match': r1.headers.etag } });
    assert.equal(r2.status, 304);
  });

  test('plantillas sin Blob configurado: se guardan como antes (base64) y se descargan con sesión', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const archivoDatos = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 prueba').toString('base64')}`;
    const r = await call(plantillas, { method: 'PATCH', cookie, body: { empresaKey: 'MEIDE', nombre: 'Formato.pdf', tipo: 'application/pdf', archivoDatos } });
    assert.equal(r.status, 200);
    assert.equal(store.store.get('cmms:limpiezaPlantillas').MEIDE.archivoDatos, archivoDatos);
    const g1 = await call(plantillas, { method: 'GET', cookie });
    assert.equal(g1.body.data.MEIDE.archivoDatos, archivoDatos);
    assert.equal((await call(plantillas, { method: 'GET', cookie, headers: { 'if-none-match': g1.headers.etag } })).status, 304);
    const d = await call(plantillas, { method: 'GET', cookie, query: { archivo: 'MEIDE', descargar: '1' } });
    assert.equal(d.status, 200);
    assert.equal(Buffer.from(d.raw).toString(), '%PDF-1.4 prueba');
    assert.match(d.headers['content-disposition'], /^attachment/);
    const sin = await call(plantillas, { method: 'GET', query: { archivo: 'MEIDE' } });
    assert.equal(sin.status, 401);
  });

  test('plantillas: errores dentro del GET (404, base de datos) se responden, no escapan', async () => {
    const r = await call(plantillas, { method: 'GET', cookie, query: { archivo: 'NO-EXISTE' } });
    assert.equal(r.status, 404);
    setKvForTests(new Proxy(store, { get: (t, p) => (p === 'get' ? async () => { throw new Error('ERR max daily request limit exceeded'); } : t[p]) }));
    const caida = await call(plantillas, { method: 'GET', cookie });
    assert.equal(caida.status, 503); // límite de Upstash → mensaje claro, no un fallo sin manejar
    assert.equal(caida.headers['cache-control'], 'no-store');
  });

  test('plantilla guardada en Blob: el cliente recibe una URL autenticada, nunca la ruta interna', async () => {
    store.store.set('cmms:limpiezaPlantillas', { MEIDE: { nombre: 'F.pdf', tipo: 'application/pdf', tamano: 10, blobPathname: 'limpieza-plantillas/MEIDE/F-abc.pdf', updatedAt: 'x' } });
    const g = await call(plantillas, { method: 'GET', cookie });
    assert.equal(g.body.data.MEIDE.archivoUrl, '/api/limpieza-plantillas?archivo=MEIDE');
    assert.equal(g.body.data.MEIDE.blobPathname, undefined);
    assert.equal(store.store.get('cmms:limpiezaPlantillas').MEIDE.blobPathname, 'limpieza-plantillas/MEIDE/F-abc.pdf');
  });

  test('user_sessions:<id> tiene TTL y se limpian los tokens de sesiones vencidas al iniciar sesión', async () => {
    const usuario = (await store.get('cmms:usuarios'))[0];
    const indice = `user_sessions:${usuario.id}`;
    await store.sadd(indice, 'a'.repeat(64)); // token de una sesión que ya no existe
    await entrar();
    const tokens = await store.smembers(indice);
    assert.ok(!tokens.includes('a'.repeat(64)));
    assert.ok(tokens.length >= 1);
    assert.equal(store.ttls.get(indice), 60 * 60 * 24 * 30);
    assert.ok(cookie);
  });
});
