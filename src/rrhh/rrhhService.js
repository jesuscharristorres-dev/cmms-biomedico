// src/rrhh/rrhhService.js
// Capa de acceso a datos del módulo Gestión Humana.
//
// HOY: trabaja sobre los datos de demostración (mockData.js) en memoria del navegador; los
// cambios (documentos cargados, vacunas, títulos…) duran mientras la pestaña esté abierta y
// no se envían a ningún servidor.
//
// MAÑANA: cada función exportada tiene la forma de una llamada a la API (async, devuelve
// objetos planos). Para conectar la base de datos real basta con reemplazar el cuerpo de
// estas funciones por `apiFetch('/api/rrhh/...')` — la interfaz no cambia. Las reglas de
// negocio de presentación (estado de un documento, completitud, alertas) están en funciones
// puras al final del archivo y pueden seguir usándose en el cliente o moverse al servidor.
//
// Multiempresa: en la versión real cada consulta debe filtrarse por la empresa del usuario
// en el servidor (igual que el resto de la plataforma, ver lib/tenancy.js).

import { DATOS_DEMO, DOCUMENTOS_BASE, TIPO_CONTRATO_LARGO } from './mockData';

export const ES_DEMO = true;

const DIAS_ALERTA_VENCIMIENTO = 60;

// Copia de trabajo: los datos originales no se mutan (recargar la página reinicia la demo).
const store = structuredClone(DATOS_DEMO);

const espera = (valor) => new Promise(resolve => setTimeout(() => resolve(valor), 120));
const hoyISO = () => new Date().toISOString().slice(0, 10);
const fmtCorta = (iso) => iso.split('-').reverse().join('/');
let secuencia = 0;
const nuevoId = (prefijo) => `${prefijo}-${Date.now().toString(36)}-${(secuencia++).toString(36)}`;

/* ---------------------------------------------------------------- */
/* REGLAS DE PRESENTACIÓN (funciones puras)                          */
/* ---------------------------------------------------------------- */
export function diasHasta(fechaISO) {
  if (!fechaISO) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(fechaISO + 'T00:00:00');
  return Math.round((f - hoy) / 86400000);
}

// vigente | por_vencer | vencido | pendiente
export function estadoDocumento(doc) {
  if (!doc.archivo) return 'pendiente';
  const dias = diasHasta(doc.fechaVencimiento);
  if (dias == null) return 'vigente';
  if (dias < 0) return 'vencido';
  if (dias <= DIAS_ALERTA_VENCIMIENTO) return 'por_vencer';
  return 'vigente';
}

// completa | pendiente (próxima dosis programada) | vencida (refuerzo atrasado)
export function estadoVacuna(v) {
  const dias = diasHasta(v.proximaDosis);
  if (dias == null) return 'completa';
  return dias < 0 ? 'vencida' : 'pendiente';
}

// CONTRATOS: se renuevan automáticamente cada 3 meses. La alarma se enciende cuando falta
// 1 mes y 1 día (o menos) para terminar el periodo vigente.
export const MESES_RENOVACION_CONTRATO = 3;
export function sumarMeses(fechaISO, meses) {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, ultimoDia));
  return base.toISOString().slice(0, 10);
}
function restarDias(fechaISO, dias) {
  const f = new Date(fechaISO + 'T00:00:00Z');
  f.setUTCDate(f.getUTCDate() - dias);
  return f.toISOString().slice(0, 10);
}
// Fecha desde la que suena la alarma: 1 mes y 1 día antes de terminar el periodo.
export function fechaAlarmaContrato(fechaFin) {
  return fechaFin ? restarDias(sumarMeses(fechaFin, -1), 1) : null;
}

export function estadoContrato(c) {
  const dias = diasHasta(c.fechaFin);
  if (dias == null) return { clave: 'activo', dias: null, alarma: null };
  const alarma = fechaAlarmaContrato(c.fechaFin);
  if (dias < 0) return { clave: 'finalizado', dias, alarma };
  if (diasHasta(alarma) <= 0) return { clave: 'por_vencer', dias, alarma };
  return { clave: 'activo', dias, alarma };
}

