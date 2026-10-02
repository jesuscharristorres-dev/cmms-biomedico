// lib/datos/redis.js
// Implementación ACTUAL de los repositorios: Vercel KV / Upstash Redis, con las mismas claves
// y el mismo formato de siempre (una clave JSON por colección). Las lecturas usan la caché por
// versión y las escrituras el SET condicional de lib/coleccion.js.

import { HttpError } from '../http.js';
import { kv } from '../db.js';
import { leer, mutar, marca as marcaClave } from '../coleccion.js';
import { REGISTROS, CAMPO_DE_COLUMNA } from './mapeo.js';

const textoMarca = async (key) => { const m = await marcaClave(key); return `${m.version}:${m.len}`; };

function registros(key, resumen) {
  const vacio = () => [];
  const buscar = (lista, id, acceso) => lista.findIndex(r => r && r.id === id && (!acceso || acceso(r)));
  return {
    marca: () => textoMarca(key),
    listar: async () => (await leer(key, vacio)).data,
    async listarResumen({ empresa = null, desde = 0, cantidad = 100 } = {}) {
      const todos = (await leer(key, vacio)).data.filter(r => r && (!empresa || r.empresa === empresa));
      const campos = resumen.map(c => CAMPO_DE_COLUMNA[c] || c);
      const items = todos.slice(desde, desde + cantidad).map(r => Object.fromEntries(campos.map(c => [c, r[c] ?? null])));
      return { items, total: todos.length };
    },
    async obtener(id, { acceso } = {}) {
      const lista = (await leer(key, vacio)).data;
      const idx = buscar(lista, id, acceso);
      return idx === -1 ? null : lista[idx];
    },
    /** Agrega los que no existen. `validar(existentesPorId)` puede rechazar el lote. */
    crear: (nuevos, validar) => mutar(key, vacio, async lista => {
      const porId = new Map();
      lista.forEach(r => { if (r && !porId.has(r.id)) porId.set(r.id, r); });
      const existentes = new Map(nuevos.filter(n => porId.has(n.id)).map(n => [n.id, porId.get(n.id)]));
      if (validar) await validar(existentes);
      const creados = nuevos.filter(n => !existentes.has(n.id));
      const respuesta = { creados, existentes };
      return creados.length ? { nuevo: [...lista, ...creados], respuesta } : { respuesta };
    }),
    /** `fn(actual)` → registro nuevo, o null si no hay cambio. 404 si no existe/no es accesible. */
    actualizar: (id, fn, { acceso } = {}) => mutar(key, vacio, async lista => {
      const idx = buscar(lista, id, acceso);
      if (idx === -1) throw new HttpError(404);
      const nuevo = await fn(lista[idx]);
      if (nuevo == null) return { respuesta: lista[idx] };
      const copia = [...lista];
      copia[idx] = nuevo;
      return { nuevo: copia, respuesta: nuevo };
    }),
    eliminar: (id, { acceso } = {}) => mutar(key, vacio, lista => {
      const idx = buscar(lista, id, acceso);
      if (idx === -1) throw new HttpError(404);
      return { nuevo: lista.filter((_, i) => i !== idx), respuesta: lista[idx] };
    }),
    /** Borra todos los de una empresa (o todos si empresa es null). Devuelve cuántos. */
    eliminarPorEmpresa: (empresa) => mutar(key, vacio, lista => {
      const quedan = empresa ? lista.filter(r => r.empresa !== empresa) : [];
      return { nuevo: quedan, respuesta: lista.length - quedan.length };
    }),
  };
}

function documento(key, vacio, operaciones) {
  const base = {
    marca: () => textoMarca(key),
    leer: async () => (await leer(key, vacio)).data,
  };
  for (const [nombre, transformar] of Object.entries(operaciones)) {
    // Cada operación transforma el objeto completo y devuelve { datos, anterior? }.
    base[nombre] = (...args) => mutar(key, vacio, async data => {
      const { nuevo, anterior } = await transformar(data, ...args);
      return { nuevo, respuesta: { datos: nuevo, anterior } };
    });
  }
  return base;
}

