#!/usr/bin/env node
// scripts/copy-production-to-preview.mjs
// Copia los DATOS DE NEGOCIO de Production al namespace de Preview (o development/local) para
// poder probar un deployment de Preview con datos realistas SIN tocar Production.
//
//   - Production solo se LEE (nunca se escribe desde este script).
//   - NO copia usuarios, sesiones, contadores de login ni correos de alerta: Preview crea su
//     propio SUPER_ADMIN desde AUTH_USER/AUTH_PASSWORD_HASH (migración 002) y no debe enviar
//     alertas a destinatarios reales.
//   - Si el destino ya tiene datos, se detiene salvo que se pase --overwrite.
//
// Uso:
//   (credenciales de KV en .env.kv.local — ver docs/preview-production.md)
//   node --env-file=.env.kv.local scripts/copy-production-to-preview.mjs --to=preview [--overwrite]

import { rawKv } from '../lib/db.js';

const CLAVES = [
  'cmms:empresas',
  'cmms:equipos',
  'cmms:personal',
  'cmms:reportesFalla',
  'cmms:planesProgramas',
  'cmms:tecnoReportes',
  'cmms:tecnoTransversal',
  'cmms:limpiezaDesinfeccion',
  'cmms:limpiezaPlantillas',
  'cmms:capacitaciones',
];

const argv = process.argv.slice(2);
const to = (argv.find(a => a.startsWith('--to=')) || '').slice(5).trim().toLowerCase();
if (!['preview', 'development', 'local'].includes(to)) {
  console.error('Indica el destino: --to=preview | development | local (nunca production).');
  process.exit(1);
}
const overwrite = argv.includes('--overwrite');

try {
  const ocupadas = [];
  for (const k of CLAVES) if ((await rawKv.get(`${to}:${k}`)) !== null) ocupadas.push(k);
  if (ocupadas.length && !overwrite) {
    console.error(`El namespace "${to}" ya tiene datos (${ocupadas.join(', ')}). Usa --overwrite para reemplazarlos.`);
    process.exit(1);
  }
  for (const k of CLAVES) {
    const valor = await rawKv.get(k); // Production = claves sin prefijo (solo lectura)
    if (valor === null) { console.log(`· ${k}: vacío en production, se omite`); continue; }
    await rawKv.set(`${to}:${k}`, valor);
    console.log(`✔ ${k} → ${to}:${k}`);
  }
  console.log(`\nListo. El deployment de ${to} verá estos datos; Production no se modificó.`);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
