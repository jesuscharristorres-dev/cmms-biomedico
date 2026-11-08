// api/personal.js
// Fuente de verdad COMPARTIDA de las hojas de vida del personal ('cmms:personal').
// Mismo patrón que api/equipos.js: crear UNO, actualizar UNO por id, con aislamiento
// multiempresa en el servidor (ver lib/tenancy.js).

import { requireAuth } from '../lib/auth.js';
import { listPersonal, getPersonal, setPersonal } from '../lib/personal.js';
import { EMPRESA_FIELD, empresaFilter, scopeArray, canAccessEmpresa, resolveEmpresaForWrite, applyScopedPatch } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';

function idValido(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

export default withErrors('api/personal', 'No se pudo acceder a la base de datos compartida de personal.', async (req, res) => {
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const personal = scopeArray(ctx, await listPersonal(), empresaFilter(ctx, req.query));
    return res.status(200).json({ personal });
  }

  const ctx = await requireAuth(req, { write: true });

  if (req.method === 'POST') {
    const { record } = req.body || {};
    if (!record || typeof record !== 'object' || Array.isArray(record) || !idValido(record.id)) {
      throw new HttpError(400, 'Falta el registro a crear (con id).');
    }
    const nuevo = { ...record, empresa: await resolveEmpresaForWrite(ctx, record.empresa) };
    const existente = await getPersonal(nuevo.id);
    if (existente) {
      if (!canAccessEmpresa(ctx, existente[EMPRESA_FIELD])) {
        throw new HttpError(409, 'El identificador del registro ya está en uso. Intenta de nuevo.');
      }
      // Idempotencia ante reintentos de red (solo registros propios llegan aquí).
      return res.status(200).json({ record: existente });
    }
    await setPersonal(nuevo);
    return res.status(200).json({ record: nuevo });
  }

  if (req.method === 'PATCH') {
    const { id, patch } = req.body || {};
    if (!idValido(id) || !patch) throw new HttpError(400, 'Falta id o patch para actualizar el registro.');
    const actual = await getPersonal(id);
    if (!actual || !canAccessEmpresa(ctx, actual[EMPRESA_FIELD])) throw new HttpError(404);
    const actualizado = await applyScopedPatch(ctx, actual, patch);
    await setPersonal(actualizado);
    return res.status(200).json({ record: actualizado });
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH']);
});
