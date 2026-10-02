// api/tecno-reportes.js
// Fuente de verdad COMPARTIDA de los reportes trimestrales de Tecnovigilancia, organizados
// por empresa · sede · año · trimestre. Forma: { [empresaId]: { [sede]: { [anio]: { [trimestre]: valor } } } }.
// El PATCH solo toca una hoja del árbol a la vez (read-modify-write en el servidor).
//
// MULTIEMPRESA: GET recortado a las empresas visibles; PATCH solo sobre una empresa accesible.

import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeKeyed, assertKeyedWrite } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';
import { datos } from '../lib/datos/index.js';
import { responderVersionado } from '../lib/etag.js';

export default withErrors('api/tecno-reportes', 'No se pudo acceder a la base de datos compartida de reportes de tecnovigilancia.', async (req, res) => {
  const repo = datos.tecnoReportes;
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const filtro = empresaFilter(ctx, req.query);
    return responderVersionado(req, res, {
      nombre: 'tecnoReportes', marca: repo.marca, alcance: [ctx.userId, ctx.role, ctx.empresaId, filtro],
      construir: async () => ({ data: scopeKeyed(ctx, (await repo.leer()) || {}, filtro) }),
    });
  }

  if (req.method === 'PATCH') {
    const ctx = await requireAuth(req, { write: true });
    const { empresaKey, sede, anio, trimestre, valor } = req.body || {};
    if (!sede || !anio || !trimestre) throw new HttpError(400, 'Falta empresaKey, sede, anio o trimestre.');
    await assertKeyedWrite(ctx, empresaKey);
    const { datos: actualizado } = await repo.fijar(empresaKey, sede, anio, trimestre, valor);
    return res.status(200).json({ data: scopeKeyed(ctx, actualizado) });
  }

  return methodNotAllowed(res, ['GET', 'PATCH']);
});
