// tests/helpers.js
// Utilidades para probar los handlers serverless reales (api/*.js) sin Vercel ni KV real:
// KV en memoria (lib/db.js → setKvForTests) + objetos req/res mínimos compatibles.

import { createMemoryKv, setKvForTests } from '../lib/db.js';
import { resetEnsureSchemaForTests } from '../lib/migrations.js';
import { hashPassword } from '../lib/password.js';

export const ADMIN_USER = 'jesus.charris';
export const ADMIN_PASS = 'ClaveSuperAdmin-2026';
export const EMPRESAS = ['MACROMED', 'MEIDE', 'NP MEDICAL', 'DIAGNOSTIK', 'AUNAR SALUD'];
export const SEDES = { MACROMED: 'Bogotá', MEIDE: 'La Dorada', 'NP MEDICAL': 'Tunja', DIAGNOSTIK: 'Chapinero', 'AUNAR SALUD': 'Neiva' };

/** Datos "heredados" (formato previo a multiempresa): 2 equipos por empresa + 1 huérfano. */
export function datosHeredados() {
  const equipos = [];
  EMPRESAS.forEach((emp, i) => {
    [1, 2].forEach(n => equipos.push({
      id: `eq_${i}_${n}`, empresa: emp, sede: SEDES[emp], equipo: `Monitor ${emp} ${n}`, marca: 'Mindray',
      modelo: 'X', numeroSerie: `SN${i}${n}`, preventivos: [], correctivos: [], calibraciones: [], observaciones: 'interna',
    }));
  });
  equipos.push({ id: 'eq_huerfano', empresa: 'EMPRESA VIEJA', sede: 'X', equipo: 'Huérfano' });
  const personal = EMPRESAS.map((emp, i) => ({ id: `per_${i}`, empresa: emp, nombreCompleto: `Persona ${emp}` }));
  const reportesFalla = EMPRESAS.map((emp, i) => ({ id: `rf_${i}`, empresa: emp, sede: SEDES[emp], equipoId: `eq_${i}_1`, estado: 'Reportado' }));
  const planesProgramas = Object.fromEntries(EMPRESAS.map(e => [e, { plan: `https://ex.com/${encodeURIComponent(e)}` }]));
  return {
    'cmms:equipos': equipos,
    'cmms:personal': personal,
    'cmms:reportesFalla': reportesFalla,
    'cmms:planesProgramas': planesProgramas,
    'cmms:tecnoTransversal': { invima: 'https://global.example/doc', manual: Object.fromEntries(EMPRESAS.map(e => [e, `https://m/${e}`])) },
    'cmms:tecnoReportes': Object.fromEntries(EMPRESAS.map(e => [e, { s: { 2026: { 1: 'x' } } }])),
    'cmms:tecnoComites': Object.fromEntries(EMPRESAS.map(e => [e, { 2026: { t1: {
      url: `https://meet.example/${encodeURIComponent(e)}`, nombreComite: 'Comité Q1', fechaReunion: '2026-03-15',
      estado: 'Realizado', observaciones: '', updatedAt: '2026-03-16T00:00:00.000Z',
    } } }])),
    'cmms:limpiezaDesinfeccion': Object.fromEntries(EMPRESAS.map(e => [e, {}])),
    'cmms:limpiezaPlantillas': {},
    'cmms:capacitaciones': { records: EMPRESAS.map((e, i) => ({ id: `c${i}`, empresa: e })).concat({ id: 'cx', empresa: 'OTRAS' }), errores: [{ id: 'z' }], capacitacionesConfiguradas: [] },
  };
}

export function setupStore(initial = datosHeredados()) {
  const store = createMemoryKv(initial);
  setKvForTests(store);
  resetEnsureSchemaForTests();
  // Los datos de prueba se siembran con las claves de production (sin prefijo).
  process.env.KV_NAMESPACE = 'production';
  process.env.AUTH_USER = ADMIN_USER;
  process.env.AUTH_PASSWORD_HASH = hashPassword(ADMIN_PASS);
  delete process.env.SUPERADMIN_EMAIL;
  delete process.env.SUPERADMIN_PASSWORD_HASH;
  return store;
}

/** Ejecuta un handler con una petición simulada. Devuelve { status, body, headers }. */
export async function call(handler, { method = 'GET', query = {}, body, cookie } = {}) {
  const req = { method, query, body, headers: { cookie: cookie || '', 'x-forwarded-for': '10.0.0.1' }, socket: {} };
  const out = { status: 200, body: undefined, headers: {} };
  const res = {
    status(code) { out.status = code; return res; },
    json(obj) { out.body = obj; return res; },
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; return res; },
  };
  await handler(req, res);
  return out;
}

export function cookieFrom(response) {
  const sc = response.headers['set-cookie'];
  if (!sc) return '';
  return String(sc).split(';')[0];
}
