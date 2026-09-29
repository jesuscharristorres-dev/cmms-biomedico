// lib/tenancy.js
// Reglas de AISLAMIENTO MULTIEMPRESA — usadas por TODOS los endpoints de datos.
//
// Principio: la empresa con la que se trabaja la decide el servidor a partir del usuario
// autenticado (ctx, ver lib/auth.js → getAuthContext), nunca un valor enviado por el
// navegador:
//   - SUPER_ADMIN (ctx.empresaId === null): acceso global; puede filtrar opcionalmente por
//     empresa (?empresa=) y escribir en cualquier empresa existente.
//   - Usuario de empresa: SIEMPRE ctx.empresaId. Si el cliente intenta pedir o escribir en
//     otra empresa (query, body, id de un recurso ajeno) → 403.
//
// En los registros de negocio el campo histórico `empresa` ES la clave foránea empresa_id
// (ver lib/empresas.js).

import { HttpError } from './http.js';
import { getEmpresa } from './empresas.js';

export const EMPRESA_FIELD = 'empresa';

export function canAccessEmpresa(ctx, empresaId) {
  if (ctx.isSuperAdmin) return true;
  return !!empresaId && empresaId === ctx.empresaId;
}

export function assertEmpresaAccess(ctx, empresaId) {
  if (!canAccessEmpresa(ctx, empresaId)) throw new HttpError(403);
}

/**
 * Filtro de lectura por empresa a partir de la query. SUPER_ADMIN: el ?empresa= es un
 * filtro opcional (null = todas). Usuario de empresa: siempre su empresa; pedir otra → 403.
 */
export function empresaFilter(ctx, query = {}) {
  const pedido = typeof query.empresa === 'string' && query.empresa && query.empresa !== 'TODAS' ? query.empresa : null;
  if (ctx.isSuperAdmin) return pedido;
  if (pedido && pedido !== ctx.empresaId) throw new HttpError(403);
  return ctx.empresaId;
}

/** Recorta un arreglo de registros a lo que el usuario puede ver. */
export function scopeArray(ctx, list, filtro = null) {
  const arr = Array.isArray(list) ? list : [];
  const empresa = ctx.isSuperAdmin ? filtro : ctx.empresaId;
  if (!empresa) return arr;
  return arr.filter(r => r && r[EMPRESA_FIELD] === empresa);
}

/** Recorta un objeto indexado por empresa ({ [empresaId]: ... }) a lo que el usuario puede ver. */
export function scopeKeyed(ctx, obj, filtro = null) {
  const data = obj && typeof obj === 'object' ? obj : {};
  const empresa = ctx.isSuperAdmin ? filtro : ctx.empresaId;
  if (!empresa) return data;
  return Object.prototype.hasOwnProperty.call(data, empresa) ? { [empresa]: data[empresa] } : {};
}

/**
 * Busca un registro por id y verifica que pertenezca a una empresa accesible (anti-IDOR).
 * 404 si no existe; 403 si existe pero es de otra empresa.
 */
export function findOwned(ctx, list, id) {
  const idx = list.findIndex(r => r && r.id === id);
  if (idx === -1) throw new HttpError(404);
  if (!canAccessEmpresa(ctx, list[idx][EMPRESA_FIELD])) throw new HttpError(403);
  return idx;
}

/**
 * Decide la empresa de un registro NUEVO (o del destino de un cambio de empresa).
 *   - Usuario de empresa: su empresa. Si el cliente manda otra → 403.
 *   - SUPER_ADMIN: la que venga en el registro; debe existir (integridad referencial) y,
 *     si `requireActiva`, estar activa.
 */
export async function resolveEmpresaForWrite(ctx, solicitada, { requireActiva = true } = {}) {
  if (!ctx.isSuperAdmin) {
    if (solicitada && solicitada !== ctx.empresaId) throw new HttpError(403);
    return ctx.empresaId;
  }
  if (!solicitada || typeof solicitada !== 'string') {
    throw new HttpError(422, 'La empresa es obligatoria.', { empresa: 'Campo obligatorio.' });
  }
  const empresa = await getEmpresa(solicitada);
  if (!empresa) throw new HttpError(422, 'La empresa no existe.', { empresa: 'La empresa no existe.' });
  if (requireActiva && empresa.estado !== 'activo') throw new HttpError(422, 'La empresa está inactiva.', { empresa: 'La empresa está inactiva.' });
  return empresa.id;
}

/**
 * Aplica un `patch` a un registro existente respetando el aislamiento:
 *   - `id` nunca se puede cambiar.
 *   - `empresa`: un usuario de empresa no puede moverlo a otra (403); el SUPER_ADMIN sí,
 *     pero solo a una empresa existente.
 */
export async function applyScopedPatch(ctx, actual, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(400, 'El cambio enviado no es válido.');
  const { id: _id, ...resto } = patch;
  if (Object.prototype.hasOwnProperty.call(resto, EMPRESA_FIELD) && resto[EMPRESA_FIELD] !== actual[EMPRESA_FIELD]) {
    resto[EMPRESA_FIELD] = await resolveEmpresaForWrite(ctx, resto[EMPRESA_FIELD]);
  } else {
    delete resto[EMPRESA_FIELD];
  }
  return { ...actual, ...resto, id: actual.id };
}

/**
 * Valida la empresa destino de una escritura en un documento indexado por empresa
 * ({ [empresaKey]: ... }): usuario de empresa → solo la suya (403); SUPER_ADMIN → debe existir.
 */
export async function assertKeyedWrite(ctx, empresaKey) {
  if (typeof empresaKey !== 'string' || !empresaKey.trim() || empresaKey.length > 80) {
    throw new HttpError(400, 'Falta empresaKey o es inválido.');
  }
  if (!ctx.isSuperAdmin) {
    if (empresaKey !== ctx.empresaId) throw new HttpError(403);
    return empresaKey;
  }
  if (!(await getEmpresa(empresaKey))) throw new HttpError(422, 'La empresa no existe.', { empresaKey: 'La empresa no existe.' });
  return empresaKey;
}
