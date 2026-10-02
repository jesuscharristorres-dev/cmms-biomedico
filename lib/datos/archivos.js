// lib/datos/archivos.js
// Saca de los registros los archivos guardados como Data URI base64 ("data:<tipo>;base64,...")
// y los sube a Supabase Storage (bucket privado). En el registro, el texto base64 se reemplaza
// por la URL autenticada de la API: /api/archivos?ruta=<ruta>. El campo sigue siendo un texto
// con la "dirección" del archivo, así que <img src>, enlaces y descargas funcionan igual.
//
// Rutas por contenido (empresa/sha256.ext): subir dos veces el mismo archivo no duplica nada,
// por eso la importación se puede repetir sin efectos (idempotente).

import crypto from 'node:crypto';
import { subirArchivo, rest } from './supabase-cliente.js';

const DATA_URI = /^data:([\w.+/-]+)?(?:;[\w=.+-]+)*;base64,/;
export const PREFIJO_URL = '/api/archivos?ruta=';
const EXT = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export const esDataUri = (v) => typeof v === 'string' && DATA_URI.test(v);

export function decodificar(dataUri) {
  const tipo = DATA_URI.exec(dataUri)?.[1] || 'application/octet-stream';
  const buffer = Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64');
  return { tipo, buffer, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

export function rutaPara(empresa, sha256, tipo) {
  const carpeta = String(empresa || 'global').replace(/[^\w.-]+/g, '_');
  return `${carpeta}/${sha256}.${EXT[tipo] || 'bin'}`;
}

/**
 * Recorre `valor` (cualquier JSON) y externaliza cada Data URI. Devuelve el valor nuevo (no
 * muta el original) y la lista de archivos subidos. `subir=false` solo calcula (simulación).
 */
export async function externalizar(valor, { empresa = null, origen = '', subir = true } = {}) {
  const subidos = [];
  async function recorrer(v, camino) {
    if (esDataUri(v)) {
      const { tipo, buffer, sha256 } = decodificar(v);
      const ruta = rutaPara(empresa, sha256, tipo);
      const encabezado = v.slice(0, v.indexOf(','));
      if (subir) {
        await subirArchivo(ruta, buffer, tipo);
        await rest('archivos?on_conflict=ruta', {
          method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
          body: [{ ruta, empresa, tipo, tamano: buffer.length, sha256, encabezado, origen: camino }],
        });
      }
      subidos.push({ ruta, tipo, tamano: buffer.length, sha256, encabezado, origen: camino });
      return `${PREFIJO_URL}${encodeURIComponent(ruta)}`;
    }
    if (Array.isArray(v)) {
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(await recorrer(v[i], `${camino}/${i}`));
      return out;
    }
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = await recorrer(x, `${camino}/${k}`);
      return out;
    }
    return v;
  }
  const nuevo = await recorrer(valor, origen);
  return { valor: nuevo, subidos };
}

/**
 * Inverso de externalizar(): cambia cada URL /api/archivos?ruta=... por el Data URI original
 * (descargando el archivo de Storage). Se usa para exportar de Supabase a formato Redis.
 */
export async function reincorporar(valor, descargar) {
  async function recorrer(v) {
    if (typeof v === 'string' && v.startsWith(PREFIJO_URL)) {
      const ruta = decodeURIComponent(v.slice(PREFIJO_URL.length));
      const { encabezado, buffer } = await descargar(ruta);
      return `${encabezado},${buffer.toString('base64')}`;
    }
    if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await recorrer(x)); return out; }
    if (v && typeof v === 'object') { const out = {}; for (const [k, x] of Object.entries(v)) out[k] = await recorrer(x); return out; }
    return v;
  }
  return recorrer(valor);
}
