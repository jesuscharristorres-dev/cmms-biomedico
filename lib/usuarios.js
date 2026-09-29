// lib/usuarios.js
// Repositorio de USUARIOS. Se guardan en Vercel KV bajo `cmms:usuarios` (arreglo).
// La contraseña NUNCA se guarda en texto plano: solo `password_hash` (scrypt con salt,
// ver lib/auth.js → hashPassword), y ese campo nunca sale del servidor (usuarioPublico).
//
// Roles:
//   SUPER_ADMIN — acceso global. empresa_id = null.
//   EMPRESA     — gestiona (lee y escribe) SOLO los datos de su empresa_id.
//   LECTURA     — solo lectura, SOLO de su empresa_id. Reemplaza al antiguo "Modo invitado"
//                 anónimo, que leía los datos de las 5 empresas sin iniciar sesión y era
//                 incompatible con el aislamiento entre empresas.

import crypto from 'node:crypto';
import { kv } from './db.js';
import { HttpError } from './http.js';
import { hashPassword } from './password.js';
import { getEmpresa } from './empresas.js';

export const USUARIOS_KEY = 'cmms:usuarios';
export const ROLES = ['SUPER_ADMIN', 'EMPRESA', 'LECTURA'];
export const ROLES_CON_EMPRESA = ['EMPRESA', 'LECTURA'];
export const ESTADOS = ['activo', 'inactivo'];
export const PASSWORD_MIN = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function listUsuarios() {
  const list = await kv.get(USUARIOS_KEY);
  return Array.isArray(list) ? list : [];
}

export async function saveUsuarios(list) {
  await kv.set(USUARIOS_KEY, list);
}

export async function getUsuario(id) {
  if (!id) return null;
  return (await listUsuarios()).find(u => u.id === id) || null;
}

/** Busca por email o por nombre de usuario (el login histórico usaba un "usuario", no un email). */
export async function findUsuarioByLogin(identificador) {
  const needle = String(identificador || '').trim().toLowerCase();
  if (!needle) return null;
  return (await listUsuarios()).find(u =>
    (u.email && u.email.toLowerCase() === needle) || (u.username && u.username.toLowerCase() === needle),
  ) || null;
}

