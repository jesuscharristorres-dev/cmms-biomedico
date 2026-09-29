// api/personal.js
// Fuente de verdad COMPARTIDA de las hojas de vida del personal ('cmms:personal').
// Mismo patrón que api/equipos.js: crear UNO, actualizar UNO por id, con aislamiento
// multiempresa en el servidor (ver lib/tenancy.js).

import { kv } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeArray, findOwned, resolveEmpresaForWrite, applyScopedPatch, idOcupadoPorOtraEmpresa } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';

const KV_KEY = 'cmms:personal';

function idValido(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

export default withErrors('api/personal', 'No se pudo acceder a la base de datos compartida de personal.', async (req, res) => {
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const personal = scopeArray(ctx, (await kv.get(KV_KEY)) || [], empresaFilter(ctx, req.query));
    return res.status(200).json({ personal });
  }

  const ctx = await requireAuth(req, { write: true });

  if (req.method === 'POST') {
    const { record } = req.body || {};
    if (!record || typeof record !== 'object' || Array.isArray(record) || !idValido(record.id)) {
      throw new HttpError(400, 'Falta el registro a crear (con id).');
    }
    const nuevo = { ...record, empresa: await resolveEmpresaForWrite(ctx, record.empresa) };
    const personal = (await kv.get(KV_KEY)) || [];
    if (idOcupadoPorOtraEmpresa(ctx, personal, nuevo.id)) {
      throw new HttpError(409, 'El identificador del registro ya está en uso. Intenta de nuevo.');
    }
    const existente = personal.find(p => p.id === nuevo.id);
    if (existente) {
      // Idempotencia ante reintentos de red (solo registros propios llegan aquí).
      return res.status(200).json({ record: existente, personal: scopeArray(ctx, personal) });
    }
    const actualizados = [...personal, nuevo];
    await kv.set(KV_KEY, actualizados);
    return res.status(200).json({ record: nuevo, personal: scopeArray(ctx, actualizados) });
  }

  if (req.method === 'PATCH') {
    const { id, patch } = req.body || {};
    if (!idValido(id) || !patch) throw new HttpError(400, 'Falta id o patch para actualizar el registro.');
    const personal = (await kv.get(KV_KEY)) || [];
    const idx = findOwned(ctx, personal, id);
    const actualizado = await applyScopedPatch(ctx, personal[idx], patch);
    const actualizados = [...personal];
    actualizados[idx] = actualizado;
    await kv.set(KV_KEY, actualizados);
    return res.status(200).json({ record: actualizado, personal: scopeArray(ctx, actualizados) });
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH']);
});
