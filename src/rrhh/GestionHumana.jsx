// src/rrhh/GestionHumana.jsx
// Módulo GESTIÓN HUMANA (RRHH) de la Plataforma Integral de Gestión — versión de
// DEMOSTRACIÓN: los datos son ficticios (mockData.js) y los cambios viven solo en la
// sesión del navegador. Toda la lectura/escritura pasa por rrhhService.js, que es lo único
// que cambia al conectar la base de datos real.
//
// Se monta dentro de MainApp (misma autenticación, encabezado, menú, tema y empresa activa);
// no es una aplicación aparte.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, FolderOpen, FileWarning, FileSignature, AlertCircle, LayoutDashboard,
  Search, ChevronRight, Eye, Sparkles, ArrowRight, Filter, UserPlus, Trash2, Building2,
  GraduationCap, BriefcaseBusiness, ExternalLink, Link2, RefreshCw, Plus,
} from 'lucide-react';
import * as rrhh from './rrhhService';
import Expediente from './Expediente';
import {
  COLOR_RRHH, COLOR_RRHH_CLARO, ESTADO_COLABORADOR, ESTADO_DOCUMENTACION, ESTADO_DOCUMENTO,
  AREAS_RRHH, TIPOS_CONTRATO, fmtFecha, abrirEnlace,
} from './formato';
import { Aviso, Avatar, Boton, Card, EstadoPill, FormularioModal, Modal, Pill, Progreso, Tabla } from './ui';

// Solo Inicio y Colaboradores: desde cada colaborador se abre su expediente, que ya reúne
// documentación, estudios, vacunación y contrato, así que no hacen falta vistas aparte.
const SECCIONES = [
  { key: 'inicio', label: 'Inicio', icon: LayoutDashboard },
  { key: 'colaboradores', label: 'Colaboradores', icon: Users },
  { key: 'capacitaciones', label: 'Capacitaciones de inducción y reinducción', icon: GraduationCap },
  { key: 'funciones', label: 'Funciones del cargo', icon: BriefcaseBusiness },
];

