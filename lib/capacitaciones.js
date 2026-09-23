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

// "UT" (los contratos ERON) se excluye por completo del dashboard de Capacitaciones a
// pedido explícito — ni sus registros, ni sus sedes, ni sus personas deben aparecer en
// ningún KPI, gráfica, filtro o tabla. Se filtra aquí, en el parseo, para que ese dato ni
// siquiera llegue al snapshot que se guarda en KV.
const EMPRESAS_EXCLUIDAS = new Set(['UT']);

function normalizeEmpresa(raw) {
  if (!raw) return OTRAS_EMPRESA;
  return COMPANY_ALIASES[raw.trim().toUpperCase()] || OTRAS_EMPRESA;
}

// uid estable por respuesta: misma hoja + misma fila de Google Forms siempre produce el
// mismo id (no depende del orden en que llegan las filas), así que un futuro consumidor
// puede deduplicar por este campo aunque una sincronización repita una respuesta ya vista.
function buildRecordId(training, fecha, email, nombre) {
  const clave = `${training.id}|${fecha || ''}|${(email || nombre || '').toLowerCase()}`;
  return clave;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reintenta con un backoff corto: Google a veces responde con error (429/5xx) cuando llegan
// varias peticiones casi simultáneas desde el mismo origen — algo típico en una función
// serverless que consulta varias hojas de golpe. Un reintento breve resuelve la mayoría de
// esos casos transitorios sin que el usuario tenga que presionar "Actualizar" de nuevo.
//
// El User-Agent explícito es a propósito: sin él, `fetch()` en Node no manda ninguno, y
// docs.google.com respondía 401 en varias hojas compartidas como "Lector" (verificado: sí
// estaban bien compartidas — el endpoint de exportación CSV de Sheets no es oficial ni
// documentado, y trata distinto una petición sin cara de navegador).
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function fetchSheetCsv(sheetId, retries = 2) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  for (let intento = 0; ; intento++) {
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_USER_AGENT, 'Accept': 'text/csv,*/*' } });
    if (res.ok) return res.text();
    if (intento >= retries) {
      const redirigido = res.redirected && res.url ? ` (redirigido a ${new URL(res.url).host})` : '';
      throw new Error(`HTTP ${res.status}${redirigido}`);
    }
    await sleep(400 * (intento + 1));
  }
}

