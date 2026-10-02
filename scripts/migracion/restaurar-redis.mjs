#!/usr/bin/env node
// scripts/migracion/restaurar-redis.mjs
// Carga en Redis las claves de NEGOCIO de un respaldo (de respaldo-redis.mjs o de
// exportar-desde-supabase.mjs). Es el paso de REVERSIÓN de la migración: SOBRESCRIBE los datos
// de Redis, por eso exige confirmación explícita y que antes se haya respaldado Redis.
//
//   node --env-file=.env.respaldo scripts/migracion/restaurar-redis.mjs --respaldo=<archivo> \
//        --namespace=production --confirmar=SOBRESCRIBIR-production
//
// - Solo escribe las claves cmms:* de negocio presentes en el respaldo (nunca sesiones,
//   contadores ni migraciones) y sube su `:version` para invalidar las cachés de la app.
// - Sin --confirmar solo muestra qué escribiría.

import fs from 'node:fs';
import { CLAVES } from '../../lib/datos/migracion.js';

const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const archivo = arg('respaldo');
const namespace = arg('namespace') || 'production';
const confirmado = arg('confirmar') === `SOBRESCRIBIR-${namespace}`;
const URL_BASE = (process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const TOKEN = process.env.KV_REST_API_TOKEN;
if (!archivo || !URL_BASE || !TOKEN) {
  console.error('Uso: --respaldo=<archivo> [--namespace=production] --confirmar=SOBRESCRIBIR-<namespace>; requiere KV_REST_API_URL y KV_REST_API_TOKEN.');
  process.exit(1);
}
const respaldo = JSON.parse(fs.readFileSync(archivo.replace(/^~/, process.env.HOME || '~'), 'utf8'));
const origenPrefijo = respaldo.origen === 'supabase' ? '' : (arg('namespace-origen') ? `${arg('namespace-origen')}:` : '');
const destino = namespace === 'production' ? '' : `${namespace}:`;

const comandos = [];
for (const clave of Object.values(CLAVES)) {
  const e = respaldo.claves[`${origenPrefijo}${clave}`];
  if (!e) continue;
  JSON.parse(e.valor); // valida que sea JSON antes de escribir nada
  comandos.push(['SET', `${destino}${clave}`, e.valor], ['INCR', `${destino}${clave}:version`]);
}
console.log(`${confirmado ? 'Escribiendo' : 'SIMULACIÓN — se escribirían'} ${comandos.length / 2} claves en el namespace "${namespace}":`);
comandos.filter(c => c[0] === 'SET').forEach(c => console.log(`  ${c[1]}  (${(Buffer.byteLength(c[2]) / 1024).toFixed(1)} KB)`));
if (!confirmado) {
  console.log(`\nPara escribir de verdad (después de respaldar Redis): --confirmar=SOBRESCRIBIR-${namespace}`);
  process.exit(0);
}
const res = await fetch(`${URL_BASE}/pipeline`, {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(comandos),
});
const out = await res.json();
const errores = (Array.isArray(out) ? out : [out]).filter(r => r.error);
if (!res.ok || errores.length) { console.error('✘ Error al escribir en Redis:', errores[0]?.error || res.status); process.exit(1); }
console.log('\n✔ Restaurado. Verifica en la app (DATA_BACKEND=redis) antes de reabrir escrituras.');