// Todos los documentos del expediente en una sola lista (documentos generales + títulos,
// actas, certificados de estudios y soportes de vacunación). `ref` indica en qué colección
// vive cada uno, para poder cargarle/reemplazarle el archivo.
function documentosUnificados(colaboradorId) {
  const lista = [];
  store.documentos.filter(d => d.colaboradorId === colaboradorId).forEach(d => lista.push({
    ref: { coleccion: 'documentos', id: d.id }, tipo: d.tipo, nombre: d.nombre, requerido: d.requerido,
    fechaExpedicion: d.fechaExpedicion, fechaVencimiento: d.fechaVencimiento, archivo: d.archivo,
  }));
  store.titulos.filter(t => t.colaboradorId === colaboradorId).forEach(t => {
    lista.push({ ref: { coleccion: 'titulos', id: t.id }, tipo: 'Títulos', nombre: `Título — ${t.titulo}`, requerido: true, fechaVencimiento: null, archivo: t.archivo });
    lista.push({ ref: { coleccion: 'actas', id: t.id }, tipo: 'Actas de grado', nombre: `Acta de grado — ${t.titulo}`, requerido: true, fechaVencimiento: null, archivo: t.acta.archivo });
  });
  store.estudios.filter(s => s.colaboradorId === colaboradorId).forEach(s => lista.push({
    ref: { coleccion: 'estudios', id: s.id }, tipo: 'Estudios complementarios', nombre: `Certificado — ${s.nombre}`, requerido: true,
    fechaVencimiento: s.fechaVencimiento, archivo: s.archivo,
  }));
  store.vacunas.filter(v => v.colaboradorId === colaboradorId).forEach(v => lista.push({
    ref: { coleccion: 'vacunas', id: v.id }, tipo: 'Vacunación', nombre: `Soporte de vacunación — ${v.vacuna} (${v.dosis})`, requerido: true,
    fechaVencimiento: null, archivo: v.archivo,
  }));
  return lista.map(d => ({ ...d, id: `${d.ref.coleccion}:${d.ref.id}`, estado: estadoDocumento(d), fechaCarga: d.archivo?.fechaCarga || null }));
}

export function calcularCompletitud(documentos) {
  const requeridos = documentos.filter(d => d.requerido);
  const completos = requeridos.filter(d => d.estado === 'vigente' || d.estado === 'por_vencer');
  const pendientes = requeridos.filter(d => d.estado === 'pendiente' || d.estado === 'vencido').map(d => ({
    id: d.id, ref: d.ref, nombre: d.nombre, motivo: d.estado === 'vencido' ? 'Actualización de documento (vencido)' : 'Documento pendiente de carga',
  }));
  const total = requeridos.length;
  return { completos: completos.length, total, porcentaje: total ? Math.round((completos.length / total) * 100) : 100, pendientes };
}

function calcularAlertas({ documentos, vacunas, contrato }) {
  const alertas = [];
  documentos.forEach(d => {
    if (d.estado === 'vencido') alertas.push({ nivel: 'rojo', texto: `Documento vencido: ${d.nombre}`, ref: d.ref });
    else if (d.estado === 'pendiente') alertas.push({ nivel: 'rojo', texto: `Documento pendiente: ${d.nombre}`, ref: d.ref });
    else if (d.estado === 'por_vencer') alertas.push({ nivel: 'amarillo', texto: `${d.nombre} vence en ${diasHasta(d.fechaVencimiento)} días`, ref: d.ref });
  });
  vacunas.forEach(v => {
    const est = estadoVacuna(v);
    if (est === 'vencida') alertas.push({ nivel: 'amarillo', texto: `Vacuna requiere actualización: ${v.vacuna}` });
    else if (est === 'pendiente') alertas.push({ nivel: 'amarillo', texto: `Próxima dosis de ${v.vacuna} programada` });
  });
  if (contrato) {
    const ec = estadoContrato(contrato);
    if (ec.clave === 'finalizado') alertas.push({ nivel: 'rojo', texto: 'Contrato finalizado' });
    else if (ec.clave === 'por_vencer') alertas.push({ nivel: 'amarillo', texto: `Alarma de contrato: el periodo termina el ${fmtCorta(contrato.fechaFin)} (en ${ec.dias} días); se renovará automáticamente por ${MESES_RENOVACION_CONTRATO} meses` });
    else alertas.push({ nivel: 'verde', texto: 'Contrato vigente' });
  }
  const orden = { rojo: 0, amarillo: 1, verde: 2 };
  return alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}

function estadoDocumentacion(completitud, documentos) {
  if (completitud.pendientes.length > 0) return 'Con pendientes';
  if (documentos.some(d => d.estado === 'por_vencer')) return 'Por vencer';
  return 'Completa';
}

