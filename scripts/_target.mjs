// scripts/_target.mjs
// Selección EXPLÍCITA del entorno (namespace de KV) para los scripts de mantenimiento.
// Preview y Production comparten hoy el mismo store de Vercel KV (ver lib/db.js), así que un
// script sin destino explícito podría escribir sobre datos reales. Todos los scripts exigen:
//   --env=production | preview | development | local
// y, para escribir en production, además --confirm-production.

const VALIDOS = ['production', 'preview', 'development', 'local'];

export function seleccionarEntorno(argv, { escribe = true } = {}) {
  const arg = argv.find(a => a.startsWith('--env='));
  const env = arg ? arg.slice('--env='.length).trim().toLowerCase() : '';
  if (!VALIDOS.includes(env)) {
    console.error(`Indica el entorno destino: --env=${VALIDOS.join('|')}`);
    process.exit(1);
  }
  if (escribe && env === 'production' && !argv.includes('--confirm-production')) {
    console.error('Vas a ESCRIBIR en los datos de PRODUCCIÓN. Repite el comando agregando --confirm-production.');
    process.exit(1);
  }
  process.env.KV_NAMESPACE = env;
  let host = '(sin KV_REST_API_URL)';
  try { host = new URL(process.env.KV_REST_API_URL).host; } catch { /* sin URL */ }
  console.log(`Destino: KV ${host} · namespace "${env}"${env === 'production' ? ' (claves sin prefijo — DATOS REALES)' : ` (claves "${env}:*")`}\n`);
  return env;
}

export function argumentosPosicionales(argv) {
  return argv.filter(a => !a.startsWith('--'));
}
