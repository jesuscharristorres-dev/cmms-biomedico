#!/usr/bin/env node
// scripts/migrate.mjs
// Ejecuta / revierte las migraciones multiempresa (lib/migrations.js) contra Vercel KV.
//
// Requiere las credenciales de KV en el entorno (KV_REST_API_URL y KV_REST_API_TOKEN).
// La forma más simple es traerlas de Vercel:
//   vercel env pull .env.local
//   node --env-file=.env.local scripts/migrate.mjs status
//   node --env-file=.env.local scripts/migrate.mjs up
//   node --env-file=.env.local scripts/migrate.mjs down 003_auditoria_sin_empresa
//   node --env-file=.env.local scripts/migrate.mjs audit      # informe de registros sin empresa
//
// Nota: no es obligatorio correrlo a mano — la app aplica las migraciones pendientes sola en
// la primera petición (lib/migrations.js → ensureSchema). Este script sirve para hacerlo de
// forma controlada, revisar el estado o revertir.

import { MIGRATIONS, getAplicadas, runPending, revert, auditarSinEmpresa } from '../lib/migrations.js';

const [cmd = 'status', arg] = process.argv.slice(2);

async function status() {
  const aplicadas = new Map((await getAplicadas()).map(a => [a.id, a.appliedAt]));
  MIGRATIONS.forEach(m => {
    const at = aplicadas.get(m.id);
    console.log(`${at ? '✔' : '·'} ${m.id}${at ? `  (aplicada ${at})` : '  (pendiente)'}\n    ${m.descripcion}`);
  });
}

try {
  if (cmd === 'status') await status();
  else if (cmd === 'up') {
    const nuevas = await runPending();
    console.log(nuevas.length ? `Aplicadas: ${nuevas.join(', ')}` : 'No hay migraciones pendientes (o 002 espera credenciales del SUPER_ADMIN).');
    await status();
  } else if (cmd === 'down') {
    if (!arg) throw new Error('Uso: migrate.mjs down <id>');
    await revert(arg);
    console.log(`Revertida: ${arg}`);
  } else if (cmd === 'audit') {
    const informe = await auditarSinEmpresa();
    console.log(`Registros sin empresa válida: ${informe.total}`);
    informe.items.forEach(i => console.log(`  [${i.coleccion}] ${i.id}  empresa=${JSON.stringify(i.empresaActual)}  ${i.etiqueta}`));
    informe.clavesHuerfanas.forEach(c => console.log(`  [${c.coleccion}] clave de empresa desconocida: ${c.empresaKey}`));
  } else {
    throw new Error(`Comando desconocido: ${cmd} (usa status | up | down <id> | audit)`);
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
