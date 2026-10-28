// Lector del formato UT-GGC-F-09 "Plan de mejora continua" (.xlsx) para el dashboard de
// Plan de mejora. No usa `read-excel-file` a propósito: ese archivo trae tablas dinámicas
// cuya caché (pivotCacheRecords*.xml) pesa >140 MB descomprimida y una hoja con formato
// hasta la fila 1.048.576 — `readSheet` lo descomprime todo y devuelve un millón de filas
// vacías (~1 GB de memoria, inviable en el navegador). Aquí solo se descomprimen el libro,
// las cadenas compartidas y las hojas, y se recorren las celdas con expresiones regulares
// (funciona igual en el navegador y en Node, sin DOMParser).
import { unzipSync, strFromU8 } from 'fflate';

const decodeEntities = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

// Texto de un <si>/<is>: concatena los <t> de cada run, ignorando la guía fonética (<rPh>).
function richText(xml) {
  const sinFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of sinFonetica.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) out += m[1] ? decodeEntities(m[1]) : '';
  return out;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map(m => (m[1] ? richText(m[1]) : ''));
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decodeEntities(m[1]) : undefined;
};

// "AB12" -> índice de columna 27 (base 0)
function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Filas de la hoja como arreglos (solo las filas con al menos un valor). Los números
// quedan como number y el resto como string; las fechas se resuelven después por columna.
function parseSheetRows(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    let hasValue = false;
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cm[1];
      const body = cm[2];
      if (!body) continue;
      const ref = attr(tag, 'r');
      const type = attr(tag, 't');
      let value;
      if (type === 'inlineStr') {
        const is = body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/);
        value = is ? richText(is[1]) : '';
      } else {
        const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        if (!v) continue;
        const raw = decodeEntities(v[1]);
        if (type === 's') value = shared[Number(raw)] ?? '';
        else if (type === 'str' || type === 'e') value = raw;
        else if (type === 'b') value = raw === '1';
        else value = raw === '' ? '' : Number(raw);
      }
      if (value === '' || value === undefined || (typeof value === 'number' && Number.isNaN(value))) continue;
      row[ref ? colIndex(ref) : row.length] = value;
      hasValue = true;
    }
    if (hasValue) rows.push(row);
  }
  return rows;
}

// Lee todas las hojas del libro: [{ name, hidden, rows }]
export function readWorkbookSheets(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const meta = unzipSync(bytes, {
    filter: f => f.name === 'xl/workbook.xml' || f.name === 'xl/_rels/workbook.xml.rels' || f.name === 'xl/sharedStrings.xml',
  });
  if (!meta['xl/workbook.xml']) throw new Error('El archivo no parece ser un libro de Excel (.xlsx) válido.');
  const workbook = strFromU8(meta['xl/workbook.xml']);
  const rels = meta['xl/_rels/workbook.xml.rels'] ? strFromU8(meta['xl/_rels/workbook.xml.rels']) : '';
  const shared = parseSharedStrings(meta['xl/sharedStrings.xml'] ? strFromU8(meta['xl/sharedStrings.xml']) : '');

  const relTarget = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) relTarget[id] = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  }
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map(m => ({
    name: attr(m[0], 'name'),
    hidden: (attr(m[0], 'state') || 'visible') !== 'visible',
    path: relTarget[attr(m[0], 'r:id')],
  })).filter(s => s.path);

  const wanted = new Set(sheets.map(s => s.path));
  const files = unzipSync(bytes, { filter: f => wanted.has(f.name) });
  return sheets.map(s => ({
    name: s.name,
    hidden: s.hidden,
    rows: files[s.path] ? parseSheetRows(strFromU8(files[s.path]), shared) : [],
  }));
}

/* ---------------------------------------------------------------- */
/* Interpretación del formato de plan de mejora                       */
/* ---------------------------------------------------------------- */

