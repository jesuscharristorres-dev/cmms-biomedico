#!/usr/bin/env node
// scripts/preview-isolation-test.mjs
// Ejecuta scripts/isolation-suite.js contra un deployment real vía HTTP (solo Preview: la suite
// aborta sin tocar nada si el deployment responde entorno "production").
//
// Uso:
//   CMMS_BASE_URL=https://<deployment-de-preview>.vercel.app \
//   CMMS_ADMIN_USER=<usuario o email del SUPER_ADMIN> \
//   CMMS_ADMIN_PASS=<contraseña>        # si se omite, se pide por consola (no se muestra ni se guarda)
//   [VERCEL_PROTECTION_BYPASS=<secreto>]   # "Protection Bypass for Automation" (Preview con Vercel Authentication)
//   [TEST_USER_PASSWORD=<clave>]           # contraseña de los usuarios de prueba (si se omite, una aleatoria por ejecución)
//   node scripts/preview-isolation-test.mjs [--cleanup] [--report=informe.json]
//
// Cada identidad (SUPER_ADMIN, usuario 1, usuario 2, anónimo) tiene su propia cookie de sesión,
// igual que si fueran navegadores distintos.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(path.join(here, 'isolation-suite.js'));
const { runSuite } = globalThis.cmmsIsolationSuite;

const argv = process.argv.slice(2);
const cleanup = argv.includes('--cleanup');
const reportArg = argv.find(a => a.startsWith('--report='));
const base = (process.env.CMMS_BASE_URL || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Falta CMMS_BASE_URL (URL del deployment de Preview).');
  process.exit(1);
}
const adminUser = process.env.CMMS_ADMIN_USER;
if (!adminUser) {
  console.error('Falta CMMS_ADMIN_USER (usuario o email del SUPER_ADMIN).');
  process.exit(1);
}

async function preguntarOculto(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(texto)) rl.output.write(s); };
  const r = await new Promise(res => rl.question(texto, res));
  rl.close();
  process.stdout.write('\n');
  return r;
}
const adminPass = process.env.CMMS_ADMIN_PASS || await preguntarOculto('Contraseña del SUPER_ADMIN: ');

const bypass = process.env.VERCEL_PROTECTION_BYPASS;
const jars = {}; // identidad → "cmms_session=..."

async function http(method, p, { body, as = 'anon' } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  if (as !== 'anon' && jars[as]) headers.Cookie = jars[as];
  const res = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const sess = setCookie.map(c => c.split(';')[0]).find(c => c.startsWith('cmms_session='));
  if (sess && as !== 'anon') jars[as] = sess.endsWith('=') ? '' : sess;
  let parsed = {};
  const text = await res.text();
  try { parsed = text ? JSON.parse(text) : {}; } catch {
    if (res.status === 401 || res.status === 302) {
      throw new Error(`El deployment respondió ${res.status} sin JSON: probablemente lo bloquea Vercel Authentication. Define VERCEL_PROTECTION_BYPASS (ver docs/prueba-aislamiento-preview.md).`);
    }
    parsed = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body: parsed };
}
async function login(as, user, pass, extra = {}) {
  jars[as] = '';
  return http('POST', '/api/login', { as, body: { user, pass, ...extra } });
}
async function logout(as) {
  if (jars[as]) await http('POST', '/api/login?action=logout', { as });
  jars[as] = '';
}

try {
  const out = await runSuite({
    http, login, logout, adminUser, adminPass, cleanup,
    testPassword: process.env.TEST_USER_PASSWORD || undefined,
  });
  if (reportArg) {
    const destino = reportArg.slice('--report='.length);
    fs.writeFileSync(destino, JSON.stringify({ fecha: new Date().toISOString(), base, ...out, usuarios: out.usuarios.map(u => ({ ...u })) }, null, 2));
    console.log(`Informe guardado en ${destino}`);
  }
  process.exit(out.ok ? 0 : 2);
} catch (err) {
  console.error(`\nABORTADO: ${err.message}`);
  process.exit(1);
}