// Carga asíncrona simple con recarga manual (misma forma que tendrá con la API).
function useDatos(cargar, deps) {
  const [datos, setDatos] = useState(null);
  useEffect(() => {
    let vivo = true;
    cargar().then(d => { if (vivo) setDatos(d); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return datos;
}

function Kpi({ t, label, valor, sub, color, icono: Icono, onClick }) {
  return (
    <button onClick={onClick} className={`text-left rounded-2xl border p-4 relative overflow-hidden transition hover:shadow-lg hover:-translate-y-0.5 ${t.panel} ${t.border}`}>
      <div className="absolute top-0 left-0 w-full h-[3px]" style={{ background: color }} />
      <div className="flex items-start justify-between gap-2">
        <div className={`text-3xs uppercase tracking-wide font-semibold ${t.muted}`}>{label}</div>
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '1A', color }}><Icono size={16} /></span>
      </div>
      <div className="text-3xl font-bold font-mono mt-1" style={{ color }}>{valor}</div>
      <div className={`text-2xs mt-1 ${t.muted}`}>{sub}</div>
    </button>
  );
}

function Selector({ t, value, onChange, opciones, etiqueta }) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">{etiqueta}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className={`w-full rounded-lg border px-3 min-h-10 text-xs ${t.input}`}>
        <option value="">{etiqueta}: todos</option>
        {opciones.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Buscador({ t, value, onChange, placeholder }) {
  return (
    <label className={`flex items-center gap-2 rounded-lg border px-3 min-h-10 ${t.input}`}>
      <Search size={15} className={t.muted} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="flex-1 bg-transparent outline-none text-xs min-w-0" />
    </label>
  );
}

/* ---------------------------------------------------------------- */
/* INICIO — tablero de Gestión Humana                                */
/* ---------------------------------------------------------------- */
function InicioRRHH({ t, ir, abrirExpediente, empresa }) {
  const resumen = useDatos(() => rrhh.obtenerResumen(empresa), [empresa]);
  if (!resumen) return <div className={`py-20 text-center text-sm ${t.muted}`}>Cargando indicadores…</div>;
  const { indicadores: k, muestra } = resumen;
  const maxArea = Math.max(...muestra.porArea.map(([, n]) => n), 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi t={t} label="Colaboradores activos" valor={k.colaboradoresActivos} sub="De la empresa seleccionada" color={COLOR_RRHH} icono={Users} onClick={() => ir('colaboradores')} />
        <Kpi t={t} label="Documentos registrados" valor={k.documentosRegistrados} sub="En expedientes digitales" color="#0D9488" icono={FolderOpen} onClick={() => ir('colaboradores')} />
        <Kpi t={t} label="Próximos a vencer" valor={k.documentosPorVencer} sub="En los próximos 60 días" color="#D97706" icono={FileWarning} onClick={() => ir('colaboradores', { documentacion: 'Por vencer' })} />
        <Kpi t={t} label="Contratos activos" valor={k.contratosActivos} sub="Vigentes a la fecha" color="#2563EB" icono={FileSignature} onClick={() => ir('colaboradores')} />
        <Kpi t={t} label="Documentación pendiente" valor={k.documentacionPendiente} sub="Colaboradores con pendientes" color="#DC2626" icono={AlertCircle} onClick={() => ir('colaboradores', { documentacion: 'Con pendientes' })} />
      </div>

      <section className="rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #431407 0%, #9A3412 50%, #E8603C 100%)' }}>
        <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-white/10" aria-hidden="true" />
        <div className="relative grid lg:grid-cols-[1fr_auto] gap-5 items-center">
          <div>
            <div className="text-3xs uppercase tracking-widest font-semibold text-orange-200 flex items-center gap-1.5"><Sparkles size={12} /> Expediente digital</div>
            <h2 className="mt-2 text-lg sm:text-xl font-bold">De carpetas y documentos dispersos a expedientes digitales centralizados</h2>
            <p className="mt-2 text-xs sm:text-sm text-orange-50 max-w-3xl">
              Hojas de vida, títulos, actas de grado, certificados, vacunas y contratos de cada colaborador en un solo lugar,
              con alertas de vencimiento, completitud del expediente y trazabilidad de cada cambio.
            </p>
          </div>
          <button onClick={() => ir('colaboradores')} className="inline-flex items-center gap-2 rounded-lg px-5 min-h-11 text-sm font-semibold bg-white text-orange-900 hover:bg-orange-50 transition justify-self-start">
            Ver colaboradores <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card t={t} titulo="Expedientes que requieren atención" icono={AlertCircle} color="#DC2626" className="lg:col-span-2">
          <ul className={`divide-y ${t.border}`}>
            {muestra.menorCompletitud.map(c => (
              <li key={c.id}>
                <button onClick={() => abrirExpediente(c.id)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-slate-500/5 rounded-lg px-1">
                  <Avatar nombre={c.nombreCompleto} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold truncate">{c.nombreCompleto}</span>
                    <span className={`block text-3xs truncate ${t.muted}`}>{c.cargo} · {c.area}</span>
                  </span>
                  <span className="w-28 sm:w-40 shrink-0">
                    <span className="flex justify-between text-3xs font-semibold"><span className={t.muted}>Completitud</span><span>{c.completitud.porcentaje}%</span></span>
                    <Progreso valor={c.completitud.porcentaje} alto={6} />
                  </span>
                  <ChevronRight size={16} className={t.muted} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card t={t} titulo="Completitud promedio" icono={FolderOpen} color={COLOR_RRHH}>
          <div className="text-5xl font-bold font-mono" style={{ color: COLOR_RRHH }}>{muestra.completitudPromedio}%</div>
          <div className="mt-3"><Progreso valor={muestra.completitudPromedio} color={COLOR_RRHH} alto={10} /></div>
          <p className={`mt-3 text-2xs ${t.muted}`}>Promedio de los {muestra.total} expedientes de la muestra.</p>
        </Card>
        <Card t={t} titulo="Próximos vencimientos" icono={FileWarning} color="#D97706" className="lg:col-span-2">
          <Tabla t={t} filas={muestra.vencimientos} onFila={v => abrirExpediente(v.colaboradorId)} vacio="Sin vencimientos próximos." columnas={[
            { key: 'colaborador', label: 'Colaborador', render: v => <span className="font-semibold">{v.colaborador}</span> },
            { key: 'documento', label: 'Documento' },
            { key: 'fecha', label: 'Vence', render: v => fmtFecha(v.fecha), className: 'whitespace-nowrap' },
            { key: 'estado', label: 'Estado', render: v => <EstadoPill mapa={ESTADO_DOCUMENTO} valor={v.estado} /> },
          ]} />
        </Card>
        <Card t={t} titulo="Colaboradores por área" icono={Users} color={COLOR_RRHH}>
          <ul className="space-y-2.5">
            {muestra.porArea.map(([area, n]) => (
              <li key={area}>
                <div className="flex justify-between text-2xs"><span className="font-semibold">{area}</span><span className={t.muted}>{n}</span></div>
                <div className="mt-1 h-2 rounded-full bg-slate-500/15 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(n / maxArea) * 100}%`, background: COLOR_RRHH }} /></div>
              </li>
            ))}
          </ul>
          <p className={`mt-3 text-3xs ${t.muted}`}>Muestra de expedientes de demostración.</p>
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* COLABORADORES — listado con búsqueda y filtros                   */
/* ---------------------------------------------------------------- */
function Colaboradores({ t, abrirExpediente, filtroInicial, empresa, empresas, readOnly, usuario, notificar }) {
  const [version, setVersion] = useState(0);
  const lista = useDatos(() => rrhh.listarColaboradores(empresa), [empresa, version]);
  const [formAlta, setFormAlta] = useState(false);
  const [aEliminar, setAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const nombreEmpresa = (key) => empresas.find(e => e.key === key)?.nombre || key || '—';
  const colorEmpresa = (key) => empresas.find(e => e.key === key)?.color || '#64748B';
  const verTodas = !empresa || empresa === 'TODAS';

  const crear = async (v) => {
    const empresaKey = empresas.find(e => e.nombre === v.empresa)?.key || empresa;
    await rrhh.crearColaborador({ ...v, empresa: empresaKey }, usuario);
    setVersion(x => x + 1);
    notificar(`${v.nombres.trim()} ${v.apellidos.trim()} fue agregado a ${nombreEmpresa(empresaKey)}.`);
  };
  const confirmarEliminar = async () => {
    setEliminando(true);
    try {
      await rrhh.eliminarColaborador(aEliminar.id);
      notificar(`${aEliminar.nombreCompleto} fue eliminado.`);
      setAEliminar(null);
      setVersion(x => x + 1);
    } finally { setEliminando(false); }
  };
  const [texto, setTexto] = useState('');
  const [filtros, setFiltros] = useState({ area: '', estado: '', contrato: '', documentacion: '', ...filtroInicial });
  const set = (k) => (v) => setFiltros(f => ({ ...f, [k]: v }));

  const filtrados = useMemo(() => {
    if (!lista) return [];
    const q = texto.trim().toLowerCase();
    return lista.filter(c =>
      (!q || [c.nombreCompleto, c.documento, c.cargo, c.area].join(' ').toLowerCase().includes(q))
      && (!filtros.area || c.area === filtros.area)
      && (!filtros.estado || c.estado === filtros.estado)
      && (!filtros.contrato || c.tipoContrato === filtros.contrato)
      && (!filtros.documentacion || c.documentacion === filtros.documentacion));
  }, [lista, texto, filtros]);

  const hayFiltros = texto || Object.values(filtros).some(Boolean);
  return (
    <Card t={t}>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <h2 className="text-base font-bold">Colaboradores</h2>
          <p className={`text-2xs mt-0.5 ${t.muted}`}>
            {lista ? `${verTodas ? 'Todas las empresas' : nombreEmpresa(empresa)} · mostrando ${filtrados.length} de ${lista.length} colaborador${lista.length !== 1 ? 'es' : ''}` : 'Cargando…'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hayFiltros && <Boton pequeno variante="fantasma" icono={Filter} onClick={() => { setTexto(''); setFiltros({ area: '', estado: '', contrato: '', documentacion: '' }); }}>Limpiar filtros</Boton>}
          {!readOnly && <Boton variante="primario" color={COLOR_RRHH} icono={UserPlus} onClick={() => setFormAlta(true)}>Agregar colaborador</Boton>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 mb-4">
        <Buscador t={t} value={texto} onChange={setTexto} placeholder="Buscar colaborador..." />
        <Selector t={t} etiqueta="Área" value={filtros.area} onChange={set('area')} opciones={AREAS_RRHH} />
        <Selector t={t} etiqueta="Estado" value={filtros.estado} onChange={set('estado')} opciones={Object.keys(ESTADO_COLABORADOR)} />
        <Selector t={t} etiqueta="Contrato" value={filtros.contrato} onChange={set('contrato')} opciones={TIPOS_CONTRATO} />
        <Selector t={t} etiqueta="Documentación" value={filtros.documentacion} onChange={set('documentacion')} opciones={Object.keys(ESTADO_DOCUMENTACION)} />
      </div>
      <Tabla t={t} filas={filtrados} onFila={c => abrirExpediente(c.id)}
        vacio={lista && lista.length === 0 ? 'Esta empresa todavía no tiene colaboradores registrados.' : 'Ningún colaborador coincide con la búsqueda.'} columnas={[
        { key: 'foto', label: 'Foto', render: c => <Avatar nombre={c.nombreCompleto} size={34} /> },
        { key: 'nombreCompleto', label: 'Nombre completo', render: c => <span className="font-semibold">{c.nombreCompleto}</span> },
        { key: 'documento', label: 'Documento', render: c => <span className="font-mono text-2xs whitespace-nowrap">{c.documento}</span> },
        ...(verTodas ? [{ key: 'empresa', label: 'Empresa', render: c => <Pill color={colorEmpresa(c.empresa)}>{nombreEmpresa(c.empresa)}</Pill> }] : []),
        { key: 'cargo', label: 'Cargo' },
        { key: 'area', label: 'Área' },
        { key: 'tipoContrato', label: 'Tipo de contrato' },
        { key: 'estado', label: 'Estado', render: c => <EstadoPill mapa={ESTADO_COLABORADOR} valor={c.estado} /> },
        { key: 'documentacion', label: 'Documentación', render: c => (
          <div className="min-w-[120px]">
            <div className="flex items-center justify-between gap-2 mb-1"><EstadoPill mapa={ESTADO_DOCUMENTACION} valor={c.documentacion} /><span className="text-2xs font-bold">{c.completitud.porcentaje}%</span></div>
            <Progreso valor={c.completitud.porcentaje} alto={5} />
          </div>
        ) },
        { key: 'accion', label: 'Acción', render: c => (
          <div className="flex items-center gap-1.5">
            <Boton pequeno icono={Eye} onClick={(e) => { e.stopPropagation(); abrirExpediente(c.id); }}>Ver expediente</Boton>
            {!readOnly && (
              <button type="button" title={`Eliminar a ${c.nombreCompleto}`} aria-label={`Eliminar a ${c.nombreCompleto}`}
                onClick={(e) => { e.stopPropagation(); setAEliminar(c); }}
                className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 transition">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ) },
      ]} />

      {formAlta && (
        <FormularioModal t={t} color={COLOR_RRHH} titulo="Agregar colaborador"
          subtitulo="Se crea su expediente con los documentos requeridos pendientes."
          inicial={{ empresa: verTodas ? '' : nombreEmpresa(empresa), tipoDocumento: 'CC', fechaIngreso: new Date().toISOString().slice(0, 10) }}
          campos={[
            { name: 'nombres', label: 'Nombres', required: true },
            { name: 'apellidos', label: 'Apellidos', required: true },
            { name: 'tipoDocumento', label: 'Tipo de documento', type: 'select', options: ['CC', 'CE', 'PA', 'TI'], required: true },
            { name: 'documento', label: 'Número de documento', required: true },
            { name: 'empresa', label: 'Empresa', type: 'select', options: empresas.map(e => e.nombre), required: true, full: true },
            { name: 'cargo', label: 'Cargo', required: true },
            { name: 'area', label: 'Área', type: 'select', options: AREAS_RRHH, required: true },
            { name: 'tipoContrato', label: 'Tipo de contrato', type: 'select', options: TIPOS_CONTRATO, required: true },
            { name: 'fechaIngreso', label: 'Fecha de ingreso', type: 'date', required: true },
            { name: 'genero', label: 'Género', type: 'select', options: ['Femenino', 'Masculino'] },
            { name: 'correo', label: 'Correo electrónico', type: 'email' },
            { name: 'telefono', label: 'Teléfono' },
            { name: 'ciudad', label: 'Ciudad' },
          ]}
          nota="Demostración: el colaborador se conserva solo en esta sesión del navegador."
          textoGuardar="Agregar colaborador" onGuardar={crear} onClose={() => setFormAlta(false)} />
      )}

      {aEliminar && (
        <Modal t={t} titulo="Eliminar colaborador" subtitulo={aEliminar.nombreCompleto} onClose={() => !eliminando && setAEliminar(null)} pie={
          <>
            <Boton onClick={() => setAEliminar(null)} color="#64748B" disabled={eliminando}>Cancelar</Boton>
            <Boton variante="primario" color="#DC2626" icono={Trash2} disabled={eliminando} onClick={confirmarEliminar}>
              {eliminando ? 'Eliminando…' : 'Eliminar'}
            </Boton>
          </>
        }>
          <p className="text-sm">
            ¿Eliminar a <strong>{aEliminar.nombreCompleto}</strong> ({nombreEmpresa(aEliminar.empresa)})? Se borrará su expediente completo: documentos, estudios, vacunación y contrato.
          </p>
        </Modal>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* CAPACITACIONES DE INGRESO Y REINDUCCIÓN                           */
/* ---------------------------------------------------------------- */
function CapacitacionesIngreso({ t }) {
  return (
    <Card t={t}>
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: COLOR_RRHH + '1A', color: COLOR_RRHH }}><GraduationCap size={20} /></span>
        <div>
          <h2 className="text-base font-bold">Capacitaciones de inducción y reinducción</h2>
          <p className={`text-xs mt-1 max-w-3xl ${t.muted}`}>
            Material para la inducción de quien ingresa a la organización y para la reinducción periódica del personal.
          </p>
        </div>
      </div>
      <div className={`mt-5 rounded-xl border border-dashed px-4 py-8 text-center text-xs ${t.border} ${t.muted}`}>
        Todavía no hay capacitaciones registradas en esta sección.
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* FUNCIONES DEL CARGO                                               */
/* ---------------------------------------------------------------- */
// Un documento (enlace al PDF, igual que en el expediente) por cargo: Director, Coordinador,
// Analista, Auxiliar…
function FuncionesCargo({ t, readOnly, notificar }) {
  const [version, setVersion] = useState(0);
  const cargos = useDatos(rrhh.listarFuncionesCargo, [version]);
  const [formulario, setFormulario] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const recargar = () => setVersion(v => v + 1);

  const editarDocumento = (x) => setFormulario({
    titulo: x.archivo ? 'Cambiar documento de funciones' : 'Agregar documento de funciones', subtitulo: `Cargo: ${x.cargo}`,
    campos: [{ name: 'url', label: 'URL del documento de funciones (PDF)', type: 'url', required: true }],
    inicial: { url: x.archivo?.url?.startsWith('/') ? '' : (x.archivo?.url || '') },
    textoGuardar: 'Guardar documento',
    onGuardar: async (v) => { await rrhh.guardarDocumentoCargo(x.id, v.url); recargar(); notificar(`Documento de funciones de ${x.cargo} guardado.`); },
  });
  const nuevoCargo = () => setFormulario({
    titulo: 'Agregar cargo', subtitulo: 'Funciones del cargo',
    campos: [
      { name: 'cargo', label: 'Cargo', required: true, placeholder: 'Ej.: Jefe de área', full: true },
      { name: 'url', label: 'URL del documento de funciones (PDF)', type: 'url' },
    ],
    textoGuardar: 'Agregar cargo',
    onGuardar: async (v) => { await rrhh.agregarCargo(v.cargo, v.url); recargar(); notificar(`Cargo ${v.cargo.trim()} agregado.`); },
  });

  return (
    <div className="space-y-4">
      <Card t={t} titulo="Funciones del cargo" icono={BriefcaseBusiness} color={COLOR_RRHH}
        accion={!readOnly && <Boton pequeno icono={Plus} onClick={nuevoCargo}>Agregar cargo</Boton>}>
        <p className={`text-2xs mb-4 ${t.muted}`}>Un documento por cargo. Súbelo en PDF a Drive, OneDrive o SharePoint y pega el enlace; al dar clic en “Ver” se abre en una pestaña nueva.</p>
        {!cargos ? <div className={`py-10 text-center text-xs ${t.muted}`}>Cargando…</div> : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {cargos.map(x => (
              <li key={x.id} className={`rounded-xl border p-4 flex flex-col ${t.border}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: COLOR_RRHH + '1A', color: COLOR_RRHH }}><BriefcaseBusiness size={18} /></span>
                  {x.archivo ? <Pill color="#16A34A">Documento cargado</Pill> : <Pill color="#DC2626">Pendiente</Pill>}
                </div>
                <h3 className="mt-3 text-sm font-bold">{x.cargo}</h3>
                <p className={`text-3xs mt-0.5 ${t.muted}`}>{x.archivo ? `Enlace · ${x.archivo.nombre} · ${fmtFecha(x.archivo.fechaCarga)}` : 'Sin documento de funciones'}</p>
                <div className="mt-auto pt-4 flex flex-wrap items-center gap-1.5">
                  {x.archivo && <Boton pequeno variante="fantasma" icono={ExternalLink} onClick={() => abrirEnlace(x.archivo.url)}>Ver</Boton>}
                  {!readOnly && (
                    <Boton pequeno variante={x.archivo ? 'fantasma' : 'secundario'} icono={x.archivo ? RefreshCw : Link2} onClick={() => editarDocumento(x)}>
                      {x.archivo ? 'Cambiar URL' : 'Agregar URL'}
                    </Boton>
                  )}
                  {!readOnly && (
                    <button type="button" title={`Eliminar el cargo ${x.cargo}`} aria-label={`Eliminar el cargo ${x.cargo}`} onClick={() => setAEliminar(x)}
                      className="ml-auto w-8 h-8 inline-flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 transition">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {formulario && <FormularioModal t={t} color={COLOR_RRHH} nota="Demostración: los cambios se conservan solo en esta sesión del navegador." {...formulario} onClose={() => setFormulario(null)} />}
      {aEliminar && (
        <Modal t={t} titulo="Eliminar cargo" subtitulo={aEliminar.cargo} onClose={() => setAEliminar(null)} pie={
          <>
            <Boton onClick={() => setAEliminar(null)} color="#64748B">Cancelar</Boton>
            <Boton variante="primario" color="#DC2626" icono={Trash2}
              onClick={async () => { await rrhh.eliminarCargo(aEliminar.id); notificar(`Cargo ${aEliminar.cargo} eliminado.`); setAEliminar(null); recargar(); }}>Eliminar</Boton>
          </>
        }>
          <p className="text-sm">¿Eliminar el cargo <strong>{aEliminar.cargo}</strong> y su documento de funciones?</p>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* MÓDULO                                                           */
/* ---------------------------------------------------------------- */
// `seccion` / `onSeccion` / `navegacion`: el menú lateral de la plataforma maneja la sección
// (Inicio, Colaboradores); cada clic en el menú incrementa `navegacion` y cierra el expediente
// abierto. Sin esas props el módulo maneja su sección por sí solo.
export default function GestionHumana({ t, user, readOnly, empresaLabel, empresa = 'TODAS', empresas = [], onCambiarEmpresa, seccion: seccionControlada, onSeccion, navegacion = 0 }) {
  const [seccionLocal, setSeccionLocal] = useState('inicio');
  const seccion = seccionControlada ?? seccionLocal;
  const setSeccion = onSeccion ?? setSeccionLocal;
  const [filtroInicial, setFiltroInicial] = useState(null);
  const [colaboradorId, setColaboradorId] = useState(null);
  const [aviso, setAviso] = useState('');
  const cerrarAviso = useCallback(() => setAviso(''), []);

  // Al cambiar de empresa en el encabezado se cierra el expediente abierto (puede ser de otra empresa).
  const [empresaVista, setEmpresaVista] = useState(empresa);
  if (empresaVista !== empresa) { setEmpresaVista(empresa); setColaboradorId(null); }
  const [navegacionVista, setNavegacionVista] = useState(navegacion);
  if (navegacionVista !== navegacion) { setNavegacionVista(navegacion); setColaboradorId(null); setFiltroInicial(null); }

  const ir = (key, filtro = null) => { setSeccion(key); setFiltroInicial(filtro); setColaboradorId(null); };
  const abrirExpediente = (id) => { setColaboradorId(id); };
  const usuario = user?.nombre || user?.email || 'usuario';

  return (
    <div className="max-w-7xl mx-auto pb-10">
      {/* ENCABEZADO DEL MÓDULO */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${COLOR_RRHH} 0%, ${COLOR_RRHH_CLARO} 100%)` }}>
            <Users size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Gestión Humana</h1>
              <Pill color="#D97706">Demo · datos ficticios</Pill>
            </div>
            <p className={`text-xs sm:text-sm mt-1 ${t.muted}`}>
              {colaboradorId ? 'Gestión integral de la información y documentación de los colaboradores.' : 'Administra y consulta la información integral de los colaboradores de la organización.'}
            </p>
          </div>
        </div>
      </div>

      {/* EMPRESAS — mismo selector que Biomédica: el SUPER_ADMIN filtra por empresa; un
          usuario de empresa ve únicamente la suya. */}
      <div className="flex gap-2 flex-wrap mb-4" role="group" aria-label="Empresa">
        {onCambiarEmpresa ? (
          <>
            <button type="button" onClick={() => onCambiarEmpresa('TODAS')} aria-pressed={empresa === 'TODAS'}
              className={`px-3 min-h-10 flex items-center rounded-full text-2xs font-mono border transition ${empresa === 'TODAS' ? 'font-semibold' : t.border}`}
              style={empresa === 'TODAS' ? { background: COLOR_RRHH + '1A', borderColor: COLOR_RRHH, color: COLOR_RRHH } : {}}>
              Todas las empresas
            </button>
            {empresas.map(e => (
              <button type="button" key={e.key} onClick={() => onCambiarEmpresa(e.key)} aria-pressed={empresa === e.key}
                className={`px-3 min-h-10 flex items-center rounded-full text-2xs font-mono border transition ${empresa === e.key ? 'text-white font-semibold' : t.border}`}
                style={empresa === e.key ? { background: e.gradient || e.color, borderColor: e.color } : {}}>
                {e.nombre}
              </button>
            ))}
          </>
        ) : (
          <span className="px-3 min-h-10 flex items-center gap-1.5 rounded-full text-2xs font-mono border text-white font-semibold"
            style={{ background: empresas.find(e => e.key === empresa)?.gradient || COLOR_RRHH }}>
            <Building2 size={12} /> {empresaLabel}
          </span>
        )}
      </div>

      {/* NAVEGACIÓN INTERNA */}
      <nav className={`flex gap-1 overflow-x-auto rounded-xl border p-1 mb-5 ${t.panel} ${t.border}`} aria-label="Secciones de Gestión Humana">
        {SECCIONES.map(s => {
          const activa = seccion === s.key && !colaboradorId;
          const Icon = s.icon;
          return (
            <button key={s.key} onClick={() => ir(s.key)} aria-current={activa ? 'page' : undefined}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 min-h-9 rounded-lg text-xs font-semibold transition ${activa ? 'text-white shadow-sm' : `${t.muted} hover:bg-slate-500/10`}`}
              style={activa ? { background: COLOR_RRHH } : {}}>
              <Icon size={14} /> {s.label}
            </button>
          );
        })}
      </nav>

      {colaboradorId ? (
        <Expediente key={colaboradorId} t={t} colaboradorId={colaboradorId} readOnly={readOnly} usuario={usuario}
          empresaLabel={empresaLabel} empresas={empresas} onVolver={() => setColaboradorId(null)} notificar={setAviso} />
      ) : (
        <>
          {seccion === 'inicio' && <InicioRRHH t={t} ir={ir} abrirExpediente={abrirExpediente} empresa={empresa} />}
          {seccion === 'colaboradores' && (
            <Colaboradores key={JSON.stringify(filtroInicial)} t={t} abrirExpediente={abrirExpediente} filtroInicial={filtroInicial}
              empresa={empresa} empresas={empresas} readOnly={readOnly} usuario={usuario} notificar={setAviso} />
          )}
          {seccion === 'capacitaciones' && <CapacitacionesIngreso t={t} />}
          {seccion === 'funciones' && <FuncionesCargo t={t} readOnly={readOnly} notificar={setAviso} />}
        </>
      )}

      <Aviso mensaje={aviso} onCerrar={cerrarAviso} />
    </div>
  );
}
