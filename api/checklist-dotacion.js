// api/checklist-dotacion.js
// Checklist de inventario de la dotación por consultorio: UN enlace externo (Drive/OneDrive/
// SharePoint) por empresa — mismo mecanismo que api/limpieza-plantillas.js (nunca se sube el
// archivo, solo su URL). Endpoint propio para mantener cada documento en su propia colección.
// Forma: { [empresaKey]: url }.
//
// Pedido explícito: disponible para todas las empresas MENOS MACROMED.
//
// MULTIEMPRESA: GET exige sesión y devuelve solo lo de las empresas visibles para el usuario;
// guardar exige un rol con escritura y solo sobre la empresa propia (SUPER_ADMIN: cualquiera
// existente, salvo MACROMED).

import { kv } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeKeyed, assertKeyedWrite } from '../lib/tenancy.js';
import { HttpError } from '../lib/http.js';

const KV_KEY = 'cmms:checklistDotacion';
const EMPRESA_EXCLUIDA = 'MACROMED';
const MAX_KEY_LEN = 80;
const MAX_URL_LEN = 2048;

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const ctx = await requireAuth(req);
      const data = scopeKeyed(ctx, (await kv.get(KV_KEY)) || {}, empresaFilter(ctx, req.query));
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const ctx = await requireAuth(req, { write: true });
      const { empresaKey, url } = req.body || {};
      if (typeof empresaKey !== 'string' || !empresaKey.trim() || empresaKey.length > MAX_KEY_LEN) {
        return res.status(400).json({ error: 'Falta empresaKey o es inválido.' });
      }
      if (empresaKey === EMPRESA_EXCLUIDA) {
        return res.status(403).json({ error: `El checklist de dotación por consultorio no aplica para ${EMPRESA_EXCLUIDA}.` });
      }
      const limpio = typeof url === 'string' ? url.trim() : '';
      if (limpio && (!/^https?:\/\//i.test(limpio) || limpio.length > MAX_URL_LEN)) {
        return res.status(400).json({ error: 'El enlace debe ser una URL http(s) válida.' });
      }
      await assertKeyedWrite(ctx, empresaKey);
      const data = (await kv.get(KV_KEY)) || {};
      const actualizado = { ...data, [empresaKey]: limpio };
      await kv.set(KV_KEY, actualizado);
      return res.status(200).json({ data: scopeKeyed(ctx, actualizado) });
    }

    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    console.error('[api/checklist-dotacion] Error:', err);
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida del checklist de dotación.' });
  }
}
