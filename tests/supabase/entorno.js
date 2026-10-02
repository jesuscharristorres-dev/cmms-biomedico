// tests/supabase/entorno.js
// Entorno de pruebas LOCAL para el backend Supabase: Postgres + PostgREST locales (ver
// scripts/migracion/entorno-prueba-local.sh) y un Storage falso en memoria. Nunca apunta a un
// proyecto real: si las variables SUPABASE_PRUEBAS_* no están definidas, los tests se omiten.
//
//   SUPABASE_PRUEBAS_REST_URL  p. ej. http://127.0.0.1:54321   (PostgREST local)
//   SUPABASE_PRUEBAS_CLAVE     JWT service_role firmado con el jwt-secret local
//   SUPABASE_PRUEBAS_PG        p. ej. postgres://postgres@127.0.0.1:5433/cmms (para vaciar tablas)

import http from 'node:http';
import { execFileSync } from 'node:child_process';

export const disponible = !!(process.env.SUPABASE_PRUEBAS_REST_URL && process.env.SUPABASE_PRUEBAS_CLAVE && process.env.SUPABASE_PRUEBAS_PG);

const TABLAS = ['alert_emails', 'archivos', 'limpieza_plantillas', 'limpieza_desinfeccion', 'tecno_transversal', 'tecno_reportes',
  'planes_programas', 'capacitaciones_meta', 'capacitaciones_registros', 'reportes_falla', 'personal', 'equipo_bajas',
  'equipo_documentos', 'equipo_instalaciones', 'equipo_calibraciones', 'equipo_correctivos', 'equipo_preventivos',
  'equipos', 'usuarios', 'sedes', 'empresas'];

export function vaciarSupabase() {
  const local = /127\.0\.0\.1|localhost/.test(process.env.SUPABASE_PRUEBAS_PG || '');
  if (!local) throw new Error('SUPABASE_PRUEBAS_PG debe ser una base de datos LOCAL.');
  execFileSync('psql', [process.env.SUPABASE_PRUEBAS_PG, '-q', '-v', 'ON_ERROR_STOP=1', '-c',
    `truncate ${TABLAS.map(t => `public.${t}`).join(', ')} cascade; update public.cmms_versiones set version = 0;`]);
}

/** Storage falso (API mínima de Supabase Storage usada por lib/datos/supabase-cliente.js). */
export async function iniciarStorageFalso() {
  const objetos = new Map();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const partes = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'POST' && partes[0] === 'object' && partes[1] !== 'sign') {
        objetos.set(partes.slice(2).join('/'), { buf: Buffer.concat(chunks), tipo: req.headers['content-type'] });
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ Key: partes.slice(1).join('/') }));
      }
      if (req.method === 'POST' && partes[0] === 'object' && partes[1] === 'sign') {
        const ruta = partes.slice(3).join('/');
        if (!objetos.has(ruta)) { res.statusCode = 400; return res.end('{"error":"not found"}'); }
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ signedURL: `/object/sign/${partes[2]}/${partes.slice(3).map(encodeURIComponent).join('/')}?token=prueba` }));
      }
      if (req.method === 'GET' && partes[0] === 'object' && partes[1] === 'sign') {
        const o = objetos.get(partes.slice(3).join('/'));
        if (!o || url.searchParams.get('token') !== 'prueba') { res.statusCode = 400; return res.end(); }
        res.setHeader('Content-Type', o.tipo || 'application/octet-stream');
        return res.end(o.buf);
      }
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, objetos, cerrar: () => new Promise(r => server.close(r)) };
}

export function configurarSupabase(storageUrl) {
  process.env.SUPABASE_URL = 'http://127.0.0.1';
  process.env.SUPABASE_REST_URL = process.env.SUPABASE_PRUEBAS_REST_URL;
  process.env.SUPABASE_STORAGE_URL = storageUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_PRUEBAS_CLAVE;
}
