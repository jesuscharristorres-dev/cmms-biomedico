// src/components/inventario/InventarioPage.jsx
import { useState } from 'react';
import {
  Search, Plus, Trash2, Copy, Download, Upload, X, MessageCircle, ArrowUpDown,
} from 'lucide-react';
import { calibStatus, aplicaCalibracionEfectiva } from '../../services/alertLogic';
import { preventivoDelMes } from '../../services/preventivoSchedule';
import { formatFechaCorta } from '../../utils/fechas.js';
import { companyOf } from '../../data/empresas.js';
import { MONTHS, CLASIFICACIONES, ESTADOS_EQUIPO, ESTADOS_MANTENIMIENTOS, STATUS_HEX, STATUS_LABEL, CAL_HEX } from '../../data/equipos.js';
import { Button, Badge } from '../ui.jsx';

// Color fijo (independiente del tema de cada empresa) para resaltar el ícono de
// observaciones en el inventario cuando el equipo tiene una observación guardada.
const OBS_HIGHLIGHT_COLOR = '#F59E0B';

/* ---------------------------------------------------------------- */
/* PÁGINA: INVENTARIO / MANTENIMIENTOS / CALIBRACIONES / CORRECTIVOS   */
/* ---------------------------------------------------------------- */
const INVENTORY_HEAD = [
  { key: 'equipo', label: 'EQUIPO' }, { key: 'marca', label: 'MARCA' }, { key: 'modelo', label: 'MODELO' },
  { key: 'numeroSerie', label: 'N° SERIE' }, { key: 'registroInvima', label: 'REG. INVIMA' },
  { key: 'clasificacionRiesgo', label: 'RIESGO' }, { key: 'inventario', label: 'INVENTARIO' },
];

