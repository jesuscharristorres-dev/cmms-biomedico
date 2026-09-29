// api/tecno-transversal.js
// Fuente de verdad COMPARTIDA de la documentación de Tecnovigilancia (ABC-Tecnovigilancia-
// INVIMA, Manual de Tecnovigilancia, etc). Forma: { [docKey]: { [empresaId]: valor } }, o
// { [docKey]: valor } (valor plano) para un documento ÚNICO compartido por todas las
// empresas (p. ej. el formato de INVIMA). `_default` dentro del objeto = valor compartido
// heredado, que ven todas las empresas que aún no tienen su propia URL.
//
// MULTIEMPRESA:
//   GET   → los documentos globales (valor plano) los ven todos; de los documentos por
//           empresa, un usuario de empresa solo recibe la hoja de SU empresa.
//   PATCH → con empresaKey: solo sobre una empresa accesible. Sin empresaKey (documento
//           global compartido): solo SUPER_ADMIN, porque afecta a todas las empresas.

import { kv } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { empresaFilter, assertKeyedWrite } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';

const KV_KEY = 'cmms:tecnoTransversal';

function scopeTransversal(ctx, data, filtro) {
  const empresa = ctx.isSuperAdmin ? filtro : ctx.empresaId;
  if (!empresa) return data;
  const out = {};
  Object.entries(data || {}).forEach(([docKey, v]) => {
    if (v && typeof v === 'object') {
      const propio = Object.prototype.hasOwnProperty.call(v, empresa) ? { [empresa]: v[empresa] } : {};
      out[docKey] = v._default ? { _default: v._default, ...propio } : propio;
    } else {
      out[docKey] = v; // documento global compartido
    }
  });
  return out;
}

export default withErrors('api/tecno-transversal', 'No se pudo acceder a la base de datos compartida de tecnovigilancia.', async (req, res) => {
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const data = scopeTransversal(ctx, (await kv.get(KV_KEY)) || {}, empresaFilter(ctx, req.query));
    return res.status(200).json({ data });
  }

  if (req.method === 'PATCH') {
    const ctx = await requireAuth(req, { write: true });
    const { docKey, empresaKey, valor } = req.body || {};
    if (typeof docKey !== 'string' || !docKey || docKey.length > 80) throw new HttpError(400, 'Falta docKey.');
    const data = (await kv.get(KV_KEY)) || {};
    let actualizado;
    if (empresaKey) {
      await assertKeyedWrite(ctx, empresaKey);
      const actual = data[docKey];
      // Si el documento tenía un valor plano (global/heredado, compartido por todas las
      // empresas), se conserva bajo `_default` al pasar al formato por empresa — escribir la
      // URL de UNA empresa nunca debe borrar la que ven las demás.
      const docObj = (actual && typeof actual === 'object') ? actual : (actual ? { _default: actual } : {});
      actualizado = { ...data, [docKey]: { ...docObj, [empresaKey]: valor } };
    } else {
      if (!ctx.isSuperAdmin) throw new HttpError(403);
      actualizado = { ...data, [docKey]: valor };
    }
    await kv.set(KV_KEY, actualizado);
    return res.status(200).json({ data: scopeTransversal(ctx, actualizado, null) });
  }

  return methodNotAllowed(res, ['GET', 'PATCH']);
});
