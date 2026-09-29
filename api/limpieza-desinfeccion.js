// api/limpieza-desinfeccion.js
// Fuente de verdad COMPARTIDA de los formatos de limpieza y desinfección, organizados por
// empresa · sede · año · mes. Forma: { [empresaId]: { [sede]: { [anio]: { [mes]: { url, updatedAt } } } } }.
// Solo se guardan metadatos mínimos (sede/año/mes van en la ruta; url y updatedAt en la hoja) —
// el documento en sí vive en un servicio externo (Drive/OneDrive/SharePoint), nunca aquí.
//
// MULTIEMPRESA: antes el PATCH era público (lo usaba el antiguo "Modo invitado" anónimo).
// Con aislamiento entre empresas eso ya no es aceptable: cualquiera podía escribir enlaces en
// cualquier empresa. Ahora GET y PATCH exigen sesión, y el PATCH solo se permite sobre la
// empresa del usuario (SUPER_ADMIN: cualquiera existente). La validación estricta de tipos,
// tamaños y esquema http(s) del enlace se conserva.

import { kv } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeKeyed, assertKeyedWrite } from '../lib/tenancy.js';
import { HttpError } from '../lib/http.js';

const KV_KEY = 'cmms:limpiezaDesinfeccion';
const MAX_KEY_LEN = 80;
const MAX_URL_LEN = 2048;
const ANIO_MIN = 2000;
const ANIO_MAX = 2100;

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

    if (req.method === 'PATCH') {
      const ctx = await requireAuth(req, { write: true });
      const { empresaKey, sede, anio, mes, url } = req.body || {};
      const anioNum = Number(anio);
      const mesNum = Number(mes);
      if (!esTextoValido(empresaKey, MAX_KEY_LEN) || !esTextoValido(sede, MAX_KEY_LEN)) {
        return res.status(400).json({ error: 'Falta empresaKey o sede, o son inválidos.' });
      }
      if (!Number.isInteger(anioNum) || anioNum < ANIO_MIN || anioNum > ANIO_MAX) {
        return res.status(400).json({ error: 'El año no es válido.' });
      }
      if (!Number.isInteger(mesNum) || mesNum < 0 || mesNum > 11) {
        return res.status(400).json({ error: 'El mes no es válido.' });
      }
      const limpio = typeof url === 'string' ? url.trim() : '';
      if (limpio && (!/^https?:\/\//i.test(limpio) || limpio.length > MAX_URL_LEN)) {
        return res.status(400).json({ error: 'El enlace debe ser una URL http(s) válida.' });
      }
      await assertKeyedWrite(ctx, empresaKey);

      const data = (await kv.get(KV_KEY)) || {};
      const emp = data[empresaKey] || {};
      const sedeObj = emp[sede] || {};
      const anioObj = { ...(sedeObj[anioNum] || {}) };
      if (limpio) {
        // La fecha de actualización se calcula en el servidor — no se confía en el reloj del cliente.
        anioObj[mesNum] = { url: limpio, updatedAt: new Date().toISOString() };
      } else {
        delete anioObj[mesNum];
      }
      const actualizado = {
        ...data,
        [empresaKey]: { ...emp, [sede]: { ...sedeObj, [anioNum]: anioObj } },
      };
      await kv.set(KV_KEY, actualizado);
      return res.status(200).json({ data: scopeKeyed(ctx, actualizado) });
    }

    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    console.error('[api/limpieza-desinfeccion] Error:', err);
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida de limpieza y desinfección.' });
  }
}
