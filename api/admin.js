// api/admin.js
// Módulo de ADMINISTRACIÓN multiempresa: empresas, usuarios y asignación de registros
// heredados sin empresa. Un solo archivo (una sola función serverless) con `?resource=`
// para no superar el límite de funciones del plan de Vercel; vercel.json además expone
// rutas REST equivalentes (/api/empresas, /api/usuarios, /api/empresas/:id, ...).
//
//   GET    ?resource=empresas              → SUPER_ADMIN: todas (+ nº de usuarios).
//                                            Usuario de empresa: solo la suya.
//   POST   ?resource=empresas              → SUPER_ADMIN: crear empresa.
//   PATCH  ?resource=empresas&id=ID        → SUPER_ADMIN: editar / activar / desactivar.
//   GET    ?resource=usuarios[&empresa=ID] → SUPER_ADMIN: listar usuarios.
//   POST   ?resource=usuarios              → SUPER_ADMIN: crear usuario.
//   PATCH  ?resource=usuarios&id=ID        → SUPER_ADMIN: editar, activar/desactivar,
//                                            cambiar rol, cambiar empresa, resetear clave.
//   DELETE ?resource=usuarios&id=ID        → SUPER_ADMIN: eliminar usuario.
//   GET    ?resource=sin-empresa           → SUPER_ADMIN: registros heredados sin empresa válida.
//   PATCH  ?resource=sin-empresa           → SUPER_ADMIN: { coleccion, id, empresa } asigna empresa.
//
// Toda la autorización se decide aquí (requireSuperAdmin / requireAuth), no en la UI.

import { datos } from '../lib/datos/index.js';
import { requireAuth, requireSuperAdmin, destroyUserSessions } from '../lib/auth.js';
import { listEmpresas, crearEmpresa, actualizarEmpresa } from '../lib/empresas.js';
import { listUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario, usuarioPublico } from '../lib/usuarios.js';
import { auditarSinEmpresa, COLECCIONES_ARRAY } from '../lib/migrations.js';
import { resolveEmpresaForWrite } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';

function idParam(req) {
  const id = req.query?.id;
  if (typeof id !== 'string' || !id.trim()) throw new HttpError(400, 'Falta el id.');
  return id;
}

async function empresas(req, res) {
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    if (!ctx.isSuperAdmin) return res.status(200).json({ empresas: [ctx.empresa] });
    const [lista, usuarios] = await Promise.all([listEmpresas(), listUsuarios()]);
    const conteo = {};
    usuarios.forEach(u => { if (u.empresa_id) conteo[u.empresa_id] = (conteo[u.empresa_id] || 0) + 1; });
    return res.status(200).json({ empresas: lista.map(e => ({ ...e, usuarios: conteo[e.id] || 0 })) });
  }
  await requireSuperAdmin(req);
  if (req.method === 'POST') {
    const empresa = await crearEmpresa(req.body);
    return res.status(201).json({ empresa });
  }
  if (req.method === 'PATCH' || req.method === 'PUT') {
    const empresa = await actualizarEmpresa(idParam(req), req.body);
    return res.status(200).json({ empresa });
  }
  return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'PUT']);
}

async function usuarios(req, res) {
  const ctx = await requireSuperAdmin(req);
  if (req.method === 'GET') {
    let lista = await listUsuarios();
    const { empresa } = req.query || {};
    if (typeof empresa === 'string' && empresa) lista = lista.filter(u => u.empresa_id === empresa);
    return res.status(200).json({ usuarios: lista.map(usuarioPublico) });
  }
  if (req.method === 'POST') {
    const usuario = await crearUsuario(req.body);
    return res.status(201).json({ usuario: usuarioPublico(usuario) });
  }
  if (req.method === 'PATCH' || req.method === 'PUT') {
    const id = idParam(req);
    const { anterior, actualizado } = await actualizarUsuario(id, req.body, { actorId: ctx.userId });
    // Cualquier cambio de privilegios o credenciales invalida las sesiones abiertas del
    // usuario afectado: tras cambiar de empresa ya no conserva acceso a la anterior ni
    // siquiera en una pestaña que tuviera abierta.
    const cambioSensible = anterior.estado !== actualizado.estado
      || anterior.role !== actualizado.role
      || anterior.empresa_id !== actualizado.empresa_id
      || anterior.password_hash !== actualizado.password_hash;
    if (cambioSensible && id !== ctx.userId) await destroyUserSessions(id);
    return res.status(200).json({ usuario: usuarioPublico(actualizado) });
  }
  if (req.method === 'DELETE') {
    const id = idParam(req);
    await eliminarUsuario(id, { actorId: ctx.userId });
    await destroyUserSessions(id);
    return res.status(200).json({ ok: true });
  }
  return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
}

async function sinEmpresa(req, res) {
  const ctx = await requireSuperAdmin(req);
  if (req.method === 'GET') {
    return res.status(200).json({ informe: await auditarSinEmpresa() });
  }
  if (req.method === 'PATCH') {
    const { coleccion, id, empresa } = req.body || {};
    const def = COLECCIONES_ARRAY.find(c => c.coleccion === coleccion);
    if (!def || typeof id !== 'string' || !id) throw new HttpError(400, 'Falta la colección o el id.');
    const destino = await resolveEmpresaForWrite(ctx, empresa);
    const ids = new Set((await listEmpresas()).map(e => e.id));
    await datos[def.coleccion].actualizar(id, actual => {
      if (ids.has(actual.empresa)) throw new HttpError(409, 'El registro ya tiene una empresa válida asignada.');
      // Se conserva el valor original para que la asignación sea auditable y reversible.
      return { ...actual, empresa: destino, empresa_anterior: actual.empresa ?? null };
    });
    return res.status(200).json({ informe: await auditarSinEmpresa() });
  }
  return methodNotAllowed(res, ['GET', 'PATCH']);
}

const RECURSOS = { empresas, usuarios, 'sin-empresa': sinEmpresa };

export default withErrors('api/admin', 'No se pudo completar la operación de administración.', async (req, res) => {
  const recurso = RECURSOS[req.query?.resource];
  if (!recurso) throw new HttpError(404);
  return recurso(req, res);
});