// Cada formulario tiene sus propias columnas (orden y redacción exacta varían entre
// hojas creadas en fechas distintas, y pueden llamarse distinto según quién armó el
// formulario), así que en vez de asumir posiciones o nombres fijos se busca cada columna
// por coincidencias de su encabezado — tolerante a espacios extra, mayúsculas/minúsculas y
// a los sinónimos más comunes que usa el equipo (Institución/Centro/Lugar, etc.).
function parseTrainingSheet(training, csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const col = {
    marca: findCol(headers, h => h === 'marca temporal'),
    // "Dirección de correo electrónico" es el campo que Google Forms autocompleta con la
    // cuenta de quien responde (siempre presente cuando el formulario la recoge). Algunas
    // hojas más viejas/genéricas en cambio piden el correo como pregunta libre bajo "Correo
    // electrónico" — se usa como respaldo cuando no existe la columna autocompletada.
    email: findCol(headers, h => h.startsWith('dirección de correo') || h.startsWith('direccion de correo') || h.startsWith('correo electrónico') || h.startsWith('correo electronico')),
    puntuacion: findCol(headers, h => h.startsWith('puntuación') || h.startsWith('puntuacion')),
    empresa: findCol(headers, h => h === 'empresa' || h.includes('institución') || h.includes('institucion') || h.includes('empresa a la que')),
    sede: findCol(headers, h => h.includes('sede') || h.includes('eron') || h.includes('centro') || h === 'lugar'),
    nombre: findCol(headers, h => h.includes('nombre completo') || h === 'nombre' || h.includes('participante')),
    documento: findCol(headers, h => h.includes('documento') || h.includes('cédula') || h.includes('cedula') || h === 'dni' || h.includes('identificación') || h.includes('identificacion')),
    cargo: findCol(headers, h => h === 'cargo' || h.includes('área') || h.includes('area de')),
    asistencia: findCol(headers, h => h.includes('asistencia') || h === 'resultado'),
    // Casi todas las hojas tienen un tema fijo (una por equipo/curso) y usan `training.label`
    // como nombre de la capacitación. Unas pocas (p. ej. "Confirmación de asistencia") son
    // genéricas y el TEMA lo trae cada fila en su propia columna "Capacitación" — de ahí el
    // match exacto además de "Capacitación realizada", sin `includes` amplio para no
    // confundirla con una pregunta del cuestionario que mencione la palabra de pasada.
    capacitacionRealizada: findCol(headers, h => h.includes('capacitación realizada') || h.includes('capacitacion realizada') || h === 'capacitación' || h === 'capacitacion'),
  };

  return rows.slice(1)
    .filter(r => r.some(v => v && v.trim()))
    .map(r => {
      const empresaRaw = cell(r, col.empresa);
      const puntuacion = parsePuntuacion(cell(r, col.puntuacion));
      const capacitacionRealizada = cell(r, col.capacitacionRealizada);
      const fecha = parseMarcaTemporal(cell(r, col.marca));
      const email = cell(r, col.email).toLowerCase();
      const nombre = cell(r, col.nombre);
      return {
        id: buildRecordId(training, fecha, email, nombre),
        capacitacionId: training.id,
        capacitacion: capacitacionRealizada || training.label,
        fecha,
        empresa: normalizeEmpresa(empresaRaw),
        empresaRaw,
        sede: cell(r, col.sede),
        nombre,
        documento: cell(r, col.documento),
        cargo: cell(r, col.cargo),
        email,
        asistencia: cell(r, col.asistencia),
        puntajeObtenido: puntuacion ? puntuacion.obtenido : null,
        puntajeMax: puntuacion ? puntuacion.max : null,
        porcentaje: puntuacion ? puntuacion.porcentaje : null,
      };
    })
    .filter(r => r.fecha || r.nombre) // descarta filas completamente vacías
    .filter(r => !EMPRESAS_EXCLUIDAS.has(r.empresaRaw.trim().toUpperCase())); // ver EMPRESAS_EXCLUIDAS
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

// Cuántas hojas se consultan a la vez. No todas de golpe: Google responde con error a veces
// cuando le llegan muchas peticiones simultáneas desde el mismo origen (visto en producción
// con las 18 hojas configuradas — varias fallaban en cada sincronización). En lotes chicos,
// más el reintento de fetchSheetCsv, la sincronización es más lenta pero mucho más confiable.
const CAPACITACIONES_CONCURRENCIA = 4;

// Trae y normaliza TODAS las hojas configuradas, en lotes (ver CAPACITACIONES_CONCURRENCIA).
// Tolerante a fallos parciales: si una hoja puntual falla (renombrada, sin respuestas aún,
// error de red), se omite y se reporta en `errores` — no aborta la sincronización completa
// por una sola hoja.
export async function buildCapacitacionesSnapshot() {
  const trainings = getTrainingsConfig();
  const records = [];
  const errores = [];
  for (let i = 0; i < trainings.length; i += CAPACITACIONES_CONCURRENCIA) {
    const lote = trainings.slice(i, i + CAPACITACIONES_CONCURRENCIA);
    await Promise.all(lote.map(async (training) => {
      try {
        const csv = await fetchSheetCsv(training.sheetId);
        records.push(...parseTrainingSheet(training, csv));
      } catch (err) {
        errores.push({ id: training.id, label: training.label, error: err.message });
      }
    }));
  }
  // Deduplicación defensiva: cada sincronización vuelve a traer el CSV completo de cada
  // hoja (no hay forma de pedirle a Google Sheets solo "lo nuevo" sin credenciales propias
  // de la API — ver README de este módulo), así que en circunstancias normales no hay
  // duplicados entre sincronizaciones (se reemplaza el snapshot completo, nunca se le
  // agrega). Esto solo cubre el caso de que la MISMA hoja tenga dos filas idénticas (p. ej.
  // alguien envió el formulario dos veces) — se queda con la primera.
  const vistos = new Set();
  const dedupe = records.filter(r => {
    if (vistos.has(r.id)) return false;
    vistos.add(r.id);
    return true;
  });
  dedupe.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return {
    records: dedupe,
    errores,
    capacitacionesConfiguradas: trainings.map(t => ({ id: t.id, label: t.label })),
  };
}
