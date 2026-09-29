// api/limpieza-plantillas.js
// Plantilla del formato de limpieza y desinfección: UN archivo real (PDF/Word/Excel) por
// empresa — a diferencia de api/limpieza-desinfeccion.js (que solo guarda un enlace externo
// por sede·año·mes), aquí el archivo se guarda tal cual en la base de datos compartida como
// Data URI base64 (mismo mecanismo que ya usaban los documentos de equipo con
// `archivoDatos`, ver src/App.jsx → abrirDocumento()), así que se puede ver/descargar sin
// depender de un servicio externo.
// Forma: { [empresaKey]: { nombre, tipo, tamano, archivoDatos, updatedAt } }
//
// MULTIEMPRESA: GET exige sesión y devuelve solo las plantillas de las empresas visibles para
// el usuario; cargar, reemplazar y eliminar exigen un rol con escritura y solo se permiten
// sobre la empresa del usuario (SUPER_ADMIN: cualquiera existente). La restricción real vive
// aquí: aunque alguien llame a este endpoint directamente, el servidor la aplica igual.

import { kv } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeKeyed, assertKeyedWrite } from '../lib/tenancy.js';
import { HttpError } from '../lib/http.js';

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

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const ctx = await requireAuth(req);
      const data = scopeKeyed(ctx, (await kv.get(KV_KEY)) || {}, empresaFilter(ctx, req.query));
      return res.status(200).json({ data });
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

      const data = (await kv.get(KV_KEY)) || {};
      const actualizado = {
        ...data,
        [empresaKey]: {
          nombre: nombre.trim(),
          tipo,
          tamano: archivoDatos.length,
          archivoDatos,
          // La fecha de actualización se calcula en el servidor — no se confía en el reloj del cliente.
          updatedAt: new Date().toISOString(),
        },
      };
      await kv.set(KV_KEY, actualizado);
      return res.status(200).json({ data: scopeKeyed(ctx, actualizado) });
    }

    if (req.method === 'DELETE') {
      const { empresaKey } = req.body || {};
      if (!esTextoValido(empresaKey, MAX_KEY_LEN)) {
        return res.status(400).json({ error: 'Falta empresaKey.' });
      }
      await assertKeyedWrite(ctx, empresaKey);
      const data = (await kv.get(KV_KEY)) || {};
      const actualizado = { ...data };
      delete actualizado[empresaKey];
      await kv.set(KV_KEY, actualizado);
      return res.status(200).json({ data: scopeKeyed(ctx, actualizado) });
    }

    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    console.error('[api/limpieza-plantillas] Error:', err);
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida de plantillas de limpieza y desinfección.' });
  }
}
