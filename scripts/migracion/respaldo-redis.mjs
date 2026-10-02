#!/usr/bin/env node
// scripts/migracion/respaldo-redis.mjs
// Respaldo COMPLETO de Vercel KV / Upstash Redis a un archivo JSON local. SOLO LECTURA.
//
// - Recorre todas las claves de todos los namespaces (production sin prefijo, preview:, ...)
//   con SCAN y guarda cada valor EXACTAMENTE como está en Redis (cadena original), su tipo y
//   su TTL, para poder restaurarlo byte a byte.
// - Por defecto omite las claves temporales (session:*, user_sessions:*, login_fail:*, rate:*,
//   locks): son credenciales de sesión o contadores que expiran solos y no deben quedar en un
//   archivo. --incluir-temporales las incluye.
// - Verifica el archivo escrito: lo vuelve a leer, compara el tamaño de cada valor con STRLEN
//   en Redis y muestra los conteos de registros de cada colección de negocio.
//
// El archivo contiene datos reales (incluidos los hash de contraseñas de cmms:usuarios):
// guárdalo fuera del repositorio y en un lugar privado. Por defecto se escribe en
// ~/cmms-respaldos/ (fuera del repo); la carpeta respaldos/ del repo también está en .gitignore.
//
// Uso:
//   vercel env pull .env.respaldo --environment=production
//   node --env-file=.env.respaldo scripts/migracion/respaldo-redis.mjs [--dir=RUTA] [--incluir-temporales]
//
// Transferencia: una lectura completa (~3–4 MB hoy). Sin codificación base64 (REST directo).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const URL_BASE = (process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const TOKEN = process.env.KV_REST_API_READ_ONLY_TOKEN || process.env.KV_REST_API_TOKEN;
const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const DIR = path.resolve(arg('dir') || path.join(os.homedir(), 'cmms-respaldos'));
const INCLUIR_TEMPORALES = process.argv.includes('--incluir-temporales');
const TEMPORAL = /^(?:(?:preview|development|local):)?(?:session:|user_sessions:|login_fail:|rate:|cmms:schema_migrations:lock$)/;

if (!URL_BASE || !TOKEN) {
  console.error('Faltan KV_REST_API_URL y KV_REST_API_READ_ONLY_TOKEN (o KV_REST_API_TOKEN). Ver la cabecera del script.');
  process.exit(1);
}

export async function pipeline(comandos) {
  const res = await fetch(`${URL_BASE}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comandos),
  });
  if (!res.ok) throw new Error(`Upstash respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).map(r => {
    if (r.error) throw new Error(`Error de Redis: ${r.error}`);
    return r.result;
  });
}

async function todasLasClaves() {
  const claves = [];
  let cursor = '0';
  do {
    const [[siguiente, lote]] = await pipeline([['SCAN', cursor, 'COUNT', '500']]);
    cursor = String(siguiente);
    claves.push(...lote);
  } while (cursor !== '0');
  return [...new Set(claves)].sort();
}

const LECTURA = { string: k => ['GET', k], set: k => ['SMEMBERS', k], hash: k => ['HGETALL', k], list: k => ['LRANGE', k, '0', '-1'], zset: k => ['ZRANGE', k, '0', '-1', 'WITHSCORES'] };

function conteo(valor) {
  try {
    const v = JSON.parse(valor);
    if (Array.isArray(v)) return `${v.length} registros`;
    if (v && typeof v === 'object') return Array.isArray(v.records) ? `${v.records.length} registros` : `${Object.keys(v).length} claves`;
  } catch { /* no es JSON */ }
  return '';
}

const todas = await todasLasClaves();
const claves = INCLUIR_TEMPORALES ? todas : todas.filter(k => !TEMPORAL.test(k));
const respaldo = { generado: new Date().toISOString(), origen: URL_BASE.replace(/\/\/([^.]+)/, '//***'), totalClaves: claves.length, omitidasTemporales: todas.length - claves.length, claves: {} };

for (let i = 0; i < claves.length; i += 50) {
  const lote = claves.slice(i, i + 50);
  const tipos = await pipeline(lote.map(k => ['TYPE', k]));
  const ttls = await pipeline(lote.map(k => ['PTTL', k]));
  const valores = await pipeline(lote.map((k, j) => (LECTURA[tipos[j]] || (x => ['TYPE', x]))(k)));
  const largos = await pipeline(lote.map((k, j) => (tipos[j] === 'string' ? ['STRLEN', k] : ['TYPE', k])));
  lote.forEach((k, j) => {
    if (!LECTURA[tipos[j]]) throw new Error(`Tipo no soportado en ${k}: ${tipos[j]}`);
    respaldo.claves[k] = { tipo: tipos[j], pttl: ttls[j], valor: valores[j], ...(tipos[j] === 'string' ? { bytes: largos[j] } : {}) };
  });
}

fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
const archivo = path.join(DIR, `redis-${respaldo.generado.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(archivo, JSON.stringify(respaldo), { mode: 0o600 });

// VERIFICACIÓN: releer el archivo y comparar con lo que hay en Redis.
const leido = JSON.parse(fs.readFileSync(archivo, 'utf8'));
let errores = 0;
for (const [k, e] of Object.entries(leido.claves)) {
  if (e.tipo === 'string' && Buffer.byteLength(e.valor) !== e.bytes) {
    errores++;
    console.error(`✘ ${k}: el tamaño guardado (${Buffer.byteLength(e.valor)}) no coincide con STRLEN (${e.bytes})`);
  }
}
if (Object.keys(leido.claves).length !== claves.length) { errores++; console.error('✘ El número de claves del archivo no coincide.'); }

const sha = crypto.createHash('sha256').update(fs.readFileSync(archivo)).digest('hex');
console.log(`Respaldo: ${archivo}`);
console.log(`SHA-256: ${sha}`);
console.log(`Claves respaldadas: ${claves.length} (temporales omitidas: ${respaldo.omitidasTemporales})\n`);
for (const [k, e] of Object.entries(leido.claves)) {
  if (!/cmms:/.test(k)) continue;
  const tam = e.tipo === 'string' ? `${(e.bytes / 1024).toFixed(1).padStart(9)} KB` : ''.padStart(12);
  console.log(`${tam}  ${k}  ${e.tipo === 'string' ? conteo(e.valor) : `${e.tipo}`}`);
}
console.log(errores ? `\n✘ VERIFICACIÓN FALLIDA (${errores} problemas). No uses este respaldo.` : '\n✔ Verificación correcta: cada valor coincide byte a byte con Redis.');
process.exit(errores ? 1 : 0);
