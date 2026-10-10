// api/limpieza-plantillas.js
// Plantilla del formato de limpieza y desinfección: UN archivo real (PDF/Word/Excel) por
// empresa — a diferencia de api/limpieza-desinfeccion.js (que solo guarda un enlace externo
// por sede·año·mes), aquí el archivo se guarda tal cual en la base de datos compartida como
// Data URI base64 (mismo mecanismo que ya usaban los documentos de equipo con
// `archivoDatos`, ver src/App.jsx → abrirDocumento()), así que se puede ver/descargar sin
// depender de un servicio externo.
// Forma: { [empresaKey]: { nombre, tipo, tamano, archivoDatos, updatedAt } }
//
// ARCHIVOS FUERA DE REDIS: si el proyecto tiene un store de Vercel Blob conectado
// (BLOB_READ_WRITE_TOKEN), las plantillas NUEVAS se suben a Blob como archivo PRIVADO y en
// Redis solo queda su metadato ({ ..., blobPathname } sin `archivoDatos`). La descarga pasa
// por GET ?archivo=<empresaKey>, con la misma verificación de sesión y empresa. Sin Blob
// configurado se sigue guardando en base64 como siempre. Las plantillas antiguas en base64 no
// se mueven ni se modifican; se siguen viendo y descargando igual.
//
// TRÁFICO: lectura con caché por versión y ETag (lib/coleccion.js); escrituras condicionales.
//
// MULTIEMPRESA: GET exige sesión y devuelve solo las plantillas de las empresas visibles para
// el usuario; cargar, reemplazar y eliminar exigen un rol con escritura y solo se permiten
// sobre la empresa del usuario (SUPER_ADMIN: cualquiera existente). La restricción real vive
// aquí: aunque alguien llame a este endpoint directamente, el servidor la aplica igual.

import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeKeyed, assertKeyedWrite } from '../lib/tenancy.js';
import { HttpError, esLimiteBaseDatos, MENSAJE_LIMITE_BASE_DATOS } from '../lib/http.js';
import { mutar, responderConEtag, leer } from '../lib/coleccion.js';

const KV_KEY = 'cmms:limpiezaPlantillas';
const MAX_KEY_LEN = 80;
const MAX_NOMBRE_LEN = 200;
// 3 MB de archivo real caben en ~4.1 MB en base64 (factor ~1.37) — con margen bajo el límite
// de 4.5 MB que Vercel impone al cuerpo de una función serverless. El límite real de tamaño
// de archivo lo aplica el cliente (src/App.jsx → PLANTILLA_LIMPIEZA_MAX_BYTES); aquí solo se
// pone un techo absoluto de defensa, por si alguien llama al endpoint sin pasar por la UI.
const MAX_ARCHIVO_LEN = 4.2 * 1024 * 1024;
const TIPOS_PERMITIDOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function esTextoValido(v, maxLen) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= maxLen;
}

const vacio = () => ({});
const blobConfigurado = () => !!process.env.BLOB_READ_WRITE_TOKEN;

// La ruta interna del archivo en Blob no se expone: el cliente recibe la URL de descarga
// autenticada de esta misma API. No muta `data` (es la caché compartida).
function paraCliente(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v && v.blobPathname) {
      const { blobPathname: _p, ...resto } = v;
      out[k] = { ...resto, archivoUrl: `/api/limpieza-plantillas?archivo=${encodeURIComponent(k)}` };
    } else out[k] = v;
  }
  return out;
}

async function subirABlob(empresaKey, nombre, tipo, archivoDatos) {
  const { put } = await import('@vercel/blob');
  const buffer = Buffer.from(archivoDatos.slice(archivoDatos.indexOf(',') + 1), 'base64');
  const seguro = nombre.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'plantilla';
  const r = await put(`limpieza-plantillas/${encodeURIComponent(empresaKey)}/${seguro}`, buffer, {
    access: 'private', contentType: tipo, addRandomSuffix: true,
  });
  return { pathname: r.pathname, tamano: buffer.length };
}

async function borrarDeBlob(pathname) {
  if (!pathname || !blobConfigurado()) return;
  try {
    const { del } = await import('@vercel/blob');
    await del(pathname);
  } catch (err) {
    // Un archivo huérfano en Blob no rompe nada; se registra para limpiarlo a mano si hace falta.
    console.error('[api/limpieza-plantillas] No se pudo borrar el archivo anterior de Blob:', pathname, err);
  }
}