/** Lo único que sale del servidor sobre un usuario — sin password_hash. */
export function usuarioPublico(u) {
  if (!u) return null;
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    username: u.username || '',
    role: u.role,
    empresa_id: u.empresa_id ?? null,
    estado: u.estado,
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

function textoRequerido(v, max, campo, errores) {
  if (typeof v !== 'string' || !v.trim()) { errores[campo] = 'Campo obligatorio.'; return ''; }
  const limpio = v.trim();
  if (limpio.length > max) errores[campo] = `Máximo ${max} caracteres.`;
  return limpio;
}

/**
 * Valida el cuerpo de creación/edición. Whitelist estricta de campos (anti mass-assignment):
 * nombre, email, password, role, empresa_id, estado. Cualquier otro campo se ignora.
 */
async function validarUsuario(body, { parcial, actual }) {
  const b = body && typeof body === 'object' ? body : {};
  const errores = {};
  const out = {};

  if (!parcial || b.nombre !== undefined) out.nombre = textoRequerido(b.nombre, 120, 'nombre', errores);
  if (!parcial || b.email !== undefined) {
    out.email = textoRequerido(b.email, 160, 'email', errores).toLowerCase();
    if (out.email && !EMAIL_RE.test(out.email)) errores.email = 'Email no válido.';
  }
  if (!parcial || (b.password !== undefined && b.password !== '')) {
    if (typeof b.password !== 'string' || b.password.length < PASSWORD_MIN) {
      errores.password = `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
    } else if (b.password.length > 200) {
      errores.password = 'Contraseña demasiado larga.';
    } else {
      out.password = b.password;
    }
  }
  if (!parcial || b.role !== undefined) {
    out.role = b.role;
    if (!ROLES.includes(out.role)) errores.role = 'Rol no válido.';
  }
  if (!parcial || b.estado !== undefined) {
    out.estado = b.estado === undefined ? 'activo' : b.estado;
    if (!ESTADOS.includes(out.estado)) errores.estado = 'Estado no válido.';
  }
  if (b.empresa_id !== undefined) out.empresa_id = b.empresa_id === '' ? null : b.empresa_id;

  // Coherencia rol ↔ empresa, evaluada sobre el estado FINAL del usuario.
  const roleFinal = out.role ?? actual?.role;
  let empresaFinal = out.empresa_id !== undefined ? out.empresa_id : actual?.empresa_id ?? null;
  if (roleFinal === 'SUPER_ADMIN') {
    empresaFinal = null; // el SUPER_ADMIN nunca queda atado a una empresa
  } else if (ROLES_CON_EMPRESA.includes(roleFinal)) {
    if (!empresaFinal || typeof empresaFinal !== 'string') {
      errores.empresa_id = 'La empresa es obligatoria para este rol.';
    } else {
      const empresa = await getEmpresa(empresaFinal);
      if (!empresa) errores.empresa_id = 'La empresa no existe.';
      else if (empresa.estado !== 'activo' && empresaFinal !== actual?.empresa_id) errores.empresa_id = 'La empresa está inactiva.';
    }
  }
  if (roleFinal !== undefined) out.empresa_id = empresaFinal;

  if (Object.keys(errores).length) throw new HttpError(422, 'Los datos del usuario no son válidos.', errores);
  return out;
}

function activosSuperAdmin(usuarios) {
  return usuarios.filter(u => u.role === 'SUPER_ADMIN' && u.estado === 'activo');
}

export async function crearUsuario(body) {
  const data = await validarUsuario(body, { parcial: false });
  const usuarios = await listUsuarios();
  if (usuarios.some(u => (u.email || '').toLowerCase() === data.email || (u.username || '').toLowerCase() === data.email)) {
    throw new HttpError(409, 'Ya existe un usuario con ese email.');
  }
  const now = new Date().toISOString();
  const usuario = {
    id: `usr_${crypto.randomBytes(9).toString('hex')}`,
    nombre: data.nombre,
    email: data.email,
    username: '',
    password_hash: hashPassword(data.password),
    role: data.role,
    empresa_id: data.empresa_id ?? null,
    estado: data.estado,
    created_at: now,
    updated_at: now,
  };
  await saveUsuarios([...usuarios, usuario]);
  return usuario;
}

/**
 * Edita un usuario. `actorId` es el SUPER_ADMIN que hace la operación: no puede
 * desactivarse, degradarse ni quitarse el rol a sí mismo, y nunca puede quedar el
 * sistema sin ningún SUPER_ADMIN activo (evita bloquear la administración por error).
 */
export async function actualizarUsuario(id, body, { actorId } = {}) {
  const usuarios = await listUsuarios();
  const idx = usuarios.findIndex(u => u.id === id);
  if (idx === -1) throw new HttpError(404, 'El usuario no existe.');
  const actual = usuarios[idx];
  const data = await validarUsuario(body, { parcial: true, actual });

  if (data.email && usuarios.some(u => u.id !== id && ((u.email || '').toLowerCase() === data.email || (u.username || '').toLowerCase() === data.email))) {
    throw new HttpError(409, 'Ya existe un usuario con ese email.');
  }

  const { password, ...resto } = data;
  const actualizado = { ...actual, ...resto, id, updated_at: new Date().toISOString() };
  if (password) actualizado.password_hash = hashPassword(password);

  if (actorId === id && (actualizado.estado !== 'activo' || actualizado.role !== 'SUPER_ADMIN') && actual.role === 'SUPER_ADMIN') {
    throw new HttpError(409, 'No puedes desactivarte ni quitarte el rol de SUPER_ADMIN a ti mismo.');
  }
  const lista = [...usuarios];
  lista[idx] = actualizado;
  if (activosSuperAdmin(lista).length === 0) {
    throw new HttpError(409, 'Debe quedar al menos un SUPER_ADMIN activo.');
  }
  await saveUsuarios(lista);
  return { anterior: actual, actualizado };
}

export async function eliminarUsuario(id, { actorId } = {}) {
  const usuarios = await listUsuarios();
  const actual = usuarios.find(u => u.id === id);
  if (!actual) throw new HttpError(404, 'El usuario no existe.');
  if (actorId === id) throw new HttpError(409, 'No puedes eliminar tu propio usuario.');
  const lista = usuarios.filter(u => u.id !== id);
  if (activosSuperAdmin(lista).length === 0) throw new HttpError(409, 'Debe quedar al menos un SUPER_ADMIN activo.');
  await saveUsuarios(lista);
  return actual;
}
