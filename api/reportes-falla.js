// api/reportes-falla.js
// Fuente de verdad COMPARTIDA de los reportes de falla ('cmms:reportesFalla').
//
// Endpoints PÚBLICOS (sin sesión) — los usan los coordinadores de sede sin cuenta desde el
// formulario "Reportar falla":
//   GET  ?catalogo=1 → catálogo MÍNIMO para el formulario: empresas activas (nombre, sedes)
//                      y equipos (solo id, empresa, sede y datos de identificación). Nunca
//                      mantenimientos, calibraciones, observaciones ni documentos.
//   POST             → crea UN reporte. El servidor reconstruye el registro con una whitelist
//                      de campos, valida que la empresa exista y esté activa, que la sede sea
//                      de esa empresa y que el equipo pertenezca a esa empresa y sede.
//
// Endpoints AUTENTICADOS con aislamiento multiempresa (lib/tenancy.js):
//   GET              → reportes visibles para el usuario (SUPER_ADMIN: todos o ?empresa=).
//   PATCH            → actualizar UN reporte de una empresa accesible.
//   DELETE ?id=      → borrar UN reporte de una empresa accesible.
//   DELETE (sin id)  → vaciar el histórico: SUPER_ADMIN vacía todo (o ?empresa=); un usuario
//                      de empresa solo puede vaciar los de SU empresa.

import { kv } from '../lib/db.js';
import { requireAuth, allowRate, getClientIp } from '../lib/auth.js';
import { listEmpresas, getEmpresa, empresaPublica } from '../lib/empresas.js';
import { empresaFilter, scopeArray, findOwned, applyScopedPatch } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';

const KV_KEY = 'cmms:reportesFalla';
const EQUIPOS_KEY = 'cmms:equipos';
const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Crítica'];
const MAX_REPORTES_POR_HORA = 30;

function texto(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

async function catalogoPublico(res) {
  const empresas = (await listEmpresas()).filter(e => e.estado === 'activo');
  const activas = new Set(empresas.map(e => e.id));
  const equipos = ((await kv.get(EQUIPOS_KEY)) || [])
    .filter(e => e && activas.has(e.empresa))
    .map(e => ({
      id: e.id, empresa: e.empresa, sede: e.sede,
      equipo: e.equipo || '', marca: e.marca || '', modelo: e.modelo || '',
      numeroSerie: e.numeroSerie || '', inventario: e.inventario || '',
    }));
  return res.status(200).json({ empresas: empresas.map(empresaPublica), equipos });
}

/** Reconstruye el reporte en el servidor: nada que no esté en esta whitelist se guarda. */
async function construirReportePublico(body) {
  const r = body && typeof body === 'object' ? body : {};
  const errores = {};
  const id = typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(r.id) ? r.id : null;
  if (!id) errores.id = 'Id no válido.';

  const empresa = await getEmpresa(typeof r.empresa === 'string' ? r.empresa : '');
  if (!empresa || empresa.estado !== 'activo') errores.empresa = 'La empresa no existe o no está activa.';
  const sede = texto(r.sede, 80);
  if (empresa && !empresa.sedes.includes(sede)) errores.sede = 'La sede no pertenece a la empresa.';

  const equipos = (await kv.get(EQUIPOS_KEY)) || [];
  const equipo = equipos.find(e => e && e.id === r.equipoId);
  if (!equipo || !empresa || equipo.empresa !== empresa.id || equipo.sede !== sede) {
    errores.equipoId = 'El equipo no pertenece a la empresa y sede seleccionadas.';
  }
  const personaReporta = texto(r.personaReporta, 120);
  if (!personaReporta) errores.personaReporta = 'Campo obligatorio.';
  const descripcion = texto(r.descripcion, 2000);
  if (!descripcion) errores.descripcion = 'Campo obligatorio.';
  const prioridad = PRIORIDADES.includes(r.prioridad) ? r.prioridad : 'Media';
  const fecha = typeof r.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : new Date().toISOString().slice(0, 10);

  if (Object.keys(errores).length) throw new HttpError(422, 'Los datos del reporte no son válidos.', errores);
  return {
    id, empresa: empresa.id, sede, equipoId: equipo.id, equipoNombre: equipo.equipo || '',
    fecha, personaReporta, descripcion, prioridad,
    adjuntos: [],
    estado: 'Reportado', tecnicoAsignado: '', fechaCierre: '', observacionesReparacion: '',
    fechaHoraReporte: new Date().toISOString(), fechaHoraSolucion: '',
    visto: false,
  };
}

export default withErrors('api/reportes-falla', 'No se pudo acceder a la base de datos compartida de reportes.', async (req, res) => {
  if (req.method === 'GET') {
    if (req.query?.catalogo) return catalogoPublico(res);
    const ctx = await requireAuth(req);
    const reportes = scopeArray(ctx, (await kv.get(KV_KEY)) || [], empresaFilter(ctx, req.query));
    return res.status(200).json({ reportes });
  }

  if (req.method === 'POST') {
    // Endpoint anónimo: límite por IP para que no se pueda inundar de reportes a ninguna empresa.
    if (!(await allowRate(`reporte-falla:${getClientIp(req)}`, MAX_REPORTES_POR_HORA, 60 * 60))) {
      throw new HttpError(429, 'Se enviaron demasiados reportes desde esta conexión. Intenta más tarde.');
    }
    const reporte = await construirReportePublico(req.body?.reporte);
    const reportes = (await kv.get(KV_KEY)) || [];
    // Idempotencia: si por un reintento de red llega el mismo id dos veces, no se duplica.
    // La respuesta pública solo devuelve el propio reporte, nunca el listado.
    if (reportes.some(r => r.id === reporte.id)) return res.status(200).json({ reporte });
    await kv.set(KV_KEY, [...reportes, reporte]);
    return res.status(200).json({ reporte });
  }

  const ctx = await requireAuth(req, { write: true });

  if (req.method === 'PATCH') {
    const { id, patch } = req.body || {};
    if (typeof id !== 'string' || !id || !patch) throw new HttpError(400, 'Falta id o patch para actualizar el reporte.');
    const reportes = (await kv.get(KV_KEY)) || [];
    const idx = findOwned(ctx, reportes, id);
    const actualizado = await applyScopedPatch(ctx, reportes[idx], patch);
    const actualizados = [...reportes];
    actualizados[idx] = actualizado;
    await kv.set(KV_KEY, actualizados);
    return res.status(200).json({ reporte: actualizado, reportes: scopeArray(ctx, actualizados) });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {};
    const reportes = (await kv.get(KV_KEY)) || [];
    if (id) {
      const idx = findOwned(ctx, reportes, id);
      const actualizados = reportes.filter((_, i) => i !== idx);
      await kv.set(KV_KEY, actualizados);
      return res.status(200).json({ reportes: scopeArray(ctx, actualizados) });
    }
    const empresa = empresaFilter(ctx, req.query); // null solo para SUPER_ADMIN sin filtro
    const actualizados = empresa ? reportes.filter(r => r.empresa !== empresa) : [];
    await kv.set(KV_KEY, actualizados);
    return res.status(200).json({ reportes: scopeArray(ctx, actualizados) });
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
});
