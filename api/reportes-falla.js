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

import { datos } from '../lib/datos/index.js';
import { responderVersionado } from '../lib/etag.js';
import { bloquearEscrituraSiMantenimiento } from '../lib/mantenimiento.js';
import { requireAuth, allowRate, getClientIp } from '../lib/auth.js';
import { listEmpresas, getEmpresa, empresaPublica } from '../lib/empresas.js';
import { empresaFilter, scopeArray, canAccessEmpresa, applyScopedPatch } from '../lib/tenancy.js';
import { HttpError, withErrors, methodNotAllowed } from '../lib/http.js';

const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Crítica'];
const MAX_REPORTES_POR_HORA = 30;

function texto(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// Catálogo PÚBLICO (anónimo) del formulario de reporte de falla. Antes cada visita leía el
// inventario completo de Redis (~3 MB de transferencia). Ahora:
//   - el inventario sale de la caché en memoria validada por versión (lib/coleccion.js);
//   - la respuesta se cachea en el CDN de Vercel (s-maxage) — la mayoría de visitas ni
//     siquiera llega a la función; un equipo nuevo aparece en el formulario en ≤ 5 minutos;
//   - límite de frecuencia por IP para las que sí llegan.
// Solo se exponen los campos de identificación que el buscador del formulario necesita.
const MAX_CATALOGO_POR_HORA = 120;
const CACHE_CATALOGO = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';

async function listarIdentificacion() {
  const todos = [];
  for (let desde = 0; ; desde += 1000) {
    const { items, total } = await datos.equipos.listarResumen({ desde, cantidad: 1000 });
    todos.push(...items);
    if (!items.length || todos.length >= total) return todos;
  }
}

async function catalogoPublico(req, res) {
  if (!(await allowRate(`catalogo:${getClientIp(req)}`, MAX_CATALOGO_POR_HORA, 60 * 60))) {
    throw new HttpError(429, 'Demasiadas consultas desde esta conexión. Intenta más tarde.');
  }
  const empresas = (await listEmpresas()).filter(e => e.estado === 'activo');
  const activas = new Set(empresas.map(e => e.id));
  // Solo las columnas de identificación (en Supabase, sin historial ni `datos`).
  const equipos = (await listarIdentificacion())
    .filter(e => e && activas.has(e.empresa))
    .map(e => ({
      id: e.id, empresa: e.empresa, sede: e.sede,
      equipo: e.equipo || '', marca: e.marca || '', modelo: e.modelo || '',
      numeroSerie: e.numeroSerie || '', inventario: e.inventario || '',
    }));
  res.setHeader('Cache-Control', CACHE_CATALOGO);
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

  // Validación con la caché del inventario (Redis) o con una consulta de UN equipo (Supabase).
  const equipo = typeof r.equipoId === 'string' && r.equipoId ? await datos.equipos.obtener(r.equipoId) : null;
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
  const repo = datos.reportesFalla;
  if (req.method === 'GET') {
    if (req.query?.catalogo) return catalogoPublico(req, res);
    const ctx = await requireAuth(req);
    const filtro = empresaFilter(ctx, req.query);
    return responderVersionado(req, res, {
      nombre: 'reportesFalla', marca: repo.marca, alcance: [ctx.userId, ctx.role, ctx.empresaId, filtro],
      construir: async () => ({ reportes: scopeArray(ctx, await repo.listar({ empresa: ctx.isSuperAdmin ? filtro : ctx.empresaId }), filtro) }),
    });
  }

  if (req.method === 'POST') {
    bloquearEscrituraSiMantenimiento(req);
    // Endpoint anónimo: límite por IP para que no se pueda inundar de reportes a ninguna empresa.
    if (!(await allowRate(`reporte-falla:${getClientIp(req)}`, MAX_REPORTES_POR_HORA, 60 * 60))) {
      throw new HttpError(429, 'Se enviaron demasiados reportes desde esta conexión. Intenta más tarde.');
    }
    const reporte = await construirReportePublico(req.body?.reporte);
    // Idempotencia: si por un reintento de red llega el mismo id dos veces, no se duplica.
    // La respuesta pública solo devuelve el propio reporte, nunca el listado.
    await repo.crear([reporte]);
    return res.status(200).json({ reporte });
  }

  const ctx = await requireAuth(req, { write: true });
  const acceso = r => canAccessEmpresa(ctx, r.empresa);

  if (req.method === 'PATCH') {
    const { id, patch } = req.body || {};
    if (typeof id !== 'string' || !id || !patch) throw new HttpError(400, 'Falta id o patch para actualizar el reporte.');
    const reporte = await repo.actualizar(id, actual => applyScopedPatch(ctx, actual, patch), { acceso });
    // Solo el reporte actualizado: el frontend no usa la colección (ver api/equipos.js).
    return res.status(200).json({ reporte });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {};
    if (id) {
      await repo.eliminar(id, { acceso });
      return res.status(200).json({ ok: true, id });
    }
    const empresa = empresaFilter(ctx, req.query); // null solo para SUPER_ADMIN sin filtro
    const eliminados = await repo.eliminarPorEmpresa(empresa);
    return res.status(200).json({ ok: true, eliminados });
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
});
