// lib/datos/mapeo.js
// Conversión SIN PÉRDIDA entre los registros JSON de la app (tal como viven hoy en Redis) y
// las filas de Supabase (supabase/migrations/*_esquema_inicial.sql). La usan el repositorio
// de Supabase (lib/datos/supabase.js) y los scripts de migración (scripts/migracion/*).
//
// Regla general: `datos` (jsonb) guarda el registro COMPLETO; las demás columnas son copias
// para consultar. Excepción: en los equipos, los arreglos de historial NO vacíos salen de
// `datos` y van a sus tablas hijas (los vacíos se quedan en `datos` como []), para que al
// reconstruir el registro vuelva exactamente igual.

const txt = (v) => (v === undefined || v === null ? null : String(v));

export const HIJOS_EQUIPO = {
  preventivos: 'equipo_preventivos',
  correctivos: 'equipo_correctivos',
  calibraciones: 'equipo_calibraciones',
  instalaciones: 'equipo_instalaciones',
  documentos: 'equipo_documentos',
  bajas: 'equipo_bajas',
};

/** Colecciones de registros con `id` (antes arreglos en una sola clave de Redis). */
export const REGISTROS = {
  equipos: {
    tabla: 'equipos',
    claveRedis: 'cmms:equipos',
    columnas: (r) => ({
      empresa: txt(r.empresa), sede: txt(r.sede), equipo: txt(r.equipo), marca: txt(r.marca),
      modelo: txt(r.modelo), numero_serie: txt(r.numeroSerie), inventario: txt(r.inventario), estado: txt(r.estado),
    }),
    hijos: HIJOS_EQUIPO,
    // Columnas del listado resumido (sin historial ni `datos`).
    resumen: ['id', 'empresa', 'sede', 'equipo', 'marca', 'modelo', 'numero_serie', 'inventario', 'estado'],
  },
  personal: {
    tabla: 'personal',
    claveRedis: 'cmms:personal',
    columnas: (r) => ({
      empresa: txt(r.empresa), nombre_completo: txt(r.nombreCompleto), numero_documento: txt(r.numeroDocumento),
      cargo: txt(r.cargo), estado: txt(r.estado),
    }),
    hijos: {},
    resumen: ['id', 'empresa', 'nombre_completo', 'numero_documento', 'cargo', 'estado'],
  },
  reportesFalla: {
    tabla: 'reportes_falla',
    claveRedis: 'cmms:reportesFalla',
    columnas: (r) => ({
      empresa: txt(r.empresa), sede: txt(r.sede), equipo_id: txt(r.equipoId), fecha: txt(r.fecha),
      estado: txt(r.estado), prioridad: txt(r.prioridad),
    }),
    hijos: {},
    resumen: ['id', 'empresa', 'sede', 'equipo_id', 'fecha', 'estado', 'prioridad'],
  },
};

/** snake_case de columnas de resumen → nombres de campo de la app. */
export const CAMPO_DE_COLUMNA = { numero_serie: 'numeroSerie', nombre_completo: 'nombreCompleto', numero_documento: 'numeroDocumento', equipo_id: 'equipoId' };

/**
 * Registro de la app → { fila, hijos }. `hijos`: { tabla_hija: [ítems] } solo con los arreglos
 * no vacíos (o, con `todos`, también los vacíos: para reemplazarlos en una actualización).
 */
export function aFila(def, registro, orden, { soloHijos = null } = {}) {
  const datos = { ...registro };
  const hijos = {};
  for (const [campo, tabla] of Object.entries(def.hijos)) {
    const lista = registro[campo];
    if (Array.isArray(lista) && lista.length > 0) {
      delete datos[campo];
      if (!soloHijos || soloHijos.has(campo)) hijos[tabla] = lista;
    } else if (soloHijos && soloHijos.has(campo)) {
      hijos[tabla] = []; // el arreglo quedó vacío o desapareció: borrar sus filas
    }
  }
  return { fila: { id: String(registro.id), ...def.columnas(registro), orden, datos }, hijos };
}

/** Fila (con hijos embebidos por alias = nombre del campo) → registro de la app. */
export function desdeFila(def, fila) {
  const registro = { ...(fila.datos || {}) };
  for (const campo of Object.keys(def.hijos)) {
    const filas = fila[campo];
    if (Array.isArray(filas) && filas.length > 0) {
      registro[campo] = [...filas].sort((a, b) => a.orden - b.orden).map(h => h.datos);
    }
  }
  return registro;
}

/** Campos de historial cuyo contenido cambió entre dos versiones del registro. */
export function hijosCambiados(def, antes, despues) {
  const cambiados = new Set();
  for (const campo of Object.keys(def.hijos)) {
    if (JSON.stringify(antes?.[campo] ?? null) !== JSON.stringify(despues?.[campo] ?? null)) cambiados.add(campo);
  }
  return cambiados;
}

/** Selección PostgREST de un registro completo con su historial embebido. */
export function seleccionCompleta(def) {
  const embebidos = Object.entries(def.hijos).map(([campo, tabla]) => `${campo}:${tabla}(orden,datos)`);
  return ['id', 'orden', 'version', 'datos', ...embebidos].join(',');
}

