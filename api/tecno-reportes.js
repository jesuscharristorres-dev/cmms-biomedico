// api/tecno-reportes.js
// Fuente de verdad COMPARTIDA de los reportes trimestrales de Tecnovigilancia, organizados
// por empresa · sede · año · trimestre. Forma: { [empresaId]: { [sede]: { [anio]: { [trimestre]: valor } } } }.
// El PATCH solo toca una hoja del árbol a la vez (read-modify-write en el servidor).
//
// MULTIEMPRESA: GET recortado a las empresas visibles; PATCH solo sobre una empresa accesible.

import { kv } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeKeyed, assertKeyedWrite } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';

const KV_KEY = 'cmms:tecnoReportes';

export default withErrors('api/tecno-reportes', 'No se pudo acceder a la base de datos compartida de reportes de tecnovigilancia.', async (req, res) => {
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const data = scopeKeyed(ctx, (await kv.get(KV_KEY)) || {}, empresaFilter(ctx, req.query));
    return res.status(200).json({ data });
  }

  if (req.method === 'PATCH') {
    const ctx = await requireAuth(req, { write: true });
    const { empresaKey, sede, anio, trimestre, valor } = req.body || {};
    if (!sede || !anio || !trimestre) throw new HttpError(400, 'Falta empresaKey, sede, anio o trimestre.');
    await assertKeyedWrite(ctx, empresaKey);
    const data = (await kv.get(KV_KEY)) || {};
    const emp = data[empresaKey] || {};
    const sedeObj = emp[sede] || {};
    const anioObj = sedeObj[anio] || {};
    const actualizado = {
      ...data,
      [empresaKey]: { ...emp, [sede]: { ...sedeObj, [anio]: { ...anioObj, [trimestre]: valor } } },
    };
    await kv.set(KV_KEY, actualizado);
    return res.status(200).json({ data: scopeKeyed(ctx, actualizado) });
  }

  return methodNotAllowed(res, ['GET', 'PATCH']);
});
