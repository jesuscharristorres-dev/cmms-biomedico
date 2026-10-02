// api/equipos.js
// Fuente de verdad COMPARTIDA del inventario de equipos (y, dentro de cada equipo, sus
// preventivos, correctivos, calibraciones y bajas, que van anidados en el mismo objeto).
// Vercel KV bajo 'cmms:equipos'. Cada operación es puntual (crear uno o varios, actualizar
// uno por id, eliminar uno por id) y el servidor hace el read-modify-write.
//
// MULTIEMPRESA (ver lib/tenancy.js): el campo `empresa` de cada equipo es su empresa_id.
//   GET    → SUPER_ADMIN: todos (o ?empresa=ID). Usuario de empresa: solo los suyos;
//            pedir ?empresa= de otra → 403.
//   POST   → la empresa del equipo la decide el servidor (usuario de empresa: la suya).
//   PATCH  → solo si el equipo es de una empresa accesible (anti-IDOR); solo el SUPER_ADMIN
//            puede moverlo a otra empresa.
//   DELETE → idem PATCH.
// GET devuelve la lista recortada a lo que el usuario puede ver. Las ESCRITURAS devuelven solo
// lo afectado (no la colección): antes cada PATCH —que la hoja de vida envía en cada tecla—
// respondía el inventario completo (~4 MB medidos en Production), principal fuente de
// Fast Origin Transfer. El frontend no usaba esa colección salvo para su caché local.
//
// TRÁFICO CON REDIS (lib/coleccion.js): el inventario se cachea en memoria por instancia y se
// valida con la clave pequeña 'cmms:equipos:version'. El GET responde 304 (sin leer los
// ~2,4 MB) si el navegador ya tiene esa versión, y las escrituras guardan con un SET
// condicional que nunca pisa el cambio de otro usuario (si hubo uno, relee y reintenta).

import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeArray, findOwned, resolveEmpresaForWrite, applyScopedPatch, idOcupadoPorOtraEmpresa } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';
import { mutar, responderConEtag } from '../lib/coleccion.js';

export const KV_KEY = 'cmms:equipos';
const vacio = () => [];
const MAX_POR_LOTE = 5000;

function idValido(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

export default withErrors('api/equipos', 'No se pudo acceder a la base de datos compartida de equipos.', async (req, res) => {
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const filtro = empresaFilter(ctx, req.query);
    return responderConEtag(req, res, KV_KEY, vacio, [ctx.userId, ctx.role, ctx.empresaId, filtro],
      equipos => ({ equipos: scopeArray(ctx, equipos, filtro) }));
  }

  const ctx = await requireAuth(req, { write: true });

  if (req.method === 'POST') {
    const { equipo, equipos: nuevos } = req.body || {};
    const porAgregar = Array.isArray(nuevos) ? nuevos : equipo ? [equipo] : null;
    if (!porAgregar || porAgregar.length === 0 || porAgregar.length > MAX_POR_LOTE
      || porAgregar.some(e => !e || typeof e !== 'object' || Array.isArray(e) || !idValido(e.id))) {
      throw new HttpError(400, 'Falta el equipo (o equipos) a crear, con id.');
    }
    // La empresa de cada equipo nuevo se valida/decide en el servidor antes de guardar nada.
    const normalizados = [];
    for (const e of porAgregar) {
      normalizados.push({ ...e, empresa: await resolveEmpresaForWrite(ctx, e.empresa) });
    }
    const respuesta = await mutar(KV_KEY, vacio, equipos => {
      if (normalizados.some(e => idOcupadoPorOtraEmpresa(ctx, equipos, e.id))) {
        throw new HttpError(409, 'El identificador del equipo ya está en uso. Intenta de nuevo.');
      }
      const existentes = new Set(equipos.map(e => e.id));
      const aAgregar = normalizados.filter(e => !existentes.has(e.id));
      // Solo los equipos realmente agregados (todos de una empresa accesible: resolveEmpresaForWrite).
      const r = { ok: true, creados: aAgregar };
      return aAgregar.length ? { nuevo: [...equipos, ...aAgregar], respuesta: r } : { respuesta: r };
    });
    return res.status(200).json(respuesta);
  }

  if (req.method === 'PATCH') {
    const { id, patch } = req.body || {};
    if (!idValido(id) || !patch) throw new HttpError(400, 'Falta id o patch para actualizar el equipo.');
    const respuesta = await mutar(KV_KEY, vacio, async equipos => {
      const idx = findOwned(ctx, equipos, id);
      const actualizado = await applyScopedPatch(ctx, equipos[idx], patch);
      // Si el cambio no modifica nada, no se reescribe el inventario completo en Redis.
      if (JSON.stringify(actualizado) === JSON.stringify(equipos[idx])) return { respuesta: { equipo: actualizado } };
      const actualizados = [...equipos];
      actualizados[idx] = actualizado;
      return { nuevo: actualizados, respuesta: { equipo: actualizado } };
    });
    return res.status(200).json(respuesta);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!idValido(id)) throw new HttpError(400, 'Falta id del equipo a eliminar.');
    const respuesta = await mutar(KV_KEY, vacio, equipos => {
      const idx = findOwned(ctx, equipos, id);
      // Se elimina por posición (el registro ya verificado), nunca "todos los que tengan ese id".
      return { nuevo: equipos.filter((_, i) => i !== idx), respuesta: { ok: true, id } };
    });
    return res.status(200).json(respuesta);
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
});
