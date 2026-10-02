// lib/datos/supabase.js
// Implementación de los repositorios sobre Supabase (Postgres vía PostgREST). Se activa con
// DATA_BACKEND=supabase. Misma interfaz que lib/datos/redis.js, de modo que las rutas de api/
// no cambian.
//
// Tráfico (egress) mínimo:
//   - `marca()` lee un solo número (cmms_versiones) → ETag/304 y caché en memoria por
//     instancia: los listados completos solo se descargan cuando algo cambió.
//   - Las ediciones mandan SOLO el registro modificado (y solo el historial que cambió) a la
//     función transaccional cmms_guardar, con return=minimal (sin respuesta de datos).
//   - Listados resumidos con columnas propias y paginación (listarResumen).
//   - Los archivos base64 se suben a Storage y se descargan solo al abrirlos (/api/archivos).

import { HttpError } from '../http.js';
import { rest, todas, rpc, eq, enLista, esConflicto, urlFirmada } from './supabase-cliente.js';
import { externalizar } from './archivos.js';
import {
  REGISTROS, CAMPO_DE_COLUMNA, aFila, desdeFila, hijosCambiados, seleccionCompleta,
  empresaAFila, empresaDesdeFila, usuarioAFila, usuarioDesdeFila,
  planesAFilas, planesDesdeFilas, tecnoReportesAFilas, tecnoReportesDesdeFilas,
  limpiezaAFilas, limpiezaDesdeFilas, transversalAFilas, transversalDesdeFilas,
} from './mapeo.js';

const MAX_INTENTOS = 3;
const conflicto = () => new HttpError(409, 'Otro usuario modificó estos datos al mismo tiempo. Vuelve a intentarlo.');

// ---------------------------------------------------------------------------------------
// Versión por colección + caché en memoria
// ---------------------------------------------------------------------------------------
async function version(coleccion) {
  const { datos } = await rest(`cmms_versiones?coleccion=${eq(coleccion)}&select=version`);
  return String(datos?.[0]?.version ?? 0);
}
const cache = new Map(); // `${coleccion}|${clave}` → { version, valor }
const registrosCopias = []; // copias incrementales de equipos/personal/reportes (ver registros())
async function conCache(coleccion, clave, cargar) {
  const v = await version(coleccion);
  const k = `${coleccion}|${clave}`;
  const c = cache.get(k);
  if (c && c.version === v) return c.valor;
  const valor = await cargar();
  cache.set(k, { version: v, valor });
  return valor;
}
export function resetCacheSupabaseForTests() {
  cache.clear();
  registrosCopias.forEach(c => Object.assign(c, { version: null, porId: null, lista: [], marcaAgua: null }));
}

