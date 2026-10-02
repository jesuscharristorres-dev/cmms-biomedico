// lib/datos/migracion.js
// Lógica de la migración Redis → Supabase, compartida por los scripts de scripts/migracion/
// y por los tests. NO se ejecuta sola: solo la llaman los scripts, a mano, el día acordado.
//
//   leerRespaldo(archivo|objeto, namespace) → { [claveRedis]: valor }
//   validar(datos)       → problemas que impiden migrar sin perder datos (ids duplicados,
//                          registros con empresa inexistente...). Si hay, NO se importa nada.
//   importar(datos)      → crea/actualiza todo en Supabase (idempotente) y sube los archivos
//                          base64 a Storage. Con { simular: true } no escribe nada.
//   verificar(datos)     → compara, colección por colección, lo que la APP verá en Supabase
//                          (a través de lib/datos/supabase.js) contra el respaldo.

import fs from 'node:fs';
import { repos } from './supabase.js';
import { rest, rpc, todas, eq } from './supabase-cliente.js';
import { externalizar, reincorporar } from './archivos.js';
import { urlFirmada } from './supabase-cliente.js';
import {
  REGISTROS, aFila, empresaAFila, usuarioAFila, planesAFilas, tecnoReportesAFilas, limpiezaAFilas,
  transversalAFilas, sinVacios, igualesJson,
} from './mapeo.js';

export const CLAVES = {
  empresas: 'cmms:empresas', usuarios: 'cmms:usuarios', equipos: 'cmms:equipos', personal: 'cmms:personal',
  reportesFalla: 'cmms:reportesFalla', capacitaciones: 'cmms:capacitaciones', planesProgramas: 'cmms:planesProgramas',
  tecnoReportes: 'cmms:tecnoReportes', tecnoTransversal: 'cmms:tecnoTransversal', limpiezaDesinfeccion: 'cmms:limpiezaDesinfeccion',
  limpiezaPlantillas: 'cmms:limpiezaPlantillas', alertEmails: 'cmms:alertEmails',
};

/** Lee un respaldo de scripts/migracion/respaldo-redis.mjs y devuelve los valores de un namespace. */
export function leerRespaldo(origen, namespace = 'production') {
  const respaldo = typeof origen === 'string' ? JSON.parse(fs.readFileSync(origen, 'utf8')) : origen;
  const prefijo = namespace === 'production' ? '' : `${namespace}:`;
  const datos = {};
  for (const clave of Object.values(CLAVES)) {
    const e = respaldo.claves?.[`${prefijo}${clave}`];
    if (!e) { datos[clave] = null; continue; }
    if (e.tipo !== 'string') throw new Error(`La clave ${prefijo}${clave} no es de tipo string (${e.tipo}).`);
    datos[clave] = typeof e.valor === 'string' ? JSON.parse(e.valor) : e.valor;
  }
  return datos;
}

const arreglo = (v) => (Array.isArray(v) ? v : []);
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export function validar(datos) {
  const errores = [];
  const empresas = arreglo(datos[CLAVES.empresas]);
  const ids = new Set(empresas.map(e => e.id));
  if (!empresas.length) errores.push('No hay empresas en el respaldo (cmms:empresas vacío).');
  const dup = (lista, nombre) => {
    const vistos = new Set();
    lista.forEach(r => {
      if (!r || typeof r.id !== 'string' || !r.id) errores.push(`${nombre}: registro sin id válido.`);
      else if (vistos.has(r.id)) errores.push(`${nombre}: id duplicado "${r.id}".`);
      else vistos.add(r.id);
    });
  };
  dup(empresas, 'empresas');
  dup(arreglo(datos[CLAVES.usuarios]), 'usuarios');
  for (const nombre of ['equipos', 'personal', 'reportesFalla']) {
    const lista = arreglo(datos[CLAVES[nombre]]);
    dup(lista, nombre);
    lista.forEach(r => { if (r && !ids.has(r.empresa)) errores.push(`${nombre}: "${r.id}" tiene empresa "${r.empresa}" que no existe (asígnala en Administración → Registros sin empresa).`); });
  }
  arreglo(datos[CLAVES.usuarios]).forEach(u => {
    if (u.empresa_id && !ids.has(u.empresa_id)) errores.push(`usuarios: "${u.id}" pertenece a la empresa "${u.empresa_id}" que no existe.`);
  });
  for (const nombre of ['planesProgramas', 'tecnoReportes', 'limpiezaDesinfeccion', 'limpiezaPlantillas']) {
    Object.keys(objeto(datos[CLAVES[nombre]])).forEach(k => {
      if (!ids.has(k)) errores.push(`${nombre}: hay datos de la empresa "${k}" que no existe.`);
    });
  }
  return errores;
}

