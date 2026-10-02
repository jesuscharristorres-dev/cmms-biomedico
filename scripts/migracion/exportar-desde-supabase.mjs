#!/usr/bin/env node
// scripts/migracion/exportar-desde-supabase.mjs
// Exporta TODOS los datos de Supabase (incluidos los archivos de Storage, reincorporados como
// Data URI) a un JSON con el MISMO formato que scripts/migracion/respaldo-redis.mjs. SOLO LECTURA.
//
// Para qué:
//   1. Respaldo periódico completo (el plan gratuito de Supabase no tiene copias de seguridad).
//   2. Reversión a Redis sin perder lo escrito en Supabase: este archivo se carga en Redis con
//      scripts/migracion/restaurar-redis.mjs (ver MIGRACION.md → Plan de reversión).
//
//   node --env-file=.env.supabase scripts/migracion/exportar-desde-supabase.mjs [--dir=RUTA]
//
// El archivo contiene datos reales (incluidos hash de contraseñas): guárdalo en un lugar privado.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { exportar } from '../../lib/datos/migracion.js';

const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const DIR = path.resolve(arg('dir') || path.join(os.homedir(), 'cmms-respaldos'));
process.env.DATA_BACKEND = 'supabase';

const respaldo = await exportar();
fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
const archivo = path.join(DIR, `supabase-${respaldo.generado.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(archivo, JSON.stringify(respaldo), { mode: 0o600 });
const sha = crypto.createHash('sha256').update(fs.readFileSync(archivo)).digest('hex');
console.log(`Exportado: ${archivo}\nSHA-256: ${sha}\n`);
for (const [k, e] of Object.entries(respaldo.claves)) {
  const v = JSON.parse(e.valor);
  const n = Array.isArray(v) ? `${v.length} registros` : Array.isArray(v?.records) ? `${v.records.length} registros` : `${Object.keys(v || {}).length} claves`;
  console.log(`${(e.bytes / 1024).toFixed(1).padStart(10)} KB  ${k}  ${n}`);
}
