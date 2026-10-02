// lib/etag.js
// GET con ETag para cualquier backend de datos: el ETag depende de la "marca" de la colección
// (su versión), de lo que el usuario puede ver y del despliegue. Si el navegador ya tiene esa
// versión, se responde 304 sin cuerpo y sin leer la colección.

import crypto from 'node:crypto';

export function etag(nombre, marca, alcance) {
  const despliegue = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || '';
  const h = crypto.createHash('sha256').update(JSON.stringify([nombre, marca, alcance, despliegue])).digest('base64url').slice(0, 27);
  return `W/"${h}"`;
}

const normalizar = (v) => String(v || '').trim().replace(/^W\//, '');

/** true si la petición trae If-None-Match con este ETag. */
export function noModificado(req, tag) {
  return String(req.headers?.['if-none-match'] || '').split(',').map(normalizar).includes(normalizar(tag));
}

/**
 * `marca()` → texto de versión; `construir()` → cuerpo JSON (solo se llama si hace falta).
 * `private, no-cache`: el navegador guarda la copia y la revalida; ningún CDN la comparte.
 */
export async function responderVersionado(req, res, { nombre, marca, alcance, construir }) {
  const tag = etag(nombre, await marca(), alcance);
  res.setHeader('ETag', tag);
  res.setHeader('Cache-Control', 'private, no-cache');
  if (noModificado(req, tag)) return res.status(304).end();
  return res.status(200).json(await construir());
}
