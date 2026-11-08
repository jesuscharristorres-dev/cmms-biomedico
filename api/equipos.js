// api/equipos.js
// Fuente de verdad COMPARTIDA del inventario de equipos (y, dentro de cada equipo, sus
// preventivos, correctivos, calibraciones y bajas, que van anidados en el mismo objeto).
// Un equipo por clave en Vercel KV (ver lib/equipos.js — por qué no un solo arreglo). Cada
// operación es puntual (crear uno o varios, actualizar uno por id, eliminar uno por id): ya
// no hace falta traer ni reescribir el inventario completo para tocar un solo equipo.
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

import { requireAuth } from '../lib/auth.js';
import { listEquipos, getEquipo, setEquipo, deleteEquipo } from '../lib/equipos.js';
import { EMPRESA_FIELD, empresaFilter, scopeArray, canAccessEmpresa, resolveEmpresaForWrite, applyScopedPatch } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';

const MAX_POR_LOTE = 5000;

function idValido(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

export default withErrors('api/equipos', 'No se pudo acceder a la base de datos compartida de equipos.', async (req, res) => {
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const filtro = empresaFilter(ctx, req.query);
    const equipos = scopeArray(ctx, await listEquipos(), filtro);
    return res.status(200).json({ equipos });
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
    // Un id ya usado por un equipo que el usuario NO puede ver → 409 (todo el lote se rechaza,
    // ver lib/tenancy.js → canAccessEmpresa). Uno ya usado por un equipo accesible se omite en
    // silencio (reintentar una alta que ya se guardó no debe fallar ni duplicar).
    const existentes = await Promise.all(normalizados.map(e => getEquipo(e.id)));
    if (normalizados.some((e, i) => existentes[i] && !canAccessEmpresa(ctx, existentes[i][EMPRESA_FIELD]))) {
      throw new HttpError(409, 'El identificador del equipo ya está en uso. Intenta de nuevo.');
    }
    const aAgregar = normalizados.filter((e, i) => !existentes[i]);
    for (const e of aAgregar) await setEquipo(e);
    // Solo los equipos realmente agregados (todos de una empresa accesible: resolveEmpresaForWrite).
    return res.status(200).json({ ok: true, creados: aAgregar });
  }

  if (req.method === 'PATCH') {
    const { id, patch } = req.body || {};
    if (!idValido(id) || !patch) throw new HttpError(400, 'Falta id o patch para actualizar el equipo.');
    const actual = await getEquipo(id);
    if (!actual || !canAccessEmpresa(ctx, actual[EMPRESA_FIELD])) throw new HttpError(404);
    const actualizado = await applyScopedPatch(ctx, actual, patch);
    await setEquipo(actualizado);
    return res.status(200).json({ equipo: actualizado });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!idValido(id)) throw new HttpError(400, 'Falta id del equipo a eliminar.');
    const actual = await getEquipo(id);
    if (!actual || !canAccessEmpresa(ctx, actual[EMPRESA_FIELD])) throw new HttpError(404);
    await deleteEquipo(id);
    return res.status(200).json({ ok: true, id });
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
});