/** Valor esperado en Supabase: el del respaldo con los Data URI cambiados por la URL de Storage. */
async function sinBase64(valor, empresa, origen, opciones) {
  return (await externalizar(valor, { empresa, origen, subir: !opciones.simular })).valor;
}

export async function importar(datos, { simular = false, log = () => {} } = {}) {
  const problemas = validar(datos);
  if (problemas.length) {
    const err = new Error(`El respaldo tiene ${problemas.length} problema(s); no se importó nada.`);
    err.problemas = problemas;
    throw err;
  }
  const resumen = {};
  const archivos = [];
  const ext = async (valor, empresa, origen) => {
    const r = await externalizar(valor, { empresa, origen, subir: !simular });
    archivos.push(...r.subidos);
    return r.valor;
  };

  // 1. Empresas (con sedes) y usuarios.
  const empresas = arreglo(datos[CLAVES.empresas]);
  for (const [i, e] of empresas.entries()) {
    const { fila, sedes } = empresaAFila(e, i);
    if (!simular) await rpc('cmms_guardar_empresa', { p_fila: fila, p_sedes: sedes });
  }
  resumen.empresas = empresas.length;
  const usuarios = arreglo(datos[CLAVES.usuarios]);
  if (!simular && usuarios.length) await rest('usuarios?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: usuarios.map((u, i) => usuarioAFila(u, i)) });
  resumen.usuarios = usuarios.length;

  // 2. Registros (con historial y archivos).
  for (const nombre of ['equipos', 'personal', 'reportesFalla']) {
    const def = REGISTROS[nombre];
    const lista = arreglo(datos[CLAVES[nombre]]);
    const lote = [];
    for (let i = 0; i < lista.length; i++) {
      const r = await ext(lista[i], lista[i].empresa, `${def.tabla}/${lista[i].id}`);
      const { fila, hijos } = aFila(def, r, i, { soloHijos: new Set(Object.keys(def.hijos)) });
      lote.push({ ...fila, _hijos: hijos });
    }
    if (!simular) {
      for (let i = 0; i < lote.length; i += 100) {
        await rpc('cmms_importar', { p_tabla: def.tabla, p_filas: lote.slice(i, i + 100) });
        log(`  ${nombre}: ${Math.min(i + 100, lote.length)}/${lote.length}`);
      }
    }
    resumen[nombre] = lista.length;
  }

  // 3. Capacitaciones.
  const cap = datos[CLAVES.capacitaciones];
  if (cap && !simular) await repos.capacitaciones.reemplazar(cap);
  resumen.capacitaciones = arreglo(cap?.records).length;

  // 4. Documentos por empresa.
  const upsert = async (tabla, claves, filas) => {
    if (!simular && filas.length) {
      for (let i = 0; i < filas.length; i += 500) {
        await rest(`${tabla}?on_conflict=${claves}`, { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: filas.slice(i, i + 500) });
      }
    }
    return filas.length;
  };
  resumen.planesProgramas = await upsert('planes_programas', 'empresa,campo', planesAFilas(datos[CLAVES.planesProgramas]));
  resumen.tecnoReportes = await upsert('tecno_reportes', 'empresa,sede,anio,trimestre', tecnoReportesAFilas(datos[CLAVES.tecnoReportes]));
  resumen.tecnoTransversal = await upsert('tecno_transversal', 'doc_key,empresa', transversalAFilas(datos[CLAVES.tecnoTransversal]));
  resumen.limpiezaDesinfeccion = await upsert('limpieza_desinfeccion', 'empresa,sede,anio,mes', limpiezaAFilas(datos[CLAVES.limpiezaDesinfeccion]));
  const plantillas = [];
  for (const [empresa, p] of Object.entries(objeto(datos[CLAVES.limpiezaPlantillas]))) {
    plantillas.push({ empresa, datos: await ext(p, empresa, `limpieza_plantillas/${empresa}`) });
  }
  resumen.limpiezaPlantillas = await upsert('limpieza_plantillas', 'empresa', plantillas);
  const correos = arreglo(datos[CLAVES.alertEmails]).map((email, orden) => ({ email, orden }));
  resumen.alertEmails = await upsert('alert_emails', 'email', correos);

  resumen.archivos = archivos.length;
  resumen.bytesArchivos = archivos.reduce((s, a) => s + a.tamano, 0);
  return resumen;
}

/**
 * Compara lo que la app leerá de Supabase con el respaldo. Devuelve una fila por colección:
 * { coleccion, esperado, encontrado, ok, detalle }.
 */
export async function verificar(datos, { descargarMuestra = 0 } = {}) {
  const filas = [];
  const comparar = (coleccion, esperado, encontrado, conteo) => {
    const ok = igualesJson(esperado, encontrado);
    let detalle = '';
    if (!ok && Array.isArray(esperado) && Array.isArray(encontrado)) {
      const porId = new Map(encontrado.map(r => [r?.id, r]));
      const distintos = esperado.filter(r => !igualesJson(r, porId.get(r?.id))).slice(0, 5).map(r => r?.id);
      detalle = `distintos (muestra): ${distintos.join(', ')}`;
    }
    filas.push({ coleccion, esperado: conteo(esperado), encontrado: conteo(encontrado), ok, detalle });
  };
  const n = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : v == null ? 0 : 1);
  const opciones = { simular: true };

  comparar('empresas', arreglo(datos[CLAVES.empresas]), await repos.empresas.listar(), n);
  comparar('usuarios', arreglo(datos[CLAVES.usuarios]), await repos.usuarios.listar(), n);
  for (const nombre of ['equipos', 'personal', 'reportesFalla']) {
    const esperado = [];
    for (const r of arreglo(datos[CLAVES[nombre]])) esperado.push(await sinBase64(r, r.empresa, '', opciones));
    comparar(nombre, esperado, await repos[nombre].listar(), n);
  }
  const cap = datos[CLAVES.capacitaciones];
  comparar('capacitaciones', cap ?? null, await repos.capacitaciones.leer(), v => arreglo(v?.records).length);
  for (const nombre of ['planesProgramas', 'tecnoReportes', 'tecnoTransversal', 'limpiezaDesinfeccion']) {
    comparar(nombre, sinVacios(objeto(datos[CLAVES[nombre]])), sinVacios(await repos[nombre].leer()), n);
  }
  const plantillas = {};
  for (const [empresa, p] of Object.entries(objeto(datos[CLAVES.limpiezaPlantillas]))) plantillas[empresa] = await sinBase64(p, empresa, '', opciones);
  comparar('limpiezaPlantillas', plantillas, await repos.limpiezaPlantillas.leer(), n);
  comparar('alertEmails', arreglo(datos[CLAVES.alertEmails]), await repos.alertEmails.leer(), n);

  // Archivos: cada Data URI del respaldo debe estar registrado en Storage con el mismo SHA-256.
  // (solo las colecciones cuyos archivos externaliza importar()).
  const esperados = [];
  for (const nombre of ['equipos', 'personal', 'reportesFalla']) {
    for (const r of arreglo(datos[CLAVES[nombre]])) esperados.push(...(await externalizar(r, { empresa: r.empresa, subir: false })).subidos);
  }
  for (const [empresa, p] of Object.entries(objeto(datos[CLAVES.limpiezaPlantillas]))) {
    esperados.push(...(await externalizar(p, { empresa, subir: false })).subidos);
  }
  const registrados = new Map((await todas('archivos?select=ruta,sha256,tamano')).map(a => [a.ruta, a]));
  const faltan = esperados.filter(a => registrados.get(a.ruta)?.sha256 !== a.sha256);
  filas.push({ coleccion: 'archivos (Storage)', esperado: new Set(esperados.map(a => a.ruta)).size, encontrado: registrados.size, ok: faltan.length === 0, detalle: faltan.slice(0, 5).map(a => a.ruta).join(', ') });

  // Muestra: descarga N archivos de Storage y comprueba su contenido byte a byte.
  if (descargarMuestra > 0) {
    const muestra = [...new Map(esperados.map(a => [a.ruta, a])).values()].slice(0, descargarMuestra);
    let buenos = 0;
    for (const a of muestra) {
      const url = await repos.archivos.urlFirmada(a.ruta);
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      const sha = (await import('node:crypto')).createHash('sha256').update(buf).digest('hex');
      if (sha === a.sha256) buenos++;
    }
    filas.push({ coleccion: 'archivos (muestra descargada)', esperado: muestra.length, encontrado: buenos, ok: buenos === muestra.length, detalle: '' });
  }
  return filas;
}

