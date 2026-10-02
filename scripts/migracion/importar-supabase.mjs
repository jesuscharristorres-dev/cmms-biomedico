#!/usr/bin/env node
// scripts/migracion/importar-supabase.mjs
// Importa un respaldo de Redis (scripts/migracion/respaldo-redis.mjs) a Supabase.
// NO SE EJECUTA sin aprobación: es un paso del día de la migración (ver MIGRACION.md).
//
// - Valida primero el respaldo (ids duplicados, empresas inexistentes...): si hay problemas,
//   no importa nada y los lista.
// - Idempotente: crea o actualiza cada registro para que quede igual al respaldo; repetirlo no
//   duplica nada. Los archivos base64 se suben a Storage con ruta por contenido (SHA-256).
// - Por defecto SIMULA (no escribe). Para escribir hay que confirmar el proyecto destino:
//     --confirmar=<ref del proyecto>   (el subdominio de SUPABASE_URL; "local" para pruebas)
// - Si el proyecto ya tiene datos, se detiene; para re-ejecutar la MISMA migración: --actualizar
//
// Uso:
//   node --env-file=.env.supabase scripts/migracion/importar-supabase.mjs --respaldo=~/cmms-respaldos/redis-....json
//   node --env-file=.env.supabase scripts/migracion/importar-supabase.mjs --respaldo=... --confirmar=abcdxyz
// Opcional: --namespace=preview (importa las claves preview:* en lugar de las de Production).

import { leerRespaldo, validar, importar, conteosSupabase } from '../../lib/datos/migracion.js';

const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const archivo = arg('respaldo');
const namespace = arg('namespace') || 'production';
const confirmar = arg('confirmar');

if (!archivo) { console.error('Falta --respaldo=<archivo JSON de respaldo-redis.mjs>.'); process.exit(1); }
const url = process.env.SUPABASE_URL || process.env.SUPABASE_REST_URL || '';
const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] || (/localhost|127\.0\.0\.1/.test(url) ? 'local' : '');
if (!ref) { console.error('SUPABASE_URL no está configurada o no es reconocible.'); process.exit(1); }
const simular = confirmar !== ref;
if (confirmar && confirmar !== ref) { console.error(`--confirmar=${confirmar} no coincide con el proyecto de SUPABASE_URL (${ref}). No se escribe nada.`); process.exit(1); }

process.env.DATA_BACKEND = 'supabase';
const datos = leerRespaldo(archivo.replace(/^~/, process.env.HOME || '~'), namespace);
console.log(`Respaldo: ${archivo} (namespace ${namespace}) → Supabase: ${ref}${simular ? '  [SIMULACIÓN: no se escribe nada]' : ''}\n`);

const problemas = validar(datos);
if (problemas.length) {
  console.error(`✘ El respaldo tiene ${problemas.length} problema(s) que impedirían migrar sin pérdida. No se importó nada:`);
  problemas.slice(0, 50).forEach(p => console.error(`  - ${p}`));
  process.exit(1);
}
if (!simular) {
  const previos = await conteosSupabase();
  const conDatos = Object.values(previos).some(n => n > 0);
  console.log('Filas existentes en Supabase antes de importar:', previos);
  // Un proyecto con datos solo se acepta si es una re-ejecución de esta misma migración.
  if (conDatos && !process.argv.includes('--actualizar')) {
    console.error('\n✘ El proyecto de Supabase YA TIENE DATOS. Si es una re-ejecución de esta misma migración (mismo\n'
      + '  respaldo), repite con --actualizar. Si no, usa un proyecto vacío. No se escribió nada.');
    process.exit(1);
  }
}
const inicio = Date.now();
const resumen = await importar(datos, { simular, log: m => console.log(m) });
console.log(`\n${simular ? 'Se importaría' : '✔ Importado'} (${((Date.now() - inicio) / 1000).toFixed(1)} s):`);
for (const [k, v] of Object.entries(resumen)) console.log(`  ${k.padEnd(22)} ${v}`);
if (simular) console.log(`\nPara importar de verdad: --confirmar=${ref}`);
else console.log('\nSiguiente paso: node scripts/migracion/verificar-migracion.mjs --respaldo=... --muestra=10');
