// lib/capacitaciones.js
// Trae y normaliza las respuestas de los formularios de Google Forms que el equipo de
// biomédicos usa para las capacitaciones del personal (dueño biomedicosmacromed@gmail.com).
//
// La lista de formularios a consultar vive en la variable de entorno CAPACITACIONES_SHEETS
// (JSON) — a propósito FUERA del código fuente: este repositorio es público en GitHub, y
// cada hoja de respuestas está compartida "cualquiera con el enlace puede ver". Si los IDs
// quedaran hardcodeados aquí, cualquiera en GitHub podría abrirlos y ver nombres y correos
// reales del personal capacitado — la variable de entorno evita esa exposición.
//
// Formato esperado de CAPACITACIONES_SHEETS (un array JSON):
//   [{ "id": "bascula", "label": "Báscula", "sheetId": "1UKb-mryC..." }, ...]
// El "id" es una clave corta y estable (no cambia aunque se renombre la hoja en Drive);
// "sheetId" es el ID de la hoja de respuestas, tomado de su URL de Google Sheets.

// Alias de empresa: los formularios recogen "Empresa" como texto libre, así que el mismo
// valor real aparece escrito de formas distintas (p. ej. "MEIDE SAS" en vez de "MEIDE", el
// key que usa el resto del CMMS en COMPANIES). Todo lo que no matchee cae en OTRAS_EMPRESA
// (p. ej. "UT", usado por los contratos ERON, que no es una de las 5 empresas del CMMS).
const COMPANY_ALIASES = {
  MACROMED: 'MACROMED',
  MEIDE: 'MEIDE',
  'MEIDE SAS': 'MEIDE',
  'NP MEDICAL': 'NP MEDICAL',
  'NP-MEDICAL': 'NP MEDICAL',
  NPMEDICAL: 'NP MEDICAL',
  DIAGNOSTIK: 'DIAGNOSTIK',
  'AUNAR SALUD': 'AUNAR SALUD',
  AUNAR: 'AUNAR SALUD',
};
export const OTRAS_EMPRESA = 'OTRAS';

function normalizeEmpresa(raw) {
  if (!raw) return OTRAS_EMPRESA;
  return COMPANY_ALIASES[raw.trim().toUpperCase()] || OTRAS_EMPRESA;
}

// Parser CSV mínimo (RFC 4180): soporta campos entre comillas con comas y saltos de línea
// embebidos — el export CSV de Google Sheets los usa cuando una respuesta libre del
// formulario contiene una coma o un salto de línea.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function findCol(headers, matcher) {
  const idx = headers.findIndex(h => matcher(h.trim().toLowerCase()));
  return idx === -1 ? null : idx;
}
const cell = (row, idx) => (idx != null ? (row[idx] || '').trim() : '');

// "16/07/2026 10:50:35" (Marca temporal de Google Forms) → ISO "2026-07-16T10:50:35".
function parseMarcaTemporal(raw) {
  const m = (raw || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:${s}`;
}

// "12 / 17" → { obtenido: 12, max: 17, porcentaje: 70.6 }
function parsePuntuacion(raw) {
  const m = (raw || '').match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (!m) return null;
  const obtenido = parseFloat(m[1]);
  const max = parseFloat(m[2]);
  if (!max) return null;
  return { obtenido, max, porcentaje: Math.round((obtenido / max) * 1000) / 10 };
}

async function fetchSheetCsv(sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Cada formulario tiene sus propias columnas (orden y redacción exacta varían entre
// hojas creadas en fechas distintas), así que en vez de asumir posiciones fijas se busca
// cada columna por su encabezado — tolerante a espacios extra y mayúsculas/minúsculas.
function parseTrainingSheet(training, csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const col = {
    marca: findCol(headers, h => h === 'marca temporal'),
    email: findCol(headers, h => h.startsWith('dirección de correo') || h.startsWith('direccion de correo')),
    puntuacion: findCol(headers, h => h.startsWith('puntuación') || h.startsWith('puntuacion')),
    empresa: findCol(headers, h => h === 'empresa'),
    sede: findCol(headers, h => h.includes('sede') || h.includes('eron')),
    nombre: findCol(headers, h => h.includes('nombre completo') || h === 'nombre'),
    cargo: findCol(headers, h => h === 'cargo'),
    capacitacionRealizada: findCol(headers, h => h.includes('capacitación realizada') || h.includes('capacitacion realizada')),
  };

  return rows.slice(1)
    .filter(r => r.some(v => v && v.trim()))
    .map(r => {
      const empresaRaw = cell(r, col.empresa);
      const puntuacion = parsePuntuacion(cell(r, col.puntuacion));
      const capacitacionRealizada = cell(r, col.capacitacionRealizada);
      return {
        capacitacionId: training.id,
        capacitacion: capacitacionRealizada || training.label,
        fecha: parseMarcaTemporal(cell(r, col.marca)),
        empresa: normalizeEmpresa(empresaRaw),
        empresaRaw,
        sede: cell(r, col.sede),
        nombre: cell(r, col.nombre),
        cargo: cell(r, col.cargo),
        email: cell(r, col.email).toLowerCase(),
        puntajeObtenido: puntuacion ? puntuacion.obtenido : null,
        puntajeMax: puntuacion ? puntuacion.max : null,
        porcentaje: puntuacion ? puntuacion.porcentaje : null,
      };
    })
    .filter(r => r.fecha || r.nombre); // descarta filas completamente vacías
}

export function getTrainingsConfig() {
  const raw = process.env.CAPACITACIONES_SHEETS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(t => t && t.id && t.sheetId) : [];
  } catch (err) {
    console.error('[lib/capacitaciones] CAPACITACIONES_SHEETS no es JSON válido:', err.message);
    return [];
  }
}

// Trae y normaliza TODAS las hojas configuradas, en paralelo. Tolerante a fallos
// parciales: si una hoja puntual falla (renombrada, sin respuestas aún, error de red), se
// omite y se reporta en `errores` — no aborta la sincronización completa por una sola hoja.
export async function buildCapacitacionesSnapshot() {
  const trainings = getTrainingsConfig();
  const records = [];
  const errores = [];
  await Promise.all(trainings.map(async (training) => {
    try {
      const csv = await fetchSheetCsv(training.sheetId);
      records.push(...parseTrainingSheet(training, csv));
    } catch (err) {
      errores.push({ id: training.id, label: training.label, error: err.message });
    }
  }));
  records.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return {
    records,
    errores,
    capacitacionesConfiguradas: trainings.map(t => ({ id: t.id, label: t.label })),
  };
}
