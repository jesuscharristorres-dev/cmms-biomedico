// api/planes-programas.js
// Fuente de verdad COMPARTIDA de "Planes y programas" (documentación por empresa: programa
// de mantenimiento, plan de mantenimiento, programa/plan de capacitaciones).
// Forma: { [empresaId]: { [campo]: valor } }. El PATCH solo toca un campo de una empresa.
//
// MULTIEMPRESA: GET devuelve solo las empresas visibles para el usuario; PATCH solo sobre
// una empresa accesible (lib/tenancy.js → assertKeyedWrite).

import { kv } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeKeyed, assertKeyedWrite } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';

const KV_KEY = 'cmms:planesProgramas';

export default withErrors('api/planes-programas', 'No se pudo acceder a la base de datos compartida de planes y programas.', async (req, res) => {
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const data = scopeKeyed(ctx, (await kv.get(KV_KEY)) || {}, empresaFilter(ctx, req.query));
    return res.status(200).json({ data });
  }

  if (req.method === 'PATCH') {
    const ctx = await requireAuth(req, { write: true });
    const { empresaKey, campo, valor } = req.body || {};
    if (typeof campo !== 'string' || !campo || campo.length > 80) throw new HttpError(400, 'Falta empresaKey o campo.');
    await assertKeyedWrite(ctx, empresaKey);
    const data = (await kv.get(KV_KEY)) || {};
    const actualizado = { ...data, [empresaKey]: { ...(data[empresaKey] || {}), [campo]: valor } };
    await kv.set(KV_KEY, actualizado);
    return res.status(200).json({ data: scopeKeyed(ctx, actualizado) });
  }

  return methodNotAllowed(res, ['GET', 'PATCH']);
});
