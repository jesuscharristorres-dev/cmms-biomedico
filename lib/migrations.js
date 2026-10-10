// lib/migrations.js
// Migraciones VERSIONADAS del esquema multiempresa sobre Vercel KV.
//
// Este proyecto no usa una base SQL: todo vive en Vercel KV (Redis) como documentos JSON bajo
// claves `cmms:*`. No hay ALTER TABLE ni FOREIGN KEY nativas, así que las "migraciones" son
// funciones idempotentes `up`/`down` registradas aquí, y la integridad referencial
// (empresa_id → empresas.id) se garantiza en la capa de acceso a datos (lib/tenancy.js,
// lib/usuarios.js) en cada escritura.
//
// Las migraciones aplicadas se registran en `cmms:schema_migrations`. Se ejecutan:
//   - automáticamente (ensureSchema) en la primera petición autenticada de cada instancia
//     serverless — así un despliegue nuevo funciona sin pasos manuales; y
//   - manualmente con `node scripts/migrate.mjs` (status / up / down <id>).
//
// Ninguna migración modifica ni borra registros existentes de negocio (equipos, personal,
// reportes...). El campo `empresa` que ya tenían es, desde ahora, la clave foránea
// `empresa_id`: las 5 empresas sembradas conservan exactamente esas claves.

import { kv } from './db.js';
import { EMPRESAS_KEY, EMPRESAS_SEED, listEmpresas, saveEmpresas, nuevaEmpresaBase } from './empresas.js';
import { USUARIOS_KEY, listUsuarios, saveUsuarios } from './usuarios.js';
import crypto from 'node:crypto';

export const MIGRATIONS_KEY = 'cmms:schema_migrations';
export const SIN_EMPRESA_KEY = 'cmms:migracion:sin_empresa';

// Colecciones de negocio con `empresa` por registro (arreglos) y por clave (objetos).
export const COLECCIONES_ARRAY = [
  { coleccion: 'equipos', key: 'cmms:equipos', etiqueta: r => [r.equipo, r.marca, r.modelo, r.numeroSerie].filter(Boolean).join(' — ') },
  { coleccion: 'personal', key: 'cmms:personal', etiqueta: r => r.nombreCompleto || r.numeroDocumento || '' },
  { coleccion: 'reportesFalla', key: 'cmms:reportesFalla', etiqueta: r => [r.equipoNombre, r.fecha].filter(Boolean).join(' — ') },
];
export const COLECCIONES_OBJETO = [
  { coleccion: 'planesProgramas', key: 'cmms:planesProgramas' },
  { coleccion: 'tecnoReportes', key: 'cmms:tecnoReportes' },
  { coleccion: 'tecnoComites', key: 'cmms:tecnoComites' },
  { coleccion: 'limpiezaDesinfeccion', key: 'cmms:limpiezaDesinfeccion' },
  { coleccion: 'limpiezaPlantillas', key: 'cmms:limpiezaPlantillas' },
];

/** Genera el informe de registros cuyo `empresa` no corresponde a ninguna empresa existente. */
export async function auditarSinEmpresa() {
  const ids = new Set((await listEmpresas()).map(e => e.id));
  const items = [];
  for (const c of COLECCIONES_ARRAY) {
    const list = (await kv.get(c.key)) || [];
    if (!Array.isArray(list)) continue;
    list.forEach(r => {
      if (!r || ids.has(r.empresa)) return;
      items.push({ coleccion: c.coleccion, id: r.id, empresaActual: r.empresa ?? null, etiqueta: c.etiqueta(r) });
    });
  }
  const clavesHuerfanas = [];
  for (const c of COLECCIONES_OBJETO) {
    const obj = (await kv.get(c.key)) || {};
    Object.keys(obj).forEach(k => { if (!ids.has(k)) clavesHuerfanas.push({ coleccion: c.coleccion, empresaKey: k }); });
  }
  const informe = { generatedAt: new Date().toISOString(), total: items.length, items, clavesHuerfanas };
  await kv.set(SIN_EMPRESA_KEY, informe);
  return informe;
}