async function descargar(req, res, ctx) {
  const empresaKey = String(req.query.archivo || '');
  const { data } = await leer(KV_KEY, vacio);
  const visible = scopeKeyed(ctx, data, null)[empresaKey];
  if (!visible) throw new HttpError(404);
  if (visible.archivoDatos) {
    const buffer = Buffer.from(visible.archivoDatos.slice(visible.archivoDatos.indexOf(',') + 1), 'base64');
    res.setHeader('Content-Type', visible.tipo || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${req.query.descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(visible.nombre || 'plantilla')}`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).end(buffer);
  }
  if (!visible.blobPathname || !blobConfigurado()) throw new HttpError(404);
  const { get } = await import('@vercel/blob');
  const r = await get(visible.blobPathname, { access: 'private' });
  if (!r || r.statusCode !== 200) throw new HttpError(404);
  res.setHeader('Content-Type', visible.tipo || r.blob.contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${req.query.descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(visible.nombre || 'plantilla')}`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).end(Buffer.from(await new Response(r.stream).arrayBuffer()));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const ctx = await requireAuth(req);
      // `return await`: dentro del try, para que sus errores (404, límite de Redis…) los maneje el catch.
      if (req.query?.archivo) return await descargar(req, res, ctx);
      const filtro = empresaFilter(ctx, req.query);
      return await responderConEtag(req, res, KV_KEY, vacio, [ctx.userId, ctx.role, ctx.empresaId, filtro],
        data => ({ data: paraCliente(scopeKeyed(ctx, data, filtro)) }));
    }

    // Cargar, reemplazar y eliminar: sin sesión con permiso de escritura, la petición se
    // rechaza aquí mismo (401/403), sin llegar a tocar la base de datos.
    const ctx = await requireAuth(req, { write: true });

    if (req.method === 'PATCH') {
      const { empresaKey, nombre, tipo, archivoDatos } = req.body || {};
      if (!esTextoValido(empresaKey, MAX_KEY_LEN)) {
        return res.status(400).json({ error: 'Falta empresaKey o es inválido.' });
      }
      await assertKeyedWrite(ctx, empresaKey);
      if (!esTextoValido(nombre, MAX_NOMBRE_LEN)) {
        return res.status(400).json({ error: 'Falta el nombre del archivo.' });
      }
      if (!TIPOS_PERMITIDOS.includes(tipo)) {
        return res.status(400).json({ error: 'Tipo de archivo no permitido. Solo se aceptan PDF, Word o Excel.' });
      }
      if (typeof archivoDatos !== 'string' || !archivoDatos.startsWith('data:') || archivoDatos.length > MAX_ARCHIVO_LEN) {
        return res.status(400).json({ error: 'El archivo no es válido o supera el tamaño máximo permitido (3 MB).' });
      }

      // La fecha de actualización se calcula en el servidor — no se confía en el reloj del cliente.
      let registro;
      if (blobConfigurado()) {
        const { pathname, tamano } = await subirABlob(empresaKey, nombre.trim(), tipo, archivoDatos);
        registro = { nombre: nombre.trim(), tipo, tamano, blobPathname: pathname, updatedAt: new Date().toISOString() };
      } else {
        registro = { nombre: nombre.trim(), tipo, tamano: archivoDatos.length, archivoDatos, updatedAt: new Date().toISOString() };
      }
      let anterior = null;
      let actualizado;
      try {
        actualizado = await mutar(KV_KEY, vacio, data => {
          anterior = data[empresaKey]?.blobPathname || null;
          const nuevo = { ...data, [empresaKey]: registro };
          return { nuevo, respuesta: nuevo };
        });
      } catch (err) {
        await borrarDeBlob(registro.blobPathname); // no dejar el archivo nuevo huérfano
        throw err;
      }
      if (anterior && anterior !== registro.blobPathname) await borrarDeBlob(anterior);
      return res.status(200).json({ data: paraCliente(scopeKeyed(ctx, actualizado)) });
    }

    if (req.method === 'DELETE') {
      const { empresaKey } = req.body || {};
      if (!esTextoValido(empresaKey, MAX_KEY_LEN)) {
        return res.status(400).json({ error: 'Falta empresaKey.' });
      }
      await assertKeyedWrite(ctx, empresaKey);
      let anterior = null;
      const actualizado = await mutar(KV_KEY, vacio, data => {
        anterior = data[empresaKey]?.blobPathname || null;
        const nuevo = { ...data };
        delete nuevo[empresaKey];
        return { nuevo, respuesta: nuevo };
      });
      if (anterior) await borrarDeBlob(anterior);
      return res.status(200).json({ data: paraCliente(scopeKeyed(ctx, actualizado)) });
    }

    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    console.error('[api/limpieza-plantillas] Error:', err);
    if (esLimiteBaseDatos(err)) return res.status(503).json({ error: MENSAJE_LIMITE_BASE_DATOS });
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida de plantillas de limpieza y desinfección.' });
  }
}