// Confirmación previa a eliminar un equipo del inventario — mismo patrón visual que
// DeleteDocumentDialog/EliminarFallaDialog (fondo oscuro + tarjeta + Cancelar/Eliminar).
function EliminarEquipoDialog({ equipo, onCancel, onConfirm, t }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className={`animate-modal-in relative w-full max-w-xs rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="text-sm font-bold mb-1">¿Está seguro de que desea eliminar este equipo?</div>
        <p className={`text-2xs mb-4 ${t.muted}`}>
          <strong>{equipo?.equipo || 'Este equipo'}</strong>{equipo?.numeroSerie ? ` (N° serie ${equipo.numeroSerie})` : ''} se eliminará del inventario. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" t={t} onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm}>Eliminar</Button>
        </div>
      </div>
    </div>
  );
}

export default function InventarioPage({ mode, equipos, t, accentBg, filters, setFilters, onChangeSede, search, setSearch, searchText, setSearchText, setSort, uniqueVals, onOpen, onObs, onAdd, onDuplicate, onRemove, onExport, onImport, activeCompany, onClearFilters, readOnly, selectedId }) {
  const year = new Date().getFullYear();
  const title = { inventario: 'Inventario de equipos', mantenimientos: 'Mantenimientos preventivos', calibraciones: 'Calibraciones', correctivos: 'Correctivos' }[mode];
  // Filtro por mes del mantenimiento — exclusivo de la vista "Mantenimientos preventivos",
  // no forma parte del objeto `filters` compartido porque no aplica a las demás vistas.
  const [filtroMes, setFiltroMes] = useState('');
  // Equipo pendiente de confirmar eliminación (null = sin diálogo abierto) — la eliminación
  // real sigue siendo `onRemove`, solo se pospone hasta que el usuario confirme.
  const [equipoAEliminar, setEquipoAEliminar] = useState(null);
  const hayFiltrosActivos = Boolean(
    (activeCompany && activeCompany !== 'TODAS') || search.trim() || searchText.trim() ||
    filters.sede || filters.ubicacion || filters.estado || filters.marca || filters.clasificacion || filtroMes
  );

  const toggleSort = (key) => setSort(s => ({ key, dir: s.key === key ? -s.dir : 1 }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-bold">{title}</h1>
        {mode === 'inventario' && (
          <div className="flex gap-2 flex-wrap">
            {!readOnly && <Button variant="primary" accent={accentBg} icon={Plus} onClick={onAdd}>Agregar equipo</Button>}
            <Button variant="outline" t={t} icon={Download} onClick={onExport}>Exportar Excel</Button>
            {!readOnly && (
              <label className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs border cursor-pointer ${t.border}`}>
                <Upload size={13} /> Importar Excel
                <input type="file" accept=".xlsx" className="hidden"
                  onChange={e => { const f = e.target.files[0]; if (f) onImport(f); e.target.value = ''; }} />
              </label>
            )}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border ${t.border} ${t.panel}`}>
          <Search size={13} className={t.muted} />
          <select value={search} onChange={e => setSearch(e.target.value)} className={`bg-transparent text-xs w-40 outline-none ${t.text}`}>
            <option value="">Todos los equipos</option>
            {uniqueVals('equipo').map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border ${t.border} ${t.panel}`}>
          <Search size={13} className={t.muted} />
          <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Buscar equipo..."
            className={`bg-transparent text-xs w-48 outline-none ${t.text}`} />
          {searchText.trim() && (
            <button onClick={() => setSearchText('')} aria-label="Limpiar búsqueda" className={t.muted}><X size={13} /></button>
          )}
        </div>
        <select value={filters.sede} onChange={e => onChangeSede(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border uppercase ${t.input}`}>
          <option value="">Todas las sedes</option>
          {uniqueVals('sede').map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.ubicacion} onChange={e => setFilters({ ...filters, ubicacion: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda ubicación</option>
          {uniqueVals('ubicacion').map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.estado} onChange={e => setFilters({ ...filters, estado: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo estado</option>
          {(mode === 'mantenimientos' ? ESTADOS_MANTENIMIENTOS : ESTADOS_EQUIPO).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.marca} onChange={e => setFilters({ ...filters, marca: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda marca</option>
          {uniqueVals('marca').map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.clasificacion} onChange={e => setFilters({ ...filters, clasificacion: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda clasificación</option>
          {CLASIFICACIONES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {mode === 'mantenimientos' && (
          <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
            <option value="">Todo mes</option>
            {MONTHS.map(m => <option key={m.k} value={m.idx}>{m.full}</option>)}
          </select>
        )}
        {hayFiltrosActivos && (
          <Button variant="ghost" t={t} icon={X} iconSize={12} onClick={() => { onClearFilters(); setFiltroMes(''); }}>Limpiar filtros</Button>
        )}
      </div>

      {mode === 'inventario' && (
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-3xs ${t.muted}`}>
          {[
            { st: 'realizado', label: 'Realizado' },
            { st: 'programado', label: 'Programado' },
            { st: 'vencido', label: 'Vencido' },
            { st: 'no_aplica', label: 'Sin programación' },
          ].map(({ st, label }) => (
            <span key={st} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STATUS_HEX[st] }} />
              {label}
            </span>
          ))}
        </div>
      )}

      {mode === 'inventario' && (
        <div className={`rounded-xl border overflow-x-auto ${t.panel} ${t.border}`}>
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className={`border-b ${t.border}`}>
                {INVENTORY_HEAD.map(h => (
                  <th key={h.key} onClick={() => toggleSort(h.key)} className={`text-left px-3 py-2.5 font-mono text-3xs uppercase cursor-pointer select-none ${t.muted}`}>
                    <span className="inline-flex items-center gap-1">{h.label}<ArrowUpDown size={10} /></span>
                  </th>
                ))}
                {MONTHS.map(m => <th key={m.k} className={`px-2 py-2.5 font-mono text-3xs ${t.muted}`} translate="no" lang="es">{m.l}</th>)}
                <th className={`px-3 py-2.5 font-mono text-3xs uppercase ${t.muted}`}>CALIB.</th>
                <th className={`px-3 py-2.5 font-mono text-3xs uppercase ${t.muted}`}>PREV.</th>
                <th className={`px-3 py-2.5 font-mono text-3xs uppercase ${t.muted}`}>PERIODICIDAD DE MANTENIMIENTO</th>
                <th className={`px-3 py-2.5 font-mono text-3xs uppercase ${t.muted}`}>PERIODICIDAD DE CALIBRACIÓN</th>
                <th className={`px-3 py-2.5 font-mono text-3xs uppercase ${t.muted}`}>UBICACIÓN</th>
                <th className={`px-3 py-2.5 font-mono text-3xs uppercase ${t.muted}`}>PRÓX. CALIB.</th>
                <th className={`px-3 py-2.5 font-mono text-3xs uppercase ${t.muted}`}>ESTADO</th>
                <th className={`px-3 py-2.5 font-mono text-3xs uppercase ${t.muted}`}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {equipos.length === 0 && (
                <tr><td colSpan={22} className={`text-center py-8 text-xs ${t.muted}`}>Sin equipos — usa "Agregar equipo" para empezar</td></tr>
              )}
              {equipos.map(e => {
                const cs = calibStatus(e);
                const co = companyOf(e.empresa);
                // Resalta la fila del equipo con la Hoja de Vida abierta y atenúa las demás —
                // `selectedId` es el mismo `drawerId` que ya decide qué equipo muestra el drawer,
                // así que el resaltado sigue automáticamente al abrir/cerrar/cambiar de equipo.
                const isSelected = selectedId === e.id;
                const isDimmed = Boolean(selectedId) && !isSelected;
                return (
                  <tr key={e.id} className={`border-b cursor-pointer transition-opacity duration-150 ${t.border} ${isSelected ? '' : 'hover:bg-white/5'} ${isDimmed ? 'opacity-40' : ''}`}
                    style={{ borderLeft: `3px solid ${co.color}`, background: isSelected ? `${co.color}1F` : undefined }} onClick={() => onOpen(e.id)}>
                    <td className="px-3 py-2 font-semibold">{e.equipo || '—'}</td>
                    <td className="px-3 py-2">{e.marca || '—'}</td>
                    <td className="px-3 py-2">{e.modelo || '—'}</td>
                    <td className="px-3 py-2">{e.numeroSerie || '—'}</td>
                    <td className="px-3 py-2">{e.registroInvima || '—'}</td>
                    <td className="px-3 py-2">{e.clasificacionRiesgo}</td>
                    <td className="px-3 py-2">{e.inventario || '—'}</td>
                    {MONTHS.map(m => {
                      const { status: st, fecha } = preventivoDelMes(e, m.idx, year);
                      const tip = `${STATUS_LABEL[st]}${fecha ? ' — ' + formatFechaCorta(fecha) : ''}`;
                      return <td key={m.k} className="px-2 py-2 text-center" title={tip}><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STATUS_HEX[st] }} role="img" aria-label={tip} /></td>;
                    })}
                    <td className="px-3 py-2 text-center">{aplicaCalibracionEfectiva(e) ? '✓' : '✗'}</td>
                    <td className="px-3 py-2 text-center">{e.aplicaPreventivo ? '✓' : '—'}</td>
                    <td className="px-3 py-2">{e.periodicidadMantenimiento || '—'}</td>
                    <td className="px-3 py-2">{e.periodicidadCalibracion || '—'}</td>
                    <td className="px-3 py-2">{e.ubicacion || '—'}</td>
                    <td className="px-3 py-2">{cs.next ? formatFechaCorta(cs.next) : '—'}</td>
                    <td className="px-3 py-2">
                      <Badge mono={false} color={e.estado === 'Operativo' ? '#22C55E' : e.estado === 'Dado de baja' ? '#EF4444' : '#F59E0B'}>{e.estado}</Badge>
                    </td>
                    <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => onObs(e.id)} title={e.observaciones?.trim() ? 'Observaciones registradas' : 'Observaciones'} aria-label="Observaciones" className="p-2.5 -m-1.5 flex items-center justify-center">
                          <MessageCircle size={14} className={e.observaciones?.trim() ? '' : t.muted} fill={e.observaciones?.trim() ? OBS_HIGHLIGHT_COLOR : 'none'} style={e.observaciones?.trim() ? { color: OBS_HIGHLIGHT_COLOR } : {}} />
                        </button>
                        {!readOnly && (
                          <>
                            <button onClick={() => onDuplicate(e)} title="Duplicar" aria-label="Duplicar" className="p-2.5 -m-1.5 flex items-center justify-center"><Copy size={13} className={t.muted} /></button>
                            <button onClick={() => setEquipoAEliminar(e)} title="Eliminar" aria-label="Eliminar" className="p-2.5 -m-1.5 flex items-center justify-center"><Trash2 size={13} className="text-red-400" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mode === 'calibraciones' && (
        <div className="space-y-2">
          {equipos.map(e => {
            const cs = calibStatus(e);
            return (
              <div key={e.id} onClick={() => onOpen(e.id)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CAL_HEX[cs.status] }} />
                <div className="flex-1">
                  <div className="text-xs font-semibold">{e.equipo}</div>
                  <div className={`text-2xs ${t.muted}`}>{e.empresa} · {e.sede}</div>
                </div>
                <div className="text-2xs font-mono capitalize" style={{ color: CAL_HEX[cs.status] }}>{cs.status.replace('_', ' ')}</div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'mantenimientos' && (
        <div className="space-y-2">
          {equipos.flatMap(e => (e.preventivos || []).map(p => ({ ...p, equipoNombre: e.equipo, equipoId: e.id, empresa: e.empresa, sede: e.sede })))
            .filter(p => filtroMes === '' || (p.fecha && new Date(p.fecha + 'T00:00:00').getMonth() === +filtroMes))
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .map((p, i) => (
              <div key={i} onClick={() => onOpen(p.equipoId)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.estado === 'Ejecutado' ? '#22C55E' : '#F59E0B' }} />
                <div className="flex-1">
                  <div className="text-xs font-semibold">{p.equipoNombre}</div>
                  <div className={`text-2xs ${t.muted}`}>{p.empresa} · {p.sede} · {p.responsable || 'sin responsable'}</div>
                </div>
                <div className="text-2xs font-mono">{formatFechaCorta(p.fecha)}</div>
              </div>
            ))}
        </div>
      )}

      {mode === 'correctivos' && (
        <div className="space-y-2">
          {equipos.flatMap(e => (e.correctivos || []).map(c => ({ ...c, equipoNombre: e.equipo, equipoId: e.id, empresa: e.empresa, sede: e.sede })))
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .map((c, i) => (
              <div key={i} onClick={() => onOpen(c.equipoId)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.estado === 'Ejecutado' ? '#22C55E' : '#F59E0B' }} />
                <div className="flex-1">
                  <div className="text-xs font-semibold">{c.equipoNombre}</div>
                  <div className={`text-2xs ${t.muted}`}>{c.empresa} · {c.sede} · {c.responsable || 'sin responsable'}</div>
                </div>
                <div className="text-2xs font-mono">{formatFechaCorta(c.fecha)}</div>
              </div>
            ))}
        </div>
      )}

      {equipoAEliminar && (
        <EliminarEquipoDialog
          equipo={equipoAEliminar}
          t={t}
          onCancel={() => setEquipoAEliminar(null)}
          onConfirm={() => { onRemove(equipoAEliminar.id); setEquipoAEliminar(null); }}
        />
      )}
    </div>
  );
}
