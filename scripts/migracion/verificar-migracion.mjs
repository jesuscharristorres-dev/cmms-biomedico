#!/usr/bin/env node
// scripts/migracion/verificar-migracion.mjs
// Compara Supabase con el respaldo de Redis, colección por colección, leyendo Supabase con la
// MISMA capa de datos que usará la app (lib/datos/supabase.js). Solo lectura.
//
//   node --env-file=.env.supabase scripts/migracion/verificar-migracion.mjs --respaldo=<archivo> [--muestra=10] [--namespace=preview]
//
// --muestra=N descarga N archivos de Storage y verifica su contenido (SHA-256) byte a byte.
// Termina con código 0 solo si TODO coincide.

import { leerRespaldo, verificar } from '../../lib/datos/migracion.js';

const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const archivo = arg('respaldo');
if (!archivo) { console.error('Falta --respaldo=<archivo JSON de respaldo-redis.mjs>.'); process.exit(1); }
process.env.DATA_BACKEND = 'supabase';

const datos = leerRespaldo(archivo.replace(/^~/, process.env.HOME || '~'), arg('namespace') || 'production');
const filas = await verificar(datos, { descargarMuestra: Number(arg('muestra') || 0) });
console.log('COLECCIÓN                      RESPALDO  SUPABASE  RESULTADO');
for (const f of filas) {
  console.log(`${f.coleccion.padEnd(30)} ${String(f.esperado).padStart(8)}  ${String(f.encontrado).padStart(8)}  ${f.ok ? '✔ igual' : `✘ DIFERENTE ${f.detalle}`}`);
}
const ok = filas.every(f => f.ok);
console.log(ok ? '\n✔ Verificación correcta: Supabase coincide con el respaldo.' : '\n✘ Hay diferencias: NO cambies DATA_BACKEND hasta resolverlas.');
process.exit(ok ? 0 : 1);
