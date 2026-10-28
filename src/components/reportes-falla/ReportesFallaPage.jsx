// src/components/reportes-falla/ReportesFallaPage.jsx
// Reportes de falla reportados por los coordinadores de sede (ver el formulario público,
// ReporteFallaForm): listado filtrable, gráficas de fallas por mes y tiempo de atención, y
// el detalle expandible de cada reporte (estado, técnico asignado, observaciones).

import { useState } from 'react';
import { Trash2, Save } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Button, Badge, Field, SelectInput, TextInput, PdfLink, HeroStat } from '../ui.jsx';
import { formatFechaCorta, formatFechaHora, todayISO } from '../../utils/fechas.js';
import { MONTHS } from '../../data/equipos.js';
import { PRIORIDADES, PRIORIDAD_HEX, REPORTE_ESTADOS, REPORTE_ESTADO_HEX, equipoLabelCompleto } from '../../data/fallas.js';

// Resuelve el inicio/fin de atención de un reporte de falla. Para reportes creados
// antes de guardar hora exacta, cae a las fechas (solo día) que ya existían, así los
// registros antiguos siguen mostrando información en vez de quedar vacíos.
function reporteTimestamps(r) {
  const inicio = r.fechaHoraReporte || (r.fecha ? `${r.fecha}T00:00:00` : null);
  const fin = r.fechaHoraSolucion || (r.estado === 'Finalizado' && r.fechaCierre ? `${r.fechaCierre}T00:00:00` : null);
  return { inicio, fin };
}
// Tiempo de respuesta en milisegundos, o null si la falla aún no tiene fecha de solución.
function tiempoRespuestaMs(r) {
  const { inicio, fin } = reporteTimestamps(r);
  if (!inicio || !fin) return null;
  const ms = new Date(fin) - new Date(inicio);
  return isNaN(ms) ? null : Math.max(0, ms);
}
// Duración legible (ej. "2d 5h 10min") a partir de una diferencia en milisegundos.
function formatDuracion(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const partes = [];
  if (d) partes.push(`${d}d`);
  if (d || h) partes.push(`${h}h`);
  partes.push(`${m}min`);
  return partes.join(' ');
}

// Confirmación para "Vaciar histórico" — mismo patrón que DeleteDocumentDialog, pero
// advirtiendo que es TODO el histórico compartido, no un solo registro.
function VaciarHistorialFallasDialog({ total, onCancel, onConfirm, t }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className={`animate-modal-in relative w-full max-w-xs rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="text-sm font-bold mb-1">¿Vaciar todo el histórico de fallas?</div>
        <p className={`text-2xs mb-4 ${t.muted}`}>
          Se eliminarán los {total} reporte{total !== 1 ? 's' : ''} de falla de la base de datos compartida, para todos los usuarios. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" t={t} onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm}>Vaciar histórico</Button>
        </div>
      </div>
    </div>
  );
}

function EliminarFallaDialog({ equipoLabel, fecha, onCancel, onConfirm, t }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className={`animate-modal-in relative w-full max-w-xs rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="text-sm font-bold mb-1">¿Eliminar este reporte?</div>
        <p className={`text-2xs mb-4 ${t.muted}`}>
          El reporte de falla de <strong>{equipoLabel}</strong> ({fecha}) se eliminará de la base de datos compartida, para todos los usuarios. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" t={t} onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm}>Eliminar</Button>
        </div>
      </div>
    </div>
  );
}