function resumenColaborador(c) {
  const documentos = documentosUnificados(c.id);
  const completitud = calcularCompletitud(documentos);
  const contrato = store.contratos.find(k => k.colaboradorId === c.id) || null;
  return {
    ...c,
    tipoContrato: contrato?.tipo || '—',
    completitud,
    documentacion: estadoDocumentacion(completitud, documentos),
    documentosTotal: documentos.filter(d => d.archivo).length,
  };
}

/* ---------------------------------------------------------------- */
/* CONSULTAS (futuros GET)                                           */
/* ---------------------------------------------------------------- */
// Multiempresa: `empresa` es la empresa activa de la plataforma (la del selector del
// encabezado); 'TODAS' o vacío = todas. En la versión real lo decide el servidor.
function colaboradoresDe(empresa) {
  return !empresa || empresa === 'TODAS' ? store.colaboradores : store.colaboradores.filter(c => c.empresa === empresa);
}

export async function listarColaboradores(empresa) {
  renovarContratos();
  return espera(colaboradoresDe(empresa).map(resumenColaborador));
}

export async function obtenerExpediente(colaboradorId) {
  renovarContratos();
  const colaborador = store.colaboradores.find(c => c.id === colaboradorId);
  if (!colaborador) return espera(null);
  const documentos = documentosUnificados(colaboradorId);
  const vacunas = store.vacunas.filter(v => v.colaboradorId === colaboradorId).map(v => ({ ...v, estado: estadoVacuna(v) }));
  const contratoBase = store.contratos.find(k => k.colaboradorId === colaboradorId) || null;
  const docContrato = documentos.find(d => d.ref.coleccion === 'documentos' && d.ref.id === `${colaboradorId}-doc-contrato`) || null;
  const contrato = contratoBase ? { ...contratoBase, estado: estadoContrato(contratoBase), documento: docContrato } : null;
  const completitud = calcularCompletitud(documentos);
  return espera({
    colaborador,
    documentos,
    titulos: store.titulos.filter(t => t.colaboradorId === colaboradorId),
    estudios: store.estudios.filter(s => s.colaboradorId === colaboradorId).map(s => ({ ...s, estado: estadoDocumento(s) })),
    vacunas,
    contrato,
    experiencia: store.experiencia.filter(x => x.colaboradorId === colaboradorId),
    historial: store.historial.filter(h => h.colaboradorId === colaboradorId).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    completitud,
    alertas: calcularAlertas({ documentos, vacunas: store.vacunas.filter(v => v.colaboradorId === colaboradorId), contrato: contratoBase }),
  });
}

// Indicadores del tablero, calculados sobre los expedientes cargados (en producción: un
// endpoint de agregados).
export async function obtenerResumen(empresa) {
  renovarContratos();
  const colaboradores = colaboradoresDe(empresa).map(resumenColaborador);
  const ids = new Set(colaboradores.map(c => c.id));
  const porArea = {};
  colaboradores.forEach(c => { porArea[c.area] = (porArea[c.area] || 0) + 1; });
  const vencimientos = [];
  let documentosPorVencer = 0;
  colaboradores.forEach(c => documentosUnificados(c.id).forEach(d => {
    if (d.estado === 'por_vencer') documentosPorVencer += 1;
    if (d.estado === 'por_vencer' || d.estado === 'vencido') {
      vencimientos.push({ colaboradorId: c.id, colaborador: c.nombreCompleto, documento: d.nombre, estado: d.estado, fecha: d.fechaVencimiento, dias: diasHasta(d.fechaVencimiento) });
    }
  }));
  // Contratos en alarma (falta 1 mes y 1 día o menos para terminar el periodo).
  store.contratos.filter(k => ids.has(k.colaboradorId)).forEach(k => {
    const ec = estadoContrato(k);
    if (ec.clave !== 'por_vencer') return;
    const c = colaboradores.find(x => x.id === k.colaboradorId);
    vencimientos.push({ colaboradorId: k.colaboradorId, colaborador: c.nombreCompleto, documento: 'Contrato laboral (renovación automática)', estado: 'por_vencer', fecha: k.fechaFin, dias: ec.dias, esContrato: true });
  });
  const promedio = colaboradores.length ? Math.round(colaboradores.reduce((s, c) => s + c.completitud.porcentaje, 0) / colaboradores.length) : 0;
  return espera({
    indicadores: {
      colaboradoresActivos: colaboradores.filter(c => c.estado === 'Activo').length,
      documentosRegistrados: colaboradores.reduce((s, c) => s + c.documentosTotal, 0),
      documentosPorVencer,
      contratosActivos: store.contratos.filter(k => ids.has(k.colaboradorId) && estadoContrato(k).clave !== 'finalizado').length,
      documentacionPendiente: colaboradores.filter(c => c.documentacion === 'Con pendientes').length,
    },
    muestra: {
      total: colaboradores.length,
      completitudPromedio: promedio,
      porArea: Object.entries(porArea).sort((a, b) => b[1] - a[1]),
      menorCompletitud: [...colaboradores].sort((a, b) => a.completitud.porcentaje - b.completitud.porcentaje).slice(0, 5),
      vencimientos: vencimientos.sort((a, b) => a.dias - b.dias).slice(0, 6),
    },
  });
}