// ---------------------------------------------------------------------------------------
// Registros (equipos, personal, reportes de falla)
// ---------------------------------------------------------------------------------------
function registros(nombre) {
  const def = REGISTROS[nombre];
  const tabla = def.tabla;
  const seleccion = seleccionCompleta(def);

  async function filaCompleta(id) {
    const { datos } = await rest(`${tabla}?id=${eq(id)}&select=${seleccion}`);
    return datos?.[0] || null;
  }
  async function siguienteOrden() {
    const { datos } = await rest(`${tabla}?select=orden&order=orden.desc&limit=1`);
    return (datos?.[0]?.orden ?? -1) + 1;
  }
  // Copia en memoria de la colección completa, refrescada de forma INCREMENTAL: la primera vez
  // se descarga todo; después solo las filas con updated_at reciente y las eliminaciones
  // (cmms_eliminados). Ventana de solape de 2 minutos para no perder escrituras concurrentes
  // cuyo commit llegó después de la última sincronización.
  const copia = { version: null, porId: null, lista: [], marcaAgua: null };
  const SOLAPE_MS = 2 * 60 * 1000;
  const seleccionConFecha = `${seleccion},updated_at`;
  async function sincronizar(v) {
    if (!copia.porId) {
      const filas = await todas(`${tabla}?select=${seleccionConFecha}&order=orden.asc`);
      copia.porId = new Map(filas.map(f => [f.id, f]));
    } else {
      const desde = new Date(Date.parse(copia.marcaAgua || '1970-01-01T00:00:00Z') - SOLAPE_MS).toISOString();
      const [cambiadas, eliminadas] = await Promise.all([
        todas(`${tabla}?select=${seleccionConFecha}&updated_at=gte.${encodeURIComponent(desde)}`),
        todas(`cmms_eliminados?tabla=${eq(tabla)}&eliminado_at=gte.${encodeURIComponent(desde)}&select=id`),
      ]);
      eliminadas.forEach(e => copia.porId.delete(e.id));
      cambiadas.forEach(f => copia.porId.set(f.id, f));
    }
    const filas = [...copia.porId.values()].sort((a, b) => a.orden - b.orden);
    copia.marcaAgua = filas.reduce((m, f) => (f.updated_at > (m || '') ? f.updated_at : m), copia.marcaAgua);
    copia.lista = filas.map(f => desdeFila(def, f));
    copia.version = v;
  }
  registrosCopias.push(copia);

  async function prepararArchivos(registro) {
    // Los archivos base64 que lleguen en un registro (p. ej. firmas) van a Storage.
    const { valor } = await externalizar(registro, { empresa: registro.empresa, origen: `${tabla}/${registro.id}` });
    return valor;
  }

  return {
    marca: () => version(tabla),
    async listar({ empresa = null } = {}) {
      const v = await version(tabla);
      if (copia.version !== v) await sincronizar(v);
      return empresa ? copia.lista.filter(r => r && r.empresa === empresa) : copia.lista;
    },
    async listarResumen({ empresa = null, desde = 0, cantidad = 100 } = {}) {
      const filtro = empresa ? `&empresa=${eq(empresa)}` : '';
      const { datos, total } = await rest(`${tabla}?select=${def.resumen.join(',')}${filtro}&order=orden.asc`, {
        prefer: 'count=exact', rango: [desde, desde + cantidad - 1],
      });
      const items = (datos || []).map(f => Object.fromEntries(Object.entries(f).map(([k, v]) => [CAMPO_DE_COLUMNA[k] || k, v])));
      return { items, total: total ?? items.length };
    },
    async obtener(id, { acceso } = {}) {
      const fila = await filaCompleta(id);
      const r = fila ? desdeFila(def, fila) : null;
      return r && (!acceso || acceso(r)) ? r : null;
    },
    async crear(nuevos, validar) {
      const ids = [...new Set(nuevos.map(n => String(n.id)))];
      const existentes = new Map();
      for (let i = 0; i < ids.length; i += 100) {
        const { datos } = await rest(`${tabla}?id=${enLista(ids.slice(i, i + 100))}&select=${seleccion}`);
        (datos || []).forEach(f => existentes.set(f.id, desdeFila(def, f)));
      }
      if (validar) await validar(existentes);
      const creados = nuevos.filter(n => !existentes.has(n.id));
      let orden = await siguienteOrden();
      const lote = [];
      for (const n of creados) {
        const { fila, hijos } = aFila(def, await prepararArchivos(n), orden++);
        lote.push({ ...fila, _hijos: hijos });
      }
      for (let i = 0; i < lote.length; i += 200) {
        await rpc('cmms_insertar', { p_tabla: tabla, p_filas: lote.slice(i, i + 200) });
      }
      return { creados, existentes };
    },
    async actualizar(id, fn, { acceso } = {}) {
      for (let intento = 0; intento < MAX_INTENTOS; intento++) {
        const fila = await filaCompleta(id);
        const actual = fila ? desdeFila(def, fila) : null;
        if (!actual || (acceso && !acceso(actual))) throw new HttpError(404);
        let nuevo = await fn(actual);
        if (nuevo == null) return actual;
        nuevo = await prepararArchivos(nuevo);
        const cambiados = hijosCambiados(def, actual, nuevo);
        if (nuevo.empresa !== actual.empresa) Object.keys(def.hijos).forEach(c => cambiados.add(c));
        const { fila: nueva, hijos } = aFila(def, nuevo, fila.orden, { soloHijos: cambiados });
        try {
          await rpc('cmms_guardar', { p_tabla: tabla, p_fila: nueva, p_hijos: hijos, p_version: fila.version });
          return nuevo;
        } catch (err) {
          if (!esConflicto(err)) throw err;
        }
      }
      throw conflicto();
    },
    async eliminar(id, { acceso } = {}) {
      const r = await this.obtener(id, { acceso });
      if (!r) throw new HttpError(404);
      await rest(`${tabla}?id=${eq(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
      return r;
    },
    async eliminarPorEmpresa(empresa) {
      const filtro = empresa ? `empresa=${eq(empresa)}` : 'id=not.is.null';
      const { total } = await rest(`${tabla}?${filtro}`, { method: 'DELETE', prefer: 'return=minimal,count=exact' });
      return total ?? 0;
    },
  };
}

// ---------------------------------------------------------------------------------------
// Documentos por empresa
// ---------------------------------------------------------------------------------------
function documentoTabla(tabla, { aFilas, desdeFilas, claves }) {
  const leerTodo = () => conCache(tabla, 'todo', async () => desdeFilas(await todas(`${tabla}?select=*`)));
  const upsert = (filas) => rest(`${tabla}?on_conflict=${claves.join(',')}`, {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: filas,
  });
  const borrar = (fila) => rest(`${tabla}?${claves.map(c => `${c}=${eq(fila[c])}`).join('&')}`, { method: 'DELETE', prefer: 'return=minimal' });
  return { marca: () => version(tabla), leer: leerTodo, aFilas, upsert, borrar };
}

const planes = documentoTabla('planes_programas', { aFilas: planesAFilas, desdeFilas: planesDesdeFilas, claves: ['empresa', 'campo'] });
const tecnoRep = documentoTabla('tecno_reportes', { aFilas: tecnoReportesAFilas, desdeFilas: tecnoReportesDesdeFilas, claves: ['empresa', 'sede', 'anio', 'trimestre'] });
const transversal = documentoTabla('tecno_transversal', { aFilas: transversalAFilas, desdeFilas: transversalDesdeFilas, claves: ['doc_key', 'empresa'] });
const limpieza = documentoTabla('limpieza_desinfeccion', { aFilas: limpiezaAFilas, desdeFilas: limpiezaDesdeFilas, claves: ['empresa', 'sede', 'anio', 'mes'] });

async function leerPlantillas() {
  return conCache('limpieza_plantillas', 'todo', async () => {
    const filas = await todas('limpieza_plantillas?select=empresa,datos');
    return Object.fromEntries(filas.map(f => [f.empresa, f.datos]));
  });
}

export const repos = {
  equipos: registros('equipos'),
  personal: registros('personal'),
  reportesFalla: registros('reportesFalla'),

  planesProgramas: {
    marca: planes.marca,
    leer: planes.leer,
    async fijarCampo(empresaKey, campo, valor) {
      await planes.upsert([{ empresa: empresaKey, campo, valor: valor ?? null }]);
      return { datos: await planes.leer() };
    },
  },
  tecnoReportes: {
    marca: tecnoRep.marca,
    leer: tecnoRep.leer,
    async fijar(empresaKey, sede, anio, trimestre, valor) {
      await tecnoRep.upsert([{ empresa: empresaKey, sede: String(sede), anio: String(anio), trimestre: String(trimestre), valor: valor ?? null }]);
      return { datos: await tecnoRep.leer() };
    },
  },
  tecnoTransversal: {
    marca: transversal.marca,
    leer: transversal.leer,
    async fijar(docKey, empresaKey, valor) {
      const { datos: filas } = await rest(`tecno_transversal?doc_key=${eq(docKey)}&select=*`);
      if (!empresaKey) {
        await rest(`tecno_transversal?doc_key=${eq(docKey)}`, { method: 'DELETE', prefer: 'return=minimal' });
        await transversal.upsert([{ doc_key: docKey, empresa: '', valor: valor ?? null }]);
      } else {
        // Valor plano previo → pasa a `_default` (mismo comportamiento que en Redis).
        const plano = (filas || []).find(f => f.empresa === '');
        if (plano) {
          await transversal.borrar(plano);
          const v = plano.valor;
          const esObjeto = v && typeof v === 'object' && !Array.isArray(v);
          if (esObjeto) await transversal.upsert(Object.entries(v).map(([empresa, x]) => ({ doc_key: docKey, empresa, valor: x ?? null })));
          else if (v) await transversal.upsert([{ doc_key: docKey, empresa: '_default', valor: v }]);
        }
        await transversal.upsert([{ doc_key: docKey, empresa: empresaKey, valor: valor ?? null }]);
      }
      return { datos: await transversal.leer() };
    },
  },
  limpiezaDesinfeccion: {
    marca: limpieza.marca,
    leer: limpieza.leer,
    async fijarMes(empresaKey, sede, anio, mes, valor) {
      const fila = { empresa: empresaKey, sede: String(sede), anio: String(anio), mes: String(mes), datos: valor || {} };
      if (valor) await limpieza.upsert([fila]); else await limpieza.borrar(fila);
      return { datos: await limpieza.leer() };
    },
  },
  limpiezaPlantillas: {
    marca: () => version('limpieza_plantillas'),
    leer: leerPlantillas,
    async fijar(empresaKey, registro) {
      const anterior = (await leerPlantillas())[empresaKey] || null;
      const { valor } = await externalizar(registro, { empresa: empresaKey, origen: `limpieza_plantillas/${empresaKey}` });
      await rest('limpieza_plantillas?on_conflict=empresa', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: [{ empresa: empresaKey, datos: valor }] });
      return { datos: await leerPlantillas(), anterior };
    },
    async quitar(empresaKey) {
      const anterior = (await leerPlantillas())[empresaKey] || null;
      await rest(`limpieza_plantillas?empresa=${eq(empresaKey)}`, { method: 'DELETE', prefer: 'return=minimal' });
      return { datos: await leerPlantillas(), anterior };
    },
  },
  capacitaciones: {
    marca: () => version('capacitaciones'),
    leer: () => conCache('capacitaciones', 'todo', async () => {
      const { datos: meta } = await rest('capacitaciones_meta?id=eq.1&select=datos');
      if (!meta?.length) return null;
      const registrosCap = await todas('capacitaciones_registros?select=datos&order=orden.asc');
      return { ...meta[0].datos, records: registrosCap.map(r => r.datos) };
    }),
    async reemplazar(snapshot) {
      const { records = [], ...meta } = snapshot || {};
      await rpc('cmms_reemplazar_capacitaciones', { p_meta: meta, p_registros: records });
      return { datos: snapshot };
    },
  },
  alertEmails: {
    leer: async () => (await todas('alert_emails?select=email&order=orden.asc')).map(f => f.email),
  },
  archivos: {
    async obtener(ruta) {
      const { datos } = await rest(`archivos?ruta=${eq(ruta)}&select=ruta,empresa,tipo,tamano`);
      return datos?.[0] || null;
    },
    urlFirmada: (ruta, opciones) => urlFirmada(ruta, 60, opciones),
  },

  empresas: {
    marca: () => version('empresas'),
    listar: () => conCache('empresas', 'todo', async () => {
      const filas = await todas('empresas?select=datos,sedes(nombre,orden)&order=orden.asc,id.asc');
      return filas.map(empresaDesdeFila);
    }),
    // Solo se escriben las empresas que cambiaron (contenido o posición en la lista).
    async guardarLista(lista) {
      const previa = await this.listar();
      const actuales = new Map(previa.map((e, i) => [e.id, { e, i }]));
      for (const [i, e] of lista.entries()) {
        const a = actuales.get(e.id);
        if (a && a.i === i && JSON.stringify(a.e) === JSON.stringify(e)) continue;
        const { fila, sedes } = empresaAFila(e, i);
        await rpc('cmms_guardar_empresa', { p_fila: fila, p_sedes: sedes });
      }
      const ids = new Set(lista.map(e => e.id));
      for (const id of actuales.keys()) {
        if (!ids.has(id)) await rest(`empresas?id=${eq(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
      }
    },
  },
  usuarios: {
    marca: () => version('usuarios'),
    listar: () => conCache('usuarios', 'todo', async () => (await todas('usuarios?select=datos&order=orden.asc,id.asc')).map(usuarioDesdeFila)),
    async guardarLista(lista) {
      const actuales = new Map((await this.listar()).map((u, i) => [u.id, { u, i }]));
      const cambiados = lista.map((u, i) => [u, i])
        .filter(([u, i]) => { const a = actuales.get(u.id); return !a || a.i !== i || JSON.stringify(a.u) !== JSON.stringify(u); })
        .map(([u, i]) => usuarioAFila(u, i));
      if (cambiados.length) await rest('usuarios?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: cambiados });
      const ids = new Set(lista.map(u => u.id));
      for (const id of actuales.keys()) {
        if (!ids.has(id)) await rest(`usuarios?id=${eq(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
      }
    },
  },
};
