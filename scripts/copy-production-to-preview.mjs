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
import { EQUIPOS_IDS_KEY, equipoItemKey } from '../lib/equipos.js';
import { PERSONAL_IDS_KEY, personalItemKey } from '../lib/personal.js';
import { REPORTES_FALLA_IDS_KEY, reporteFallaItemKey } from '../lib/reportes-falla.js';

// Colecciones que ya no viven en un solo valor (una clave por registro, ver lib/equipos.js) —
// no entran en CLAVES porque no se copian con un simple get/set.
const COLECCIONES_POR_CLAVE = [
  { nombre: 'equipos', idsKey: EQUIPOS_IDS_KEY, itemKey: equipoItemKey },
  { nombre: 'personal', idsKey: PERSONAL_IDS_KEY, itemKey: personalItemKey },
  { nombre: 'reportesFalla', idsKey: REPORTES_FALLA_IDS_KEY, itemKey: reporteFallaItemKey },
];

const CLAVES = [
  'cmms:empresas',
  'cmms:equipos', // respaldo histórico (migración 004) — los vigentes se copian aparte, ver abajo
  'cmms:personal', // ídem, migración 005
  'cmms:reportesFalla', // ídem, migración 006
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
  // Production = claves sin prefijo (solo lectura).
  const idsPorColeccion = await Promise.all(COLECCIONES_POR_CLAVE.map(c => rawKv.smembers(c.idsKey)));

  const ocupadas = [];
  for (const k of CLAVES) if ((await rawKv.get(`${to}:${k}`)) !== null) ocupadas.push(k);
  for (const [i, c] of COLECCIONES_POR_CLAVE.entries()) {
    if (idsPorColeccion[i].length && (await rawKv.smembers(`${to}:${c.idsKey}`)).length) ocupadas.push(c.idsKey);
  }
  if (ocupadas.length && !overwrite) {
    console.error(`El namespace "${to}" ya tiene datos (${ocupadas.join(', ')}). Usa --overwrite para reemplazarlos.`);
    process.exit(1);
  }
  for (const k of CLAVES) {
    const valor = await rawKv.get(k);
    if (valor === null) { console.log(`· ${k}: vacío en production, se omite`); continue; }
    await rawKv.set(`${to}:${k}`, valor);
    console.log(`✔ ${k} → ${to}:${k}`);
  }
  // Una clave por registro (ver lib/equipos.js, lib/personal.js, lib/reportes-falla.js): se
  // copian aparte el índice de ids y cada registro.
  for (const [i, c] of COLECCIONES_POR_CLAVE.entries()) {
    const ids = idsPorColeccion[i];
    if (!ids.length) { console.log(`· ${c.nombre}: vacío en production, se omite`); continue; }
    const valores = await rawKv.mget(...ids.map(c.itemKey));
    await rawKv.sadd(`${to}:${c.idsKey}`, ...ids);
    for (const [j, id] of ids.entries()) {
      if (valores[j] !== null) await rawKv.set(`${to}:${c.itemKey(id)}`, valores[j]);
    }
    console.log(`✔ ${c.nombre} (${ids.length}) → ${to}:${c.idsKey} + ${to}:${c.itemKey('*')}`);
  }
  console.log(`\nListo. El deployment de ${to} verá estos datos; Production no se modificó.`);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
