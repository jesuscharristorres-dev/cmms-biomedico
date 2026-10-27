// src/components/dashboard/DashboardPage.jsx
import { useState, useMemo } from 'react';
import { Plus, ListTree, BellRing } from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line,
} from 'recharts';
import { PREVENTIVO_ALERTA_DIAS, calibStatus, buildAlerts } from '../../services/alertLogic';
import { Button, HeroStat, ClusterCard, MiniRow } from '../ui.jsx';
import { COMPANIES, companyOf } from '../../data/empresas.js';
import { MONTHS, ESTADOS_EQUIPO } from '../../data/equipos.js';
import { REPORTE_ESTADOS, REPORTE_ESTADO_HEX } from '../../data/fallas.js';

/* ---------------------------------------------------------------- */
/* PÁGINA: DASHBOARD                                                  */
/* ---------------------------------------------------------------- */
export default function Dashboard({ equipos, reportesFalla, activeCompany, accent, theme, t, readOnly, onGoAlerts, onGoFallas, onGoInventario }) {
  if (equipos.length === 0) {
    return (
      <div className={`rounded-xl border p-10 text-center ${t.panel} ${t.border}`}>
        <ListTree size={32} className={`mx-auto mb-3 ${t.muted}`} />
        <h2 className="text-sm font-bold mb-1">Todavía no hay equipos cargados</h2>
        <p className={`text-xs mb-5 max-w-sm mx-auto ${t.muted}`}>
          {readOnly
            ? 'Tu usuario es de solo lectura: puedes explorar el CMMS, pero no agregar equipos.'
            : 'Agrega tu primer equipo biomédico al inventario para empezar a ver el dashboard con datos reales.'}
        </p>
        {!readOnly && <Button variant="primary" accent={accent} icon={Plus} onClick={onGoInventario}>Agregar equipo</Button>}
      </div>
    );
  }

  const scoped = activeCompany === 'TODAS' ? equipos : equipos.filter(e => e.empresa === activeCompany);
  const alertCount = buildAlerts(scoped).length;
  const year = new Date().getFullYear(); const month = new Date().getMonth();

  const reportesScoped = activeCompany === 'TODAS' ? (reportesFalla || []) : (reportesFalla || []).filter(r => r.empresa === activeCompany);
  const fallasReportadas = reportesScoped.length;
  const fallasSolucionadas = reportesScoped.filter(r => r.estado === 'Finalizado').length;
  const fallasPorEstado = REPORTE_ESTADOS.map(s => ({ name: s, value: reportesScoped.filter(r => r.estado === s).length, fill: REPORTE_ESTADO_HEX[s] }));

  let prevProgramados = 0, prevEjecutados = 0;
  let calVigente = 0, calProximo = 0, calVencido = 0;
  let fueraServicio = 0;
  scoped.forEach(e => {
    (e.preventivos || []).forEach(p => {
      if (!p.fecha) return;
      const d = new Date(p.fecha + 'T00:00:00');
      if (d.getFullYear() === year && d.getMonth() === month) { prevProgramados++; if (p.estado === 'Ejecutado') prevEjecutados++; }
    });
    const cs = calibStatus(e);
    if (cs.status === 'vigente') calVigente++; else if (cs.status === 'proximo') calProximo++; else if (cs.status === 'vencido') calVencido++;
    if (e.estado === 'Fuera de servicio') fueraServicio++;
  });
  const disponibilidad = scoped.length ? Math.round(((scoped.length - fueraServicio) / scoped.length) * 100) : 0;

  const isCompanyView = activeCompany !== 'TODAS';
  // Tonos de la MISMA marca de la empresa activa — nunca colores de otra empresa.
  const SEDE_SHADES = theme.shades;

  // Cuando se ve "Todas las empresas": comparar empresas (cada una con su propio color).
  // Cuando se ve UNA empresa: comparar sus sedes, todas en variantes del mismo color de marca.
  const porGrupo = isCompanyView
    ? companyOf(activeCompany).sedes.map((sede, i) => ({
        name: sede,
        preventivos: scoped.filter(e => e.sede === sede).reduce((acc, e) => acc + (e.preventivos || []).length, 0),
        fill: SEDE_SHADES[i % SEDE_SHADES.length],
      }))
    : COMPANIES.map(c => ({
        name: c.key.length > 10 ? c.key.slice(0, 9) + '…' : c.key,
        preventivos: equipos.filter(e => e.empresa === c.key).reduce((acc, e) => acc + (e.preventivos || []).length, 0),
        fill: c.color,
      }));

  // Desglose por sede: equipos, alertas, bajas, fallas y calibraciones vencidas de cada sede
  // de la empresa activa. "Bajas" usa la misma definición de baja que ya usa el resto del
  // sistema (equipo.estado === 'Dado de baja' — así se marca un equipo al guardar su registro
  // de baja en la pestaña "Baja de Equipo", y así lo excluye buildAlerts de las alertas).
  const sedeBreakdown = isCompanyView
    ? companyOf(activeCompany).sedes.map((sede, i) => {
        const eqSede = scoped.filter(e => e.sede === sede);
        const repSede = reportesScoped.filter(r => r.sede === sede);
        return {
          sede, color: SEDE_SHADES[i % SEDE_SHADES.length],
          equipos: eqSede.length,
          alertas: buildAlerts(eqSede).length,
          bajas: eqSede.filter(e => e.estado === 'Dado de baja').length,
          fallasAbiertas: repSede.length - repSede.filter(r => r.estado === 'Finalizado').length,
          calVencidas: eqSede.filter(e => calibStatus(e).status === 'vencido').length,
        };
      })
    : [];

  const estadoPie = ESTADOS_EQUIPO.map((s, i) => ({ name: s, value: scoped.filter(e => e.estado === s).length, fill: ['#22C55E', '#EF4444', '#F59E0B', '#64748B'][i] }));

  const alertasSuaves = alertCount; // preventivos+calibraciones próximos/vencidos
  const fallasAbiertas = fallasReportadas - fallasSolucionadas;
  const pctPreventivo = prevProgramados ? Math.round((prevEjecutados / prevProgramados) * 100) : 0;
  const totalCal = calVigente + calProximo + calVencido;
  const porGrupoOrdenado = [...porGrupo].sort((a, b) => b.preventivos - a.preventivos);
  const maxPorGrupo = Math.max(...porGrupoOrdenado.map(p => p.preventivos), 1);

  const topCorrectivos = scoped
    .map(e => ({ nombre: e.equipo || 'Sin nombre', empresa: e.empresa, sede: e.sede, count: (e.correctivos || []).length }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div>
      {alertCount > 0 && (
        <button onClick={onGoAlerts} className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-5 border text-left" style={{ background: '#F59E0B1A', borderColor: '#F59E0B' }}>
          <BellRing size={16} style={{ color: '#F59E0B' }} />
          <span className="text-xs font-semibold" style={{ color: '#F59E0B' }}>
            {alertCount} alerta{alertCount !== 1 ? 's' : ''} activa{alertCount !== 1 ? 's' : ''} — preventivos a {PREVENTIVO_ALERTA_DIAS} días de vencer o calibraciones próximas/vencidas.
          </span>
          <span className="ml-auto text-2xs underline" style={{ color: '#F59E0B' }}>Ver alertas</span>
        </button>
      )}

      {isCompanyView && (
        <div className={`rounded-xl border p-5 mb-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Desglose por sede — {activeCompany}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className={`border-b ${t.border}`}>
                  <th className={`text-left px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Sede</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Equipos</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Alertas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Bajas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Fallas abiertas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Calib. vencidas</th>
                </tr>
              </thead>
              <tbody>
                {sedeBreakdown.map(s => (
                  <tr key={s.sede} className={`border-b ${t.border}`}>
                    <td className="px-2 py-2 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                      {s.sede}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{s.equipos}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.alertas > 0 ? { color: '#F59E0B' } : {}}>{s.alertas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.bajas > 0 ? { color: '#EF4444' } : {}}>{s.bajas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.fallasAbiertas > 0 ? { color: '#EF4444' } : {}}>{s.fallasAbiertas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.calVencidas > 0 ? { color: '#EF4444' } : {}}>{s.calVencidas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HERO — métricas principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <HeroStat t={t} label="Equipos activos" value={scoped.length} sub={`${fueraServicio} fuera de servicio`} color={accent} brandBg={theme.bg} />
        <HeroStat t={t} label="Disponibilidad" value={disponibilidad + '%'} sub="operacional" color="#0EA5E9" ring={disponibilidad} brandBg={theme.bg} />
        <HeroStat t={t} label="Alertas activas" value={alertasSuaves} sub="preventivos y calibraciones" color="#F59E0B" onClick={onGoAlerts} brandBg={theme.bg} />
        <HeroStat t={t} label="Fallas abiertas" value={Math.max(fallasAbiertas, 0)} sub={`${fallasSolucionadas} solucionadas`} color="#EF4444" onClick={onGoFallas} brandBg={theme.bg} />
      </div>

      {/* CLUSTERS TEMÁTICOS */}
      <div className="grid md:grid-cols-3 gap-4 mb-5">
        <ClusterCard t={t} title="Preventivos del mes" color="#F59E0B" brandBg={theme.bg}>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xl font-bold font-mono">{pctPreventivo}%</span>
            <span className={`text-2xs ${t.muted}`}>ejecutados</span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden mb-3 ${t.panel3}`}>
            <div className="h-full rounded-full" style={{ width: `${pctPreventivo}%`, background: '#22C55E' }} />
          </div>
          <MiniRow label="Programados" value={prevProgramados} t={t} noTranslate />
          <MiniRow label="Ejecutados" value={prevEjecutados} t={t} color="#22C55E" noTranslate />
          <MiniRow label="Pendientes" value={Math.max(prevProgramados - prevEjecutados, 0)} t={t} color="#F59E0B" noTranslate />
        </ClusterCard>

        <ClusterCard t={t} title="Calibraciones" color="#22C55E" brandBg={theme.bg}>
          <div className={`h-2.5 rounded-full overflow-hidden flex mb-3 ${t.panel3}`}>
            {totalCal > 0 ? (
              <>
                <div style={{ width: `${(calVigente / totalCal) * 100}%`, background: '#22C55E' }} />
                <div style={{ width: `${(calProximo / totalCal) * 100}%`, background: '#F59E0B' }} />
                <div style={{ width: `${(calVencido / totalCal) * 100}%`, background: '#EF4444' }} />
              </>
            ) : <div className="w-full" />}
          </div>
          <MiniRow label="Vigentes" value={calVigente} t={t} color="#22C55E" />
          <MiniRow label="Próximas a vencer" value={calProximo} t={t} color="#F59E0B" />
          <MiniRow label="Vencidas" value={calVencido} t={t} color="#EF4444" />
        </ClusterCard>

        <ClusterCard t={t} title="Fallas reportadas" color="#EF4444" onClick={onGoFallas} brandBg={theme.bg}>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-xl font-bold font-mono">{fallasReportadas}</span>
            <span className={`text-2xs ${t.muted}`}>reportadas en total</span>
          </div>
          {REPORTE_ESTADOS.map(s => (
            <MiniRow key={s} label={s} value={reportesScoped.filter(r => r.estado === s).length} t={t} color={REPORTE_ESTADO_HEX[s]} />
          ))}
        </ClusterCard>
      </div>

      {/* BENTO — comparativos */}
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className={`lg:col-span-2 rounded-xl border p-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-4 uppercase tracking-wide" style={{ color: accent }}>{isCompanyView ? 'Preventivos por sede' : 'Preventivos por empresa'}</div>
          <div className="space-y-3">
            {porGrupoOrdenado.map(p => (
              <div key={p.name} className="flex items-center gap-3">
                <div className={`w-28 text-2xs font-mono shrink-0 truncate ${t.muted}`} title={p.name}>{p.name}</div>
                <div className={`flex-1 h-3 rounded-full overflow-hidden ${t.panel3}`}>
                  <div className="h-full rounded-full" style={{ width: `${(p.preventivos / maxPorGrupo) * 100}%`, background: p.fill }} />
                </div>
                <div className="w-8 text-right text-2xs font-mono font-semibold">{p.preventivos}</div>
              </div>
            ))}
          </div>
        </div>
        <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Estado de equipos</div>
          <div className="relative">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={estadoPie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
                  {estadoPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: -10 }}>
              <div className="text-xl font-bold font-mono">{scoped.length}</div>
              <div className={`text-3xs uppercase ${t.muted}`}>equipos</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
            {estadoPie.map((e, i) => (
              <span key={i} className="flex items-center gap-1 text-3xs">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.fill }} />
                <span className={t.muted}>{e.name}</span>
                <span className="font-mono font-semibold">{e.value}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <HeatmapMantenimientos scoped={scoped} activeCompany={activeCompany} t={t} accent={accent} />
      </div>

      <div className="mb-4">
        <EvolucionAnual scoped={scoped} activeCompany={activeCompany} theme={theme} t={t} accent={accent} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Equipos con más correctivos</div>
          {topCorrectivos.length === 0 && <div className={`text-xs text-center py-6 ${t.muted}`}>Sin correctivos registrados en este filtro</div>}
          <div className="space-y-2.5">
            {topCorrectivos.map((c, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="text-3xs font-mono w-4 shrink-0" style={{ color: accent }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{c.nombre}</div>
                  <div className={`text-3xs ${t.muted}`}>{c.empresa} · {c.sede}</div>
                </div>
                <span className="text-2xs font-mono font-semibold shrink-0" style={{ color: '#EF4444' }}>{c.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={`lg:col-span-2 rounded-xl border p-5 cursor-pointer ${t.panel} ${t.border}`} onClick={onGoFallas}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Fallas por estado</div>
            {fallasReportadas > 0 && <span className="text-2xs font-mono" style={{ color: accent }}>{fallasSolucionadas}/{fallasReportadas} cerradas</span>}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={fallasPorEstado} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={90} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                {fallasPorEstado.map((f, i) => <Cell key={i} fill={f.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

const TIPOS_HEATMAP = ['Preventivo', 'Correctivo', 'Instalación', 'Baja'];

function countsForType(equipos, tipo, year) {
  const counts = new Array(12).fill(0);
  equipos.forEach(e => {
    let items = [];
    if (tipo === 'Preventivo') items = (e.preventivos || []).filter(p => p.estado === 'Ejecutado');
    else if (tipo === 'Correctivo') items = e.correctivos || [];
    else if (tipo === 'Instalación') items = e.instalaciones || [];
    else if (tipo === 'Baja') items = e.bajas || [];
    items.forEach(it => {
      if (!it.fecha) return;
      const d = new Date(it.fecha + 'T00:00:00');
      if (isNaN(d.getTime()) || d.getFullYear() !== year) return;
      counts[d.getMonth()]++;
    });
  });
  return counts;
}

function HeatmapMantenimientos({ scoped, activeCompany, t, accent }) {
  const [sede, setSede] = useState('TODAS');
  const sedesDisponibles = activeCompany === 'TODAS' ? [] : companyOf(activeCompany).sedes;

  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear()]);
    scoped.forEach(e => {
      ['preventivos', 'correctivos', 'instalaciones', 'bajas'].forEach(k => {
        (e[k] || []).forEach(it => {
          if (!it.fecha) return;
          const y = new Date(it.fecha + 'T00:00:00').getFullYear();
          if (!isNaN(y)) set.add(y);
        });
      });
    });
    return [...set].sort((a, b) => b - a);
  }, [scoped]);
  const [year, setYear] = useState(new Date().getFullYear());

  const filtrados = sede === 'TODAS' ? scoped : scoped.filter(e => e.sede === sede);
  const matrix = TIPOS_HEATMAP.map(tipo => countsForType(filtrados, tipo, year));
  const maxVal = Math.max(...matrix.flat(), 1);
  const totalAnio = matrix.flat().reduce((a, b) => a + b, 0);

  const heatBg = (v) => {
    if (!v) return null;
    const alpha = 0.18 + (v / maxVal) * 0.72;
    return accent + Math.round(alpha * 255).toString(16).padStart(2, '0');
  };

  return (
    <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Mapa de calor — mantenimientos ejecutados</div>
        <div className="flex gap-2">
          {activeCompany !== 'TODAS' && (
            <select value={sede} onChange={e => setSede(e.target.value)} className={`rounded-md px-2 py-1 text-2xs border uppercase ${t.input}`}>
              <option value="TODAS">Todas las sedes</option>
              {sedesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select value={year} onChange={e => setYear(Number(e.target.value))} className={`rounded-md px-2 py-1 text-2xs border ${t.input}`}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <p className={`text-2xs mb-3 ${t.muted}`}>{totalAnio} intervenciones en {year}{sede !== 'TODAS' ? ` · ${sede}` : ''}</p>

      <div className="overflow-x-auto">
        <table className="text-3xs" style={{ borderSpacing: 4, borderCollapse: 'separate' }}>
          <thead>
            <tr>
              <th className="w-20"></th>
              {MONTHS.map(m => <th key={m.k} className={`font-mono font-normal pb-1 px-1 ${t.muted}`} translate="no" lang="es">{m.l}</th>)}
            </tr>
          </thead>
          <tbody>
            {TIPOS_HEATMAP.map((tipo, ti) => (
              <tr key={tipo}>
                <td className={`pr-2 text-right font-mono whitespace-nowrap align-middle ${t.muted}`}>{tipo}</td>
                {matrix[ti].map((v, mi) => (
                  <td key={mi}
                    title={`${tipo} · ${MONTHS[mi].l} ${year}: ${v} mantenimiento${v !== 1 ? 's' : ''}`}
                    className={`text-center align-middle rounded-md font-mono font-semibold ${v ? '' : t.panel3}`}
                    style={{ background: heatBg(v) || undefined, minWidth: 30, height: 26 }}>
                    {v || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Colores fijos y distinguibles para el modo neutro ("Todas las empresas").
const TIPO_LINEA_NEUTRO = { Preventivo: '#4FD1C5', Correctivo: '#F87171', 'Instalación': '#60A5FA', Baja: '#94A3B8' };

function EvolucionAnual({ scoped, activeCompany, theme, t, accent }) {
  const [sede, setSede] = useState('TODAS');
  const sedesDisponibles = activeCompany === 'TODAS' ? [] : companyOf(activeCompany).sedes;

  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear()]);
    scoped.forEach(e => {
      ['preventivos', 'correctivos', 'instalaciones', 'bajas'].forEach(k => {
        (e[k] || []).forEach(it => {
          if (!it.fecha) return;
          const y = new Date(it.fecha + 'T00:00:00').getFullYear();
          if (!isNaN(y)) set.add(y);
        });
      });
    });
    return [...set].sort((a, b) => b - a);
  }, [scoped]);
  const [year, setYear] = useState(new Date().getFullYear());

  const filtrados = sede === 'TODAS' ? scoped : scoped.filter(e => e.sede === sede);
  const isCompanyView = activeCompany !== 'TODAS';

  // Mismos tonos de marca usados en el resto del Dashboard cuando hay una empresa activa;
  // paleta fija y distinguible cuando se ve "Todas las empresas".
  const lineColor = (tipo, idx) => isCompanyView ? theme.shades[(idx * 2) % theme.shades.length] : TIPO_LINEA_NEUTRO[tipo];

  const data = useMemo(() => {
    const matrix = TIPOS_HEATMAP.map(tipo => countsForType(filtrados, tipo, year));
    return MONTHS.map((m, mi) => {
      const row = { name: m.l };
      TIPOS_HEATMAP.forEach((tipo, ti) => { row[tipo] = matrix[ti][mi]; });
      return row;
    });
  }, [filtrados, year]);
  const totalAnio = TIPOS_HEATMAP.reduce((acc, tipo) => acc + data.reduce((a, d) => a + d[tipo], 0), 0);

  return (
    <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Evolución anual de mantenimientos</div>
        <div className="flex gap-2">
          {isCompanyView && (
            <select value={sede} onChange={e => setSede(e.target.value)} className={`rounded-md px-2 py-1 text-2xs border uppercase ${t.input}`}>
              <option value="TODAS">Todas las sedes</option>
              {sedesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select value={year} onChange={e => setYear(Number(e.target.value))} className={`rounded-md px-2 py-1 text-2xs border ${t.input}`}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <p className={`text-2xs mb-3 ${t.muted}`}>{totalAnio} intervenciones en {year}{sede !== 'TODAS' ? ` · ${sede}` : ''} — eje X: meses, eje Y: intervenciones realizadas</p>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {TIPOS_HEATMAP.map((tipo, i) => (
            <Line key={tipo} type="monotone" dataKey={tipo} stroke={lineColor(tipo, i)} strokeWidth={2.2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