const conValor = (obj, k, v) => ({ ...obj, [k]: v });

export const repos = {
  equipos: registros(REGISTROS.equipos.claveRedis, REGISTROS.equipos.resumen),
  personal: registros(REGISTROS.personal.claveRedis, REGISTROS.personal.resumen),
  reportesFalla: registros(REGISTROS.reportesFalla.claveRedis, REGISTROS.reportesFalla.resumen),

  planesProgramas: documento('cmms:planesProgramas', () => ({}), {
    fijarCampo: (data, empresaKey, campo, valor) => ({ nuevo: conValor(data, empresaKey, { ...(data[empresaKey] || {}), [campo]: valor }) }),
  }),
  tecnoReportes: documento('cmms:tecnoReportes', () => ({}), {
    fijar: (data, empresaKey, sede, anio, trimestre, valor) => {
      const emp = data[empresaKey] || {};
      const sedeObj = emp[sede] || {};
      const anioObj = sedeObj[anio] || {};
      return { nuevo: conValor(data, empresaKey, { ...emp, [sede]: { ...sedeObj, [anio]: { ...anioObj, [trimestre]: valor } } }) };
    },
  }),
  tecnoTransversal: documento('cmms:tecnoTransversal', () => ({}), {
    // empresaKey null → valor global. Con empresa: si el documento tenía un valor plano
    // (global/heredado), se conserva bajo `_default` al pasar al formato por empresa.
    fijar: (data, docKey, empresaKey, valor) => {
      if (!empresaKey) return { nuevo: conValor(data, docKey, valor) };
      const actual = data[docKey];
      const docObj = (actual && typeof actual === 'object') ? actual : (actual ? { _default: actual } : {});
      return { nuevo: conValor(data, docKey, { ...docObj, [empresaKey]: valor }) };
    },
  }),
  limpiezaDesinfeccion: documento('cmms:limpiezaDesinfeccion', () => ({}), {
    fijarMes: (data, empresaKey, sede, anio, mes, valor) => {
      const emp = data[empresaKey] || {};
      const sedeObj = emp[sede] || {};
      const anioObj = { ...(sedeObj[anio] || {}) };
      if (valor) anioObj[mes] = valor; else delete anioObj[mes];
      return { nuevo: conValor(data, empresaKey, { ...emp, [sede]: { ...sedeObj, [anio]: anioObj } }) };
    },
  }),
  limpiezaPlantillas: documento('cmms:limpiezaPlantillas', () => ({}), {
    fijar: (data, empresaKey, registro) => ({ nuevo: conValor(data, empresaKey, registro), anterior: data[empresaKey] || null }),
    quitar: (data, empresaKey) => {
      const nuevo = { ...data };
      delete nuevo[empresaKey];
      return { nuevo, anterior: data[empresaKey] || null };
    },
  }),
  capacitaciones: documento('cmms:capacitaciones', () => null, {
    reemplazar: (_data, snapshot) => ({ nuevo: snapshot }),
  }),
  alertEmails: { leer: async () => ((await kv.get('cmms:alertEmails')) || []) },
  // Con Redis los archivos viven dentro de los registros (base64) o en Vercel Blob.
  archivos: { obtener: async () => null, urlFirmada: async () => { throw new HttpError(404); } },

  empresas: {
    marca: () => textoMarca('cmms:empresas'),
    listar: async () => { const l = (await leer('cmms:empresas', () => [])).data; return Array.isArray(l) ? l : []; },
    guardarLista: (lista) => mutar('cmms:empresas', () => [], () => ({ nuevo: lista })),
  },
  usuarios: {
    marca: () => textoMarca('cmms:usuarios'),
    listar: async () => { const l = (await leer('cmms:usuarios', () => [])).data; return Array.isArray(l) ? l : []; },
    guardarLista: (lista) => mutar('cmms:usuarios', () => [], () => ({ nuevo: lista })),
  },
};
