// api/planes-programas.js
// Fuente de verdad COMPARTIDA de "Planes y programas" (documentación por empresa: programa
// de mantenimiento, plan de mantenimiento, programa/plan de capacitaciones).
// Forma: { [empresaId]: { [campo]: valor } }. El PATCH solo toca un campo de una empresa.
//
// MULTIEMPRESA: GET devuelve solo las empresas visibles para el usuario; PATCH solo sobre
// una empresa accesible (lib/tenancy.js → assertKeyedWrite).

import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeKeyed, assertKeyedWrite } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';
import { datos } from '../lib/datos/index.js';
import { responderVersionado } from '../lib/etag.js';

export default withErrors('api/planes-programas', 'No se pudo acceder a la base de datos compartida de planes y programas.', async (req, res) => {
  const repo = datos.planesProgramas;
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const filtro = empresaFilter(ctx, req.query);
    return responderVersionado(req, res, {
      nombre: 'planesProgramas', marca: repo.marca, alcance: [ctx.userId, ctx.role, ctx.empresaId, filtro],
      construir: async () => ({ data: scopeKeyed(ctx, (await repo.leer()) || {}, filtro) }),
    });
  }

  if (req.method === 'PATCH') {
    const ctx = await requireAuth(req, { write: true });
    const { empresaKey, campo, valor } = req.body || {};
    if (typeof campo !== 'string' || !campo || campo.length > 80) throw new HttpError(400, 'Falta empresaKey o campo.');
    await assertKeyedWrite(ctx, empresaKey);
    const { datos: actualizado } = await repo.fijarCampo(empresaKey, campo, valor);
    return res.status(200).json({ data: scopeKeyed(ctx, actualizado) });
  }

  return methodNotAllowed(res, ['GET', 'PATCH']);
});