/** Cuántas filas hay hoy en Supabase (para avisar antes de importar sobre un proyecto con datos). */
export async function conteosSupabase() {
  const out = {};
  for (const tabla of ['empresas', 'usuarios', 'equipos', 'personal', 'reportes_falla', 'capacitaciones_registros', 'archivos']) {
    const { total } = await rest(`${tabla}?select=*`, { prefer: 'count=exact', rango: [0, 0] });
    out[tabla] = total ?? 0;
  }
  return out;
}

/**
 * Exporta TODO Supabase al formato de respaldo de Redis (mismas claves y forma), con los
 * archivos de Storage reincorporados como Data URI. Sirve para revertir a Redis sin perder lo
 * escrito en Supabase y como respaldo periódico completo (el plan gratuito no tiene backups).
 */
export async function exportar() {
  const registros = new Map((await todas('archivos?select=ruta,encabezado,tipo')).map(a => [a.ruta, a]));
  const descargar = async (ruta) => {
    const a = registros.get(ruta);
    if (!a) throw new Error(`Archivo sin registro en la tabla archivos: ${ruta}`);
    const res = await fetch(await urlFirmada(ruta, 300));
    if (!res.ok) throw new Error(`No se pudo descargar ${ruta} de Storage (${res.status}).`);
    return { encabezado: a.encabezado || `data:${a.tipo};base64`, buffer: Buffer.from(await res.arrayBuffer()) };
  };
  const conArchivos = (v) => reincorporar(v, descargar);
  const valores = {
    [CLAVES.empresas]: await repos.empresas.listar(),
    [CLAVES.usuarios]: await repos.usuarios.listar(),
    [CLAVES.equipos]: await conArchivos(await repos.equipos.listar()),
    [CLAVES.personal]: await conArchivos(await repos.personal.listar()),
    [CLAVES.reportesFalla]: await conArchivos(await repos.reportesFalla.listar()),
    [CLAVES.capacitaciones]: await repos.capacitaciones.leer(),
    [CLAVES.planesProgramas]: await repos.planesProgramas.leer(),
    [CLAVES.tecnoReportes]: await repos.tecnoReportes.leer(),
    [CLAVES.tecnoTransversal]: await repos.tecnoTransversal.leer(),
    [CLAVES.limpiezaDesinfeccion]: await repos.limpiezaDesinfeccion.leer(),
    [CLAVES.limpiezaPlantillas]: await conArchivos(await repos.limpiezaPlantillas.leer()),
    [CLAVES.alertEmails]: await repos.alertEmails.leer(),
  };
  const claves = {};
  for (const [k, v] of Object.entries(valores)) {
    if (v === null || v === undefined) continue;
    const valor = JSON.stringify(v);
    claves[k] = { tipo: 'string', pttl: -1, valor, bytes: Buffer.byteLength(valor) };
  }
  return { generado: new Date().toISOString(), origen: 'supabase', totalClaves: Object.keys(claves).length, claves };
}

export { eq };
