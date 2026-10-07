// src/rrhh/Expediente.jsx
// Expediente digital de un colaborador: cabecera con completitud y acciones, y la
// información organizada en pestañas. Todas las lecturas/escrituras pasan por rrhhService.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Pencil, Eye, Download, FilePlus2, GraduationCap, Award, Syringe, FileSignature,
  AlertTriangle, AlertCircle, CheckCircle2, Link2, ExternalLink, RefreshCw, Briefcase, History,
  IdCard, BookOpen, FolderOpen, LayoutDashboard, UserRound, HardHat, HeartPulse, FileText,
  CalendarDays, MapPin, Phone, Mail, Shirt,
} from 'lucide-react';
import * as rrhh from './rrhhService';
import { verExpediente, descargarExpediente } from './exportarExpediente';
import {
  COLOR_RRHH, ESTADO_DOCUMENTO, ESTADO_VACUNA, ESTADO_CONTRATO, NIVEL_ALERTA, TIPOS_DOCUMENTO, TIPOS_CONTRATO,
  AREAS_RRHH, fmtFecha, tiempoTranscurrido, abrirEnlace,
} from './formato';
import { Avatar, Boton, Card, EstadoPill, FormularioModal, Pill, Progreso, Tabla } from './ui';

const PESTANAS = [
  { key: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { key: 'personal', label: 'Información personal', icon: UserRound },
  { key: 'estudios', label: 'Estudios', icon: GraduationCap },
  { key: 'documentos', label: 'Documentos', icon: FolderOpen },
  { key: 'vacunacion', label: 'Vacunación', icon: Syringe },
  { key: 'contrato', label: 'Contrato', icon: FileSignature },
  { key: 'hoja', label: 'Hoja de vida', icon: BookOpen },
  { key: 'historial', label: 'Historial', icon: History },
];

const DOTACION_SI = 'Sí, recibió dotación';
const DOTACION_NO = 'No recibió dotación';

const NOTA_ARCHIVO = 'Igual que en el CMMS biomédico: el documento se guarda como un enlace. Súbelo en PDF a Drive, OneDrive o SharePoint, compártelo con tu organización y pega aquí la URL; al dar clic en "Ver" se abre en una pestaña nueva. (Demostración: los cambios se conservan solo en esta sesión del navegador.)';

function IconoAlerta({ nivel }) {
  const c = NIVEL_ALERTA[nivel].color;
  if (nivel === 'rojo') return <AlertCircle size={16} style={{ color: c }} className="shrink-0" />;
  if (nivel === 'amarillo') return <AlertTriangle size={16} style={{ color: c }} className="shrink-0" />;
  return <CheckCircle2 size={16} style={{ color: c }} className="shrink-0" />;
}

function Dato({ t, label, valor, icono: Icono }) {
  return (
    <div className="min-w-0">
      <div className={`text-3xs uppercase tracking-wide font-semibold ${t.muted}`}>{label}</div>
      <div className="text-xs font-semibold mt-0.5 flex items-center gap-1.5 break-words">{Icono && <Icono size={12} className={t.muted} />}{valor || '—'}</div>
    </div>
  );
}

export default function Expediente({ t, colaboradorId, readOnly, usuario, empresaLabel, empresas = [], onVolver, notificar }) {
  const [exp, setExp] = useState(null);
  const [version, setVersion] = useState(0);
  const [pestana, setPestana] = useState('resumen');
  const [formulario, setFormulario] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('');

  useEffect(() => {
    let vivo = true;
    rrhh.obtenerExpediente(colaboradorId).then(e => { if (vivo) setExp(e); });
    return () => { vivo = false; };
  }, [colaboradorId, version]);

  const recargar = useCallback(() => setVersion(v => v + 1), []);
  const c = exp?.colaborador;

  const documentosFiltrados = useMemo(
    () => (exp ? exp.documentos.filter(d => !filtroTipo || d.tipo === filtroTipo) : []),
    [exp, filtroTipo]);

  if (!exp) {
    return <div className={`py-24 text-center text-sm ${t.muted}`}>Cargando expediente…</div>;
  }

  /* ---- acciones sobre documentos ---- */
  // Igual que en el CMMS biomédico: el documento es un enlace y se abre en una pestaña nueva.
  const verDoc = (archivo) => abrirEnlace(archivo?.url);
  const guardarYNotificar = (mensaje) => async (promesa) => { await promesa; recargar(); notificar(mensaje); };

  const abrir = (clave, extra = {}) => {
    const base = { color: COLOR_RRHH, nota: NOTA_ARCHIVO };
    const formularios = {
      adjuntar: {
        titulo: extra.reemplazar ? 'Cambiar enlace del documento' : 'Agregar enlace del documento', subtitulo: extra.nombre,
        campos: [
          { name: 'fechaExpedicion', label: 'Fecha de expedición', type: 'date' },
          ...(extra.conVencimiento ? [{ name: 'fechaVencimiento', label: 'Fecha de vencimiento', type: 'date' }] : []),
          { name: 'archivo', label: 'URL del documento (PDF)', type: 'url', required: true },
        ],
        textoGuardar: 'Guardar documento',
        onGuardar: v => guardarYNotificar('Enlace del documento guardado en el expediente.')(rrhh.adjuntarArchivo(c.id, extra.ref, v, usuario)),
      },
      documento: {
        titulo: 'Agregar documento', subtitulo: c.nombreCompleto,
        campos: [
          { name: 'tipo', label: 'Tipo de documento', type: 'select', options: TIPOS_DOCUMENTO, required: true },
          { name: 'nombre', label: 'Nombre', required: true, placeholder: 'Ej.: Certificado laboral' },
          { name: 'fechaExpedicion', label: 'Fecha de expedición', type: 'date' },
          { name: 'fechaVencimiento', label: 'Fecha de vencimiento', type: 'date' },
          { name: 'archivo', label: 'URL del documento (PDF)', type: 'url' },
        ],
        textoGuardar: 'Guardar documento',
        onGuardar: v => guardarYNotificar('Documento agregado al expediente.')(rrhh.agregarDocumento(c.id, v, usuario)),
      },
      titulo: {
        titulo: 'Agregar título académico', subtitulo: c.nombreCompleto,
        campos: [
          { name: 'titulo', label: 'Título', required: true, full: true },
          { name: 'institucion', label: 'Institución', required: true },
          { name: 'nivel', label: 'Nivel', type: 'select', options: ['Técnico', 'Tecnológico', 'Pregrado', 'Especialización', 'Maestría', 'Doctorado'], required: true },
          { name: 'anio', label: 'Año de grado', type: 'number', required: true },
          { name: 'fechaActa', label: 'Fecha del acta de grado', type: 'date' },
          { name: 'archivo', label: 'URL del diploma (PDF)', type: 'url' },
          { name: 'archivoActa', label: 'URL del acta de grado (PDF)', type: 'url' },
        ],
        textoGuardar: 'Agregar título',
        onGuardar: v => guardarYNotificar('Título académico agregado.')(rrhh.agregarTitulo(c.id, v, usuario)),
      },
      acta: {
        titulo: 'Agregar acta de grado', subtitulo: c.nombreCompleto,
        campos: [
          { name: 'tituloId', label: 'Título al que corresponde', type: 'select', options: exp.titulos.map(x => x.titulo), required: true, full: true },
          { name: 'archivo', label: 'URL del acta de grado (PDF)', type: 'url', required: true },
        ],
        textoGuardar: 'Guardar acta',
        onGuardar: v => {
          const tit = exp.titulos.find(x => x.titulo === v.tituloId);
          return guardarYNotificar('Enlace del acta de grado guardado.')(rrhh.adjuntarArchivo(c.id, { coleccion: 'actas', id: tit.id }, v, usuario));
        },
      },
      estudio: {
        titulo: extra.certificacion ? 'Agregar certificación' : 'Agregar estudio complementario', subtitulo: c.nombreCompleto,
        inicial: { tipo: extra.certificacion ? 'Certificación' : '' },
        campos: [
          { name: 'nombre', label: 'Nombre del estudio', required: true, full: true },
          { name: 'institucion', label: 'Institución', required: true },
          { name: 'tipo', label: 'Tipo', type: 'select', options: ['Curso', 'Diplomado', 'Certificación', 'Seminario'], required: true },
          { name: 'horas', label: 'Horas', type: 'number' },
          { name: 'anio', label: 'Año', type: 'number' },
          { name: 'fechaVencimiento', label: 'Vigencia hasta (si aplica)', type: 'date' },
          { name: 'archivo', label: 'URL del certificado (PDF)', type: 'url' },
        ],
        textoGuardar: 'Agregar estudio',
        onGuardar: v => guardarYNotificar('Estudio complementario agregado.')(rrhh.agregarEstudio(c.id, v, usuario)),
      },
      vacuna: {
        titulo: 'Registrar vacuna', subtitulo: c.nombreCompleto,
        campos: [
          { name: 'vacuna', label: 'Vacuna', type: 'select', options: ['COVID-19', 'Hepatitis B', 'Tétanos', 'Influenza', 'Fiebre amarilla', 'Sarampión - Rubéola', 'Otra'], required: true },
          { name: 'dosis', label: 'Dosis', type: 'select', options: ['Dosis 1', 'Dosis 2', 'Dosis 3', 'Refuerzo', 'Dosis única', 'Anual'], required: true },
          { name: 'fecha', label: 'Fecha de aplicación', type: 'date', required: true },
          { name: 'lote', label: 'Lote', placeholder: 'LOTE-0000' },
          { name: 'proximaDosis', label: 'Próxima dosis (si aplica)', type: 'date' },
          { name: 'archivo', label: 'URL del soporte (carné / certificado)', type: 'url' },
        ],
        textoGuardar: 'Registrar vacuna',
        onGuardar: v => guardarYNotificar('Vacuna registrada.')(rrhh.registrarVacuna(c.id, v, usuario)),
      },
      contrato: {
        titulo: 'Actualizar contrato', subtitulo: c.nombreCompleto,
        inicial: { tipo: exp.contrato?.tipo, fechaInicio: exp.contrato?.fechaInicio, fechaFin: exp.contrato?.fechaFin || '', cargo: exp.contrato?.cargo, area: exp.contrato?.area, jornada: exp.contrato?.jornada },
        campos: [
          { name: 'tipo', label: 'Tipo de contrato', type: 'select', options: TIPOS_CONTRATO, required: true },
          { name: 'jornada', label: 'Jornada', type: 'select', options: ['Tiempo completo', 'Medio tiempo', 'Por horas'], required: true },
          { name: 'fechaInicio', label: 'Fecha de inicio', type: 'date', required: true },
          { name: 'cargo', label: 'Cargo', required: true },
          { name: 'area', label: 'Área', type: 'select', options: AREAS_RRHH, required: true },
          { name: 'archivo', label: 'URL del contrato firmado (PDF)', type: 'url' },
        ],
        nota: 'El contrato se renueva automáticamente cada 3 meses desde la fecha de inicio; la alarma aparece cuando falta 1 mes y 1 día para terminar el periodo. (Demostración: los cambios se conservan solo en esta sesión.)',
        textoGuardar: 'Actualizar contrato',
        onGuardar: v => guardarYNotificar('Contrato actualizado.')(rrhh.actualizarContrato(c.id, v, usuario)),
      },
      dotacion: {
        titulo: 'Registrar dotación', subtitulo: c.nombreCompleto,
        inicial: {
          recibio: c.dotacion ? (c.dotacion.recibio ? DOTACION_SI : DOTACION_NO) : '',
          fecha: c.dotacion?.fecha || '', archivo: c.dotacion?.archivo?.url?.startsWith('http') ? c.dotacion.archivo.url : '',
        },
        campos: [
          { name: 'recibio', label: '¿Se le entregó dotación?', type: 'select', options: [DOTACION_SI, DOTACION_NO], required: true, full: true },
          { name: 'fecha', label: 'Fecha', type: 'date' },
          { name: 'archivo', label: 'URL del acta de entrega de dotación (PDF)', type: 'url', required: true, visible: v => v.recibio === DOTACION_SI },
        ],
        textoGuardar: 'Guardar dotación',
        onGuardar: v => {
          const recibio = v.recibio === DOTACION_SI;
          return guardarYNotificar(recibio ? 'Entrega de dotación registrada.' : 'Se marcó que no recibió dotación.')(
            rrhh.registrarDotacion(c.id, { recibio, url: recibio ? v.archivo : null, fecha: v.fecha }, usuario));
        },
      },
      editar: {
        titulo: 'Editar información', subtitulo: c.nombreCompleto,
        inicial: { telefono: c.telefono, correo: c.correo, direccion: c.direccion, ciudad: c.ciudad, estadoCivil: c.estadoCivil, perfil: c.perfil, emergenciaNombre: c.contactoEmergencia?.nombre, emergenciaTelefono: c.contactoEmergencia?.telefono },
        campos: [
          { name: 'telefono', label: 'Teléfono', required: true },
          { name: 'correo', label: 'Correo electrónico', type: 'email', required: true },
          { name: 'direccion', label: 'Dirección', full: true },
          { name: 'ciudad', label: 'Ciudad' },
          { name: 'estadoCivil', label: 'Estado civil' },
          { name: 'emergenciaNombre', label: 'Contacto de emergencia' },
          { name: 'emergenciaTelefono', label: 'Teléfono de emergencia' },
          { name: 'perfil', label: 'Perfil profesional', type: 'textarea' },
        ],
        nota: 'Demostración: los cambios se conservan solo en esta sesión del navegador.',
        textoGuardar: 'Guardar cambios',
        onGuardar: v => guardarYNotificar('Información actualizada.')(rrhh.actualizarColaborador(c.id, {
          ...v, contactoEmergencia: { nombre: v.emergenciaNombre, telefono: v.emergenciaTelefono },
        }, usuario)),
      },
    };
    setFormulario({ ...base, ...formularios[clave] });
  };

  const cargarPendiente = (p) => abrir('adjuntar', { ref: p.ref, nombre: p.nombre, conVencimiento: p.ref.coleccion === 'documentos' || p.ref.coleccion === 'estudios' });

  const accionesDoc = (d) => (
    <div className="flex flex-wrap gap-1">
      {d.archivo && <Boton pequeno variante="fantasma" icono={ExternalLink} onClick={() => verDoc(d.archivo)}>Ver</Boton>}
      {!readOnly && (
        <Boton pequeno variante={d.archivo ? 'fantasma' : 'secundario'} icono={d.archivo ? RefreshCw : Link2}
          onClick={() => abrir('adjuntar', { ref: d.ref, nombre: d.nombre, reemplazar: !!d.archivo, conVencimiento: d.ref.coleccion === 'documentos' || d.ref.coleccion === 'estudios' })}>
          {d.archivo ? 'Cambiar URL' : 'Agregar URL'}
        </Boton>
      )}
    </div>
  );

  const activoLabel = c.estado === 'Activo' ? (c.genero === 'F' ? 'Activa' : 'Activo') : (c.genero === 'F' ? 'Inactiva' : 'Inactivo');
  const docHv = exp.documentos.find(d => d.ref.id === `${c.id}-doc-hv`);
  const experienciaActual = exp.experiencia.filter(x => !x.fin);
  const experienciaAnterior = exp.experiencia.filter(x => x.fin);

  return (
    <div className="max-w-7xl mx-auto pb-10">
      <button onClick={onVolver} className={`inline-flex items-center gap-1.5 text-xs mb-4 hover:underline ${t.muted}`}>
        <ArrowLeft size={14} /> Colaboradores
      </button>

      {/* CABECERA */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        <section className={`rounded-2xl border overflow-hidden ${t.panel} ${t.border}`}>
          <div className="h-1.5" style={{ background: COLOR_RRHH }} />
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar nombre={c.nombreCompleto} size={72} />
              <div className="flex-1 min-w-[220px]">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{c.nombreCompleto}</h1>
                  <Pill color={c.estado === 'Activo' ? '#16A34A' : '#64748B'} fuerte>{activoLabel}</Pill>
                </div>
                <p className="text-sm font-semibold mt-1" style={{ color: COLOR_RRHH }}>{c.cargo}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!readOnly && <Boton icono={Pencil} onClick={() => abrir('editar')}>Editar información</Boton>}
                <Boton icono={Eye} onClick={() => verExpediente(exp, empresaLabel)}>Ver expediente</Boton>
                <Boton icono={Download} variante="primario" onClick={() => { descargarExpediente(exp, empresaLabel); notificar('Expediente descargado.'); }}>Descargar expediente</Boton>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
              <Dato t={t} label="Empresa" valor={empresas.find(e => e.key === c.empresa)?.nombre || c.empresa} />
              <Dato t={t} label="Documento" valor={`${c.tipoDocumento} ${c.documento}`} />
              <Dato t={t} label="Cargo" valor={c.cargo} />
              <Dato t={t} label="Área" valor={c.area} />
              <Dato t={t} label="Fecha de ingreso" valor={fmtFecha(c.fechaIngreso)} />
              <Dato t={t} label="Tipo de contrato" valor={exp.contrato?.tipo} />
              <Dato t={t} label="Estado" valor={c.estado} />
            </div>
            {!readOnly && (
              <div className={`mt-5 pt-4 border-t flex flex-wrap gap-2 ${t.border}`}>
                <Boton pequeno icono={FilePlus2} onClick={() => abrir('documento')}>Agregar documento</Boton>
                <Boton pequeno icono={GraduationCap} onClick={() => abrir('titulo')}>Agregar título</Boton>
                <Boton pequeno icono={Award} onClick={() => abrir('estudio', { certificacion: true })}>Agregar certificación</Boton>
                <Boton pequeno icono={Syringe} onClick={() => abrir('vacuna')}>Registrar vacuna</Boton>
                <Boton pequeno icono={FileSignature} onClick={() => abrir('contrato')}>Actualizar contrato</Boton>
              </div>
            )}
          </div>
        </section>

        <section className={`rounded-2xl border p-5 ${t.panel} ${t.border}`}>
          <div className={`text-3xs uppercase tracking-wide font-semibold ${t.muted}`}>Completitud del expediente</div>
          <div className="mt-1 flex items-end justify-between">
            <span className="text-4xl font-bold font-mono" style={{ color: exp.completitud.porcentaje >= 90 ? '#16A34A' : exp.completitud.porcentaje >= 75 ? '#D97706' : '#DC2626' }}>
              {exp.completitud.porcentaje}%
            </span>
            <span className={`text-2xs ${t.muted}`}>Documentos completos: <strong className={t.text}>{exp.completitud.completos} / {exp.completitud.total}</strong></span>
          </div>
          <div className="mt-2"><Progreso valor={exp.completitud.porcentaje} alto={10} /></div>
          <div className={`mt-4 text-3xs uppercase tracking-wide font-semibold ${t.muted}`}>Pendientes</div>
          {exp.completitud.pendientes.length === 0 ? (
            <p className="mt-2 text-xs flex items-center gap-1.5" style={{ color: '#16A34A' }}><CheckCircle2 size={14} /> Expediente completo</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {exp.completitud.pendientes.slice(0, 4).map(p => (
                <li key={p.id} className="flex items-start justify-between gap-2">
                  <span className="text-xs min-w-0">
                    <span className="font-semibold block truncate" title={p.nombre}>{p.nombre}</span>
                    <span className={`text-3xs ${t.muted}`}>{p.motivo}</span>
                  </span>
                  {!readOnly && <Boton pequeno variante="fantasma" icono={Link2} onClick={() => cargarPendiente(p)}>Agregar URL</Boton>}
                </li>
              ))}
              {exp.completitud.pendientes.length > 4 && <li className={`text-3xs ${t.muted}`}>y {exp.completitud.pendientes.length - 4} más…</li>}
            </ul>
          )}
        </section>
      </div>

      {/* PESTAÑAS */}
      <div className={`mt-5 flex gap-1 overflow-x-auto border-b ${t.border}`} role="tablist">
        {PESTANAS.map(p => {
          const activa = pestana === p.key;
          const Icon = p.icon;
          return (
            <button key={p.key} role="tab" aria-selected={activa} onClick={() => setPestana(p.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 -mb-px transition ${activa ? '' : `${t.muted} border-transparent hover:text-inherit`}`}
              style={activa ? { borderColor: COLOR_RRHH, color: COLOR_RRHH } : {}}>
              <Icon size={14} /> {p.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {pestana === 'resumen' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card t={t} titulo="Alertas del colaborador" icono={AlertTriangle} color="#D97706">
              <ul className="space-y-2">
                {exp.alertas.map((a, i) => (
                  <li key={i} className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: NIVEL_ALERTA[a.nivel].color + '10' }}>
                    <IconoAlerta nivel={a.nivel} /> <span className="text-xs">{a.texto}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card t={t} titulo="Contrato" icono={FileSignature} color={COLOR_RRHH}
              accion={<Boton pequeno variante="fantasma" onClick={() => setPestana('contrato')}>Ver contrato</Boton>}>
              {exp.contrato && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">{exp.contrato.tipoDescripcion}</span>
                    <EstadoPill mapa={ESTADO_CONTRATO} valor={exp.contrato.estado.clave} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Dato t={t} label="Inicio" valor={fmtFecha(exp.contrato.fechaInicio)} />
                    <Dato t={t} label="Terminación" valor={exp.contrato.fechaFin ? fmtFecha(exp.contrato.fechaFin) : 'No aplica'} />
                    <Dato t={t} label="Cargo" valor={exp.contrato.cargo} />
                    <Dato t={t} label="Jornada" valor={exp.contrato.jornada} />
                  </div>
                </>
              )}
            </Card>
            <Card t={t} titulo="Resumen del expediente" icono={FolderOpen} color={COLOR_RRHH}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Documentos', valor: exp.documentos.filter(d => d.archivo).length, pestana: 'documentos' },
                  { label: 'Títulos', valor: exp.titulos.length, pestana: 'estudios' },
                  { label: 'Estudios', valor: exp.estudios.length, pestana: 'estudios' },
                  { label: 'Vacunas', valor: exp.vacunas.length, pestana: 'vacunacion' },
                ].map(k => (
                  <button key={k.label} onClick={() => setPestana(k.pestana)} className={`rounded-xl border p-3 text-left transition hover:shadow-md ${t.border}`}>
                    <div className="text-2xl font-bold font-mono" style={{ color: COLOR_RRHH }}>{k.valor}</div>
                    <div className={`text-3xs uppercase tracking-wide font-semibold ${t.muted}`}>{k.label}</div>
                  </button>
                ))}
              </div>
            </Card>
            <Card t={t} titulo="Información transversal" icono={HeartPulse} color="#0D9488">
              <p className={`text-2xs mb-3 ${t.muted}`}>El expediente puede alimentar a otras áreas de la plataforma.</p>
              <ul className="space-y-2">
                {[
                  { icon: HardHat, color: '#EA580C', area: 'SST', texto: 'Vacunación → exámenes ocupacionales → riesgos → incidentes' },
                  { icon: HeartPulse, color: '#0D9488', area: 'Biomédica', texto: 'Responsable de equipos → mantenimientos → capacitaciones' },
                ].map(x => (
                  <li key={x.area} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${t.border}`}>
                    <x.icon size={16} style={{ color: x.color }} className="shrink-0" />
                    <span className="text-xs min-w-0 flex-1"><strong>{x.area}:</strong> <span className={t.muted}>{x.texto}</span></span>
                    <Pill color="#64748B">Próximamente</Pill>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        {pestana === 'personal' && (
          <Card t={t} titulo="Información del colaborador" icono={IdCard} color={COLOR_RRHH}
            accion={!readOnly && <Boton pequeno icono={Pencil} onClick={() => abrir('editar')}>Editar</Boton>}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
              <Dato t={t} label="Nombre completo" valor={c.nombreCompleto} />
              <Dato t={t} label="Tipo de documento" valor={c.tipoDocumento === 'CC' ? 'Cédula de ciudadanía' : c.tipoDocumento} />
              <Dato t={t} label="Número de documento" valor={c.documento} />
              <Dato t={t} label="Fecha de nacimiento" valor={fmtFecha(c.fechaNacimiento)} icono={CalendarDays} />
              <Dato t={t} label="Teléfono" valor={c.telefono} icono={Phone} />
              <Dato t={t} label="Correo electrónico" valor={c.correo} icono={Mail} />
              <Dato t={t} label="Dirección" valor={c.direccion} icono={MapPin} />
              <Dato t={t} label="Ciudad" valor={c.ciudad} />
              <Dato t={t} label="Estado civil" valor={c.estadoCivil} />
              <Dato t={t} label="Contacto de emergencia" valor={`${c.contactoEmergencia?.nombre || '—'}${c.contactoEmergencia?.parentesco ? ` (${c.contactoEmergencia.parentesco})` : ''} · ${c.contactoEmergencia?.telefono || ''}`} />
            </div>
            <p className={`mt-6 text-3xs ${t.muted}`}>Todos los datos de esta demostración son ficticios.</p>
          </Card>
        )}

        {pestana === 'estudios' && (
          <div className="space-y-4">
            <Card t={t} titulo="Títulos académicos" icono={GraduationCap} color={COLOR_RRHH}
              accion={!readOnly && <Boton pequeno icono={FilePlus2} onClick={() => abrir('titulo')}>Agregar título</Boton>}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {exp.titulos.map(x => (
                  <div key={x.id} className={`rounded-xl border p-4 ${t.border}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold">{x.titulo}</div>
                        <div className={`text-2xs mt-0.5 ${t.muted}`}>{x.institucion} · {x.nivel} · {x.anio}</div>
                      </div>
                      {x.archivo ? <Pill color="#16A34A">Verificado</Pill> : <Pill color="#DC2626">Sin soporte</Pill>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {x.archivo && <Boton pequeno variante="fantasma" icono={ExternalLink} onClick={() => verDoc(x.archivo)}>Ver documento</Boton>}
                      {!x.archivo && !readOnly && <Boton pequeno icono={Link2} onClick={() => abrir('adjuntar', { ref: { coleccion: 'titulos', id: x.id }, nombre: `Título — ${x.titulo}` })}>Agregar URL del diploma</Boton>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card t={t} titulo="Actas de grado" icono={FileText} color={COLOR_RRHH}
              accion={!readOnly && exp.titulos.length > 0 && <Boton pequeno icono={FilePlus2} onClick={() => abrir('acta')}>Agregar acta de grado</Boton>}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {exp.titulos.map(x => (
                  <div key={x.id} className={`rounded-xl border p-4 ${t.border}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold">Acta de grado — {x.titulo}</div>
                        <div className={`text-2xs mt-0.5 ${t.muted}`}>{x.institucion} · Fecha: {x.acta.fecha || '—'}</div>
                      </div>
                      {x.acta.archivo ? <Pill color="#16A34A">Documento cargado</Pill> : <Pill color="#DC2626">Pendiente</Pill>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {x.acta.archivo && <Boton pequeno variante="fantasma" icono={ExternalLink} onClick={() => verDoc(x.acta.archivo)}>Ver</Boton>}
                      {!readOnly && (
                        <Boton pequeno variante={x.acta.archivo ? 'fantasma' : 'secundario'} icono={x.acta.archivo ? RefreshCw : Link2}
                          onClick={() => abrir('adjuntar', { ref: { coleccion: 'actas', id: x.id }, nombre: `Acta de grado — ${x.titulo}`, reemplazar: !!x.acta.archivo })}>
                          {x.acta.archivo ? 'Cambiar URL' : 'Agregar URL'}
                        </Boton>
                      )}
                    </div>
                  </div>
                ))}
                {exp.titulos.length === 0 && <p className={`text-xs ${t.muted}`}>Sin títulos registrados.</p>}
              </div>
            </Card>

            <Card t={t} titulo="Estudios complementarios" icono={Award} color={COLOR_RRHH}
              accion={!readOnly && <Boton pequeno icono={FilePlus2} onClick={() => abrir('estudio')}>Agregar estudio</Boton>}>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {exp.estudios.map(s => (
                  <div key={s.id} className={`rounded-xl border p-4 flex flex-col ${t.border}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-3xs uppercase tracking-wide font-bold" style={{ color: COLOR_RRHH }}>{s.tipo}</span>
                      <EstadoPill mapa={{ ...ESTADO_DOCUMENTO, vigente: { label: 'Vigente', color: '#16A34A' }, pendiente: { label: 'Sin certificado', color: '#DC2626' } }} valor={s.estado} />
                    </div>
                    <div className="text-sm font-bold mt-2">{s.nombre}</div>
                    <div className={`text-2xs mt-1 ${t.muted}`}>{s.institucion}</div>
                    <div className={`text-2xs mt-1 ${t.muted}`}>{s.horas} horas · {s.anio}{s.fechaVencimiento ? ` · Vigente hasta ${fmtFecha(s.fechaVencimiento)}` : ''}</div>
                    <div className="mt-auto pt-3 flex flex-wrap gap-1">
                      {s.archivo && <Boton pequeno variante="fantasma" icono={ExternalLink} onClick={() => verDoc(s.archivo)}>Ver</Boton>}
                      {!readOnly && !s.archivo && <Boton pequeno icono={Link2} onClick={() => abrir('adjuntar', { ref: { coleccion: 'estudios', id: s.id }, nombre: `Certificado — ${s.nombre}`, conVencimiento: true })}>Agregar URL del certificado</Boton>}
                    </div>
                  </div>
                ))}
                {exp.estudios.length === 0 && <p className={`text-xs ${t.muted}`}>Sin estudios complementarios registrados.</p>}
              </div>
            </Card>
          </div>
        )}

        {pestana === 'documentos' && (
          <Card t={t} titulo="Documentación" icono={FolderOpen} color={COLOR_RRHH}
            accion={!readOnly && <Boton pequeno icono={FilePlus2} variante="primario" onClick={() => abrir('documento')}>Agregar documento</Boton>}>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {['', ...new Set(exp.documentos.map(d => d.tipo))].map(tipo => (
                <button key={tipo || 'todos'} onClick={() => setFiltroTipo(tipo)}
                  className={`px-2.5 py-1 rounded-full text-2xs font-semibold border transition ${t.border}`}
                  style={filtroTipo === tipo ? { background: COLOR_RRHH, color: '#fff', borderColor: COLOR_RRHH } : {}}>
                  {tipo || 'Todos'} <span className="opacity-70">({tipo ? exp.documentos.filter(d => d.tipo === tipo).length : exp.documentos.length})</span>
                </button>
              ))}
            </div>
            <Tabla t={t} filas={documentosFiltrados} columnas={[
              { key: 'tipo', label: 'Tipo', className: 'whitespace-nowrap' },
              { key: 'nombre', label: 'Documento', render: d => (
                <div className="min-w-0">
                  <div className="font-semibold">{d.nombre}</div>
                  <div className={`text-3xs ${t.muted}`}>{d.archivo ? `Enlace · ${d.archivo.nombre}` : 'Sin enlace'}</div>
                </div>
              ) },
              { key: 'fechaCarga', label: 'Cargado', render: d => fmtFecha(d.fechaCarga), className: 'whitespace-nowrap' },
              { key: 'fechaVencimiento', label: 'Vence', render: d => fmtFecha(d.fechaVencimiento), className: 'whitespace-nowrap' },
              { key: 'estado', label: 'Estado', render: d => <EstadoPill mapa={ESTADO_DOCUMENTO} valor={d.estado} /> },
              { key: 'accion', label: 'Acción', render: accionesDoc },
            ]} />
          </Card>
        )}

        {pestana === 'vacunacion' && (
          <Card t={t} titulo="Registro de vacunación" icono={Syringe} color={COLOR_RRHH}
            accion={!readOnly && <Boton pequeno icono={FilePlus2} variante="primario" onClick={() => abrir('vacuna')}>Registrar vacuna</Boton>}>
            <Tabla t={t} filas={exp.vacunas} columnas={[
              { key: 'vacuna', label: 'Vacuna', render: v => <span className="font-semibold">{v.vacuna}</span> },
              { key: 'dosis', label: 'Dosis' },
              { key: 'fecha', label: 'Fecha', render: v => fmtFecha(v.fecha) },
              { key: 'lote', label: 'Lote', render: v => <span className="font-mono text-2xs">{v.lote || '—'}</span> },
              { key: 'proximaDosis', label: 'Próxima dosis', render: v => fmtFecha(v.proximaDosis) },
              { key: 'estado', label: 'Estado', render: v => <EstadoPill mapa={ESTADO_VACUNA} valor={v.estado} /> },
              { key: 'soporte', label: 'Soporte', render: v => (v.archivo
                ? <Boton pequeno variante="fantasma" icono={ExternalLink} onClick={() => verDoc(v.archivo)}>Ver</Boton>
                : readOnly ? <span className={`text-2xs ${t.muted}`}>Pendiente</span>
                  : <Boton pequeno icono={Link2} onClick={() => abrir('adjuntar', { ref: { coleccion: 'vacunas', id: v.id }, nombre: `Soporte de vacunación — ${v.vacuna} (${v.dosis})` })}>Agregar URL</Boton>) },
            ]} />
            <div className="mt-4 flex flex-wrap gap-3 text-2xs">
              {Object.entries(ESTADO_VACUNA).map(([k, e]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: e.color }} />{e.label}</span>)}
            </div>
          </Card>
        )}

        {pestana === 'contrato' && exp.contrato && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
            <section className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #7C2D12 0%, #C2410C 55%, #E8603C 100%)' }}>
              <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/10" aria-hidden="true" />
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-3xs uppercase tracking-widest font-semibold text-orange-100">Contrato laboral</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-3xs font-bold uppercase bg-white/15">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: ESTADO_CONTRATO[exp.contrato.estado.clave].color === '#64748B' ? '#CBD5E1' : '#4ADE80' }} />
                    {ESTADO_CONTRATO[exp.contrato.estado.clave].label}
                  </span>
                </div>
                <div className="mt-3 text-xl sm:text-2xl font-bold">{exp.contrato.tipoDescripcion}</div>
                <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div><div className="text-3xs uppercase tracking-wide text-orange-100">Fecha de inicio</div><div className="font-semibold">{fmtFecha(exp.contrato.fechaInicio)}</div></div>
                  <div><div className="text-3xs uppercase tracking-wide text-orange-100">Terminación del periodo</div><div className="font-semibold">{exp.contrato.fechaFin ? fmtFecha(exp.contrato.fechaFin) : 'No aplica'}</div></div>
                  <div><div className="text-3xs uppercase tracking-wide text-orange-100">Renovación</div><div className="font-semibold">Automática cada 3 meses</div></div>
                  <div><div className="text-3xs uppercase tracking-wide text-orange-100">Alarma desde</div><div className="font-semibold">{exp.contrato.estado.alarma ? fmtFecha(exp.contrato.estado.alarma) : '—'}</div></div>
                  <div><div className="text-3xs uppercase tracking-wide text-orange-100">Renovaciones automáticas</div><div className="font-semibold">{exp.contrato.renovaciones || 0}</div></div>
                  <div><div className="text-3xs uppercase tracking-wide text-orange-100">Cargo</div><div className="font-semibold">{exp.contrato.cargo}</div></div>
                  <div><div className="text-3xs uppercase tracking-wide text-orange-100">Área</div><div className="font-semibold">{exp.contrato.area}</div></div>
                  <div><div className="text-3xs uppercase tracking-wide text-orange-100">Jornada</div><div className="font-semibold">{exp.contrato.jornada}</div></div>
                  {exp.contrato.estado.dias != null && exp.contrato.estado.dias >= 0 && (
                    <div><div className="text-3xs uppercase tracking-wide text-orange-100">Días para terminar</div><div className="font-semibold">{exp.contrato.estado.dias}</div></div>
                  )}
                </div>
                {exp.contrato.estado.clave === 'por_vencer' && (
                  <div className="mt-5 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    Alarma: faltan {exp.contrato.estado.dias} días para terminar el periodo. El {fmtFecha(exp.contrato.fechaFin)} se renovará automáticamente por 3 meses más.
                  </div>
                )}
              </div>
            </section>
            <Card t={t} titulo="Documento del contrato" icono={FileSignature} color={COLOR_RRHH}>
              {exp.contrato.documento?.archivo ? (
                <div className={`rounded-xl border p-4 flex items-center gap-3 ${t.border}`}>
                  <FileText size={28} style={{ color: COLOR_RRHH }} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{exp.contrato.documento.archivo.nombre}</div>
                    <div className={`text-3xs ${t.muted}`}>Registrado {fmtFecha(exp.contrato.documento.fechaCarga)} · enlace</div>
                  </div>
                </div>
              ) : <p className="text-xs text-red-500">No se ha cargado el contrato firmado.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {exp.contrato.documento?.archivo && <Boton pequeno icono={ExternalLink} onClick={() => verDoc(exp.contrato.documento.archivo)}>Ver contrato</Boton>}
                {!readOnly && <Boton pequeno icono={RefreshCw} variante="primario" onClick={() => abrir('contrato')}>Actualizar contrato</Boton>}
              </div>
            </Card>
          </div>
        )}

        {pestana === 'hoja' && (
          <div className="space-y-4">
            <Card t={t} titulo="Perfil profesional" icono={UserRound} color={COLOR_RRHH}
              accion={
                <div className="flex flex-wrap gap-1">
                  {docHv?.archivo && <Boton pequeno variante="fantasma" icono={ExternalLink} onClick={() => verDoc(docHv.archivo)}>Ver hoja de vida</Boton>}
                  {!readOnly && <Boton pequeno icono={Pencil} onClick={() => abrir('editar')}>Actualizar información</Boton>}
                </div>
              }>
              <p className="text-sm leading-relaxed">{c.perfil}</p>
            </Card>
            <Card t={t} titulo="Dotación" icono={Shirt} color={COLOR_RRHH}
              accion={!readOnly && <Boton pequeno icono={Pencil} onClick={() => abrir('dotacion')}>{c.dotacion ? 'Actualizar dotación' : 'Registrar dotación'}</Boton>}>
              {c.dotacion?.recibio ? (
                <div className={`rounded-xl border p-4 flex flex-wrap items-center gap-3 ${t.border}`}>
                  <CheckCircle2 size={24} className="shrink-0 text-green-600" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">Recibió dotación</div>
                    <div className={`text-3xs ${t.muted}`}>Entregada {fmtFecha(c.dotacion.fecha)} · soporte por enlace</div>
                  </div>
                  {c.dotacion.archivo && <Boton pequeno variante="fantasma" icono={ExternalLink} onClick={() => verDoc(c.dotacion.archivo)}>Ver acta de entrega</Boton>}
                </div>
              ) : c.dotacion ? (
                <div className={`rounded-xl border p-4 flex items-center gap-3 ${t.border}`}>
                  <AlertCircle size={24} className="shrink-0 text-red-500" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">No recibió dotación</div>
                    <div className={`text-3xs ${t.muted}`}>Registrado {fmtFecha(c.dotacion.fecha)}</div>
                  </div>
                </div>
              ) : <p className={`text-xs ${t.muted}`}>Aún no se ha registrado si el colaborador recibió dotación.</p>}
            </Card>
            <Card t={t} titulo="Experiencia laboral" icono={Briefcase} color={COLOR_RRHH}>
              <Tabla t={t} filas={experienciaActual} vacio="Sin experiencia actual registrada." columnas={[
                { key: 'empresa', label: 'Empresa', render: x => <span className="font-semibold">{x.empresa}</span> },
                { key: 'cargo', label: 'Cargo' },
                { key: 'inicio', label: 'Inicio' },
                { key: 'fin', label: 'Fin', render: () => <Pill color="#16A34A">Actualidad</Pill> },
                { key: 'tiempo', label: 'Tiempo', render: x => tiempoTranscurrido(x.inicio, x.fin) },
              ]} />
            </Card>
            <Card t={t} titulo="Experiencia anterior" icono={History} color={COLOR_RRHH}>
              <Tabla t={t} filas={experienciaAnterior} vacio="Sin experiencia anterior registrada." columnas={[
                { key: 'empresa', label: 'Empresa', render: x => <span className="font-semibold">{x.empresa}</span> },
                { key: 'cargo', label: 'Cargo' },
                { key: 'inicio', label: 'Inicio' },
                { key: 'fin', label: 'Fin' },
                { key: 'tiempo', label: 'Tiempo', render: x => tiempoTranscurrido(x.inicio, x.fin) },
              ]} />
            </Card>
          </div>
        )}

        {pestana === 'historial' && (
          <Card t={t} titulo="Historial del colaborador" icono={History} color={COLOR_RRHH}>
            <ol className="relative ml-2">
              {exp.historial.map((h, i) => (
                <li key={h.id} className="relative pl-8 pb-6 last:pb-0">
                  {i < exp.historial.length - 1 && <span className={`absolute left-[7px] top-4 bottom-0 w-px ${t.border} border-l`} aria-hidden="true" />}
                  <span className="absolute left-0 top-1 w-4 h-4 rounded-full border-4" style={{ borderColor: COLOR_RRHH + '55', background: COLOR_RRHH }} aria-hidden="true" />
                  <div className="text-3xs uppercase tracking-widest font-bold" style={{ color: COLOR_RRHH }}>{h.fecha.slice(0, 4)} · {fmtFecha(h.fecha)}</div>
                  <div className="text-sm font-bold mt-0.5">{h.titulo}</div>
                  <div className={`text-xs mt-0.5 ${t.muted}`}>{h.detalle}</div>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>

      {formulario && <FormularioModal t={t} {...formulario} onClose={() => setFormulario(null)} />}

    </div>
  );
}