// Vistas consolidadas (todas las filas de una colección, con el colaborador).
function conColaborador(fila) {
  const c = store.colaboradores.find(k => k.id === fila.colaboradorId);
  return { ...fila, colaborador: c?.nombreCompleto || '—', area: c?.area || '—' };
}
export async function listarDocumentos() {
  return espera(store.colaboradores.flatMap(c => documentosUnificados(c.id).map(d => ({ ...d, colaboradorId: c.id, colaborador: c.nombreCompleto, area: c.area }))));
}
export async function listarEstudios() {
  const titulos = store.titulos.map(t => conColaborador({ ...t, categoria: t.nivel, nombre: t.titulo, estado: t.archivo ? 'vigente' : 'pendiente' }));
  const estudios = store.estudios.map(s => conColaborador({ ...s, categoria: s.tipo, estado: estadoDocumento(s) }));
  return espera([...titulos, ...estudios]);
}
export async function listarVacunas() {
  return espera(store.vacunas.map(v => conColaborador({ ...v, estado: estadoVacuna(v) })));
}
export async function listarContratos() {
  return espera(store.contratos.map(k => conColaborador({ ...k, estado: estadoContrato(k) })));
}

/* ---------------------------------------------------------------- */
/* OPERACIONES (futuros POST / PATCH)                                */
/* ---------------------------------------------------------------- */
// `archivo` es el ENLACE al documento (Drive, OneDrive, SharePoint…), igual que en el CMMS
// biomédico: la plataforma no almacena el PDF, solo su URL, y "Ver" lo abre en una pestaña
// nueva. `nombre` es lo que se muestra en el expediente (el servicio de origen del enlace).
function nombreDesdeUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('drive.google') || host.includes('docs.google')) return 'Google Drive';
    if (host.includes('sharepoint')) return 'SharePoint';
    if (host.includes('onedrive') || host.includes('1drv.ms')) return 'OneDrive';
    if (host.includes('dropbox')) return 'Dropbox';
    return host;
  } catch {
    return 'Enlace';
  }
}
function registrarArchivo(url) {
  const limpia = typeof url === 'string' ? url.trim() : '';
  if (!limpia) return null;
  return { nombre: nombreDesdeUrl(limpia), url: limpia, fechaCarga: hoyISO() };
}

function agregarHistorial(colaboradorId, titulo, detalle, tipo, usuario, fecha = hoyISO()) {
  store.historial.push({ id: nuevoId('his'), colaboradorId, fecha, titulo, detalle: usuario ? `${detalle} Registrado por ${usuario}.` : detalle, tipo });
}

// Renovación automática: cada periodo dura 3 meses desde la fecha de inicio; al cumplirse,
// el contrato se renueva solo por otros 3 meses y queda registrado en el historial. Se
// ejecuta en cada consulta (en producción sería una tarea programada del servidor).
function renovarContratos() {
  const hoy = hoyISO();
  store.contratos.forEach(k => {
    if (!k.fechaInicio) return;
    if (!k.fechaFin) k.fechaFin = sumarMeses(k.fechaInicio, MESES_RENOVACION_CONTRATO);
    let renovadas = 0;
    let ultima = null;
    while (k.fechaFin <= hoy) {
      ultima = k.fechaFin;
      k.fechaFin = sumarMeses(k.fechaFin, MESES_RENOVACION_CONTRATO);
      renovadas += 1;
    }
    if (renovadas) {
      k.renovaciones = (k.renovaciones || 0) + renovadas;
      agregarHistorial(k.colaboradorId, 'Renovación automática del contrato',
        `Contrato renovado automáticamente por ${MESES_RENOVACION_CONTRATO} meses el ${fmtCorta(ultima)}; nueva terminación del periodo: ${fmtCorta(k.fechaFin)}.`,
        'contrato', null, ultima);
    }
  });
}

