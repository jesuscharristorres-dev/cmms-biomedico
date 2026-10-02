// api/archivos.js
// Descarga AUTENTICADA de los archivos que, con DATA_BACKEND=supabase, viven en Supabase
// Storage (bucket privado `archivos`): documentos antiguos de equipos, firmas y plantillas que
// antes estaban en base64 dentro de Redis (ver lib/datos/archivos.js).
//
//   GET /api/archivos?ruta=<empresa>/<sha256>.<ext>[&descargar=1]
//
// Exige sesión y que el archivo sea de una empresa visible para el usuario (los archivos sin
// empresa, solo SUPER_ADMIN). Responde una redirección a una URL firmada que vence en 60 s:
// el archivo se descarga solo cuando el usuario lo abre, directamente desde Storage.

import { requireAuth } from '../lib/auth.js';
import { canAccessEmpresa } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';
import { datos } from '../lib/datos/index.js';

const RUTA_RE = /^[\w.-]{1,80}\/[0-9a-f]{64}\.[a-z0-9]{1,5}$/;

export default withErrors('api/archivos', 'No se pudo obtener el archivo.', async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const ctx = await requireAuth(req);
  const ruta = String(req.query?.ruta || '');
  if (!RUTA_RE.test(ruta)) throw new HttpError(400, 'Ruta de archivo no válida.');
  const archivo = await datos.archivos.obtener(ruta);
  const visible = archivo && (archivo.empresa ? canAccessEmpresa(ctx, archivo.empresa) : ctx.isSuperAdmin);
  if (!visible) throw new HttpError(404); // inexistente y ajeno son indistinguibles
  const url = await datos.archivos.urlFirmada(ruta, { descargar: req.query?.descargar ? ruta.split('/').pop() : null });
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Location', url);
  return res.status(302).end();
});