export const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[¿?()]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// Columna -> patrón del encabezado normalizado. El orden importa: la primera columna que
// coincide gana (p. ej. "Fecha Auditoria" antes que "Fecha inicial").
const COLUMNAS = {
  establecimiento: /^establecimiento/,
  fechaAuditoria: /^fecha (de )?auditoria/,
  mes: /^mes\b/,
  ente: /ente auditor/,
  servicio: /subcomponente|^servicio/,
  numero: /^no\.? del hallazgo|^n[°o]\.? hallazgo/,
  hallazgo: /^hallazgos?$/,
  plazo: /^plazo/,
  causa: /causa raiz/,
  accion: /accion de mejoramiento/,
  responsable: /responsable/,
  tipoFalta: /solo calidad noved/,
  fechaInicial: /^fecha in(i)?cial/,
  fechaFinal: /^fecha final/,
  estado: /estado de plan/,
  porcentaje: /porcentaje de cumplimiento/,
  observacion: /^observacion/,
};
const COLUMNAS_FECHA = ['fechaAuditoria', 'fechaInicial', 'fechaFinal'];

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const pad = (n) => String(n).padStart(2, '0');
// Serial de Excel (sistema 1900) -> 'AAAA-MM-DD'
function excelSerialToISO(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function toISODate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return excelSerialToISO(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

const texto = (v) => {
  if (v === undefined || v === null || typeof v === 'boolean') return '';
  return String(v).replace(/\u00a0/g, ' ').trim();
};

// Agrupación del "ESTADO DE PLAN" para los gráficos apilados.
export const GRUPOS_ESTADO = ['Cerrado', 'En gestión', 'Re-apertura / sin gestión', 'No aplica'];
export function grupoEstado(estado) {
  const e = norm(estado);
  if (e.startsWith('cerrado')) return 'Cerrado';
  if (e.startsWith('no aplica')) return 'No aplica';
  if (e.startsWith('en gestion') || e.startsWith('en proceso')) return 'En gestión';
  return 'Re-apertura / sin gestión';
}

function mesIndex(mesTexto, fechaISO) {
  const m = norm(mesTexto);
  const i = MESES.findIndex(nombre => m.startsWith(nombre.slice(0, 3)));
  if (i >= 0) return i;
  if (m === 'setiembre') return 8;
  return fechaISO ? Number(fechaISO.slice(5, 7)) - 1 : -1;
}

// Busca en las primeras filas la fila de encabezados del formato y mapea sus columnas.
function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cols = {};
    (rows[r] || []).forEach((cell, i) => {
      if (typeof cell !== 'string') return;
      const h = norm(cell);
      for (const [key, re] of Object.entries(COLUMNAS)) {
        if (cols[key] === undefined && re.test(h)) { cols[key] = i; break; }
      }
    });
    if (cols.estado !== undefined && (cols.hallazgo !== undefined || cols.establecimiento !== undefined)) return { row: r, cols };
  }
  return null;
}

// Convierte las filas de una hoja en registros del plan de mejora.
export function parsePlanMejoraRows(rows) {
  const header = findHeader(rows);
  if (!header) return null;
  const { cols } = header;
  const registros = [];
  for (const row of rows.slice(header.row + 1)) {
    const get = (k) => (cols[k] === undefined ? undefined : row[cols[k]]);
    const rec = {};
    for (const k of Object.keys(COLUMNAS)) {
      rec[k] = COLUMNAS_FECHA.includes(k) ? toISODate(get(k)) : texto(get(k));
    }
    // La fila de sub-encabezados (y las filas sueltas de totales) no traen ni
    // establecimiento ni hallazgo.
    if (!rec.establecimiento && !rec.hallazgo) continue;
    rec.estado = rec.estado ? rec.estado.toUpperCase() : 'SIN ESTADO';
    rec.grupo = grupoEstado(rec.estado);
    rec.ente = rec.ente.toUpperCase() || 'SIN DATO';
    rec.servicio = rec.servicio.toUpperCase() || 'SIN DATO';
    rec.plazo = rec.plazo.toUpperCase() || 'SIN DATO';
    rec.establecimiento = rec.establecimiento || 'SIN DATO';
    rec.mesIdx = mesIndex(rec.mes, rec.fechaAuditoria);
    delete rec.mes;
    delete rec.causa;
    registros.push(rec);
  }
  // Unifica variantes de escritura ("COORDINACION MÉDICA" / "COORDINACIÓN MÉDICA",
  // espacios dobles…) bajo la primera forma que aparece, para que no se partan en
  // dos barras distintas en los gráficos.
  for (const k of ['establecimiento', 'ente', 'servicio', 'plazo', 'responsable', 'tipoFalta']) {
    const canon = {};
    for (const rec of registros) {
      const key = norm(rec[k]);
      if (!(key in canon)) canon[key] = rec[k].replace(/\s+/g, ' ');
      rec[k] = canon[key];
    }
  }
  return registros;
}

// Punto de entrada: elige la hoja que tenga el encabezado del formato (prefiere las visibles
// y las que se llamen "hallazgos") y devuelve { sheetName, registros }.
export function readPlanMejora(data) {
  const sheets = readWorkbookSheets(data);
  const orden = [...sheets].sort((a, b) =>
    (a.hidden - b.hidden) || (/hallazgo/i.test(b.name) - /hallazgo/i.test(a.name)));
  for (const s of orden) {
    const registros = parsePlanMejoraRows(s.rows);
    if (registros && registros.length) return { sheetName: s.name, registros };
  }
  throw new Error('No se encontró una hoja con el formato de plan de mejora (columnas "Establecimiento", "HALLAZGOS" y "ESTADO DE PLAN").');
}

// Hallazgo abierto cuya fecha final ya pasó.
export function estaVencido(rec, hoyISO) {
  return (rec.grupo === 'En gestión' || rec.grupo === 'Re-apertura / sin gestión') && !!rec.fechaFinal && rec.fechaFinal < hoyISO;
}