// Carga o reemplaza el archivo de cualquier documento del expediente (ver `ref`).
export async function adjuntarArchivo(colaboradorId, ref, { archivo, fechaExpedicion, fechaVencimiento }, usuario) {
  const nuevo = registrarArchivo(archivo);
  let nombre = '';
  if (ref.coleccion === 'documentos') {
    const d = store.documentos.find(x => x.id === ref.id);
    d.archivo = nuevo; d.fechaExpedicion = fechaExpedicion || hoyISO(); d.fechaVencimiento = fechaVencimiento || null; nombre = d.nombre;
  } else if (ref.coleccion === 'titulos') {
    const t = store.titulos.find(x => x.id === ref.id); t.archivo = nuevo; t.verificado = true; nombre = `Título — ${t.titulo}`;
  } else if (ref.coleccion === 'actas') {
    const t = store.titulos.find(x => x.id === ref.id); t.acta.archivo = nuevo; nombre = `Acta de grado — ${t.titulo}`;
  } else if (ref.coleccion === 'estudios') {
    const s = store.estudios.find(x => x.id === ref.id); s.archivo = nuevo; if (fechaVencimiento !== undefined) s.fechaVencimiento = fechaVencimiento || null; nombre = `Certificado — ${s.nombre}`;
  } else if (ref.coleccion === 'vacunas') {
    const v = store.vacunas.find(x => x.id === ref.id); v.archivo = nuevo; nombre = `Soporte de vacunación — ${v.vacuna}`;
  }
  agregarHistorial(colaboradorId, 'Enlace de documento registrado', `${nombre}.`, 'documento', usuario);
  return espera(true);
}

export async function agregarDocumento(colaboradorId, { tipo, nombre, fechaExpedicion, fechaVencimiento, archivo }, usuario) {
  store.documentos.push({
    id: nuevoId('doc'), colaboradorId, clave: null, tipo, nombre, requerido: false,
    fechaExpedicion: fechaExpedicion || hoyISO(), fechaVencimiento: fechaVencimiento || null,
    archivo: registrarArchivo(archivo),
  });
  agregarHistorial(colaboradorId, 'Nuevo documento', `${tipo}: ${nombre}.`, 'documento', usuario);
  return espera(true);
}

export async function agregarTitulo(colaboradorId, { titulo, institucion, nivel, anio, fechaActa, archivo, archivoActa }, usuario) {
  store.titulos.push({
    id: nuevoId('tit'), colaboradorId, titulo, institucion, nivel, anio: Number(anio) || anio,
    verificado: !!archivo, archivo: registrarArchivo(archivo),
    acta: { fecha: fechaActa ? fechaActa.split('-').reverse().join('/') : '', archivo: registrarArchivo(archivoActa) },
  });
  agregarHistorial(colaboradorId, 'Nuevo título académico', `${titulo} — ${institucion}.`, 'estudio', usuario);
  return espera(true);
}

export async function agregarEstudio(colaboradorId, { nombre, institucion, tipo, horas, anio, fechaVencimiento, archivo }, usuario) {
  store.estudios.push({
    id: nuevoId('est'), colaboradorId, nombre, institucion, tipo, horas: Number(horas) || 0, anio: Number(anio) || anio,
    fechaVencimiento: fechaVencimiento || null, archivo: registrarArchivo(archivo),
  });
  agregarHistorial(colaboradorId, 'Nuevo estudio complementario', `${nombre} (${horas || 0} horas).`, 'estudio', usuario);
  return espera(true);
}

export async function registrarVacuna(colaboradorId, { vacuna, dosis, fecha, lote, proximaDosis, archivo }, usuario) {
  store.vacunas.push({
    id: nuevoId('vac'), colaboradorId, vacuna, dosis, fecha, lote, proximaDosis: proximaDosis || null,
    archivo: registrarArchivo(archivo),
  });
  agregarHistorial(colaboradorId, 'Vacuna registrada', `${vacuna} — ${dosis}.`, 'vacuna', usuario);
  return espera(true);
}

export async function actualizarContrato(colaboradorId, { tipo, fechaInicio, cargo, area, jornada, archivo }, usuario) {
  const k = store.contratos.find(x => x.colaboradorId === colaboradorId);
  // La terminación se recalcula: periodos de 3 meses desde la (nueva) fecha de inicio.
  Object.assign(k, { tipo, tipoDescripcion: TIPO_CONTRATO_LARGO[tipo] || tipo, fechaInicio, fechaFin: null, cargo, area, jornada });
  renovarContratos();
  const c = store.colaboradores.find(x => x.id === colaboradorId);
  Object.assign(c, { cargo, area });
  if (archivo) {
    const d = store.documentos.find(x => x.id === `${colaboradorId}-doc-contrato`);
    if (d) { d.archivo = registrarArchivo(archivo); d.fechaExpedicion = hoyISO(); }
  }
  agregarHistorial(colaboradorId, 'Actualización de contrato', `${tipo} — ${cargo}.`, 'contrato', usuario);
  return espera(true);
}

