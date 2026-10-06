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
  Search, ChevronRight, Eye, Sparkles, ArrowRight, Filter,
} from 'lucide-react';
import * as rrhh from './rrhhService';
import Expediente from './Expediente';
import {
  COLOR_RRHH, ESTADO_COLABORADOR, ESTADO_DOCUMENTACION, ESTADO_DOCUMENTO,
  AREAS_RRHH, TIPOS_CONTRATO, fmtFecha,
} from './formato';
import { Aviso, Avatar, Boton, Card, EstadoPill, Pill, Progreso, Tabla } from './ui';

// Solo Inicio y Colaboradores: desde cada colaborador se abre su expediente, que ya reúne
// documentación, estudios, vacunación y contrato, así que no hacen falta vistas aparte.
const SECCIONES = [
  { key: 'inicio', label: 'Inicio', icon: LayoutDashboard },
  { key: 'colaboradores', label: 'Colaboradores', icon: Users },
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
function InicioRRHH({ t, ir, abrirExpediente }) {
  const resumen = useDatos(rrhh.obtenerResumen, []);
  if (!resumen) return <div className={`py-20 text-center text-sm ${t.muted}`}>Cargando indicadores…</div>;
  const { indicadores: k, muestra } = resumen;
  const maxArea = Math.max(...muestra.porArea.map(([, n]) => n), 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi t={t} label="Colaboradores activos" valor={k.colaboradoresActivos} sub="En los expedientes de la demo" color={COLOR_RRHH} icono={Users} onClick={() => ir('colaboradores')} />
        <Kpi t={t} label="Documentos registrados" valor={k.documentosRegistrados} sub="En expedientes digitales" color="#0D9488" icono={FolderOpen} onClick={() => ir('colaboradores')} />
        <Kpi t={t} label="Próximos a vencer" valor={k.documentosPorVencer} sub="En los próximos 60 días" color="#D97706" icono={FileWarning} onClick={() => ir('colaboradores', { documentacion: 'Por vencer' })} />
        <Kpi t={t} label="Contratos activos" valor={k.contratosActivos} sub="Vigentes a la fecha" color="#2563EB" icono={FileSignature} onClick={() => ir('colaboradores')} />
        <Kpi t={t} label="Documentación pendiente" valor={k.documentacionPendiente} sub="Colaboradores con pendientes" color="#DC2626" icono={AlertCircle} onClick={() => ir('colaboradores', { documentacion: 'Con pendientes' })} />
      </div>

      <section className="rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4F46E5 100%)' }}>
        <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-white/10" aria-hidden="true" />
        <div className="relative grid lg:grid-cols-[1fr_auto] gap-5 items-center">
          <div>
            <div className="text-3xs uppercase tracking-widest font-semibold text-indigo-200 flex items-center gap-1.5"><Sparkles size={12} /> Expediente digital</div>
            <h2 className="mt-2 text-lg sm:text-xl font-bold">De carpetas y documentos dispersos a expedientes digitales centralizados</h2>
            <p className="mt-2 text-xs sm:text-sm text-indigo-100 max-w-3xl">
              Hojas de vida, títulos, actas de grado, certificados, vacunas y contratos de cada colaborador en un solo lugar,
              con alertas de vencimiento, completitud del expediente y trazabilidad de cada cambio.
            </p>
          </div>
          <button onClick={() => ir('colaboradores')} className="inline-flex items-center gap-2 rounded-lg px-5 min-h-11 text-sm font-semibold bg-white text-indigo-900 hover:bg-indigo-50 transition justify-self-start">
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
function Colaboradores({ t, abrirExpediente, filtroInicial }) {
  const lista = useDatos(rrhh.listarColaboradores, []);
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
          <p className={`text-2xs mt-0.5 ${t.muted}`}>{lista ? `Mostrando ${filtrados.length} de ${lista.length} expedientes (muestra de demostración)` : 'Cargando…'}</p>
        </div>
        {hayFiltros && <Boton pequeno variante="fantasma" icono={Filter} onClick={() => { setTexto(''); setFiltros({ area: '', estado: '', contrato: '', documentacion: '' }); }}>Limpiar filtros</Boton>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 mb-4">
        <Buscador t={t} value={texto} onChange={setTexto} placeholder="Buscar colaborador..." />
        <Selector t={t} etiqueta="Área" value={filtros.area} onChange={set('area')} opciones={AREAS_RRHH} />
        <Selector t={t} etiqueta="Estado" value={filtros.estado} onChange={set('estado')} opciones={Object.keys(ESTADO_COLABORADOR)} />
        <Selector t={t} etiqueta="Contrato" value={filtros.contrato} onChange={set('contrato')} opciones={TIPOS_CONTRATO} />
        <Selector t={t} etiqueta="Documentación" value={filtros.documentacion} onChange={set('documentacion')} opciones={Object.keys(ESTADO_DOCUMENTACION)} />
      </div>
      <Tabla t={t} filas={filtrados} onFila={c => abrirExpediente(c.id)} vacio="Ningún colaborador coincide con la búsqueda." columnas={[
        { key: 'foto', label: 'Foto', render: c => <Avatar nombre={c.nombreCompleto} size={34} /> },
        { key: 'nombreCompleto', label: 'Nombre completo', render: c => <span className="font-semibold">{c.nombreCompleto}</span> },
        { key: 'documento', label: 'Documento', render: c => <span className="font-mono text-2xs whitespace-nowrap">{c.documento}</span> },
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
          <Boton pequeno icono={Eye} onClick={(e) => { e.stopPropagation(); abrirExpediente(c.id); }}>Ver expediente</Boton>
        ) },
      ]} />
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/* MÓDULO                                                           */
/* ---------------------------------------------------------------- */
export default function GestionHumana({ t, user, readOnly, empresaLabel }) {
  const [seccion, setSeccion] = useState('inicio');
  const [filtroInicial, setFiltroInicial] = useState(null);
  const [colaboradorId, setColaboradorId] = useState(null);
  const [aviso, setAviso] = useState('');
  const cerrarAviso = useCallback(() => setAviso(''), []);

  const ir = (key, filtro = null) => { setSeccion(key); setFiltroInicial(filtro); setColaboradorId(null); };
  const abrirExpediente = (id) => { setColaboradorId(id); };
  const usuario = user?.nombre || user?.email || 'usuario';

  return (
    <div className="max-w-7xl mx-auto pb-10">
      {/* ENCABEZADO DEL MÓDULO */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${COLOR_RRHH} 0%, #818CF8 100%)` }}>
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
          empresaLabel={empresaLabel} onVolver={() => setColaboradorId(null)} notificar={setAviso} />
      ) : (
        <>
          {seccion === 'inicio' && <InicioRRHH t={t} ir={ir} abrirExpediente={abrirExpediente} />}
          {seccion === 'colaboradores' && <Colaboradores key={JSON.stringify(filtroInicial)} t={t} abrirExpediente={abrirExpediente} filtroInicial={filtroInicial} />}
        </>
      )}

      <Aviso mensaje={aviso} onCerrar={cerrarAviso} />
    </div>
  );
}
