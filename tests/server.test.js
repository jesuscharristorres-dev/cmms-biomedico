// tests/server.test.js
// Pruebas de server.js: el adaptador Express que reemplaza el enrutamiento de Vercel fuera de
// Vercel. No vuelve a probar la lógica de negocio de cada endpoint (eso ya lo cubren
// tests/*.test.js llamando los handlers directamente) — esto prueba que el ENRUTAMIENTO queda
// equivalente a vercel.json: cada archivo de api/ expuesto en /api/<nombre>, las 6 reescrituras
// (logout, empresas, usuarios, admin/sin-empresa) y los headers de seguridad.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from '../server.js';
import { setupStore, ADMIN_USER, ADMIN_PASS } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const DIST_BACKUP = path.join(__dirname, '..', '.dist-backup-tmp');

describe('server.js (adaptador Express)', () => {
  let server, baseUrl, habiaDistReal;

  before(async () => {
    setupStore();
    // Fixture mínimo de "build" para probar el fallback a index.html. dist/ no se versiona,
    // pero si ya existe un build real (p. ej. recién corrido `npm run build`) se guarda a un
    // lado y se restaura en after() — este test no debe borrar un build real de nadie.
    habiaDistReal = fs.existsSync(DIST_DIR);
    if (habiaDistReal) fs.renameSync(DIST_DIR, DIST_BACKUP);
    fs.mkdirSync(DIST_DIR, { recursive: true });
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), '<!doctype html><title>CMMS</title>');

    server = createApp().listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
    if (habiaDistReal) fs.renameSync(DIST_BACKUP, DIST_DIR);
  });

  function cookieFrom(res) {
    const sc = res.headers.get('set-cookie');
    return sc ? sc.split(';')[0] : '';
  }

  test('GET /api/login sin cookie → authenticated: false (no 401; así lo espera el frontend)', async () => {
    const r = await fetch(`${baseUrl}/api/login`);
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).authenticated, false);
  });

  test('toda respuesta lleva los headers de seguridad de vercel.json', async () => {
    const r = await fetch(`${baseUrl}/api/login`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(r.headers.get('strict-transport-security'), 'max-age=63072000; includeSubDomains; preload');
  });

  test('POST /api/login con credenciales válidas inicia sesión (y Express ya parseó el JSON del body)', async () => {
    const r = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: ADMIN_USER, pass: ADMIN_PASS }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.ok(cookieFrom(r).startsWith('cmms_session='));
  });

  test('reescritura /api/empresas → api/admin.js con resource=empresas (igual que el rewrite de vercel.json)', async () => {
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: ADMIN_USER, pass: ADMIN_PASS }),
    });
    const cookie = cookieFrom(login);

    const r = await fetch(`${baseUrl}/api/empresas`, { headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body.empresas), 'debe responder como api/admin.js?resource=empresas, no 404');
  });

  test('reescritura /api/logout (POST) cierra la sesión igual que api/login.js?action=logout', async () => {
    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: ADMIN_USER, pass: ADMIN_PASS }),
    });
    const cookie = cookieFrom(login);

    const r = await fetch(`${baseUrl}/api/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);

    const after = await fetch(`${baseUrl}/api/login`, { headers: { Cookie: cookie } });
    assert.equal((await after.json()).authenticated, false, 'la sesión quedó cerrada en el servidor');
  });

  test('GET a una ruta que no es /api/* sirve el index.html del build (fallback de SPA)', async () => {
    const r = await fetch(`${baseUrl}/cualquier-vista`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /<title>CMMS<\/title>/);
  });

  test('GET /api/no-existe (ningún archivo de api/ ni reescritura la cubre) → 404, no cae al index.html', async () => {
    const r = await fetch(`${baseUrl}/api/no-existe`);
    assert.equal(r.status, 404);
  });
});
