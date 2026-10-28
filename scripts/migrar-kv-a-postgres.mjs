#!/usr/bin/env node
// scripts/migrar-kv-a-postgres.mjs
// Migra los datos reales de Vercel KV a PostgreSQL — Fase 4 del plan de migración fuera de
// Vercel, pensado para correr en la ventana de corte (Fase 5), después de practicar con
// --from=preview --dry-run (sin tocar nada real).
//
// Requiere en el entorno:
//   KV_REST_API_URL / KV_REST_API_TOKEN   → de dónde se LEE (Vercel KV)
//   DATABASE_URL                          → a dónde se ESCRIBE (PostgreSQL, el servidor nuevo)
//
// Uso:
//   (credenciales de KV en .env.kv.local — ver docs/preview-production.md)
//   DATABASE_URL=postgres://... node --env-file=.env.kv.local scripts/migrar-kv-a-postgres.mjs --from=preview --dry-run
//   DATABASE_URL=postgres://... node --env-file=.env.kv.local scripts/migrar-kv-a-postgres.mjs --from=preview
//   DATABASE_URL=postgres://... node --env-file=.env.kv.local scripts/migrar-kv-a-postgres.mjs --from=production --confirm-production
//
// --dry-run: solo LEE de Vercel KV y muestra qué hay — no toca PostgreSQL ni requiere
//            DATABASE_URL. Úsalo primero para confirmar que ve los datos correctos.
// Sin --dry-run: escribe en PostgreSQL (crea las tablas si no existen) y luego vuelve a leer
//            AMBOS lados para confirmar que coinciden EXACTAMENTE antes de darlo por bueno.
//            Vercel KV nunca se modifica — este script solo lee de ahí.
//
// Solo mueve las claves "de documento" conocidas (ver CLAVES abajo) — nunca sesiones
// (session:*, user_sessions:*) ni contadores de fuerza bruta (login_fail:*, rate:*): son datos
// efímeros que no tiene sentido migrar; los usuarios simplemente inician sesión de nuevo
// después del corte.

import pg from 'pg';
import { kv as vercelKv } from '@vercel/kv';
import { keyPrefix } from '../lib/db.js';
import { createPostgresKv } from '../lib/db-postgres.js';
import { EMPRESAS_KEY } from '../lib/empresas.js';
import { USUARIOS_KEY } from '../lib/usuarios.js';
import { MIGRATIONS_KEY, SIN_EMPRESA_KEY, COLECCIONES_ARRAY, COLECCIONES_OBJETO } from '../lib/migrations.js';

// Todas las claves "de documento" del sistema. Si se agrega una colección nueva (un nuevo
// api/*.js con su propia clave de KV que no pasa por lib/migrations.js), agregarla aquí también.
const CLAVES = [
  EMPRESAS_KEY,
  USUARIOS_KEY,
  MIGRATIONS_KEY,
  SIN_EMPRESA_KEY,
  ...COLECCIONES_ARRAY.map(c => c.key),
  ...COLECCIONES_OBJETO.map(c => c.key),
  'cmms:tecnoTransversal', // api/tecno-transversal.js
  'cmms:capacitaciones',   // api/capacitaciones.js
  'cmms:alertEmails',      // api/send-email.js
];

const VALIDOS = ['production', 'preview', 'development', 'local'];
const argv = process.argv.slice(2);
const from = (argv.find(a => a.startsWith('--from=')) || '').slice('--from='.length).trim().toLowerCase();
const dryRun = argv.includes('--dry-run');

if (!VALIDOS.includes(from)) {
  console.error(`Indica el origen: --from=${VALIDOS.join('|')}`);
  process.exit(1);
}
if (from === 'production' && !argv.includes('--confirm-production')) {
  console.error('Vas a LEER datos reales de PRODUCCIÓN. Repite el comando agregando --confirm-production.');
  process.exit(1);
}
process.env.KV_NAMESPACE = from; // para que keyPrefix() lea del namespace correcto

function resumen(valor) {
  if (valor == null) return '(vacío)';
  const registros = Array.isArray(valor) ? `${valor.length} registros, ` : '';
  return `${registros}${JSON.stringify(valor).length} caracteres`;
}

async function leerOrigen() {
  const prefijo = keyPrefix();
  const datos = new Map();
  for (const clave of CLAVES) datos.set(clave, (await vercelKv.get(`${prefijo}${clave}`)) ?? null);
  return datos;
}

async function main() {
  console.log(`Leyendo de Vercel KV — namespace "${from}"${from === 'production' ? ' (DATOS REALES)' : ''}...\n`);
  const origen = await leerOrigen();
  for (const clave of CLAVES) console.log(`  ${clave.padEnd(32)} ${resumen(origen.get(clave))}`);

  if (dryRun) {
    console.log('\n--dry-run: no se escribió nada en PostgreSQL.');
    return;
  }

  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('Falta DATABASE_URL en el entorno (destino en PostgreSQL).');

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const destino = createPostgresKv(pool); // crea kv_store/kv_sets solo si no existen aún

  console.log('\nEscribiendo en PostgreSQL...');
  for (const clave of CLAVES) {
    const valor = origen.get(clave);
    if (valor == null) { console.log(`· ${clave}: vacío en el origen, se omite`); continue; }
    await destino.set(clave, valor);
  }

  console.log('\nVerificando que PostgreSQL coincide exactamente con Vercel KV...');
  let ok = true;
  for (const clave of CLAVES) {
    const esperado = JSON.stringify(origen.get(clave) ?? null);
    const actual = JSON.stringify((await destino.get(clave)) ?? null);
    const igual = esperado === actual;
    console.log(`  ${igual ? '✔' : '✖'} ${clave}`);
    if (!igual) ok = false;
  }
  await pool.end();

  if (!ok) {
    console.error('\nALGUNA CLAVE NO COINCIDE — no continúes con el corte hasta resolverlo.');
    process.exit(1);
  }
  console.log('\nListo: PostgreSQL ya tiene una copia exacta de los datos. Vercel KV no se modificó.');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
