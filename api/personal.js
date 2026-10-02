// api/personal.js
// Fuente de verdad COMPARTIDA de las hojas de vida del personal ('cmms:personal').
// Mismo patrón que api/equipos.js: crear UNO, actualizar UNO por id, con aislamiento
// multiempresa en el servidor (ver lib/tenancy.js).

import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeArray, canAccessEmpresa, resolveEmpresaForWrite, applyScopedPatch } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';
import { datos } from '../lib/datos/index.js';
import { responderVersionado } from '../lib/etag.js';

function idValido(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

export default withErrors('api/personal', 'No se pudo acceder a la base de datos compartida de personal.', async (req, res) => {
  const repo = datos.personal;

  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const filtro = empresaFilter(ctx, req.query);
    return responderVersionado(req, res, {
      nombre: 'personal', marca: repo.marca, alcance: [ctx.userId, ctx.role, ctx.empresaId, filtro],
      construir: async () => ({ personal: scopeArray(ctx, await repo.listar({ empresa: ctx.isSuperAdmin ? filtro : ctx.empresaId }), filtro) }),
    });
  }

  const ctx = await requireAuth(req, { write: true });
  const acceso = r => canAccessEmpresa(ctx, r.empresa);

  if (req.method === 'POST') {
    const { record } = req.body || {};
    if (!record || typeof record !== 'object' || Array.isArray(record) || !idValido(record.id)) {
      throw new HttpError(400, 'Falta el registro a crear (con id).');
    }
    const nuevo = { ...record, empresa: await resolveEmpresaForWrite(ctx, record.empresa) };
    const { existentes } = await repo.crear([nuevo], ex => {
      if ([...ex.values()].some(r => !acceso(r))) {
        throw new HttpError(409, 'El identificador del registro ya está en uso. Intenta de nuevo.');
      }
    });
    // Idempotencia ante reintentos de red (solo registros propios llegan aquí).
    return res.status(200).json({ record: existentes.get(nuevo.id) || nuevo });
  }

  if (req.method === 'PATCH') {
    const { id, patch } = req.body || {};
    if (!idValido(id) || !patch) throw new HttpError(400, 'Falta id o patch para actualizar el registro.');
    const record = await repo.actualizar(id, actual => applyScopedPatch(ctx, actual, patch), { acceso });
    return res.status(200).json({ record });
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH']);
});
