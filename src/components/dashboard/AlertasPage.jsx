// src/components/dashboard/AlertasPage.jsx
// Centro de alertas: calibraciones y mantenimientos preventivos vencidos o próximos a vencer,
// con desgloses por empresa y por sede y un detalle filtrable por KPI.

import { useState } from 'react';
import { PREVENTIVO_ALERTA_DIAS, CALIBRACION_ALERTA_DIAS, buildAlerts } from '../../services/alertLogic';
import { COMPANIES, companyOf } from '../../data/empresas.js';
import { Badge, HeroStat } from '../ui.jsx';

export default function AlertasPage({ equipos, activeCompany, onChangeEmpresa, t, onOpen }) {
  const isCompanyView = activeCompany !== 'TODAS';
  // Filtro de sede — local a esta pantalla (no comparte estado con el de Inventario) y
  // depende de la empresa activa, misma jerarquía Empresa → Sede que ya exige Inventario: si
  // la sede guardada ya no pertenece a la empresa activa, se ignora en el render (derivado,
  // sin useEffect ni setState adicional) en vez de dejar una combinación inválida.
  const sedesDisponibles = isCompanyView ? companyOf(activeCompany).sedes : [];
  const [sedeFiltro, setSedeFiltro] = useState('');
  const sedeEfectiva = sedesDisponibles.includes(sedeFiltro) ? sedeFiltro : '';

  // KPI seleccionado (clic en una de las 4 tarjetas) — filtra únicamente la lista de detalle
  // de más abajo; null = mostrar todas las alertas del alcance actual (empresa + sede).
  const [filtroKpi, setFiltroKpi] = useState(null);

  let scoped = isCompanyView ? equipos.filter(e => e.empresa === activeCompany) : equipos;
  if (sedeEfectiva) scoped = scoped.filter(e => e.sede === sedeEfectiva);

  // buildAlerts sigue siendo la ÚNICA fuente de verdad para vencido/próximo (calibStatus +
  // estadoActualPreventivo, con la ventana de PREVENTIVO_ALERTA_DIAS/CALIBRACION_ALERTA_DIAS
  // de siempre) y ya excluye equipos dados de baja — nada de eso se duplica ni se reinterpreta
  // aquí, solo se agrupa su salida por tipo/empresa/sede.
  const alerts = buildAlerts(scoped);
  const calVencidas = alerts.filter(a => a.tipo === 'Calibración' && a.status === 'vencido');
  const calProximas = alerts.filter(a => a.tipo === 'Calibración' && a.status === 'proximo');
  const mantVencidos = alerts.filter(a => a.tipo === 'Preventivo' && a.status === 'vencido');
  const mantProximos = alerts.filter(a => a.tipo === 'Preventivo' && a.status === 'proximo');

  const KPIS = [
    { tipo: 'Calibración', status: 'vencido', label: 'Calibraciones vencidas', sub: 'Requieren atención inmediata', color: '#EF4444', list: calVencidas },
    { tipo: 'Calibración', status: 'proximo', label: 'Calibraciones próximas', sub: `≤ ${CALIBRACION_ALERTA_DIAS} días`, color: '#F59E0B', list: calProximas },
    { tipo: 'Preventivo', status: 'vencido', label: 'Mantenimientos vencidos', sub: 'Requieren atención inmediata', color: '#EF4444', list: mantVencidos },
    { tipo: 'Preventivo', status: 'proximo', label: 'Mantenimientos próximos', sub: `≤ ${PREVENTIVO_ALERTA_DIAS} días`, color: '#F59E0B', list: mantProximos },
  ];
  const toggleKpi = (k) => setFiltroKpi(f => (f && f.tipo === k.tipo && f.status === k.status) ? null : { tipo: k.tipo, status: k.status, label: k.label });

  // Alertas por empresa — SIEMPRE sobre las 5 empresas del catálogo (no solo la activa), para
  // poder comparar entre ellas; un clic en una fila cambia la empresa activa (misma acción que
  // los "pills" de arriba, vía onChangeEmpresa). Solo se muestra en "Todas las empresas": con
  // una sola empresa activa esta tabla tendría una única fila, redundante con los KPI de arriba.
  const porEmpresa = COMPANIES.map(c => {
    const a = buildAlerts(equipos.filter(e => e.empresa === c.key));
    return {
      empresa: c.key, color: c.color,
      calVencidas: a.filter(x => x.tipo === 'Calibración' && x.status === 'vencido').length,
      calProximas: a.filter(x => x.tipo === 'Calibración' && x.status === 'proximo').length,
      mantVencidos: a.filter(x => x.tipo === 'Preventivo' && x.status === 'vencido').length,
      mantProximos: a.filter(x => x.tipo === 'Preventivo' && x.status === 'proximo').length,
      total: a.length,
    };
  });

  // Alertas por sede — mismo catálogo companyOf(...).sedes que ya usa el "Desglose por sede"
  // del Dashboard: si la vista es una empresa, solo sus sedes; en "Todas las empresas", las de
  // las 5 empresas juntas (con su empresa visible, para no mezclarlas entre sí). Ordenada de
  // mayor a menor total para responder de un vistazo "¿cuál sede tiene más alertas?".
  const empresasParaSedes = isCompanyView ? [companyOf(activeCompany)] : COMPANIES;
  const porSede = empresasParaSedes
    .flatMap(c => c.sedes.map(sede => {
      const a = buildAlerts(equipos.filter(e => e.empresa === c.key && e.sede === sede));
      return {
        sede, empresa: c.key, color: c.color,
        calVencidas: a.filter(x => x.tipo === 'Calibración' && x.status === 'vencido').length,
        calProximas: a.filter(x => x.tipo === 'Calibración' && x.status === 'proximo').length,
        mantVencidos: a.filter(x => x.tipo === 'Preventivo' && x.status === 'vencido').length,
        mantProximos: a.filter(x => x.tipo === 'Preventivo' && x.status === 'proximo').length,
        total: a.length,
      };
    }))
    .sort((a, b) => b.total - a.total);

  // Relabeling puramente visual — buildAlerts sigue devolviendo 'Preventivo' (mismo valor que
  // usa el resto del sistema, p. ej. ReporteTecnicoButton); aquí solo se traduce a como lo pidió
  // ver el usuario ("Mantenimiento"), sin tocar la clasificación real en ningún otro lado.
  const TIPO_LABEL = { 'Calibración': 'Calibración', 'Preventivo': 'Mantenimiento' };
  const ESTADO_LABEL = {
    'Calibración': { vencido: 'Vencida', proximo: 'Próxima' },
    'Preventivo': { vencido: 'Vencido', proximo: 'Próximo' },
  };
  const badgeColor = (a) => a.status === 'vencido' ? '#EF4444' : '#F59E0B';
  const daysTxt = (a) => a.status === 'vencido'
    ? `${ESTADO_LABEL[a.tipo].vencido} hace ${Math.abs(a.diffDays)} días`
    : `Vence en ${a.diffDays} días`;

  const detalle = filtroKpi ? alerts.filter(a => a.tipo === filtroKpi.tipo && a.status === filtroKpi.status) : alerts;
  const detalleVencidas = detalle.filter(a => a.status === 'vencido');
  const detalleProximas = detalle.filter(a => a.status === 'proximo');

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 className="text-lg font-bold">Alertas</h1>
        {isCompanyView && sedesDisponibles.length > 0 && (
          <select value={sedeEfectiva} onChange={e => setSedeFiltro(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border uppercase ${t.input}`}>
            <option value="">Todas las sedes</option>
            {sedesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
      <p className={`text-xs mb-5 ${t.muted}`}>
        Centro de alertas de mantenimiento biomédico: calibraciones vencidas o próximas a vencer (≤{CALIBRACION_ALERTA_DIAS} días) y mantenimientos preventivos vencidos o próximos (≤{PREVENTIVO_ALERTA_DIAS} días).
      </p>

      {/* KPI — 4 categorías separadas explícitamente (nunca mezcladas); clic filtra el detalle de abajo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {KPIS.map(k => {
          const active = filtroKpi && filtroKpi.tipo === k.tipo && filtroKpi.status === k.status;
          return (
            <div key={`${k.tipo}-${k.status}`} className="rounded-xl" style={active ? { boxShadow: `0 0 0 2px ${k.color}` } : {}}>
              <HeroStat t={t} label={k.label} value={k.list.length} sub={k.sub} color={k.color} onClick={() => toggleKpi(k)} />
            </div>
          );
        })}
      </div>

      {/* Alertas por empresa — solo en "Todas las empresas" (con una activa sería una sola fila) */}
      {!isCompanyView && (
        <div className={`rounded-xl border p-4 mb-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-3">Alertas por empresa</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className={`border-b ${t.border}`}>
                  <th className={`text-left px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Empresa</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Cal. vencidas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Cal. próximas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Mant. vencidos</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Mant. próximos</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {porEmpresa.map(e => (
                  <tr key={e.empresa} onClick={() => onChangeEmpresa(e.empresa)} className={`border-b cursor-pointer hover:bg-white/5 ${t.border}`}>
                    <td className="px-2 py-2 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
                      {e.empresa}
                    </td>
                    <td className="px-2 py-2 text-right font-mono" style={e.calVencidas > 0 ? { color: '#EF4444' } : {}}>{e.calVencidas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={e.calProximas > 0 ? { color: '#F59E0B' } : {}}>{e.calProximas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={e.mantVencidos > 0 ? { color: '#EF4444' } : {}}>{e.mantVencidos}</td>
                    <td className="px-2 py-2 text-right font-mono" style={e.mantProximos > 0 ? { color: '#F59E0B' } : {}}>{e.mantProximos}</td>
                    <td className="px-2 py-2 text-right font-mono font-semibold">{e.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alertas por sede — sedes de la empresa activa, o de las 5 empresas si es "Todas" */}
      {porSede.length > 0 && (
        <div className={`rounded-xl border p-4 mb-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-3">Alertas por sede{isCompanyView ? ` — ${activeCompany}` : ''}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className={`border-b ${t.border}`}>
                  <th className={`text-left px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Sede</th>
                  {!isCompanyView && <th className={`text-left px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Empresa</th>}
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Cal. vencidas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Cal. próximas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Mant. vencidos</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Mant. próximos</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {porSede.map(s => (
                  <tr key={`${s.empresa}-${s.sede}`}
                    onClick={() => { if (!isCompanyView) onChangeEmpresa(s.empresa); setSedeFiltro(s.sede); }}
                    className={`border-b cursor-pointer hover:bg-white/5 ${t.border} ${isCompanyView && sedeEfectiva === s.sede ? 'font-semibold' : ''}`}>
                    <td className="px-2 py-2 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                      {s.sede}
                    </td>
                    {!isCompanyView && <td className="px-2 py-2">{s.empresa}</td>}
                    <td className="px-2 py-2 text-right font-mono" style={s.calVencidas > 0 ? { color: '#EF4444' } : {}}>{s.calVencidas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.calProximas > 0 ? { color: '#F59E0B' } : {}}>{s.calProximas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.mantVencidos > 0 ? { color: '#EF4444' } : {}}>{s.mantVencidos}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.mantProximos > 0 ? { color: '#F59E0B' } : {}}>{s.mantProximos}</td>
                    <td className="px-2 py-2 text-right font-mono font-semibold">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isCompanyView && sedeEfectiva && (
            <button onClick={() => setSedeFiltro('')} className={`mt-3 text-2xs underline ${t.muted}`}>Quitar filtro de sede ({sedeEfectiva})</button>
          )}
        </div>
      )}

      {/* Detalle de alertas — respeta el KPI seleccionado arriba */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide">
          {filtroKpi ? `${filtroKpi.label} (${detalle.length})` : `Todas las alertas (${detalle.length})`}
        </div>
        {filtroKpi && <button onClick={() => setFiltroKpi(null)} className={`text-2xs underline ${t.muted}`}>← Ver todas las alertas</button>}
      </div>

      {detalle.length === 0 && <div className={`text-sm text-center py-10 ${t.muted}`}>No hay alertas activas en este momento 👍</div>}

      {detalleVencidas.length > 0 && (
        <div className="mb-6">
          <div className="text-2xs font-mono uppercase tracking-wide mb-2 text-red-400">Vencidas ({detalleVencidas.length})</div>
          <div className="space-y-2">
            {detalleVencidas.map((a, i) => (
              <div key={i} onClick={() => onOpen(a.equipoId)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`} style={{ borderLeftColor: badgeColor(a), borderLeftWidth: 3 }}>
                <Badge mono={false} color={badgeColor(a)}>{TIPO_LABEL[a.tipo]} · {ESTADO_LABEL[a.tipo][a.status]}</Badge>
                <div className="flex-1">
                  <div className="text-xs font-semibold">{a.equipo}</div>
                  <div className={`text-2xs ${t.muted}`}>{a.empresa} · {a.sede}</div>
                </div>
                <div className="text-2xs font-mono" style={{ color: badgeColor(a) }}>{daysTxt(a)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {detalleProximas.length > 0 && (
        <div>
          <div className="text-2xs font-mono uppercase tracking-wide mb-2 text-amber-400">Próximas a vencer ({detalleProximas.length})</div>
          <div className="space-y-2">
            {detalleProximas.map((a, i) => (
              <div key={i} onClick={() => onOpen(a.equipoId)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`} style={{ borderLeftColor: badgeColor(a), borderLeftWidth: 3 }}>
                <Badge mono={false} color={badgeColor(a)}>{TIPO_LABEL[a.tipo]} · {ESTADO_LABEL[a.tipo][a.status]}</Badge>
                <div className="flex-1">
                  <div className="text-xs font-semibold">{a.equipo}</div>
                  <div className={`text-2xs ${t.muted}`}>{a.empresa} · {a.sede}</div>
                </div>
                <div className="text-2xs font-mono" style={{ color: badgeColor(a) }}>{daysTxt(a)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
