// lib/empresas.js
// Repositorio de EMPRESAS (tenants). Se guardan en Vercel KV bajo `cmms:empresas` como un
// arreglo — mismo patrón read-modify-write que el resto del proyecto (equipos, personal...).
//
// Identificador (`id` = empresa_id):
//   - Las 5 empresas que el sistema ya tenía hardcodeadas en el frontend (MACROMED, MEIDE,
//     NP MEDICAL, DIAGNOSTIK, AUNAR SALUD) conservan su clave histórica como id. Todos los
//     registros existentes (equipos, personal, reportes...) ya guardan esa clave en su campo
//     `empresa`, así que esa columna pasa a ser la clave foránea `empresa_id` SIN reescribir
//     ni un solo registro existente.
//   - Las empresas nuevas reciben un id derivado del nombre (en mayúsculas, único e
//     inmutable). Cambiar el nombre después no cambia el id → no se rompen referencias.

import { kv } from './db.js';
import { leer } from './coleccion.js';
import { HttpError } from './http.js';

export const EMPRESAS_KEY = 'cmms:empresas';
const EQUIPOS_KEY = 'cmms:equipos';

/** Clave de comparación de sedes: sin tildes, mayúsculas ni espacios repetidos. */
export function normSede(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}
export const ESTADOS = ['activo', 'inactivo'];

// Datos iniciales (seed) — son las empresas REALES que ya usaba el proyecto (ver el antiguo
// COMPANIES de src/App.jsx y los logos en public/logos). Datos fiscales/contacto quedan
// vacíos para que el SUPER_ADMIN los complete desde Administración → Empresas.
export const EMPRESAS_SEED = [
  { id: 'MACROMED', nombre: 'MACROMED', color: '#002485', logo: '/logos/MACROMED.png', sedes: ['Bogotá'] },
  { id: 'MEIDE', nombre: 'MEIDE', color: '#24546A', logo: '/logos/MEIDE.png', sedes: ['Armenia Berlín', 'Armenia Fundadores', 'Manizales Belén', 'Manizales Arboleda', 'La Dorada', 'Unidad Móvil'] },
  { id: 'NP MEDICAL', nombre: 'NP MEDICAL', color: '#3F8E6F', logo: '/logos/NP_MEDICAL.png', sedes: ['Bogotá Samper', 'Bogotá Sur', 'Fontibón', 'Girardot', 'Tunja'] },
  { id: 'DIAGNOSTIK', nombre: 'DIAGNOSTIK', color: '#C62828', logo: '/logos/DIAGNOSTIK.png', sedes: ['Armenia Berlín', 'Armenia Fundadores', 'Manizales Belén', 'Bogotá', 'Chapinero', 'Villavicencio', 'La Dorada'] },
  { id: 'AUNAR SALUD', nombre: 'AUNAR SALUD', color: '#009EB7', logo: '/logos/AUNAR.png', sedes: ['Bogotá', 'Bogotá - Segundo Piso', 'Bogotá - Quinto Piso', 'Bogotá - Sexto Piso', 'Villavicencio', 'Neiva'] },
];

