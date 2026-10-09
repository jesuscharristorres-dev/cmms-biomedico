// api/tecno-comites.js
// Fuente de verdad COMPARTIDA de los comités de tecnovigilancia: la URL (+ nombre, fecha,
// estado, observaciones) de la reunión trimestral de cada empresa. Forma:
// { [empresaId]: { [anio]: { [trimestre]: { url, nombreComite, fechaReunion, estado,
// observaciones, updatedAt } } } }. Sin dimensión de sede — a diferencia de los reportes
// trimestrales (api/tecno-reportes.js), un comité es por empresa completa. La unicidad
// empresa+año+trimestre queda garantizada por construcción: cada combinación es una única
// hoja del árbol, así que no puede haber dos registros duplicados para la misma.
//
// MULTIEMPRESA: GET recortado a las empresas visibles (scopeKeyed); PATCH/DELETE solo sobre
// una empresa accesible (assertKeyedWrite) — mismo principio que tecno-reportes.js.

import { kv } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { empresaFilter, scopeKeyed, assertKeyedWrite } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';

const KV_KEY = 'cmms:tecnoComites';
const TRIMESTRES = ['t1', 't2', 't3', 't4'];
const ESTADOS = ['Pendiente', 'Programado', 'Realizado'];
const ANIO_MIN = 2000;
const ANIO_MAX = 2100;
const MAX_URL_LEN = 2048;
const MAX_TEXTO_LEN = 200;
const MAX_OBS_LEN = 2000;

function validarAnio(anio) {
  const n = Number(anio);
  return Number.isInteger(n) && n >= ANIO_MIN && n <= ANIO_MAX ? n : null;
}

function validarFecha(v) {
  if (!v) return '';
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, 'La fecha de reunión no es válida.');
  const [yyyy, mm, dd] = v.split('-').map(Number);
  const d = new Date(`${v}T00:00:00`);
  // Date normaliza fechas imposibles en vez de rechazarlas (p. ej. "2026-02-30" se
  // convierte en el 2 de marzo) — el chequeo de ida y vuelta detecta ese caso.
  if (isNaN(d.getTime()) || d.getFullYear() !== yyyy || d.getMonth() + 1 !== mm || d.getDate() !== dd) {
    throw new HttpError(400, 'La fecha de reunión no es válida.');
  }
  return v;
}

export default withErrors('api/tecno-comites', 'No se pudo acceder a la base de datos compartida de comités de tecnovigilancia.', async (req, res) => {
  if (req.method === 'GET') {
    const ctx = await requireAuth(req);
    const data = scopeKeyed(ctx, (await kv.get(KV_KEY)) || {}, empresaFilter(ctx, req.query));
    return res.status(200).json({ data });
  }

  if (req.method !== 'PATCH' && req.method !== 'DELETE') return methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);

  const ctx = await requireAuth(req, { write: true });
  const { empresaKey, anio, trimestre } = req.body || {};
  const anioNum = validarAnio(anio);
  if (!anioNum) throw new HttpError(400, 'El año no es válido.');
  if (!TRIMESTRES.includes(trimestre)) throw new HttpError(400, 'El trimestre no es válido (debe ser t1, t2, t3 o t4).');
  await assertKeyedWrite(ctx, empresaKey);

  const data = (await kv.get(KV_KEY)) || {};
  const emp = data[empresaKey] || {};
  const anioObj = { ...(emp[anioNum] || {}) };

  if (req.method === 'DELETE') {
    delete anioObj[trimestre];
  } else {
    const { url, nombreComite, fechaReunion, observaciones, estado } = req.body || {};
    const urlLimpia = typeof url === 'string' ? url.trim() : '';
    if (urlLimpia && (!/^https?:\/\//i.test(urlLimpia) || urlLimpia.length > MAX_URL_LEN)) {
      throw new HttpError(400, 'El enlace debe ser una URL http(s) válida.');
    }
    anioObj[trimestre] = {
      url: urlLimpia,
      nombreComite: typeof nombreComite === 'string' ? nombreComite.trim().slice(0, MAX_TEXTO_LEN) : '',
      fechaReunion: validarFecha(fechaReunion),
      observaciones: typeof observaciones === 'string' ? observaciones.trim().slice(0, MAX_OBS_LEN) : '',
      estado: ESTADOS.includes(estado) ? estado : 'Pendiente',
      // La fecha de actualización se calcula en el servidor — no se confía en el reloj del cliente.
      updatedAt: new Date().toISOString(),
    };
  }

  const actualizado = { ...data, [empresaKey]: { ...emp, [anioNum]: anioObj } };
  await kv.set(KV_KEY, actualizado);
  return res.status(200).json({ data: scopeKeyed(ctx, actualizado) });
});
