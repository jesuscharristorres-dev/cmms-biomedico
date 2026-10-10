#!/usr/bin/env node
// scripts/redis-tamanos.mjs
// Auditoría de SOLO LECTURA del store de Vercel KV / Upstash Redis: lista todas las claves
// (de todos los namespaces: production sin prefijo, preview:, development:, local:) con su
// tipo, tamaño aproximado y TTL, ordenadas de mayor a menor.
//
// No descarga ningún valor (eso consumiría ancho de banda): usa SCAN, TYPE, TTL, STRLEN/SCARD y
// MEMORY USAGE, que solo devuelven números. Nunca escribe ni borra nada.
//
// Credenciales: las mismas variables de la integración de Vercel. Se prefiere el token de
// solo lectura (KV_REST_API_READ_ONLY_TOKEN); si falta, usa KV_REST_API_TOKEN.
//   vercel env pull .env.audit --environment=production      (el archivo .env* está en .gitignore)
//   node --env-file=.env.audit scripts/redis-tamanos.mjs [--json]
//
// Costo aproximado: 1 comando SCAN por cada 200 claves + 4 comandos por clave (cientos de
// comandos en total, frente a 500.000/mes del plan gratuito) y unos pocos KB de transferencia.

const URL_BASE = (process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const TOKEN = process.env.KV_REST_API_READ_ONLY_TOKEN || process.env.KV_REST_API_TOKEN;
const COMO_JSON = process.argv.includes('--json');

if (!URL_BASE || !TOKEN) {
  console.error('Faltan KV_REST_API_URL y KV_REST_API_READ_ONLY_TOKEN (o KV_REST_API_TOKEN). Ver la cabecera de este script.');
  process.exit(1);
}

async function pipeline(comandos) {
  const res = await fetch(`${URL_BASE}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comandos),
  });
  if (!res.ok) throw new Error(`Upstash respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).map(r => (r.error ? { error: r.error } : r.result));
}

async function todasLasClaves() {
  const claves = [];
  let cursor = '0';
  do {
    const [[siguiente, lote]] = await pipeline([['SCAN', cursor, 'COUNT', '200']]);
    cursor = String(siguiente);
    claves.push(...lote);
  } while (cursor !== '0');
  return claves.sort();
}

function namespaceDe(clave) {
  const m = /^(preview|development|local):/.exec(clave);
  return m ? m[1] : 'production';
}

const fmt = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

const claves = await todasLasClaves();
const filas = [];
for (let i = 0; i < claves.length; i += 50) {
  const lote = claves.slice(i, i + 50);
  const tipos = await pipeline(lote.map(k => ['TYPE', k]));
  const resultados = await pipeline(lote.flatMap((k, j) => [
    ['TTL', k],
    ['MEMORY', 'USAGE', k],
    tipos[j] === 'string' ? ['STRLEN', k] : tipos[j] === 'set' ? ['SCARD', k] : ['EXISTS', k],
  ]));
  lote.forEach((k, j) => {
    const [ttl, memoria, longitud] = resultados.slice(j * 3, j * 3 + 3);
    filas.push({
      clave: k,
      namespace: namespaceDe(k),
      tipo: tipos[j],
      bytesValor: tipos[j] === 'string' && typeof longitud === 'number' ? longitud : null,
      miembros: tipos[j] === 'set' && typeof longitud === 'number' ? longitud : null,
      memoriaUsage: typeof memoria === 'number' ? memoria : null,
      ttl: typeof ttl === 'number' ? ttl : null, // -1 = sin TTL
    });
  });
}

const tamano = (f) => f.memoriaUsage ?? f.bytesValor ?? 0;
filas.sort((a, b) => tamano(b) - tamano(a));

if (COMO_JSON) {
  console.log(JSON.stringify(filas, null, 2));
  process.exit(0);
}

// Agrupa las claves temporales (una por sesión, intento de login, etc.) para que no tapen el informe.
const grupo = (k) => k.replace(/^(preview:|development:|local:)?/, '$1')
  .replace(/(session:|user_sessions:|login_fail:(?:user|ip):|rate:)[^]*$/, '$1*');
const grupos = new Map();
for (const f of filas) {
  const g = grupo(f.clave);
  const acc = grupos.get(g) || { clave: g, tipo: f.tipo, n: 0, bytes: 0, sinTtl: 0 };
  acc.n += 1;
  acc.bytes += tamano(f);
  if (f.ttl === -1) acc.sinTtl += 1;
  grupos.set(g, acc);
}

console.log(`Claves totales: ${filas.length} · tamaño total aprox.: ${fmt(filas.reduce((s, f) => s + tamano(f), 0))}\n`);
console.log('TAMAÑO      CLAVES  SIN TTL  TIPO     CLAVE (agrupada)');
for (const g of [...grupos.values()].sort((a, b) => b.bytes - a.bytes)) {
  console.log(`${fmt(g.bytes).padStart(10)}  ${String(g.n).padStart(6)}  ${String(g.sinTtl).padStart(7)}  ${String(g.tipo).padEnd(7)}  ${g.clave}`);
}
console.log('\nTamaño = MEMORY USAGE (o STRLEN si no está disponible). "SIN TTL" = claves que nunca expiran.');

// --detalle-equipos: descarga UNA vez `cmms:equipos` (Production, ~3 MB de transferencia) y
// muestra qué campos ocupan más, incluidos documentos antiguos guardados en base64.
if (process.argv.includes('--detalle-equipos')) {
  const [crudo] = await pipeline([['GET', 'cmms:equipos']]);
  const equipos = typeof crudo === 'string' ? JSON.parse(crudo) : [];
  const porCampo = new Map();
  let docsBase64 = 0, bytesBase64 = 0;
  for (const e of equipos) {
    for (const [campo, valor] of Object.entries(e || {})) {
      porCampo.set(campo, (porCampo.get(campo) || 0) + JSON.stringify(valor ?? null).length);
    }
    for (const d of Array.isArray(e?.documentos) ? e.documentos : []) {
      if (typeof d?.archivoDatos === 'string' && d.archivoDatos.startsWith('data:')) {
        docsBase64 += 1;
        bytesBase64 += d.archivoDatos.length;
      }
    }
  }
  const total = JSON.stringify(equipos).length;
  console.log(`\ncmms:equipos — ${equipos.length} equipos, ${fmt(total)} (${fmt(total / Math.max(1, equipos.length))} por equipo)`);
  console.log(`Documentos con archivo en base64 dentro de equipos: ${docsBase64} (${fmt(bytesBase64)})`);
  console.log('Campos que más ocupan:');
  [...porCampo].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([campo, n]) => console.log(`${fmt(n).padStart(10)}  ${(100 * n / total).toFixed(1).padStart(5)} %  ${campo}`));
}
