// src/components/capacitaciones/CapacitacionesPage.jsx
import { useState, useMemo } from 'react';
import {
  GraduationCap, Filter, Search, ArrowUpDown, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  ExternalLink, RefreshCw, X,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line,
} from 'recharts';
import { formatFechaCorta, formatFechaHora } from '../../utils/fechas.js';
import { COMPANIES, companyOf } from '../../data/empresas.js';
import { MONTHS } from '../../data/equipos.js';
import { Button, Badge, HeroStat } from '../ui.jsx';

// Empresa que agrupa respuestas cuyo texto libre no matchea ninguna de las 5 empresas del
// CMMS (p. ej. "UT", usado por los contratos ERON) — ver COMPANY_ALIASES en
// lib/capacitaciones.js, que es donde se decide a qué empresa cae cada respuesta.
const OTRAS_EMPRESA = 'OTRAS';

// Etiqueta visible del bucket OTRAS_EMPRESA (empresas que no matchean ninguna de las 5 del
// CMMS). "UT" (contratos ERON) ya NO cae acá — lib/capacitaciones.js la excluye por completo
// antes de que sus registros lleguen al snapshot, así que este bucket solo agruparía alguna
// otra empresa desconocida que aparezca a futuro en los formularios. El valor interno se
// mantiene sin traducir para que coincida exactamente con lo que produce el servidor.
const EMPRESA_LABEL = { [OTRAS_EMPRESA]: 'Otras' };
const CAP_PAGE_SIZE = 20;
// Nota mínima (%) para considerar aprobada una capacitación — ver "Seguimiento de aprobación"
// más abajo. Se evalúa siempre sobre el ÚLTIMO intento de cada persona en esa capacitación,
// nunca sobre el promedio ni la peor nota histórica (a propósito: alguien que reprobó una vez
// pero ya aprobó no debe seguir apareciendo como pendiente).
const UMBRAL_APROBACION = 90;

// Aplica todos los filtros del dashboard de Capacitaciones excepto el que se indique en
// `skip` — así cada gráfica que desglosa por una dimensión (empresa, sede, capacitación)
// puede seguir mostrando esa dimensión completa aunque el usuario ya haya elegido un valor
// puntual en su propio selector (si no, "por sede" colapsaría a una sola barra en cuanto se
// filtra por sede).
function filtrarCapacitaciones(records, filtros, skip) {
  const { empresa, sede, capacitacion, anio, mes, desde, hasta } = filtros;
  return records.filter(r => {
    if (skip !== 'empresa' && empresa && empresa !== 'TODAS' && r.empresa !== empresa) return false;
    if (skip !== 'sede' && sede && r.sede !== sede) return false;
    if (skip !== 'capacitacion' && capacitacion && r.capacitacion !== capacitacion) return false;
    if (anio && r.fecha?.slice(0, 4) !== anio) return false;
    if (mes && String(Number(r.fecha?.slice(5, 7)) - 1) !== mes) return false;
    if (desde && (!r.fecha || r.fecha.slice(0, 10) < desde)) return false;
    if (hasta && (!r.fecha || r.fecha.slice(0, 10) > hasta)) return false;
    return true;
  });
}
// Identidad de una persona para contarla una sola vez como "capacitada": el correo (siempre
// lo recoge Google Forms de quien responde) o, a falta de correo, nombre+empresa. Distinto
// de "registros": cada fila es una asistencia puntual a UNA capacitación, así que la misma
// persona en 3 capacitaciones distintas suma 3 registros pero 1 sola persona.
const identidadDe = (r) => r.email || `${(r.nombre || '').toLowerCase()}|${r.empresa}`;