// ---------------------------------------------------------------------------------------
// Empresas y usuarios
// ---------------------------------------------------------------------------------------
export function empresaAFila(e, orden = 0) {
  const { sedes, ...resto } = e;
  return {
    fila: {
      id: String(e.id), nombre: txt(e.nombre) || String(e.id), nit: txt(e.nit), estado: e.estado === 'inactivo' ? 'inactivo' : 'activo',
      color: txt(e.color), logo: txt(e.logo), orden, datos: Array.isArray(sedes) ? resto : { ...resto, __sinSedes: true },
      created_at: e.created_at || null,
    },
    sedes: Array.isArray(sedes) ? sedes.map(String) : [],
  };
}
export function empresaDesdeFila(fila) {
  const e = { ...(fila.datos || {}) };
  const sinSedes = e.__sinSedes === true;
  delete e.__sinSedes;
  if (!sinSedes) e.sedes = Array.isArray(fila.sedes) ? [...fila.sedes].sort((a, b) => a.orden - b.orden).map(s => s.nombre) : [];
  return e;
}

export function usuarioAFila(u, orden = 0) {
  return {
    id: String(u.id), email: txt(u.email), username: txt(u.username), nombre: txt(u.nombre), role: u.role,
    empresa_id: u.empresa_id ?? null, estado: u.estado === 'inactivo' ? 'inactivo' : 'activo',
    password_hash: txt(u.password_hash), orden, datos: u, created_at: u.created_at || new Date().toISOString(),
  };
}
export const usuarioDesdeFila = (fila) => ({ ...(fila.datos || {}) });

// ---------------------------------------------------------------------------------------
// Documentos indexados por empresa → filas
// ---------------------------------------------------------------------------------------
export function planesAFilas(obj) {
  const filas = [];
  for (const [empresa, campos] of Object.entries(obj || {})) {
    for (const [campo, valor] of Object.entries(campos || {})) filas.push({ empresa, campo, valor: valor ?? null });
  }
  return filas;
}
export function planesDesdeFilas(filas) {
  const out = {};
  for (const f of filas) (out[f.empresa] ||= {})[f.campo] = f.valor;
  return out;
}

export function tecnoReportesAFilas(obj) {
  const filas = [];
  for (const [empresa, sedes] of Object.entries(obj || {})) {
    for (const [sede, anios] of Object.entries(sedes || {})) {
      for (const [anio, trimestres] of Object.entries(anios || {})) {
        for (const [trimestre, valor] of Object.entries(trimestres || {})) filas.push({ empresa, sede, anio, trimestre, valor: valor ?? null });
      }
    }
  }
  return filas;
}
export function tecnoReportesDesdeFilas(filas) {
  const out = {};
  for (const f of filas) ((((out[f.empresa] ||= {})[f.sede] ||= {})[f.anio] ||= {}))[f.trimestre] = f.valor;
  return out;
}

export function limpiezaAFilas(obj) {
  const filas = [];
  for (const [empresa, sedes] of Object.entries(obj || {})) {
    for (const [sede, anios] of Object.entries(sedes || {})) {
      for (const [anio, meses] of Object.entries(anios || {})) {
        for (const [mes, datos] of Object.entries(meses || {})) filas.push({ empresa, sede, anio, mes, datos: datos ?? {} });
      }
    }
  }
  return filas;
}
export function limpiezaDesdeFilas(filas) {
  const out = {};
  for (const f of filas) ((((out[f.empresa] ||= {})[f.sede] ||= {})[f.anio] ||= {}))[f.mes] = f.datos;
  return out;
}

// tecnoTransversal: { docKey: valorGlobal } o { docKey: { _default?, [empresa]: valor } }.
// empresa '' = valor global (plano, de cualquier tipo, incluido un objeto vacío).
export function transversalAFilas(obj) {
  const filas = [];
  for (const [docKey, v] of Object.entries(obj || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) {
      for (const [empresa, valor] of Object.entries(v)) filas.push({ doc_key: docKey, empresa, valor: valor ?? null });
    } else {
      filas.push({ doc_key: docKey, empresa: '', valor: v ?? null });
    }
  }
  return filas;
}
export function transversalDesdeFilas(filas) {
  const out = {};
  for (const f of filas) {
    if (f.empresa === '') out[f.doc_key] = f.valor;
    else (out[f.doc_key] && typeof out[f.doc_key] === 'object' ? out[f.doc_key] : (out[f.doc_key] = {}))[f.empresa] = f.valor;
  }
  return out;
}

/**
 * Para comparar Redis vs Supabase: quita los objetos vacíos de los documentos indexados
 * (p. ej. { MEIDE: {} }), que en tablas no tienen fila y no contienen información.
 */
export function sinVacios(v) {
  if (Array.isArray(v)) return v.map(sinVacios);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    const y = sinVacios(x);
    if (y && typeof y === 'object' && !Array.isArray(y) && Object.keys(y).length === 0) continue;
    out[k] = y;
  }
  return out;
}

/** Igualdad profunda sin depender del orden de las claves (jsonb no conserva ese orden). */
export function igualesJson(a, b) {
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, norm(v[k])]));
    return v;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
