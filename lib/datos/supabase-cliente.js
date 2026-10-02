// lib/datos/supabase-cliente.js
// Cliente mínimo de Supabase (PostgREST + Storage) sobre fetch, sin dependencias. Solo se usa
// en el SERVIDOR (funciones de Vercel y scripts), con la clave service_role: nunca llega al
// navegador.
//
// Variables de entorno:
//   SUPABASE_URL               https://<proyecto>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  clave service_role (secreta)
//   SUPABASE_REST_URL / SUPABASE_STORAGE_URL  (opcionales, solo para pruebas locales)

import { HttpError } from '../http.js';

export const BUCKET = 'archivos';
const PAGINA = 1000; // tope por petición de PostgREST en Supabase (db-max-rows)

function config() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const rest = (process.env.SUPABASE_REST_URL || (base && `${base}/rest/v1`)).replace(/\/$/, '');
  const storage = (process.env.SUPABASE_STORAGE_URL || (base && `${base}/storage/v1`)).replace(/\/$/, '');
  if (!rest || !clave) throw new Error('[lib/datos] DATA_BACKEND=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  return { rest, storage, clave };
}

export class ErrorSupabase extends Error {
  constructor(status, cuerpo) {
    super(`Supabase respondió ${status}: ${typeof cuerpo === 'string' ? cuerpo : cuerpo?.message || JSON.stringify(cuerpo)}`);
    this.status = status;
    this.code = cuerpo?.code;
    this.cuerpo = cuerpo;
  }
}

/** true si el error es el conflicto de versión de cmms_guardar (otro usuario guardó antes). */
export const esConflicto = (err) => err instanceof ErrorSupabase && (err.code === 'PT409' || err.code === '23505' || /cmms_conflicto/.test(err.cuerpo?.message || ''));

async function leerCuerpo(res) {
  const texto = await res.text();
  if (!texto) return null;
  try { return JSON.parse(texto); } catch { return texto; }
}

/**
 * Petición a PostgREST. `prefer`: p. ej. 'return=minimal', 'count=exact'.
 * Devuelve { datos, total } (total solo con count=exact).
 */
export async function rest(ruta, { method = 'GET', body, prefer, rango } = {}) {
  const { rest: base, clave } = config();
  // Respuestas comprimidas: el egress de Supabase se mide en bytes transferidos.
  const headers = { apikey: clave, Authorization: `Bearer ${clave}`, 'Accept-Encoding': 'gzip, br' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  if (rango) { headers.Range = `${rango[0]}-${rango[1]}`; headers['Range-Unit'] = 'items'; }
  const res = await fetch(`${base}/${ruta}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const datos = await leerCuerpo(res);
  if (!res.ok) throw new ErrorSupabase(res.status, datos);
  const cr = res.headers.get('content-range');
  const total = cr && cr.includes('/') ? Number(cr.split('/')[1]) : null;
  return { datos, total: Number.isFinite(total) ? total : null };
}

/** GET paginado: trae todas las filas aunque superen el tope por petición. */
export async function todas(ruta) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { datos } = await rest(ruta, { rango: [desde, desde + PAGINA - 1] });
    filas.push(...(datos || []));
    if (!datos || datos.length < PAGINA) return filas;
  }
}

export const rpc = (funcion, args) => rest(`rpc/${funcion}`, { method: 'POST', body: args }).then(r => r.datos);

/** Filtro PostgREST `in.(...)` con valores entre comillas (los ids pueden tener comas o espacios). */
export function enLista(valores) {
  return `in.(${valores.map(v => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
}
export const eq = (v) => `eq.${encodeURIComponent(String(v))}`;

// ---------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------
export async function subirArchivo(ruta, buffer, tipo) {
  const { storage, clave } = config();
  const res = await fetch(`${storage}/object/${BUCKET}/${ruta.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': tipo || 'application/octet-stream', 'x-upsert': 'true' },
    body: buffer,
  });
  if (!res.ok) throw new ErrorSupabase(res.status, await leerCuerpo(res));
}

/** URL firmada de descarga, válida `segundos` (el archivo se descarga solo cuando se abre). */
export async function urlFirmada(ruta, segundos = 60, { descargar = null } = {}) {
  const { storage, clave } = config();
  const res = await fetch(`${storage}/object/sign/${BUCKET}/${ruta.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: segundos }),
  });
  const cuerpo = await leerCuerpo(res);
  if (!res.ok) throw new HttpError(404);
  const relativa = cuerpo.signedURL || cuerpo.signedUrl;
  const url = new URL(relativa.startsWith('http') ? relativa : `${storage}${relativa.startsWith('/') ? '' : '/'}${relativa}`);
  if (descargar) url.searchParams.set('download', descargar);
  return url.toString();
}