// Dashboard de "Capacitaciones": respuestas de los formularios de Google Forms del personal
// (ver api/capacitaciones.js). El selector de empresa global del CMMS (activeCompany) sigue
// siendo el filtro de empresa — se reutiliza en vez de duplicarlo — y además tiene sus
// propios filtros (sede, capacitación, año, mes, rango de fechas) y una tabla de detalle con
// búsqueda/orden/paginación. El botón "Actualizar información" dispara una sincronización en
// vivo contra Google Sheets (solo admin).
export default function CapacitacionesPage({ capacitaciones, activeCompany, onChangeEmpresa, t, accent, onActualizar, sincronizando, syncStatus, readOnly }) {
  // Memoizado porque `capacitaciones?.records || []` crearía un array `[]` nuevo en cada
  // render cuando aún no hay datos, invalidando los useMemo de abajo que dependen de esto.
  const registros = useMemo(() => capacitaciones?.records || [], [capacitaciones]);

  const [sede, setSede] = useState('');
  const [capacitacionSel, setCapacitacionSel] = useState('');
  const [anio, setAnio] = useState('');
  const [mes, setMes] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [sort, setSort] = useState({ key: 'fecha', dir: -1 });
  const [pagina, setPagina] = useState(1);
  // '' = Todas, 'pendientes' = última nota < UMBRAL_APROBACION, 'aprobadas' = >= UMBRAL_APROBACION.
  // No participa de `filtros`/filtrarCapacitaciones (eso filtra RESPUESTAS individuales, usadas
  // por los KPI/gráficas de siempre) porque este filtro opera sobre PERSONAS — se aplica después,
  // sobre el resumen por persona+capacitación (ver resumenAprobacion más abajo).
  const [estadoAprobacion, setEstadoAprobacion] = useState('');
  // Persona+capacitación seleccionada para ver su historial de intentos (modal "Acceso al detalle").
  const [personaDetalle, setPersonaDetalle] = useState(null);
  const [aprobacionAbierta, setAprobacionAbierta] = useState(false);

  const filtros = { empresa: activeCompany, sede, capacitacion: capacitacionSel, anio, mes, desde, hasta };
  const hayFiltrosActivos = Boolean(activeCompany !== 'TODAS' || sede || capacitacionSel || anio || mes || desde || hasta || estadoAprobacion);

  // Opciones de cada selector: relativas solo a la empresa activa (no a los demás filtros
  // locales), para que elegir una capacitación puntual no borre las sedes disponibles.
  const porEmpresaBase = useMemo(
    () => activeCompany === 'TODAS' ? registros : registros.filter(r => r.empresa === activeCompany),
    [registros, activeCompany]
  );
  const sedesDisponibles = useMemo(() => [...new Set(porEmpresaBase.map(r => r.sede).filter(Boolean))].sort(), [porEmpresaBase]);
  const capacitacionesDisponibles = useMemo(() => [...new Set(porEmpresaBase.map(r => r.capacitacion).filter(Boolean))].sort(), [porEmpresaBase]);
  const aniosDisponibles = useMemo(
    () => [...new Set(porEmpresaBase.map(r => r.fecha?.slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [porEmpresaBase]
  );

  // `filtrados`: con TODOS los filtros — alimenta los KPI, la tabla y "por mes". Cada gráfica
  // de desglose usa además su propia variante que ignora su dimensión (ver filtrarCapacitaciones).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtrados = useMemo(() => filtrarCapacitaciones(registros, filtros, null), [registros, activeCompany, sede, capacitacionSel, anio, mes, desde, hasta]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paraPorEmpresa = useMemo(() => filtrarCapacitaciones(registros, filtros, 'empresa'), [registros, activeCompany, sede, capacitacionSel, anio, mes, desde, hasta]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paraPorSede = useMemo(() => filtrarCapacitaciones(registros, filtros, 'sede'), [registros, activeCompany, sede, capacitacionSel, anio, mes, desde, hasta]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paraPorCapacitacion = useMemo(() => filtrarCapacitaciones(registros, filtros, 'capacitacion'), [registros, activeCompany, sede, capacitacionSel, anio, mes, desde, hasta]);

  // Las 3 métricas que el módulo debe diferenciar: capacitaciones (temas distintos con al
  // menos una respuesta), registros (cada fila = una asistencia puntual) y personas
  // (identidades únicas) — quien asistió a 3 capacitaciones suma 3 registros pero 1 persona.
  // Se cuenta por `capacitacion` (el nombre/tema), no por `capacitacionId` (la hoja): así, dos
  // hojas con el mismo tema (p. ej. "PRE Radiadores..." y "POS Radiadores..." configuradas con
  // el mismo label) cuentan como UNA sola capacitación, no dos — a propósito, para poder
  // filtrarlas y seleccionarlas juntas como un único tema en el dashboard.
  const totalCapacitaciones = useMemo(() => new Set(filtrados.map(r => r.capacitacion)).size, [filtrados]);
  const totalRegistros = filtrados.length;
  const personasUnicas = useMemo(() => new Set(filtrados.map(identidadDe)).size, [filtrados]);
  const conPuntaje = useMemo(() => filtrados.filter(r => r.porcentaje != null), [filtrados]);
  const promedioPct = conPuntaje.length
    ? Math.round(conPuntaje.reduce((a, r) => a + r.porcentaje, 0) / conPuntaje.length)
    : null;

  const porEmpresa = useMemo(() => {
    const map = {};
    paraPorEmpresa.forEach(r => { map[r.empresa] = (map[r.empresa] || 0) + 1; });
    return [...COMPANIES.map(c => c.key), OTRAS_EMPRESA]
      .filter(k => map[k])
      .map(k => ({ name: EMPRESA_LABEL[k] || k, value: map[k], fill: (companyOf(k) || {}).color || '#94A3B8' }));
  }, [paraPorEmpresa]);

  const porSede = useMemo(() => {
    const map = {};
    paraPorSede.forEach(r => { if (r.sede) map[r.sede] = (map[r.sede] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [paraPorSede]);

  const porCapacitacion = useMemo(() => {
    const map = {};
    paraPorCapacitacion.forEach(r => { map[r.capacitacion] = (map[r.capacitacion] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [paraPorCapacitacion]);

  const porMes = useMemo(() => {
    const map = {};
    filtrados.forEach(r => {
      if (!r.fecha) return;
      const k = r.fecha.slice(0, 7); // "AAAA-MM"
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([k, value]) => {
      const [y, m] = k.split('-');
      return { name: `${MONTHS[Number(m) - 1]?.l || m} ${y.slice(2)}`, value };
    });
  }, [filtrados]);

  // La capacitación con el peor promedio de puntaje — señal de alerta para reforzar esa
  // capacitación puntual. Se exige un mínimo de respuestas para no alarmar con 1-2 casos.
  const peorCapacitacion = useMemo(() => {
    const map = {};
    filtrados.forEach(r => {
      if (r.porcentaje == null) return;
      (map[r.capacitacion] ||= []).push(r.porcentaje);
    });
    let peor = null;
    Object.entries(map).forEach(([name, arr]) => {
      if (arr.length < 3) return;
      const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      if (!peor || avg < peor.avg) peor = { name, avg };
    });
    return peor;
  }, [filtrados]);

  // Seguimiento de aprobación: para cada persona + capacitación (misma identidad, mismo
  // `capacitacion`), se queda con su intento MÁS RECIENTE con nota (ignora filas sin
  // puntaje — no hay nada que evaluar ahí) y evalúa SOLO ese último intento contra
  // UMBRAL_APROBACION. Nunca el promedio ni la peor nota histórica: alguien que reprobó una
  // vez pero ya aprobó en un intento posterior debe dejar de aparecer como pendiente, y el
  // historial completo (`intentos`) se conserva para el detalle persona a persona.
  // Se calcula sobre `filtrados` (ya respeta empresa/sede/capacitación/año/mes/rango de
  // fechas) — el filtro de Estado de aprobación se aplica DESPUÉS, sobre este resumen.
  const resumenAprobacion = useMemo(() => {
    const grupos = new Map();
    filtrados.forEach(r => {
      if (r.porcentaje == null) return;
      const clave = `${identidadDe(r)}|${r.capacitacion}`;
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(r);
    });
    const resumen = [];
    grupos.forEach(intentos => {
      const ordenados = [...intentos].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
      const ultimo = ordenados[ordenados.length - 1];
      resumen.push({
        identidad: identidadDe(ultimo),
        nombre: ultimo.nombre, empresa: ultimo.empresa, sede: ultimo.sede, cargo: ultimo.cargo,
        capacitacion: ultimo.capacitacion,
        ultimaNota: ultimo.porcentaje, ultimaFecha: ultimo.fecha,
        aprobado: ultimo.porcentaje >= UMBRAL_APROBACION,
        intentos: ordenados,
      });
    });
    // Pendientes primero, y entre ellos la nota más baja primero — así lo más urgente queda arriba.
    resumen.sort((a, b) => (a.aprobado === b.aprobado ? a.ultimaNota - b.ultimaNota : a.aprobado ? 1 : -1));
    return resumen;
  }, [filtrados]);

  const personasPendientes = useMemo(() => resumenAprobacion.filter(r => !r.aprobado), [resumenAprobacion]);
  // KPI en personas ÚNICAS (no en pares persona+capacitación): alguien pendiente en 2 temas
  // a la vez cuenta una sola vez acá, igual que "Personas capacitadas" más arriba.
  const personasPendientesUnicas = useMemo(() => new Set(personasPendientes.map(r => r.identidad)).size, [personasPendientes]);
  const resumenFiltradoPorEstado = useMemo(() => {
    if (estadoAprobacion === 'pendientes') return resumenAprobacion.filter(r => !r.aprobado);
    if (estadoAprobacion === 'aprobadas') return resumenAprobacion.filter(r => r.aprobado);
    return resumenAprobacion;
  }, [resumenAprobacion, estadoAprobacion]);

  // Comparación PRE/POS: cuando dos hojas comparten el mismo `capacitacion` (label) pero una
  // trae fase "pre" y la otra "pos" (evaluación antes/después de la capacitación), empareja
  // las respuestas de la MISMA persona (misma identidad) en ambas fases para mostrar la
  // mejora. Los temas sin ambas fases, o sin pareja para una persona puntual, no generan fila
  // acá — igual siguen viéndose sueltos en la tabla de detalle de abajo, con su fase marcada.
  const comparacionPrePost = useMemo(() => {
    const porTema = {};
    filtrados.forEach(r => {
      if (r.fase !== 'pre' && r.fase !== 'pos') return;
      const grupo = (porTema[r.capacitacion] ||= { pre: new Map(), pos: new Map() });
      grupo[r.fase].set(identidadDe(r), r);
    });
    const filas = [];
    Object.entries(porTema).forEach(([tema, { pre, pos }]) => {
      pre.forEach((rPre, identidad) => {
        const rPos = pos.get(identidad);
        if (!rPos) return;
        const mejora = (rPre.porcentaje != null && rPos.porcentaje != null)
          ? Math.round((rPos.porcentaje - rPre.porcentaje) * 10) / 10
          : null;
        filas.push({ tema, nombre: rPre.nombre || rPos.nombre, empresa: rPre.empresa, pre: rPre.porcentaje, pos: rPos.porcentaje, mejora });
      });
    });
    return filas;
  }, [filtrados]);

  // Tabla de detalle: búsqueda de texto libre + orden por columna + paginación, sobre
  // `filtrados` (ya con todos los filtros del dashboard aplicados).
  const buscados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filtrados;
    return filtrados.filter(r =>
      [r.nombre, r.empresa, r.sede, r.capacitacion, r.cargo, r.email, r.documento].some(v => (v || '').toLowerCase().includes(q))
    );
  }, [filtrados, busqueda]);

  const ordenados = useMemo(() => {
    const { key, dir } = sort;
    const copia = [...buscados];
    copia.sort((a, b) => {
      if (key === 'porcentaje') return ((a.porcentaje || 0) - (b.porcentaje || 0)) * dir;
      return String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'es') * dir;
    });
    return copia;
  }, [buscados, sort]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / CAP_PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const filasPagina = ordenados.slice((paginaActual - 1) * CAP_PAGE_SIZE, paginaActual * CAP_PAGE_SIZE);

  const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  const limpiarFiltros = () => {
    onChangeEmpresa('TODAS'); setSede(''); setCapacitacionSel(''); setAnio(''); setMes(''); setDesde(''); setHasta(''); setEstadoAprobacion('');
  };

  const ActualizarBtn = !readOnly && (
    <Button variant="outline" t={t} accent={accent} icon={RefreshCw} onClick={onActualizar} disabled={sincronizando}>
      {sincronizando ? 'Actualizando…' : 'Actualizar información'}
    </Button>
  );
  // Acceso directo y muy visible (variant="primary") a la plataforma externa de formación —
  // a pedido del usuario, un botón que abra ese sitio en una pestaña nueva desde Capacitaciones.
  const FormacionBtn = (
    <Button variant="primary" t={t} accent={accent} icon={ExternalLink}
      onClick={() => window.open('https://formacionbiomedica.wordpress.com/', '_blank', 'noopener,noreferrer')}>
      Formación Biomédica
    </Button>
  );
  const EstadoSync = (
    <>
      {sincronizando && (
        <div className="rounded-xl border p-3 mb-4 text-2xs" style={{ borderColor: `${accent}55`, background: `${accent}15`, color: accent }}>
          Actualizando…
        </div>
      )}
      {!sincronizando && syncStatus && (
        <div className="rounded-xl border p-3 mb-4 text-2xs"
          style={syncStatus.type === 'error'
            ? { borderColor: '#EF444455', background: '#EF444415', color: '#EF4444' }
            : { borderColor: '#22C55E55', background: '#22C55E15', color: '#22C55E' }}>
          {syncStatus.type === 'error' ? '⚠ ' : '✓ '}{syncStatus.message}
        </div>
      )}
    </>
  );

  if (!capacitaciones) {
    return (
      <div className={`rounded-xl border p-10 text-center ${t.panel} ${t.border}`}>
        <GraduationCap size={32} className={`mx-auto mb-3 ${t.muted}`} />
        <h2 className="text-sm font-bold mb-1">Aún no hay datos de capacitaciones sincronizados</h2>
        <p className={`text-xs mb-5 max-w-sm mx-auto ${t.muted}`}>
          {readOnly
            ? 'El administrador global debe sincronizar los datos desde los formularios.'
            : 'Presiona "Actualizar información" para traer las respuestas desde los formularios de Google.'}
        </p>
        {EstadoSync}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {FormacionBtn}
          {ActualizarBtn}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h1 className="text-lg font-bold">Capacitaciones</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {FormacionBtn}
          {ActualizarBtn}
        </div>
      </div>
      <p className={`text-xs mb-3 ${t.muted}`}>
        Respuestas de los formularios de capacitación del personal, sincronizadas desde Google Forms.
        {capacitaciones.updatedAt && ` Última actualización: ${formatFechaHora(capacitaciones.updatedAt)}.`}
      </p>

      {EstadoSync}

      {capacitaciones.errores?.length > 0 && (
        <div className="rounded-xl border p-3 mb-4 text-2xs" style={{ borderColor: '#F59E0B55', background: '#F59E0B15', color: '#F59E0B' }}>
          <div className="font-semibold mb-1">
            No se pudieron sincronizar {capacitaciones.errores.length} formulario{capacitaciones.errores.length !== 1 ? 's' : ''}:
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            {capacitaciones.errores.map(e => <li key={e.id}>{e.label}: {e.error}</li>)}
          </ul>
        </div>
      )}

      {/* Desaparece sola en cuanto personasPendientesUnicas llega a 0 (último intento de todos
          ≥ UMBRAL_APROBACION) — no es un estado que haya que cerrar ni ocultar a mano. */}
      {personasPendientesUnicas > 0 && (
        <div className="rounded-xl border p-3 mb-4 text-2xs flex items-center justify-between flex-wrap gap-2" style={{ borderColor: '#EF444455', background: '#EF444415', color: '#EF4444' }}>
          <div>
            <span className="font-semibold">⚠ Hay {personasPendientesUnicas} persona{personasPendientesUnicas !== 1 ? 's' : ''} que requiere{personasPendientesUnicas !== 1 ? 'n' : ''} seguimiento.</span>
            {' '}Obtuvieron menos del {UMBRAL_APROBACION}% en su última evaluación.
          </div>
          <button onClick={() => { setEstadoAprobacion('pendientes'); setAprobacionAbierta(true); }} className="font-semibold underline whitespace-nowrap">Ver personas pendientes →</button>
        </div>
      )}

      <div className={`rounded-xl border p-3 mb-4 flex flex-wrap items-center gap-2 ${t.panel} ${t.border}`}>
        <Filter size={13} className={t.muted} />
        {/* Reutiliza el mismo `activeCompany` que ya gobierna el resto del CMMS (pestañas
            superiores) — no es un filtro local aparte, para no tener dos fuentes de verdad
            de "empresa activa" que puedan quedar desincronizadas entre sí. */}
        <select value={activeCompany} onChange={e => onChangeEmpresa(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border font-semibold ${t.input}`}>
          <option value="TODAS">Todas las empresas</option>
          {COMPANIES.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
        </select>
        <select value={sede} onChange={e => setSede(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda sede</option>
          {sedesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={capacitacionSel} onChange={e => setCapacitacionSel(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda capacitación</option>
          {capacitacionesDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={anio} onChange={e => setAnio(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo año</option>
          {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={mes} onChange={e => setMes(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo mes</option>
          {MONTHS.map(m => <option key={m.k} value={m.idx}>{m.full}</option>)}
        </select>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`} title="Desde" />
        <span className={`text-2xs ${t.muted}`}>a</span>
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`} title="Hasta" />
        <select value={estadoAprobacion} onChange={e => setEstadoAprobacion(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`} title="Estado de aprobación">
          <option value="">Estado: todas</option>
          <option value="aprobadas">Aprobadas ≥ {UMBRAL_APROBACION}%</option>
          <option value="pendientes">Pendientes &lt; {UMBRAL_APROBACION}%</option>
        </select>
        {hayFiltrosActivos && <Button variant="ghost" t={t} icon={X} iconSize={12} onClick={limpiarFiltros}>Limpiar filtros</Button>}
      </div>

      {filtrados.length === 0 ? (
        <div className={`rounded-xl border p-10 text-center ${t.panel} ${t.border}`}>
          <p className={`text-xs ${t.muted}`}>Sin registros de capacitaciones para los filtros actuales.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
            <HeroStat t={t} label="Capacitaciones realizadas" value={totalCapacitaciones} sub="temas distintos con respuestas" color={accent} />
            <HeroStat t={t} label="Registros / respuestas" value={totalRegistros} sub="asistencias registradas" color="#3B82F6" />
            <HeroStat t={t} label="Personas capacitadas" value={personasUnicas} sub="identidades únicas" color="#22C55E" />
            <HeroStat t={t} label="Promedio de puntaje" value={promedioPct != null ? `${promedioPct}%` : '—'}
              sub={`${conPuntaje.length} evaluaciones con puntaje`} color={promedioPct != null && promedioPct < 70 ? '#EF4444' : '#8B5CF6'} />
            <HeroStat t={t} label="Menor promedio" value={peorCapacitacion ? `${peorCapacitacion.avg}%` : '—'}
              sub={peorCapacitacion ? peorCapacitacion.name : 'Sin suficientes datos'} color="#F59E0B" />
            <HeroStat t={t} label={`Personas por debajo del ${UMBRAL_APROBACION}%`} value={personasPendientesUnicas}
              sub="Requieren refuerzo / nueva presentación" color="#EF4444" onClick={() => { setEstadoAprobacion('pendientes'); setAprobacionAbierta(true); }} />
          </div>

          {resumenAprobacion.length > 0 && (
            <div className={`rounded-xl border overflow-hidden mb-4 ${t.panel} ${t.border}`}>
              <button type="button" onClick={() => setAprobacionAbierta(v => !v)} className="w-full flex items-center justify-between gap-3 p-5 pb-3 text-left">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Seguimiento de aprobación</div>
                  <p className={`text-2xs mt-1 ${t.muted}`}>Por persona + capacitación, según su último intento — no el promedio ni la peor nota histórica.</p>
                </div>
                {aprobacionAbierta ? <ChevronUp size={16} className={t.muted} /> : <ChevronDown size={16} className={t.muted} />}
              </button>
              {aprobacionAbierta && (
              <div className="overflow-x-auto">
                <table className="w-full text-2xs">
                  <thead>
                    <tr className={`text-left ${t.muted} border-t ${t.border}`}>
                      <th className="px-5 py-2 font-mono uppercase text-3xs">Persona</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Empresa</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Sede</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Cargo</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Capacitación</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs text-right">Última nota</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Fecha último intento</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Estado</th>
                      <th className="px-3 py-2 pr-5 font-mono uppercase text-3xs text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenFiltradoPorEstado.length === 0 ? (
                      <tr><td colSpan={9} className={`text-center py-6 ${t.muted}`}>Sin personas en este estado para los filtros actuales.</td></tr>
                    ) : resumenFiltradoPorEstado.map((f, i) => (
                      <tr key={i} className={`border-t ${t.border}`}>
                        <td className="px-5 py-2">{f.nombre || '—'}</td>
                        <td className="px-3 py-2">{EMPRESA_LABEL[f.empresa] || f.empresa}</td>
                        <td className="px-3 py-2">{f.sede || '—'}</td>
                        <td className="px-3 py-2">{f.cargo || '—'}</td>
                        <td className="px-3 py-2">{f.capacitacion}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: f.aprobado ? '#22C55E' : '#EF4444' }}>{f.ultimaNota}%</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{f.ultimaFecha ? formatFechaCorta(f.ultimaFecha) : '—'}</td>
                        <td className="px-3 py-2">
                          <Badge color={f.aprobado ? '#22C55E' : '#EF4444'}>{f.aprobado ? '✓ Aprobado' : '⚠ Pendiente'}</Badge>
                        </td>
                        <td className="px-3 py-2 pr-5 text-right">
                          <button onClick={() => setPersonaDetalle(f)} className="font-semibold underline" style={{ color: accent }}>Ver</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
              <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Registros por empresa</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={porEmpresa} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                    {porEmpresa.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
                {porEmpresa.map((e, i) => (
                  <span key={i} className="flex items-center gap-1 text-3xs">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.fill }} />
                    <span className={t.muted}>{e.name}</span>
                    <span className="font-mono font-semibold">{e.value}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
              <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Registros por sede</div>
              <ResponsiveContainer width="100%" height={Math.max(160, porSede.length * 24)}>
                <BarChart data={porSede} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={110} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14} fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
              <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Top capacitaciones por respuestas</div>
              <ResponsiveContainer width="100%" height={Math.max(160, porCapacitacion.length * 22)}>
                <BarChart data={porCapacitacion} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} width={130} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12} fill={accent} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`rounded-xl border p-5 mb-4 ${t.panel} ${t.border}`}>
            <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Registros por mes</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={porMes} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke={accent} strokeWidth={2.2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {comparacionPrePost.length > 0 && (
            <div className={`rounded-xl border overflow-hidden mb-4 ${t.panel} ${t.border}`}>
              <div className="p-5 pb-3">
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Comparación Pre / Post</div>
                <p className={`text-2xs mt-1 ${t.muted}`}>Mismo participante, evaluado antes y después de la capacitación — mejora en puntos porcentuales.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-2xs">
                  <thead>
                    <tr className={`text-left ${t.muted} border-t ${t.border}`}>
                      <th className="px-5 py-2 font-mono uppercase text-3xs">Capacitación</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Participante</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Empresa</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs text-right">Pre</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs text-right">Post</th>
                      <th className="px-3 py-2 pr-5 font-mono uppercase text-3xs text-right">Mejora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparacionPrePost.map((f, i) => (
                      <tr key={i} className={`border-t ${t.border}`}>
                        <td className="px-5 py-2">{f.tema}</td>
                        <td className="px-3 py-2">{f.nombre || '—'}</td>
                        <td className="px-3 py-2">{EMPRESA_LABEL[f.empresa] || f.empresa}</td>
                        <td className="px-3 py-2 text-right font-mono">{f.pre != null ? `${f.pre}%` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{f.pos != null ? `${f.pos}%` : '—'}</td>
                        <td className="px-3 py-2 pr-5 text-right font-mono font-semibold" style={{ color: f.mejora == null ? undefined : f.mejora >= 0 ? '#22C55E' : '#EF4444' }}>
                          {f.mejora != null ? `${f.mejora >= 0 ? '+' : ''}${f.mejora} pts` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={`rounded-xl border overflow-hidden ${t.panel} ${t.border}`}>
            <div className="flex items-center justify-between flex-wrap gap-2 p-5 pb-3">
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Detalle de registros</div>
              <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${t.input}`}>
                <Search size={12} className={t.muted} />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, empresa, sede..."
                  className="bg-transparent text-xs outline-none w-48" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-2xs">
                <thead>
                  <tr className={`text-left ${t.muted} border-t ${t.border}`}>
                    {[
                      { key: 'fecha', label: 'Fecha' },
                      { key: 'capacitacion', label: 'Capacitación' },
                      { key: 'fase', label: 'Fase' },
                      { key: 'nombre', label: 'Participante' },
                      { key: 'empresa', label: 'Empresa' },
                      { key: 'sede', label: 'Sede' },
                      { key: 'cargo', label: 'Área / cargo' },
                    ].map(h => (
                      <th key={h.key} onClick={() => toggleSort(h.key)} className="px-3 py-2 font-mono uppercase text-3xs cursor-pointer select-none first:pl-5">
                        <span className="inline-flex items-center gap-1">{h.label}<ArrowUpDown size={9} /></span>
                      </th>
                    ))}
                    <th onClick={() => toggleSort('porcentaje')} className="px-3 py-2 pr-5 font-mono uppercase text-3xs cursor-pointer select-none text-right">
                      <span className="inline-flex items-center gap-1 justify-end">Resultado<ArrowUpDown size={9} /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filasPagina.map(r => (
                    <tr key={r.id} className={`border-t ${t.border}`}>
                      <td className="px-5 py-2 font-mono whitespace-nowrap">{r.fecha ? formatFechaCorta(r.fecha) : '—'}</td>
                      <td className="px-3 py-2">{r.capacitacion}</td>
                      <td className="px-3 py-2">{r.fase ? <Badge color={r.fase === 'pre' ? '#F59E0B' : '#22C55E'}>{r.fase}</Badge> : '—'}</td>
                      <td className="px-3 py-2">{r.nombre || '—'}</td>
                      <td className="px-3 py-2">{EMPRESA_LABEL[r.empresa] || r.empresa}</td>
                      <td className="px-3 py-2">{r.sede || '—'}</td>
                      <td className="px-3 py-2">{r.cargo || '—'}</td>
                      <td className="px-3 py-2 pr-5 text-right font-mono">{r.asistencia || (r.porcentaje != null ? `${r.porcentaje}%` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={`flex items-center justify-between px-5 py-3 border-t text-2xs ${t.border} ${t.muted}`}>
              <span>{ordenados.length} registro{ordenados.length !== 1 ? 's' : ''} — página {paginaActual} de {totalPaginas}</span>
              <div className="flex items-center gap-1">
                {/* Se basan en `paginaActual` (ya acotado a totalPaginas), no en el estado crudo
                    `pagina`: si un filtro reduce los resultados, `pagina` puede quedar apuntando
                    más allá del final, y partir de ahí haría falta más de un clic para que
                    "Anterior" reaccione. Partir de paginaActual lo corrige en un solo clic. */}
                <button onClick={() => setPagina(Math.max(1, paginaActual - 1))} disabled={paginaActual <= 1}
                  className={`p-1 rounded-md border disabled:opacity-40 ${t.border}`}><ChevronLeft size={13} /></button>
                <button onClick={() => setPagina(Math.min(totalPaginas, paginaActual + 1))} disabled={paginaActual >= totalPaginas}
                  className={`p-1 rounded-md border disabled:opacity-40 ${t.border}`}><ChevronRight size={13} /></button>
              </div>
            </div>
          </div>
        </>
      )}

      {personaDetalle && <HistorialIntentosModal persona={personaDetalle} t={t} accent={accent} onClose={() => setPersonaDetalle(null)} />}
    </div>
  );
}

// Modal "Acceso al detalle" — historial completo de intentos de una persona en UNA
// capacitación puntual (section 7 del pedido), numerados cronológicamente, para verificar
// que efectivamente mejoró antes de confiar en su último resultado.
function HistorialIntentosModal({ persona, t, accent, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`animate-modal-in relative w-full max-w-lg rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-sm font-semibold">{persona.nombre || 'Sin nombre'} — {persona.capacitacion}</div>
            <div className={`text-2xs ${t.muted}`}>{EMPRESA_LABEL[persona.empresa] || persona.empresa}{persona.sede ? ` · ${persona.sede}` : ''}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex items-center justify-center w-11 h-11 -mr-2 -mt-2"><X size={16} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-2xs">
            <thead>
              <tr className={`text-left ${t.muted} border-t ${t.border}`}>
                <th className="py-2 font-mono uppercase text-3xs">Intento</th>
                <th className="py-2 font-mono uppercase text-3xs">Fecha</th>
                <th className="py-2 font-mono uppercase text-3xs text-right">Nota</th>
                <th className="py-2 font-mono uppercase text-3xs text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {persona.intentos.map((it, i) => {
                const aprobado = it.porcentaje >= UMBRAL_APROBACION;
                return (
                  <tr key={it.id} className={`border-t ${t.border}`}>
                    <td className="py-2 font-mono">{i + 1}</td>
                    <td className="py-2 font-mono whitespace-nowrap">{it.fecha ? formatFechaCorta(it.fecha) : '—'}</td>
                    <td className="py-2 text-right font-mono font-semibold" style={{ color: aprobado ? '#22C55E' : '#EF4444' }}>{it.porcentaje}%</td>
                    <td className="py-2 text-right" style={{ color: aprobado ? '#22C55E' : '#EF4444' }}>{aprobado ? '✓ Aprobado' : '✗ No aprobado'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button variant="outline" t={t} accent={accent} className="mt-4" onClick={onClose}>Cerrar</Button>
      </div>
    </div>
  );
}
