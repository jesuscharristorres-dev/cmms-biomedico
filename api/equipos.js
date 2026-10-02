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
// DATOS: a través de lib/datos (Redis hoy; Supabase con DATA_BACKEND=supabase). El GET
// responde 304 si el navegador ya tiene la misma versión, y las escrituras nunca pisan el
// cambio de otro usuario (si lo hubo, se relee y se reintenta).
//
// Modos del GET (para cargar por demanda; el frontend actual usa el primero):
//   GET /api/equipos                          → inventario completo visible (con historial)
//   GET /api/equipos?vista=resumen&desde=0&cantidad=100 → columnas del listado, paginado
//   GET /api/equipos?id=<id>                  → hoja de vida completa de UN equipo

import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeArray, canAccessEmpresa, resolveEmpresaForWrite, applyScopedPatch } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';
import { datos } from '../lib/datos/index.js';
import { responderVersionado } from '../lib/etag.js';

const MAX_POR_LOTE = 5000;
const MAX_PAGINA = 500;

function idValido(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

export default withErrors('api/equipos', 'No se pudo acceder a la base de datos compartida de equipos.', async (req, res) => {
  const repo = datos.equipos;

  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const filtro = empresaFilter(ctx, req.query);
    const empresa = ctx.isSuperAdmin ? filtro : ctx.empresaId;
    const acceso = r => canAccessEmpresa(ctx, r.empresa);
    if (req.query?.id) {
      return responderVersionado(req, res, {
        nombre: 'equipos:id', marca: repo.marca, alcance: [ctx.userId, ctx.role, ctx.empresaId, req.query.id],
        construir: async () => {
          const equipo = await repo.obtener(String(req.query.id), { acceso });
          if (!equipo) throw new HttpError(404);
          return { equipo };
        },
      });
    }
    if (req.query?.vista === 'resumen') {
      const desde = Math.max(0, Number.parseInt(req.query.desde, 10) || 0);
      const cantidad = Math.min(MAX_PAGINA, Math.max(1, Number.parseInt(req.query.cantidad, 10) || 100));
      return responderVersionado(req, res, {
        nombre: 'equipos:resumen', marca: repo.marca, alcance: [ctx.userId, ctx.role, ctx.empresaId, filtro, desde, cantidad],
        construir: async () => {
          const { items, total } = await repo.listarResumen({ empresa, desde, cantidad });
          return { equipos: items, total, desde, cantidad };
        },
      });
    }
    return responderVersionado(req, res, {
      nombre: 'equipos', marca: repo.marca, alcance: [ctx.userId, ctx.role, ctx.empresaId, filtro],
      construir: async () => ({ equipos: scopeArray(ctx, await repo.listar({ empresa }), filtro) }),
    });
  }

  const ctx = await requireAuth(req, { write: true });
  const acceso = r => canAccessEmpresa(ctx, r.empresa);

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
    const { creados } = await repo.crear(normalizados, existentes => {
      if ([...existentes.values()].some(r => !acceso(r))) {
        throw new HttpError(409, 'El identificador del equipo ya está en uso. Intenta de nuevo.');
      }
    });
    // Solo los equipos realmente agregados (todos de una empresa accesible: resolveEmpresaForWrite).
    return res.status(200).json({ ok: true, creados });
  }

  if (req.method === 'PATCH') {
    const { id, patch } = req.body || {};
    if (!idValido(id) || !patch) throw new HttpError(400, 'Falta id o patch para actualizar el equipo.');
    const equipo = await repo.actualizar(id, async actual => {
      const actualizado = await applyScopedPatch(ctx, actual, patch);
      // Si el cambio no modifica nada, no se escribe nada.
      return JSON.stringify(actualizado) === JSON.stringify(actual) ? null : actualizado;
    }, { acceso });
    return res.status(200).json({ equipo });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!idValido(id)) throw new HttpError(400, 'Falta id del equipo a eliminar.');
    await repo.eliminar(id, { acceso });
    return res.status(200).json({ ok: true, id });
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
});