// Alta de un colaborador: queda con su expediente vacío (los documentos requeridos como
// pendientes) y su contrato, listo para ir agregando los enlaces de cada documento.
export async function crearColaborador(datos, usuario) {
  const id = nuevoId('col');
  const nombres = datos.nombres.trim();
  const apellidos = datos.apellidos.trim();
  const cargo = datos.cargo.trim();
  store.colaboradores.push({
    id, nombres, apellidos, nombreCompleto: `${nombres} ${apellidos}`, genero: datos.genero === 'Femenino' ? 'F' : 'M',
    tipoDocumento: datos.tipoDocumento, documento: datos.documento.trim(), cargo, area: datos.area, empresa: datos.empresa,
    estado: 'Activo', fechaIngreso: datos.fechaIngreso, fechaNacimiento: datos.fechaNacimiento || null, estadoCivil: '',
    ciudad: (datos.ciudad || '').trim(), telefono: (datos.telefono || '').trim(), correo: (datos.correo || '').trim(), direccion: '',
    contactoEmergencia: { nombre: '', parentesco: '', telefono: '' }, perfil: '',
  });
  DOCUMENTOS_BASE.forEach(d => store.documentos.push({
    id: `${id}-doc-${d.clave}`, colaboradorId: id, clave: d.clave, tipo: d.tipo, nombre: d.nombre, requerido: true,
    fechaExpedicion: null, fechaVencimiento: null, archivo: null,
  }));
  store.contratos.push({
    id: `${id}-contrato`, colaboradorId: id, tipo: datos.tipoContrato, tipoDescripcion: TIPO_CONTRATO_LARGO[datos.tipoContrato] || datos.tipoContrato,
    fechaInicio: datos.fechaIngreso, fechaFin: null, cargo, area: datos.area, jornada: 'Tiempo completo',
  });
  agregarHistorial(id, 'Ingreso a la organización', `Vinculación como ${cargo}.`, 'ingreso', usuario);
  return espera(id);
}

// Elimina al colaborador y todo su expediente (documentos, estudios, vacunas, contrato…).
export async function eliminarColaborador(colaboradorId) {
  store.colaboradores = store.colaboradores.filter(c => c.id !== colaboradorId);
  ['documentos', 'titulos', 'estudios', 'vacunas', 'contratos', 'experiencia', 'historial'].forEach(k => {
    store[k] = store[k].filter(x => x.colaboradorId !== colaboradorId);
  });
  return espera(true);
}

/* ---------------------------------------------------------------- */
/* FUNCIONES DEL CARGO (Capacitaciones de ingreso y reinducción)     */
/* ---------------------------------------------------------------- */
export async function listarFuncionesCargo() {
  return espera(store.funcionesCargo.map(x => ({ ...x })));
}
export async function guardarDocumentoCargo(id, url) {
  const x = store.funcionesCargo.find(f => f.id === id);
  if (x) x.archivo = registrarArchivo(url);
  return espera(true);
}
export async function agregarCargo(cargo, url) {
  store.funcionesCargo.push({ id: nuevoId('cargo'), cargo: cargo.trim(), archivo: registrarArchivo(url) });
  return espera(true);
}
export async function eliminarCargo(id) {
  store.funcionesCargo = store.funcionesCargo.filter(f => f.id !== id);
  return espera(true);
}

const CAMPOS_EDITABLES = ['telefono', 'correo', 'direccion', 'ciudad', 'estadoCivil', 'perfil'];
export async function actualizarColaborador(colaboradorId, cambios, usuario) {
  const c = store.colaboradores.find(x => x.id === colaboradorId);
  CAMPOS_EDITABLES.forEach(k => { if (cambios[k] !== undefined) c[k] = cambios[k]; });
  if (cambios.contactoEmergencia) c.contactoEmergencia = { ...c.contactoEmergencia, ...cambios.contactoEmergencia };
  agregarHistorial(colaboradorId, 'Actualización de información', 'Se actualizaron datos personales del colaborador.', 'documento', usuario);
  return espera(true);
}