const PALETA_NUEVAS = ['#6D28D9', '#B45309', '#0F766E', '#BE185D', '#4D7C0F', '#1D4ED8', '#9A3412'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const ID_RE = /^[A-Z0-9][A-Z0-9 ._-]{1,39}$/;

export function nuevaEmpresaBase(data, now = new Date().toISOString()) {
  return {
    id: data.id,
    nombre: data.nombre,
    nit: data.nit || '',
    direccion: data.direccion || '',
    telefono: data.telefono || '',
    email: data.email || '',
    estado: data.estado || 'activo',
    color: data.color || PALETA_NUEVAS[0],
    logo: data.logo || '',
    sedes: data.sedes && data.sedes.length ? data.sedes : ['Principal'],
    created_at: data.created_at || now,
    updated_at: now,
  };
}

export async function listEmpresas() {
  const list = await kv.get(EMPRESAS_KEY);
  return Array.isArray(list) ? list : [];
}

export async function getEmpresa(id) {
  if (!id) return null;
  return (await listEmpresas()).find(e => e.id === id) || null;
}

export async function saveEmpresas(list) {
  await kv.set(EMPRESAS_KEY, list);
}

function texto(v, max, campo, errores, { requerido = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (requerido) errores[campo] = 'Campo obligatorio.';
    return '';
  }
  if (typeof v !== 'string') { errores[campo] = 'Debe ser texto.'; return ''; }
  const limpio = v.trim();
  if (requerido && !limpio) errores[campo] = 'Campo obligatorio.';
  if (limpio.length > max) errores[campo] = `Máximo ${max} caracteres.`;
  return limpio;
}

/** Normaliza el id derivado del nombre: MAYÚSCULAS, sin tildes, sin caracteres raros. */
export function idDesdeNombre(nombre) {
  return String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ._-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

/**
 * Valida y normaliza el cuerpo de creación/edición de empresa. Whitelist estricta: solo
 * estos campos pueden venir del cliente (nada de `id` en edición, ni `created_at`, etc.).
 */
export function validarEmpresa(body, { parcial = false } = {}) {
  const errores = {};
  const out = {};
  const b = body && typeof body === 'object' ? body : {};

  if (!parcial || b.nombre !== undefined) out.nombre = texto(b.nombre, 120, 'nombre', errores, { requerido: true });
  if (b.nit !== undefined) out.nit = texto(b.nit, 40, 'nit', errores);
  if (b.direccion !== undefined) out.direccion = texto(b.direccion, 200, 'direccion', errores);
  if (b.telefono !== undefined) out.telefono = texto(b.telefono, 40, 'telefono', errores);
  if (b.email !== undefined) {
    out.email = texto(b.email, 160, 'email', errores).toLowerCase();
    if (out.email && !EMAIL_RE.test(out.email)) errores.email = 'Email no válido.';
  }
  if (b.estado !== undefined || !parcial) {
    out.estado = b.estado === undefined ? 'activo' : b.estado;
    if (!ESTADOS.includes(out.estado)) errores.estado = 'Estado no válido.';
  }
  if (b.color !== undefined && b.color !== '') {
    if (typeof b.color !== 'string' || !COLOR_RE.test(b.color)) errores.color = 'Color no válido (formato #RRGGBB).';
    else out.color = b.color;
  }
  if (b.sedes !== undefined) {
    const lista = Array.isArray(b.sedes) ? b.sedes : typeof b.sedes === 'string' ? b.sedes.split(/[\n,]/) : null;
    if (!lista) errores.sedes = 'Formato de sedes no válido.';
    else {
      const sedes = [...new Set(lista.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean))];
      if (sedes.length === 0) errores.sedes = 'Debe tener al menos una sede.';
      else if (sedes.length > 50 || sedes.some(s => s.length > 80)) errores.sedes = 'Máximo 50 sedes de 80 caracteres.';
      else out.sedes = sedes;
    }
  }
  if (Object.keys(errores).length) throw new HttpError(422, 'Los datos de la empresa no son válidos.', errores);
  return out;
}

export async function crearEmpresa(body) {
  const data = validarEmpresa(body);
  const empresas = await listEmpresas();
  const id = idDesdeNombre(data.nombre);
  if (!ID_RE.test(id)) throw new HttpError(422, 'El nombre debe contener letras o números.', { nombre: 'Nombre no válido.' });
  const nombreNorm = data.nombre.toLowerCase();
  if (empresas.some(e => e.id === id || e.nombre.toLowerCase() === nombreNorm)) {
    throw new HttpError(409, 'Ya existe una empresa con ese nombre.');
  }
  if (data.nit && empresas.some(e => e.nit && e.nit === data.nit)) {
    throw new HttpError(409, 'Ya existe una empresa con ese NIT.');
  }
  const empresa = nuevaEmpresaBase({ ...data, id, color: data.color || PALETA_NUEVAS[empresas.length % PALETA_NUEVAS.length] });
  await saveEmpresas([...empresas, empresa]);
  return empresa;
}

export async function actualizarEmpresa(id, body) {
  const data = validarEmpresa(body, { parcial: true });
  const empresas = await listEmpresas();
  const idx = empresas.findIndex(e => e.id === id);
  if (idx === -1) throw new HttpError(404, 'La empresa no existe.');
  if (data.nombre) {
    const n = data.nombre.toLowerCase();
    if (empresas.some(e => e.id !== id && e.nombre.toLowerCase() === n)) throw new HttpError(409, 'Ya existe una empresa con ese nombre.');
  }
  if (data.nit && empresas.some(e => e.id !== id && e.nit && e.nit === data.nit)) {
    throw new HttpError(409, 'Ya existe una empresa con ese NIT.');
  }
  if (data.sedes) {
    // Integridad: no se puede quitar de la empresa una sede que todavía tienen sus equipos
    // (p. ej. las cargadas con el cronograma). Antes esto dejaba esas sedes fuera de la hoja
    // de vida y de los filtros, y una reimportación de Excel las reasignaba a otra sede.
    const nuevas = new Set(data.sedes.map(normSede));
    const enUso = new Map();
    (await leer(EQUIPOS_KEY, () => [])).data.forEach(e => {
      if (!e || e.empresa !== id || !e.sede || nuevas.has(normSede(e.sede))) return;
      enUso.set(e.sede, (enUso.get(e.sede) || 0) + 1);
    });
    if (enUso.size) {
      const detalle = [...enUso].map(([sede, n]) => `${sede} (${n} equipo${n !== 1 ? 's' : ''})`).join(', ');
      throw new HttpError(409, `No se pueden quitar sedes que todavía tienen equipos: ${detalle}. Mueve primero esos equipos a otra sede.`, { sedes: `Sedes en uso: ${detalle}` });
    }
  }
  const actualizada = { ...empresas[idx], ...data, id, updated_at: new Date().toISOString() };
  const lista = [...empresas];
  lista[idx] = actualizada;
  await saveEmpresas(lista);
  return actualizada;
}

/** Vista pública mínima de una empresa (sin datos de contacto) — para el formulario público. */
export function empresaPublica(e) {
  return { id: e.id, nombre: e.nombre, color: e.color, logo: e.logo, sedes: e.sedes };
}