// Detalle expandido de un reporte de falla: estado, persona asignada y observaciones de
// la reparación se editan en un borrador local y solo se envían al guardar (antes cada
// tecla disparaba un PATCH; ahora el coordinador confirma explícitamente con "Guardar").
function ReporteFallaDetalle({ r, onUpdate, readOnly, t, accent }) {
  const [draft, setDraft] = useState({
    estado: r.estado, tecnicoAsignado: r.tecnicoAsignado || '', observacionesReparacion: r.observacionesReparacion || '',
  });
  const [guardado, setGuardado] = useState(false);

  // Si el reporte cambia desde afuera (otro usuario lo actualizó, o falló el guardado y
  // se revirtió), el borrador se realinea con el dato real — ajuste durante el render.
  const [prevReporte, setPrevReporte] = useState(r);
  if (r.estado !== prevReporte.estado || r.tecnicoAsignado !== prevReporte.tecnicoAsignado || r.observacionesReparacion !== prevReporte.observacionesReparacion) {
    setPrevReporte(r);
    setDraft({ estado: r.estado, tecnicoAsignado: r.tecnicoAsignado || '', observacionesReparacion: r.observacionesReparacion || '' });
  }

  const hayCambios = draft.estado !== r.estado || draft.tecnicoAsignado !== (r.tecnicoAsignado || '') || draft.observacionesReparacion !== (r.observacionesReparacion || '');

  const guardar = () => {
    onUpdate({
      ...r,
      estado: draft.estado, tecnicoAsignado: draft.tecnicoAsignado, observacionesReparacion: draft.observacionesReparacion,
      fechaCierre: draft.estado === 'Finalizado' ? (r.fechaCierre || todayISO()) : r.fechaCierre,
      fechaHoraSolucion: draft.estado === 'Finalizado' ? (r.fechaHoraSolucion || new Date().toISOString()) : r.fechaHoraSolucion,
    });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  };

  return (
    <div className={`p-3 border-t space-y-3 ${t.border} ${t.panel3}`}>
      <div>
        <div className="text-3xs uppercase text-slate-400 mb-1">Descripción</div>
        <div className="text-xs">{r.descripcion}</div>
      </div>

      {(() => {
        const { inicio, fin } = reporteTimestamps(r);
        const ms = tiempoRespuestaMs(r);
        return (
          <div className={`rounded-lg border p-3 grid grid-cols-3 gap-3 ${t.panel3} ${t.border}`}>
            <div>
              <div className="text-3xs uppercase text-slate-400 mb-1">Reportada</div>
              <div className="text-xs font-mono">{formatFechaHora(inicio) || '—'}</div>
            </div>
            <div>
              <div className="text-3xs uppercase text-slate-400 mb-1">Solucionada</div>
              {fin
                ? <div className="text-xs font-mono">{formatFechaHora(fin)}</div>
                : <div className="text-xs font-semibold" style={{ color: '#F59E0B' }}>Pendiente de solución</div>}
            </div>
            <div>
              <div className="text-3xs uppercase text-slate-400 mb-1">Tiempo de respuesta</div>
              <div className="text-xs font-mono font-semibold" style={ms !== null ? { color: '#22C55E' } : {}}>
                {ms !== null ? formatDuracion(ms) : '—'}
              </div>
            </div>
          </div>
        );
      })()}

      {r.adjuntos && r.adjuntos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.adjuntos.map((a, i) => (
            <PdfLink key={i} url={a.url} label={a.nombre || 'Ver PDF'} title={a.nombre || 'Ver adjunto'} t={t} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estado">
          <SelectInput t={t} value={draft.estado} options={REPORTE_ESTADOS} disabled={readOnly}
            onChange={v => setDraft({ ...draft, estado: v })} />
        </Field>
        <Field label="Persona asignada">
          <TextInput t={t} value={draft.tecnicoAsignado} disabled={readOnly} onChange={v => setDraft({ ...draft, tecnicoAsignado: v })} />
        </Field>
      </div>
      <Field label="Observaciones de la reparación">
        <textarea rows={3} value={draft.observacionesReparacion} disabled={readOnly}
          onChange={e => setDraft({ ...draft, observacionesReparacion: e.target.value })}
          className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input} ${readOnly ? 'opacity-60' : ''}`} />
      </Field>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button variant="primary" accent={accent} t={t} icon={Save} iconSize={13} disabled={!hayCambios} onClick={guardar}>Guardar</Button>
          {guardado && <span className="text-2xs font-semibold" style={{ color: '#22C55E' }}>Reporte guardado</span>}
        </div>
      )}
    </div>
  );
}

export default function ReportesFallaPage({ reportes, equipos, activeCompany, t, accent, onUpdate, onEliminarReporte, onVaciarHistorial, readOnly }) {
  // El reporte solo guarda equipoId + equipoNombre (foto del nombre al momento de crearse) —
  // para mostrar marca/modelo/serie se consulta el inventario ACTUAL por id, sin tocar lo
  // que ya está guardado en el reporte. Si el equipo ya no existe en el inventario (borrado
  // después de reportarse la falla), se conserva el nombre guardado como respaldo.
  const equipoLabel = (r) => {
    const eq = equipos.find(e => e.id === r.equipoId);
    return eq ? equipoLabelCompleto(eq) : (r.equipoNombre || 'Equipo sin especificar');
  };

  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [openId, setOpenId] = useState(null);
  const [confirmarVaciar, setConfirmarVaciar] = useState(false);
  const [porEliminar, setPorEliminar] = useState(null); // reporte individual a confirmar

  // Respeta el contexto global de empresa (selector superior) y estado/prioridad,
  // ANTES del filtro de mes — así el conteo mensual de abajo siempre refleja los
  // otros filtros activos, y se puede ver el total de todos los meses a la vez.
  const baseList = reportes
    .filter(r => activeCompany === 'TODAS' || r.empresa === activeCompany)
    .filter(r => (!filtroEstado || r.estado === filtroEstado) && (!filtroPrioridad || r.prioridad === filtroPrioridad));

  const list = baseList
    .filter(r => filtroMes === '' || (r.fecha && new Date(r.fecha + 'T00:00:00').getMonth() === +filtroMes))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // Conteo de fallas reportadas por mes (todos los años juntos, mismo criterio que
  // el filtro de mes de arriba) — para el KPI y la gráfica mensual.
  const conteoPorMes = MONTHS.map(m => ({
    mes: m.l,
    idx: m.idx,
    total: baseList.filter(r => r.fecha && new Date(r.fecha + 'T00:00:00').getMonth() === m.idx).length,
  }));
  const totalMesSeleccionado = filtroMes !== '' ? (conteoPorMes.find(c => c.idx === +filtroMes)?.total || 0) : baseList.length;

  const openReport = (r) => {
    setOpenId(openId === r.id ? null : r.id);
    if (!r.visto && !readOnly) onUpdate({ ...r, visto: true });
  };

  // Fallas con tiempo de respuesta calculable — base de la gráfica "Tiempo de atención por falla".
  const resueltas = list.map(r => ({ r, ms: tiempoRespuestaMs(r) })).filter(x => x.ms !== null);

  // Gráfica: tiempo de atención por falla (equipo · fecha del reporte · horas que tardó).
  const datosTiempo = resueltas
    .map(({ r, ms }) => ({
      equipo: r.equipoNombre || 'Equipo sin especificar',
      fechaTxt: formatFechaHora(reporteTimestamps(r).inicio),
      horas: +(ms / 3600000).toFixed(1),
    }))
    .sort((a, b) => b.horas - a.horas)
    .slice(0, 8);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold mb-1">Reportes de falla</h1>
          <p className={`text-xs mb-4 ${t.muted}`}>Solicitudes enviadas por los coordinadores de sede.</p>
        </div>
        {!readOnly && reportes.length > 0 && (
          <Button variant="danger" icon={Trash2} iconSize={13} onClick={() => setConfirmarVaciar(true)}>
            Vaciar histórico
          </Button>
        )}
      </div>

      <div className="max-w-xs mb-3">
        <HeroStat t={t} label={filtroMes !== '' ? `Fallas en ${MONTHS[+filtroMes].full}` : 'Fallas reportadas (total)'} color={accent}
          value={totalMesSeleccionado}
          sub={filtroMes !== '' ? 'Clic en una barra para cambiar de mes' : 'Todos los meses'} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div className={`rounded-xl border p-4 ${t.panel} ${t.border}`}>
          <div className="text-3xs font-semibold uppercase tracking-wide mb-2" style={{ color: accent }}>Fallas reportadas por mes</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={conteoPorMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} width={24} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} fill={accent} cursor="pointer"
                onClick={(d) => setFiltroMes(f => f === String(d.idx) ? '' : String(d.idx))} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {datosTiempo.length > 0 && (
          <div className={`rounded-xl border p-4 ${t.panel} ${t.border}`}>
            <div className="text-3xs font-semibold uppercase tracking-wide mb-2" style={{ color: accent }}>Tiempo de atención por falla</div>
            <ResponsiveContainer width="100%" height={Math.max(120, datosTiempo.length * 26)}>
              <BarChart data={datosTiempo} layout="vertical" margin={{ left: 10, top: 2, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} unit="h" />
                <YAxis type="category" dataKey="equipo" tick={{ fontSize: 10, fill: '#94a3b8' }} width={100} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }}
                  formatter={(v) => [`${v} h`, 'Tiempo de atención']}
                  labelFormatter={(label, payload) => payload?.[0]?.payload ? `${label} · reportada ${payload[0].payload.fechaTxt}` : label} />
                <Bar dataKey="horas" radius={[0, 4, 4, 0]} barSize={14} fill={accent} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo estado</option>
          {REPORTE_ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filtroPrioridad} onChange={e => setFiltroPrioridad(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda prioridad</option>
          {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo mes</option>
          {MONTHS.map(m => <option key={m.k} value={m.idx}>{m.full}</option>)}
        </select>
      </div>

      {list.length === 0 && <div className={`text-sm text-center py-10 ${t.muted}`}>Sin reportes de falla todavía</div>}

      <div className="space-y-2">
        {list.map(r => (
          <div key={r.id} className={`rounded-lg border overflow-hidden ${t.panel} ${t.border}`}>
            <div onClick={() => openReport(r)} className="p-3 flex items-center gap-3 cursor-pointer flex-wrap">
              {!r.visto && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Nuevo" />}
              <Badge color={PRIORIDAD_HEX[r.prioridad]}>{r.prioridad}</Badge>
              <div className="flex-1 min-w-[160px]">
                <div className="text-xs font-semibold">{equipoLabel(r)}</div>
                <div className={`text-2xs ${t.muted}`}>{r.empresa} · {r.sede} · reportó {r.personaReporta || 'sin nombre'}</div>
              </div>
              <Badge color={REPORTE_ESTADO_HEX[r.estado]}>{r.estado}</Badge>
              <span className="text-2xs font-mono">{formatFechaCorta(r.fecha)}</span>
              {!readOnly && (
                <button onClick={(e) => { e.stopPropagation(); setPorEliminar(r); }} aria-label="Eliminar este reporte"
                  title="Eliminar este reporte" className="text-red-400 hover:text-red-300 p-1 shrink-0">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {openId === r.id && <ReporteFallaDetalle r={r} onUpdate={onUpdate} readOnly={readOnly} t={t} accent={accent} />}
          </div>
        ))}
      </div>

      {porEliminar && (
        <EliminarFallaDialog t={t} equipoLabel={equipoLabel(porEliminar)} fecha={formatFechaCorta(porEliminar.fecha)}
          onCancel={() => setPorEliminar(null)}
          onConfirm={() => { onEliminarReporte(porEliminar.id); setPorEliminar(null); }} />
      )}

      {confirmarVaciar && (
        <VaciarHistorialFallasDialog t={t} total={reportes.length}
          onCancel={() => setConfirmarVaciar(false)}
          onConfirm={() => { onVaciarHistorial(); setConfirmarVaciar(false); }} />
      )}
    </div>
  );
}