function superAdminDesdeEnv() {
  const email = (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const hash = process.env.SUPERADMIN_PASSWORD_HASH || process.env.AUTH_PASSWORD_HASH;
  const legacyUser = (process.env.AUTH_USER || '').trim();
  if (!hash || (!email && !legacyUser)) return null;
  const legacyEsEmail = legacyUser.includes('@');
  return {
    nombre: (process.env.SUPERADMIN_NOMBRE || '').trim() || 'Administrador global',
    email: email || (legacyEsEmail ? legacyUser.toLowerCase() : ''),
    username: legacyEsEmail ? '' : legacyUser,
    password_hash: hash,
  };
}

export const MIGRATIONS = [
  {
    id: '001_empresas',
    descripcion: 'Crea la colección de empresas con las 5 empresas existentes (ids = claves históricas).',
    async up() {
      const actuales = await listEmpresas();
      const existentes = new Set(actuales.map(e => e.id));
      const faltantes = EMPRESAS_SEED.filter(e => !existentes.has(e.id)).map(e => nuevaEmpresaBase(e));
      if (faltantes.length) await saveEmpresas([...actuales, ...faltantes]);
      return true;
    },
    async down() {
      const usuarios = await listUsuarios();
      if (usuarios.some(u => u.empresa_id)) throw new Error('Hay usuarios asignados a empresas; elimínalos o reasígnalos antes de revertir 001.');
      await kv.del(EMPRESAS_KEY);
    },
  },
  {
    id: '002_super_admin',
    descripcion: 'Crea el SUPER_ADMIN inicial a partir de variables de entorno (SUPERADMIN_* o las históricas AUTH_USER/AUTH_PASSWORD_HASH).',
    async up() {
      const usuarios = await listUsuarios();
      if (usuarios.some(u => u.role === 'SUPER_ADMIN')) return true;
      const datos = superAdminDesdeEnv();
      if (!datos) return false; // sin credenciales configuradas: se reintenta en la próxima ejecución
      const now = new Date().toISOString();
      await saveUsuarios([...usuarios, {
        id: `usr_${crypto.randomBytes(9).toString('hex')}`,
        ...datos,
        role: 'SUPER_ADMIN',
        empresa_id: null,
        estado: 'activo',
        creado_por_migracion: true,
        created_at: now,
        updated_at: now,
      }]);
      return true;
    },
    async down() {
      const usuarios = await listUsuarios();
      const restantes = usuarios.filter(u => !u.creado_por_migracion);
      if (restantes.length) await saveUsuarios(restantes);
      else await kv.del(USUARIOS_KEY);
    },
  },
  {
    id: '003_auditoria_sin_empresa',
    descripcion: 'Detecta registros existentes sin empresa válida y los lista para asignación manual (no modifica datos).',
    async up() {
      await auditarSinEmpresa();
      return true;
    },
    async down() {
      await kv.del(SIN_EMPRESA_KEY);
    },
  },
];

export async function getAplicadas() {
  const list = await kv.get(MIGRATIONS_KEY);
  return Array.isArray(list) ? list : [];
}

const LOCK_KEY = 'cmms:schema_migrations:lock';
const LOCK_TTL_SECONDS = 30;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Ejecuta las migraciones pendientes en orden, bajo un candado (SET NX con expiración) para
 * que dos instancias serverless arrancando a la vez no las ejecuten en paralelo (p. ej. dos
 * SUPER_ADMIN creados por la 002). Si otra instancia tiene el candado, espera a que termine.
 * Devuelve los ids aplicados en esta corrida.
 */
export async function runPending() {
  for (let intento = 0; intento < 20; intento++) {
    const obtenido = await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: LOCK_TTL_SECONDS });
    if (obtenido) {
      try {
        return await aplicarPendientes();
      } finally {
        await kv.del(LOCK_KEY);
      }
    }
    await sleep(500);
  }
  throw new Error('No se pudo obtener el candado de migraciones (otra instancia lo mantiene).');
}

async function aplicarPendientes() {
  const aplicadas = await getAplicadas();
  const hechas = new Set(aplicadas.map(a => a.id));
  const nuevas = [];
  for (const m of MIGRATIONS) {
    if (hechas.has(m.id)) continue;
    const ok = await m.up();
    if (!ok) continue;
    aplicadas.push({ id: m.id, appliedAt: new Date().toISOString() });
    await kv.set(MIGRATIONS_KEY, aplicadas);
    nuevas.push(m.id);
  }
  return nuevas;
}

export async function revert(id) {
  const m = MIGRATIONS.find(x => x.id === id);
  if (!m) throw new Error(`Migración desconocida: ${id}`);
  await m.down();
  const aplicadas = (await getAplicadas()).filter(a => a.id !== id);
  await kv.set(MIGRATIONS_KEY, aplicadas);
}

// Memo por instancia serverless: solo la primera petición paga el costo de revisar.
// Primero se LEE qué migraciones están aplicadas; el candado (una escritura SET NX + DEL)
// solo se toma si de verdad hay algo pendiente. Antes se escribía el candado en el primer
// request de cada instancia aunque todo estuviera aplicado: escrituras innecesarias y, si la
// base de datos rechaza escrituras (p. ej. por límite del plan), un fallo de TODO request.
let ensurePromise = null;
async function ensurePendientes() {
  const hechas = new Set((await getAplicadas()).map(a => a.id));
  if (MIGRATIONS.every(m => hechas.has(m.id))) return [];
  return runPending();
}
export function ensureSchema() {
  if (!ensurePromise) {
    ensurePromise = ensurePendientes().catch(err => { ensurePromise = null; throw err; });
  }
  return ensurePromise;
}
/** Solo para tests. */
export function resetEnsureSchemaForTests() { ensurePromise = null; }
