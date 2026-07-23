import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Plus, Trash2, Copy, Download, Upload, Sun, Moon, X, ChevronRight,
  MessageCircle, FileText, LayoutDashboard, Building2, ListTree, CalendarClock,
  ShieldCheck, Wrench, FileBarChart, Settings, ArrowUpDown, Image as ImageIcon
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from 'recharts';
import * as XLSX from 'xlsx';

/* ---------------------------------------------------------------- */
/* CONFIG                                                            */
/* ---------------------------------------------------------------- */

const COMPANIES = [
  { key: 'MACROMED', color: '#1E3A8A', sedes: ['Bogotá'] },
  { key: 'MEIDE', color: '#0F766E', sedes: ['Armenia Berlín','Armenia Fundadores','Manizales Belén','Manizales Arboleda','La Dorada','Unidad Móvil'] },
  { key: 'NP MEDICAL', color: '#166534', sedes: ['Bogotá Samper','Bogotá Sur','Fontibón','Girardot'] },
  { key: 'DIAGNOSTIK', color: '#DC2626', sedes: ['Armenia Berlín','Armenia Fundadores','Manizales Berlín','Manizales Belén','Bogotá','Chapinero','Villavicencio','La Dorada'] },
  { key: 'AUNAR SALUD', color: '#0284C7', sedes: ['Bogotá','Villavicencio','Neiva'] },
];
const companyOf = (key) => COMPANIES.find(c => c.key === key);

const MONTHS = [
  { k: 'ene', l: 'Ene', idx: 0 }, { k: 'feb', l: 'Feb', idx: 1 }, { k: 'mar', l: 'Mar', idx: 2 },
  { k: 'abr', l: 'Abr', idx: 3 }, { k: 'may', l: 'May', idx: 4 }, { k: 'jun', l: 'Jun', idx: 5 },
  { k: 'jul', l: 'Jul', idx: 6 }, { k: 'ago', l: 'Ago', idx: 7 }, { k: 'sep', l: 'Sep', idx: 8 },
  { k: 'oct', l: 'Oct', idx: 9 }, { k: 'nov', l: 'Nov', idx: 10 }, { k: 'dic', l: 'Dic', idx: 11 },
];
// Acceso simple — cámbialo por tus propios datos.
const AUTH_USER = 'jesus.charris';
const AUTH_PASS = 'biomedica2026';

const CLASIFICACIONES = ['I', 'IIA', 'IIB', 'III'];
const ESTADOS_EQUIPO = ['Operativo', 'Fuera de servicio', 'En mantenimiento', 'Dado de baja'];
const MENU = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'empresas', label: 'Empresas', icon: Building2 },
  { key: 'inventario', label: 'Inventario', icon: ListTree },
  { key: 'mantenimientos', label: 'Mantenimientos', icon: CalendarClock },
  { key: 'calibraciones', label: 'Calibraciones', icon: ShieldCheck },
  { key: 'correctivos', label: 'Correctivos', icon: Wrench },
  { key: 'reportes', label: 'Reportes', icon: FileBarChart },
  { key: 'configuracion', label: 'Configuración', icon: Settings },
];
const STATUS_HEX = { realizado: '#22C55E', programado: '#F59E0B', vencido: '#EF4444', no_aplica: '#475569' };
const CAL_HEX = { vigente: '#22C55E', proximo: '#F59E0B', vencido: '#EF4444', sin_dato: '#475569' };

const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);

function newEquipo(empresaKey) {
  const c = companyOf(empresaKey) || COMPANIES[0];
  return {
    id: uid('eq'),
    empresa: c.key, sede: c.sedes[0], area: '', servicio: '',
    equipo: '', marca: '', modelo: '', numeroSerie: '', registroInvima: '',
    clasificacionRiesgo: 'IIB', inventario: '',
    proveedor: '', fabricante: '', fechaCompra: '', fechaInstalacion: '', garantiaHasta: '',
    fotografiaUrl: '', ubicacion: '', estado: 'Operativo',
    aplicaCalibracion: true, aplicaPreventivo: true,
    fechaUltimaCalibracion: '', certificadoUrl: '', observaciones: '',
    preventivos: [], correctivos: [], calibraciones: [], instalaciones: [], documentos: [],
  };
}

/* ---------------------------------------------------------------- */
/* HELPERS DE CÁLCULO                                                 */
/* ---------------------------------------------------------------- */

function calibStatus(equipo) {
  if (!equipo.aplicaCalibracion || !equipo.fechaUltimaCalibracion) return { status: 'sin_dato', diffDays: null, next: null };
  const last = new Date(equipo.fechaUltimaCalibracion + 'T00:00:00');
  const next = new Date(last); next.setFullYear(next.getFullYear() + 1);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((next - today) / 86400000);
  let status = 'vigente';
  if (diffDays < 0) status = 'vencido'; else if (diffDays <= 30) status = 'proximo';
  return { status, diffDays, next };
}

function getMonthStatus(equipo, monthIdx, year) {
  if (!equipo.aplicaPreventivo) return 'no_aplica';
  const items = (equipo.preventivos || []).filter(p => {
    if (!p.fecha) return false;
    const d = new Date(p.fecha + 'T00:00:00');
    return d.getFullYear() === year && d.getMonth() === monthIdx;
  });
  if (items.length === 0) return 'no_aplica';
  if (items.some(p => p.estado === 'Ejecutado')) return 'realizado';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (items.some(p => new Date(p.fecha + 'T00:00:00') < today)) return 'vencido';
  return 'programado';
}

function historialDe(equipo) {
  const rows = [];
  (equipo.preventivos || []).forEach(p => rows.push({ fecha: p.fecha, tipo: 'Preventivo', detalle: `${p.responsable || 'Sin responsable'} · ${p.estado || ''}` }));
  (equipo.correctivos || []).forEach(c => rows.push({ fecha: c.fecha, tipo: 'Correctivo', detalle: c.fallaReportada || '' }));
  (equipo.calibraciones || []).forEach(c => rows.push({ fecha: c.fecha, tipo: 'Calibración', detalle: c.certificadoUrl ? 'Con certificado' : 'Sin certificado' }));
  (equipo.instalaciones || []).forEach(i => rows.push({ fecha: i.fecha, tipo: 'Instalación', detalle: i.proveedor || '' }));
  return rows.filter(r => r.fecha).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

/* ---------------------------------------------------------------- */
/* PERSISTENCIA                                                      */
/* ---------------------------------------------------------------- */

async function loadEquipos() {
  try {
    const raw = localStorage.getItem('cmms-equipos');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* sin datos aún */ }
  return [];
}
async function saveEquipos(equipos) {
  try { localStorage.setItem('cmms-equipos', JSON.stringify(equipos)); }
  catch (e) { console.error('Error guardando', e); }
}

/* ---------------------------------------------------------------- */
/* COMPONENTES REUTILIZABLES                                         */
/* ---------------------------------------------------------------- */

function KpiCard({ label, value, color, t }) {
  return (
    <div className={`rounded-xl p-4 border relative overflow-hidden ${t.panel} ${t.border}`}>
      <div className="absolute left-0 top-0 h-full w-1" style={{ background: color }} />
      <div className="text-2xl font-bold font-mono">{value}</div>
      <div className={`text-[11px] uppercase tracking-wide mt-1 ${t.muted}`}>{label}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wide text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, t, type = 'text', placeholder }) {
  return (
    <input
      type={type} value={value || ''} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`rounded-md px-2.5 py-1.5 text-xs border ${t.input}`}
    />
  );
}
function SelectInput({ value, onChange, options, t }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} className={`rounded-md px-2.5 py-1.5 text-xs border ${t.input}`}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** Editor genérico de listas de registros (preventivos, correctivos, etc.) */
function RecordList({ t, records, fields, onAdd, onRemove, onUpdate }) {
  const [draft, setDraft] = useState({});
  return (
    <div>
      <div className="space-y-2 mb-3">
        {records.length === 0 && <div className={`text-xs text-center py-4 ${t.muted}`}>Sin registros todavía</div>}
        {records.map((r, i) => (
          <div key={r.id} className={`rounded-lg border p-2.5 ${t.panel3} ${t.border}`}>
            <div className="flex flex-wrap gap-2">
              {fields.map(f => (
                <div key={f.key} className="flex-1 min-w-[120px]">
                  <label className="text-[9px] uppercase text-slate-400">{f.label}</label>
                  {f.type === 'select'
                    ? <SelectInput t={t} value={r[f.key]} options={f.options} onChange={v => onUpdate(i, f.key, v)} />
                    : <TextInput t={t} type={f.type || 'text'} value={r[f.key]} onChange={v => onUpdate(i, f.key, v)} />}
                </div>
              ))}
              <button onClick={() => onRemove(i)} className="self-end text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      <div className={`rounded-lg border p-2.5 ${t.panel3} ${t.border}`}>
        <div className="flex flex-wrap gap-2">
          {fields.map(f => (
            <div key={f.key} className="flex-1 min-w-[120px]">
              <label className="text-[9px] uppercase text-slate-400">{f.label}</label>
              {f.type === 'select'
                ? <SelectInput t={t} value={draft[f.key] || f.options[0]} options={f.options} onChange={v => setDraft({ ...draft, [f.key]: v })} />
                : <TextInput t={t} type={f.type || 'text'} value={draft[f.key]} onChange={v => setDraft({ ...draft, [f.key]: v })} />}
            </div>
          ))}
          <button
            onClick={() => { onAdd(draft); setDraft({}); }}
            className="self-end rounded-md px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
            style={{ background: '#4FD1C5', color: '#0F1419' }}
          ><Plus size={13} /> Agregar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* DRAWER — HOJA DE VIDA                                              */
/* ---------------------------------------------------------------- */

const DRAWER_TABS = ['Información General', 'Cronograma', 'Preventivos', 'Correctivos', 'Calibraciones', 'Instalaciones', 'Documentos', 'Historial'];

function EquipoDrawer({ equipo, onClose, onUpdate, t, accent }) {
  const [tab, setTab] = useState('Información General');
  const c = calibStatus(equipo);
  const year = new Date().getFullYear();

  const patch = (field, value) => onUpdate({ ...equipo, [field]: value });
  const patchList = (field, list) => onUpdate({ ...equipo, [field]: list });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative w-full sm:w-[640px] h-full overflow-y-auto ${t.panel} border-l ${t.border}`}>
        <div className="sticky top-0 z-10 px-5 py-4 border-b flex items-center justify-between" style={{ background: accent, borderColor: accent }}>
          <div>
            <div className="text-white/70 text-[10px] uppercase tracking-wide">{equipo.empresa} · {equipo.sede}</div>
            <div className="text-white text-lg font-bold">{equipo.equipo || 'Equipo sin nombre'}</div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex overflow-x-auto border-b sticky top-[60px] z-10 bg-inherit" style={{ borderColor: 'inherit' }}>
          {DRAWER_TABS.map(tb => (
            <button key={tb} onClick={() => setTab(tb)}
              className={`px-3 py-2.5 text-xs whitespace-nowrap border-b-2 transition ${tab === tb ? 'font-semibold' : `${t.muted} border-transparent`}`}
              style={tab === tb ? { borderColor: accent, color: accent } : {}}>
              {tb}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'Información General' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Empresa"><SelectInput t={t} value={equipo.empresa} options={COMPANIES.map(c => c.key)} onChange={v => onUpdate({ ...equipo, empresa: v, sede: companyOf(v).sedes[0] })} /></Field>
              <Field label="Sede"><SelectInput t={t} value={equipo.sede} options={companyOf(equipo.empresa).sedes} onChange={v => patch('sede', v)} /></Field>
              <Field label="Área"><TextInput t={t} value={equipo.area} onChange={v => patch('area', v)} /></Field>
              <Field label="Servicio"><TextInput t={t} value={equipo.servicio} onChange={v => patch('servicio', v)} /></Field>
              <Field label="Equipo"><TextInput t={t} value={equipo.equipo} onChange={v => patch('equipo', v)} /></Field>
              <Field label="Marca"><TextInput t={t} value={equipo.marca} onChange={v => patch('marca', v)} /></Field>
              <Field label="Modelo"><TextInput t={t} value={equipo.modelo} onChange={v => patch('modelo', v)} /></Field>
              <Field label="Serie"><TextInput t={t} value={equipo.numeroSerie} onChange={v => patch('numeroSerie', v)} /></Field>
              <Field label="Inventario"><TextInput t={t} value={equipo.inventario} onChange={v => patch('inventario', v)} /></Field>
              <Field label="Registro INVIMA"><TextInput t={t} value={equipo.registroInvima} onChange={v => patch('registroInvima', v)} /></Field>
              <Field label="Clasificación de riesgo"><SelectInput t={t} value={equipo.clasificacionRiesgo} options={CLASIFICACIONES} onChange={v => patch('clasificacionRiesgo', v)} /></Field>
              <Field label="Estado"><SelectInput t={t} value={equipo.estado} options={ESTADOS_EQUIPO} onChange={v => patch('estado', v)} /></Field>
              <Field label="Proveedor"><TextInput t={t} value={equipo.proveedor} onChange={v => patch('proveedor', v)} /></Field>
              <Field label="Fabricante"><TextInput t={t} value={equipo.fabricante} onChange={v => patch('fabricante', v)} /></Field>
              <Field label="Fecha de compra"><TextInput t={t} type="date" value={equipo.fechaCompra} onChange={v => patch('fechaCompra', v)} /></Field>
              <Field label="Fecha de instalación"><TextInput t={t} type="date" value={equipo.fechaInstalacion} onChange={v => patch('fechaInstalacion', v)} /></Field>
              <Field label="Garantía hasta"><TextInput t={t} type="date" value={equipo.garantiaHasta} onChange={v => patch('garantiaHasta', v)} /></Field>
              <Field label="Ubicación"><TextInput t={t} value={equipo.ubicacion} onChange={v => patch('ubicacion', v)} /></Field>
              <div className="col-span-2"><Field label="Fotografía (URL)"><TextInput t={t} value={equipo.fotografiaUrl} placeholder="https://..." onChange={v => patch('fotografiaUrl', v)} /></Field></div>
              {equipo.fotografiaUrl && <img src={equipo.fotografiaUrl} alt="Equipo" className="col-span-2 rounded-lg border max-h-48 object-cover" style={{ borderColor: accent }} />}
              <div className="col-span-2 flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={equipo.aplicaCalibracion} onChange={e => patch('aplicaCalibracion', e.target.checked)} /> Aplica calibración</label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={equipo.aplicaPreventivo} onChange={e => patch('aplicaPreventivo', e.target.checked)} /> Aplica preventivo</label>
              </div>
            </div>
          )}

          {tab === 'Cronograma' && (
            <div>
              <p className={`text-xs mb-3 ${t.muted}`}>Línea de tiempo {year} — el color refleja el estado del preventivo registrado ese mes.</p>
              <div className="grid grid-cols-6 sm:grid-cols-4 gap-2">
                {MONTHS.map(m => {
                  const st = getMonthStatus(equipo, m.idx, year);
                  return (
                    <div key={m.k} className={`rounded-lg border p-3 text-center ${t.panel3} ${t.border}`}>
                      <div className="w-3 h-3 rounded-full mx-auto mb-1.5" style={{ background: STATUS_HEX[st] }} />
                      <div className="text-[11px] font-mono">{m.l}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-3 flex-wrap text-[11px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_HEX.realizado }} />Realizado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_HEX.programado }} />Programado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_HEX.vencido }} />Vencido</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_HEX.no_aplica }} />No aplica</span>
              </div>
            </div>
          )}

          {tab === 'Preventivos' && (
            <RecordList t={t} records={equipo.preventivos}
              fields={[
                { key: 'fecha', label: 'Fecha', type: 'date' },
                { key: 'responsable', label: 'Responsable' },
                { key: 'estado', label: 'Estado', type: 'select', options: ['Programado', 'Ejecutado'] },
                { key: 'observaciones', label: 'Observaciones' },
                { key: 'pdfUrl', label: 'PDF (URL)' },
              ]}
              onAdd={(d) => patchList('preventivos', [...equipo.preventivos, { id: uid('pv'), fecha: todayISO(), estado: 'Programado', ...d }])}
              onRemove={(i) => patchList('preventivos', equipo.preventivos.filter((_, idx) => idx !== i))}
              onUpdate={(i, k, v) => { const list = [...equipo.preventivos]; list[i] = { ...list[i], [k]: v }; patchList('preventivos', list); }}
            />
          )}

          {tab === 'Correctivos' && (
            <RecordList t={t} records={equipo.correctivos}
              fields={[
                { key: 'fecha', label: 'Fecha', type: 'date' },
                { key: 'fallaReportada', label: 'Falla reportada' },
                { key: 'diagnostico', label: 'Diagnóstico' },
                { key: 'repuestos', label: 'Repuestos' },
                { key: 'costo', label: 'Costo', type: 'number' },
                { key: 'tiempoFueraServicio', label: 'Tiempo fuera de servicio' },
                { key: 'responsable', label: 'Responsable' },
                { key: 'pdfUrl', label: 'PDF (URL)' },
              ]}
              onAdd={(d) => patchList('correctivos', [...equipo.correctivos, { id: uid('cv'), fecha: todayISO(), ...d }])}
              onRemove={(i) => patchList('correctivos', equipo.correctivos.filter((_, idx) => idx !== i))}
              onUpdate={(i, k, v) => { const list = [...equipo.correctivos]; list[i] = { ...list[i], [k]: v }; patchList('correctivos', list); }}
            />
          )}

          {tab === 'Calibraciones' && (
            <div>
              <div className={`rounded-lg border p-4 mb-4 flex items-center gap-3 ${t.panel3} ${t.border}`}>
                <span className="w-3 h-3 rounded-full" style={{ background: CAL_HEX[c.status] }} />
                <div>
                  <div className="text-sm font-semibold capitalize">{c.status.replace('_', ' ')}</div>
                  <div className={`text-[11px] ${t.muted}`}>
                    {c.status === 'sin_dato' ? 'Aún no hay fecha de última calibración' :
                      c.status === 'vencido' ? `Vencida hace ${Math.abs(c.diffDays)} días` : `Próxima calibración en ${c.diffDays} días`}
                  </div>
                </div>
              </div>
              <RecordList t={t} records={equipo.calibraciones}
                fields={[
                  { key: 'fecha', label: 'Fecha calibración', type: 'date' },
                  { key: 'certificadoUrl', label: 'Certificado (URL)' },
                ]}
                onAdd={(d) => {
                  const list = [...equipo.calibraciones, { id: uid('cb'), fecha: todayISO(), ...d }];
                  const latest = [...list].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
                  onUpdate({ ...equipo, calibraciones: list, fechaUltimaCalibracion: latest.fecha, certificadoUrl: latest.certificadoUrl || equipo.certificadoUrl });
                }}
                onRemove={(i) => patchList('calibraciones', equipo.calibraciones.filter((_, idx) => idx !== i))}
                onUpdate={(i, k, v) => { const list = [...equipo.calibraciones]; list[i] = { ...list[i], [k]: v }; patchList('calibraciones', list); }}
              />
            </div>
          )}

          {tab === 'Instalaciones' && (
            <RecordList t={t} records={equipo.instalaciones}
              fields={[
                { key: 'fecha', label: 'Fecha', type: 'date' },
                { key: 'proveedor', label: 'Proveedor' },
                { key: 'acta', label: 'Acta' },
                { key: 'garantia', label: 'Garantía' },
                { key: 'observaciones', label: 'Observaciones' },
              ]}
              onAdd={(d) => patchList('instalaciones', [...equipo.instalaciones, { id: uid('in'), fecha: todayISO(), ...d }])}
              onRemove={(i) => patchList('instalaciones', equipo.instalaciones.filter((_, idx) => idx !== i))}
              onUpdate={(i, k, v) => { const list = [...equipo.instalaciones]; list[i] = { ...list[i], [k]: v }; patchList('instalaciones', list); }}
            />
          )}

          {tab === 'Documentos' && (
            <RecordList t={t} records={equipo.documentos}
              fields={[
                { key: 'tipo', label: 'Tipo', type: 'select', options: ['Manual', 'Registro INVIMA', 'Certificado', 'Fotografía', 'Factura', 'Acta', 'Otro'] },
                { key: 'nombre', label: 'Nombre' },
                { key: 'url', label: 'Enlace (URL)' },
              ]}
              onAdd={(d) => patchList('documentos', [...equipo.documentos, { id: uid('doc'), tipo: 'Otro', ...d }])}
              onRemove={(i) => patchList('documentos', equipo.documentos.filter((_, idx) => idx !== i))}
              onUpdate={(i, k, v) => { const list = [...equipo.documentos]; list[i] = { ...list[i], [k]: v }; patchList('documentos', list); }}
            />
          )}

          {tab === 'Historial' && (
            <div className="space-y-2">
              {historialDe(equipo).length === 0 && <div className={`text-xs text-center py-6 ${t.muted}`}>Sin eventos registrados todavía</div>}
              {historialDe(equipo).map((r, i) => (
                <div key={i} className={`rounded-lg border p-2.5 flex gap-3 items-start ${t.panel3} ${t.border}`}>
                  <div className="text-[11px] font-mono w-20 shrink-0 pt-0.5">{r.fecha}</div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase" style={{ color: accent }}>{r.tipo}</div>
                    <div className="text-xs">{r.detalle}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* MODAL SIMPLE (observaciones)                                      */
/* ---------------------------------------------------------------- */
function ObsModal({ equipo, onClose, onSave, t, accent }) {
  const [val, setVal] = useState(equipo.observaciones || '');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative w-full max-w-md rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-semibold">Observaciones — {equipo.equipo}</div>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <textarea rows={5} value={val} onChange={e => setVal(e.target.value)} className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input}`} />
        <button onClick={() => { onSave(val); onClose(); }} className="mt-3 rounded-md px-4 py-1.5 text-xs font-semibold" style={{ background: accent, color: '#fff' }}>Guardar</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PANTALLA DE ACCESO                                                 */
/* ---------------------------------------------------------------- */
function LoginScreen({ onLogin }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (user.trim() === AUTH_USER && pass === AUTH_PASS) {
      localStorage.setItem('cmms-auth-ok', 'true');
      setError('');
      onLogin();
    } else {
      setError('Usuario o contraseña incorrectos');
    }
  };

  return (
    <div className="min-h-[700px] h-full flex items-center justify-center bg-slate-950 text-slate-100" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <form onSubmit={submit} className="w-full max-w-sm bg-slate-900 border border-slate-700/60 rounded-xl p-7">
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: '#4FD1C5' }}>CMMS Biomédico</div>
        <h1 className="text-lg font-bold mb-5">Iniciar sesión</h1>

        <label className="text-[10px] uppercase tracking-wide text-slate-400">Usuario</label>
        <input
          autoFocus value={user} onChange={e => setUser(e.target.value)}
          className="w-full mb-3 mt-1 rounded-md px-3 py-2 text-sm bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-teal-400"
        />

        <label className="text-[10px] uppercase tracking-wide text-slate-400">Contraseña</label>
        <input
          type="password" value={pass} onChange={e => setPass(e.target.value)}
          className="w-full mb-4 mt-1 rounded-md px-3 py-2 text-sm bg-slate-950 border border-slate-700 text-slate-100 outline-none focus:border-teal-400"
        />

        {error && <div className="text-xs text-red-400 mb-3">{error}</div>}

        <button type="submit" className="w-full rounded-md py-2 text-sm font-semibold" style={{ background: '#4FD1C5', color: '#0F1419' }}>
          Entrar
        </button>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* APP PRINCIPAL                                                     */
/* ---------------------------------------------------------------- */

function MainApp({ onLogout }) {
  const [equipos, setEquipos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [dark, setDark] = useState(true);
  const [menu, setMenu] = useState('dashboard');
  const [activeCompany, setActiveCompany] = useState('TODAS');
  const [filters, setFilters] = useState({ sede: '', ubicacion: '', estado: '', marca: '', clasificacion: '' });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'equipo', dir: 1 });
  const [drawerId, setDrawerId] = useState(null);
  const [obsModalId, setObsModalId] = useState(null);

  useEffect(() => { loadEquipos().then(d => { setEquipos(d); setLoaded(true); }); }, []);
  useEffect(() => { if (loaded) saveEquipos(equipos); }, [equipos, loaded]);

  const accent = activeCompany === 'TODAS' ? '#4FD1C5' : companyOf(activeCompany).color;

  const t = dark
    ? { bg: 'bg-slate-950', panel: 'bg-slate-900', panel3: 'bg-slate-800/60', border: 'border-slate-700/60', text: 'text-slate-100', muted: 'text-slate-400', input: 'bg-slate-950 border-slate-700 text-slate-100' }
    : { bg: 'bg-slate-50', panel: 'bg-white', panel3: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-900', muted: 'text-slate-500', input: 'bg-white border-slate-300 text-slate-900' };

  const updateEquipo = (updated) => setEquipos(prev => prev.map(e => e.id === updated.id ? updated : e));
  const removeEquipo = (id) => setEquipos(prev => prev.filter(e => e.id !== id));
  const duplicateEquipo = (eq) => setEquipos(prev => [...prev, { ...eq, id: uid('eq'), equipo: eq.equipo + ' (copia)' }]);
  const addEquipo = () => { const n = newEquipo(activeCompany === 'TODAS' ? COMPANIES[0].key : activeCompany); setEquipos(prev => [...prev, n]); setDrawerId(n.id); };

  const filtered = useMemo(() => {
    let list = equipos;
    if (activeCompany !== 'TODAS') list = list.filter(e => e.empresa === activeCompany);
    if (filters.sede) list = list.filter(e => e.sede === filters.sede);
    if (filters.ubicacion) list = list.filter(e => e.ubicacion === filters.ubicacion);
    if (filters.estado) list = list.filter(e => e.estado === filters.estado);
    if (filters.marca) list = list.filter(e => e.marca === filters.marca);
    if (filters.clasificacion) list = list.filter(e => e.clasificacionRiesgo === filters.clasificacion);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(e => [e.equipo, e.marca, e.modelo, e.numeroSerie, e.inventario].join(' ').toLowerCase().includes(s));
    }
    list = [...list].sort((a, b) => {
      const av = (a[sort.key] || '').toString().toLowerCase();
      const bv = (b[sort.key] || '').toString().toLowerCase();
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
    });
    return list;
  }, [equipos, activeCompany, filters, search, sort]);

  const drawerEquipo = equipos.find(e => e.id === drawerId);
  const obsEquipo = equipos.find(e => e.id === obsModalId);

  /* ---- Excel export / import ---- */
  const exportExcel = () => {
    const year = new Date().getFullYear();
    const rows = filtered.map(e => {
      const row = {
        EMPRESA: e.empresa, SEDE: e.sede,
        EQUIPO: e.equipo, MARCA: e.marca, MODELO: e.modelo, 'NUMERO DE SERIE': e.numeroSerie,
        'REGISTRO INVIMA': e.registroInvima, 'CLASIFICACION DE RIESGO': e.clasificacionRiesgo, INVENTARIO: e.inventario,
      };
      MONTHS.forEach(m => { row[m.l.toUpperCase()] = getMonthStatus(e, m.idx, year); });
      row.CALIBRACION = e.aplicaCalibracion ? 'SI' : 'NO';
      row.PREVENTIVO = e.aplicaPreventivo ? 'SI' : 'NO';
      row['UBICACIÓN'] = e.ubicacion;
      row['FECHA DE ULTIMA CALIBRACION'] = e.fechaUltimaCalibracion;
      const cs = calibStatus(e);
      row['PRÓXIMA CALIBRACIÓN'] = cs.next ? cs.next.toISOString().slice(0, 10) : '';
      row.ESTADO = e.estado;
      row['CERTIFICADO DE CALIBRACION'] = e.certificadoUrl;
      row.OBSERVACIONES = e.observaciones;
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, 'inventario-biomedico.xlsx');
  };
  const importExcel = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      const imported = rows.filter(r => r.EQUIPO).map(r => {
        const empresaKey = COMPANIES.find(c => c.key.toUpperCase() === (r.EMPRESA || '').toString().trim().toUpperCase())?.key
          || (activeCompany === 'TODAS' ? COMPANIES[0].key : activeCompany);
        const co = companyOf(empresaKey);
        const sedeVal = co.sedes.find(s => s.toUpperCase() === (r.SEDE || '').toString().trim().toUpperCase()) || co.sedes[0];
        return {
          ...newEquipo(empresaKey),
          sede: sedeVal,
          equipo: r.EQUIPO || '', marca: r.MARCA || '', modelo: r.MODELO || '',
          numeroSerie: r['NUMERO DE SERIE'] || '', registroInvima: r['REGISTRO INVIMA'] || '',
          clasificacionRiesgo: r['CLASIFICACION DE RIESGO'] || 'IIB', inventario: r.INVENTARIO || '',
          ubicacion: r['UBICACIÓN'] || '', fechaUltimaCalibracion: r['FECHA DE ULTIMA CALIBRACION'] || '',
          estado: r.ESTADO || 'Operativo', certificadoUrl: r['CERTIFICADO DE CALIBRACION'] || '', observaciones: r.OBSERVACIONES || '',
        };
      });
      setEquipos(prev => [...prev, ...imported]);
    };
    reader.readAsBinaryString(file);
  };

  const uniqueVals = (key) => [...new Set(equipos.map(e => e[key]).filter(Boolean))];

  /* ---------------------------------------------------------------- */
  return (
    <div className={`flex h-full min-h-[700px] font-sans ${t.bg} ${t.text}`} style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* SIDEBAR */}
      <div className={`w-56 shrink-0 border-r flex flex-col ${t.panel} ${t.border}`}>
        <div className="px-4 py-5 border-b" style={{ borderColor: 'inherit' }}>
          <div className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>CMMS Biomédico</div>
          <div className="text-sm font-bold mt-0.5">Gestión de equipos</div>
        </div>
        <div className="flex-1 py-3">
          {MENU.map(m => {
            const Icon = m.icon;
            const active = menu === m.key;
            return (
              <button key={m.key} onClick={() => setMenu(m.key)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left transition ${active ? 'font-semibold' : t.muted}`}
                style={active ? { background: accent + '1A', color: accent, borderRight: `2px solid ${accent}` } : {}}>
                <Icon size={15} /> {m.label}
              </button>
            );
          })}
        </div>
        <div className="p-4 border-t space-y-2" style={{ borderColor: 'inherit' }}>
          <button onClick={() => setDark(!dark)} className={`w-full flex items-center justify-center gap-2 rounded-md py-2 text-xs border ${t.border}`}>
            {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? 'Modo claro' : 'Modo oscuro'}
          </button>
          <button onClick={onLogout} className={`w-full rounded-md py-2 text-xs border ${t.border} ${t.muted}`}>
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Empresa pills */}
        <div className="flex gap-2 flex-wrap mb-5">
          <button onClick={() => setActiveCompany('TODAS')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-mono border ${t.border}`}
            style={activeCompany === 'TODAS' ? { background: '#4FD1C51A', borderColor: '#4FD1C5', color: '#4FD1C5' } : {}}>
            Todas las empresas
          </button>
          {COMPANIES.map(c => (
            <button key={c.key} onClick={() => setActiveCompany(c.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-mono border ${t.border}`}
              style={activeCompany === c.key ? { background: c.color + '22', borderColor: c.color, color: c.color } : {}}>
              {c.key}
            </button>
          ))}
        </div>

        {menu === 'dashboard' && <Dashboard equipos={equipos} activeCompany={activeCompany} accent={accent} t={t} />}
        {menu === 'empresas' && <EmpresasPage equipos={equipos} t={t} onSelect={(k) => { setActiveCompany(k); setMenu('inventario'); }} />}
        {(menu === 'inventario' || menu === 'mantenimientos' || menu === 'calibraciones' || menu === 'correctivos') && (
          <InventarioPage
            mode={menu} equipos={filtered} allEquipos={equipos} t={t} accent={accent}
            filters={filters} setFilters={setFilters} search={search} setSearch={setSearch}
            sort={sort} setSort={setSort} uniqueVals={uniqueVals}
            onOpen={setDrawerId} onObs={setObsModalId}
            onAdd={addEquipo} onDuplicate={duplicateEquipo} onRemove={removeEquipo}
            onExport={exportExcel} onImport={importExcel}
          />
        )}
        {menu === 'reportes' && <ReportesPage equipos={equipos} t={t} accent={accent} onExport={exportExcel} />}
        {menu === 'configuracion' && <ConfigPage t={t} accent={accent} onReset={() => { if (confirm('¿Borrar todos los equipos guardados?')) setEquipos([]); }} onLogout={onLogout} />}
      </div>

      {drawerEquipo && <EquipoDrawer equipo={drawerEquipo} onClose={() => setDrawerId(null)} onUpdate={updateEquipo} t={t} accent={accent} />}
      {obsEquipo && <ObsModal equipo={obsEquipo} onClose={() => setObsModalId(null)} onSave={(v) => updateEquipo({ ...obsEquipo, observaciones: v })} t={t} accent={accent} />}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PÁGINA: DASHBOARD                                                  */
/* ---------------------------------------------------------------- */
function Dashboard({ equipos, activeCompany, accent, t }) {
  const scoped = activeCompany === 'TODAS' ? equipos : equipos.filter(e => e.empresa === activeCompany);
  const year = new Date().getFullYear(); const month = new Date().getMonth();

  let prevProgramados = 0, prevEjecutados = 0, correctivosAbiertos = 0;
  let calVigente = 0, calProximo = 0, calVencido = 0;
  let fueraServicio = 0;
  scoped.forEach(e => {
    (e.preventivos || []).forEach(p => {
      if (!p.fecha) return;
      const d = new Date(p.fecha + 'T00:00:00');
      if (d.getFullYear() === year && d.getMonth() === month) { prevProgramados++; if (p.estado === 'Ejecutado') prevEjecutados++; }
    });
    correctivosAbiertos += (e.correctivos || []).length;
    const cs = calibStatus(e);
    if (cs.status === 'vigente') calVigente++; else if (cs.status === 'proximo') calProximo++; else if (cs.status === 'vencido') calVencido++;
    if (e.estado === 'Fuera de servicio') fueraServicio++;
  });
  const disponibilidad = scoped.length ? Math.round(((scoped.length - fueraServicio) / scoped.length) * 100) : 0;

  const porEmpresa = COMPANIES.map(c => ({
    name: c.key.length > 10 ? c.key.slice(0, 9) + '…' : c.key,
    preventivos: equipos.filter(e => e.empresa === c.key).reduce((acc, e) => acc + (e.preventivos || []).length, 0),
    fill: c.color,
  }));
  const estadoPie = ESTADOS_EQUIPO.map((s, i) => ({ name: s, value: scoped.filter(e => e.estado === s).length, fill: ['#22C55E', '#EF4444', '#F59E0B', '#64748B'][i] }));
  const calPie = [
    { name: 'Vigente', value: calVigente, fill: '#22C55E' },
    { name: 'Próxima', value: calProximo, fill: '#F59E0B' },
    { name: 'Vencida', value: calVencido, fill: '#EF4444' },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard t={t} label="Total equipos" value={scoped.length} color={accent} />
        <KpiCard t={t} label="Preventivos programados (mes)" value={prevProgramados} color="#F59E0B" />
        <KpiCard t={t} label="Preventivos ejecutados (mes)" value={prevEjecutados} color="#22C55E" />
        <KpiCard t={t} label="Correctivos registrados" value={correctivosAbiertos} color="#EF4444" />
        <KpiCard t={t} label="Disponibilidad operacional" value={disponibilidad + '%'} color="#0EA5E9" />
        <KpiCard t={t} label="Calibraciones vigentes" value={calVigente} color="#22C55E" />
        <KpiCard t={t} label="Próximas a vencer" value={calProximo} color="#F59E0B" />
        <KpiCard t={t} label="Vencidas" value={calVencido} color="#EF4444" />
        <KpiCard t={t} label="Fuera de servicio" value={fueraServicio} color="#64748B" />
        <KpiCard t={t} label="Preventivos pendientes (mes)" value={Math.max(prevProgramados - prevEjecutados, 0)} color="#F59E0B" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className={`rounded-xl border p-4 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Preventivos por empresa</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porEmpresa}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
              <Bar dataKey="preventivos" radius={[4, 4, 0, 0]}>
                {porEmpresa.map((p, i) => <Cell key={i} fill={p.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={`rounded-xl border p-4 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Estado general de equipos</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={estadoPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                {estadoPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className={`rounded-xl border p-4 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Calibraciones</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={calPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                {calPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className={`rounded-xl border p-4 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Cumplimiento del cronograma (mes actual)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={[{ name: 'Este mes', Programados: prevProgramados, Ejecutados: prevEjecutados }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Programados" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Ejecutados" fill="#22C55E" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PÁGINA: EMPRESAS                                                   */
/* ---------------------------------------------------------------- */
function EmpresasPage({ equipos, t, onSelect }) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {COMPANIES.map(c => {
        const list = equipos.filter(e => e.empresa === c.key);
        const vencidas = list.filter(e => calibStatus(e).status === 'vencido').length;
        return (
          <button key={c.key} onClick={() => onSelect(c.key)}
            className={`text-left rounded-xl border p-5 hover:-translate-y-0.5 transition ${t.panel} ${t.border}`}
            style={{ borderTop: `3px solid ${c.color}` }}>
            <div className="text-sm font-bold mb-1" style={{ color: c.color }}>{c.key}</div>
            <div className={`text-[11px] ${t.muted} mb-3`}>{c.sedes.length} sede{c.sedes.length !== 1 ? 's' : ''}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono">{list.length}</span>
              <span className={`text-[11px] ${t.muted}`}>equipos</span>
            </div>
            {vencidas > 0 && <div className="text-[11px] mt-2 text-red-400">{vencidas} calibración(es) vencida(s)</div>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PÁGINA: INVENTARIO / MANTENIMIENTOS / CALIBRACIONES / CORRECTIVOS   */
/* ---------------------------------------------------------------- */
const INVENTORY_HEAD = [
  { key: 'equipo', label: 'EQUIPO' }, { key: 'marca', label: 'MARCA' }, { key: 'modelo', label: 'MODELO' },
  { key: 'numeroSerie', label: 'N° SERIE' }, { key: 'registroInvima', label: 'REG. INVIMA' },
  { key: 'clasificacionRiesgo', label: 'RIESGO' }, { key: 'inventario', label: 'INVENTARIO' },
];

function InventarioPage({ mode, equipos, allEquipos, t, accent, filters, setFilters, search, setSearch, sort, setSort, uniqueVals, onOpen, onObs, onAdd, onDuplicate, onRemove, onExport, onImport }) {
  const year = new Date().getFullYear();
  const title = { inventario: 'Inventario de equipos', mantenimientos: 'Mantenimientos preventivos', calibraciones: 'Calibraciones', correctivos: 'Correctivos' }[mode];

  const toggleSort = (key) => setSort(s => ({ key, dir: s.key === key ? -s.dir : 1 }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-bold">{title}</h1>
        {mode === 'inventario' && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={onAdd} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: accent, color: '#fff' }}><Plus size={13} /> Agregar equipo</button>
            <button onClick={onExport} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs border ${t.border}`}><Download size={13} /> Exportar Excel</button>
            <label className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs border cursor-pointer ${t.border}`}>
              <Upload size={13} /> Importar Excel
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files[0] && onImport(e.target.files[0])} />
            </label>
            <button onClick={() => window.print()} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs border ${t.border}`}><FileText size={13} /> Exportar / Imprimir PDF</button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border ${t.border} ${t.panel}`}>
          <Search size={13} className={t.muted} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar equipo, marca, serie…" className={`bg-transparent text-xs outline-none w-40 ${t.text}`} />
        </div>
        <select value={filters.sede} onChange={e => setFilters({ ...filters, sede: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todas las sedes</option>
          {uniqueVals('sede').map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.ubicacion} onChange={e => setFilters({ ...filters, ubicacion: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda ubicación</option>
          {uniqueVals('ubicacion').map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.estado} onChange={e => setFilters({ ...filters, estado: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo estado</option>
          {ESTADOS_EQUIPO.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.marca} onChange={e => setFilters({ ...filters, marca: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda marca</option>
          {uniqueVals('marca').map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.clasificacion} onChange={e => setFilters({ ...filters, clasificacion: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda clasificación</option>
          {CLASIFICACIONES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {mode === 'inventario' && (
        <div className={`rounded-xl border overflow-x-auto ${t.panel} ${t.border}`}>
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className={`border-b ${t.border}`}>
                {INVENTORY_HEAD.map(h => (
                  <th key={h.key} onClick={() => toggleSort(h.key)} className={`text-left px-3 py-2.5 font-mono text-[10px] uppercase cursor-pointer select-none ${t.muted}`}>
                    <span className="inline-flex items-center gap-1">{h.label}<ArrowUpDown size={10} /></span>
                  </th>
                ))}
                {MONTHS.map(m => <th key={m.k} className={`px-2 py-2.5 font-mono text-[10px] ${t.muted}`}>{m.l}</th>)}
                <th className={`px-3 py-2.5 font-mono text-[10px] uppercase ${t.muted}`}>CALIB.</th>
                <th className={`px-3 py-2.5 font-mono text-[10px] uppercase ${t.muted}`}>PREV.</th>
                <th className={`px-3 py-2.5 font-mono text-[10px] uppercase ${t.muted}`}>UBICACIÓN</th>
                <th className={`px-3 py-2.5 font-mono text-[10px] uppercase ${t.muted}`}>ÚLT. CALIB.</th>
                <th className={`px-3 py-2.5 font-mono text-[10px] uppercase ${t.muted}`}>PRÓX. CALIB.</th>
                <th className={`px-3 py-2.5 font-mono text-[10px] uppercase ${t.muted}`}>ESTADO</th>
                <th className={`px-3 py-2.5 font-mono text-[10px] uppercase ${t.muted}`}>CERTIFICADO</th>
                <th className={`px-3 py-2.5 font-mono text-[10px] uppercase ${t.muted}`}>OBS.</th>
                <th className={`px-3 py-2.5 font-mono text-[10px] uppercase ${t.muted}`}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {equipos.length === 0 && (
                <tr><td colSpan={22} className={`text-center py-8 text-xs ${t.muted}`}>Sin equipos — usa "Agregar equipo" para empezar</td></tr>
              )}
              {equipos.map(e => {
                const cs = calibStatus(e);
                const co = companyOf(e.empresa);
                return (
                  <tr key={e.id} className={`border-b cursor-pointer hover:bg-white/5 ${t.border}`} style={{ borderLeft: `3px solid ${co.color}` }} onClick={() => onOpen(e.id)}>
                    <td className="px-3 py-2 font-semibold">{e.equipo || '—'}</td>
                    <td className="px-3 py-2">{e.marca || '—'}</td>
                    <td className="px-3 py-2">{e.modelo || '—'}</td>
                    <td className="px-3 py-2">{e.numeroSerie || '—'}</td>
                    <td className="px-3 py-2">{e.registroInvima || '—'}</td>
                    <td className="px-3 py-2">{e.clasificacionRiesgo}</td>
                    <td className="px-3 py-2">{e.inventario || '—'}</td>
                    {MONTHS.map(m => {
                      const st = getMonthStatus(e, m.idx, year);
                      const items = (e.preventivos || []).filter(p => p.fecha && new Date(p.fecha + 'T00:00:00').getMonth() === m.idx && new Date(p.fecha + 'T00:00:00').getFullYear() === year);
                      const tip = items.map(p => p.fecha).join(', ') || 'Sin fecha';
                      return <td key={m.k} className="px-2 py-2 text-center" title={tip}><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STATUS_HEX[st] }} /></td>;
                    })}
                    <td className="px-3 py-2 text-center">{e.aplicaCalibracion ? '✓' : '—'}</td>
                    <td className="px-3 py-2 text-center">{e.aplicaPreventivo ? '✓' : '—'}</td>
                    <td className="px-3 py-2">{e.ubicacion || '—'}</td>
                    <td className="px-3 py-2">{e.fechaUltimaCalibracion || '—'}</td>
                    <td className="px-3 py-2">{cs.next ? cs.next.toISOString().slice(0, 10) : '—'}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ background: (e.estado === 'Operativo' ? '#22C55E' : e.estado === 'Dado de baja' ? '#EF4444' : '#F59E0B') + '22', color: e.estado === 'Operativo' ? '#22C55E' : e.estado === 'Dado de baja' ? '#EF4444' : '#F59E0B' }}>{e.estado}</span>
                    </td>
                    <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                      {e.certificadoUrl
                        ? <a href={e.certificadoUrl} target="_blank" rel="noreferrer" className="text-[11px] underline" style={{ color: accent }}>📄 Ver certificado</a>
                        : <span className={`text-[11px] ${t.muted}`}>Sin certificado</span>}
                    </td>
                    <td className="px-3 py-2 text-center" onClick={ev => { ev.stopPropagation(); onObs(e.id); }}>
                      <MessageCircle size={14} className={e.observaciones ? '' : t.muted} style={e.observaciones ? { color: accent } : {}} />
                    </td>
                    <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                      <div className="flex gap-2">
                        <button onClick={() => onDuplicate(e)} title="Duplicar"><Copy size={13} className={t.muted} /></button>
                        <button onClick={() => onRemove(e.id)} title="Eliminar"><Trash2 size={13} className="text-red-400" /></button>
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
                  <div className={`text-[11px] ${t.muted}`}>{e.empresa} · {e.sede}</div>
                </div>
                <div className="text-[11px] font-mono capitalize" style={{ color: CAL_HEX[cs.status] }}>{cs.status.replace('_', ' ')}</div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'mantenimientos' && (
        <div className="space-y-2">
          {equipos.flatMap(e => (e.preventivos || []).map(p => ({ ...p, equipoNombre: e.equipo, equipoId: e.id, empresa: e.empresa, sede: e.sede })))
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .map((p, i) => (
              <div key={i} onClick={() => onOpen(p.equipoId)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.estado === 'Ejecutado' ? '#22C55E' : '#F59E0B' }} />
                <div className="flex-1">
                  <div className="text-xs font-semibold">{p.equipoNombre}</div>
                  <div className={`text-[11px] ${t.muted}`}>{p.empresa} · {p.sede} · {p.responsable || 'sin responsable'}</div>
                </div>
                <div className="text-[11px] font-mono">{p.fecha}</div>
              </div>
            ))}
        </div>
      )}

      {mode === 'correctivos' && (
        <div className="space-y-2">
          {equipos.flatMap(e => (e.correctivos || []).map(c => ({ ...c, equipoNombre: e.equipo, equipoId: e.id, empresa: e.empresa, sede: e.sede })))
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .map((c, i) => (
              <div key={i} onClick={() => onOpen(c.equipoId)} className={`rounded-lg border p-3 cursor-pointer ${t.panel} ${t.border}`}>
                <div className="flex justify-between">
                  <div className="text-xs font-semibold">{c.equipoNombre}</div>
                  <div className="text-[11px] font-mono">{c.fecha}</div>
                </div>
                <div className={`text-[11px] ${t.muted}`}>{c.fallaReportada || 'Sin descripción'}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PÁGINA: REPORTES                                                   */
/* ---------------------------------------------------------------- */
function ReportesPage({ equipos, t, accent, onExport }) {
  const reportes = [
    'Reporte mensual', 'Reporte anual', 'Reporte por empresa', 'Reporte por sede',
    'Reporte por técnico', 'Reporte de calibraciones', 'Reporte de correctivos', 'Reporte de preventivos',
  ];
  return (
    <div>
      <h1 className="text-lg font-bold mb-4">Reportes</h1>
      <p className={`text-xs mb-5 ${t.muted}`}>Exporta el inventario completo con todos los datos actuales a Excel. Para un PDF, usa "Exportar / Imprimir PDF" desde Inventario.</p>
      <div className="grid md:grid-cols-2 gap-3">
        {reportes.map(r => (
          <div key={r} className={`rounded-lg border p-4 flex items-center justify-between ${t.panel} ${t.border}`}>
            <span className="text-xs font-semibold">{r}</span>
            <button onClick={onExport} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold" style={{ background: accent, color: '#fff' }}><Download size={12} /> Excel</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PÁGINA: CONFIGURACIÓN                                              */
/* ---------------------------------------------------------------- */
function ConfigPage({ t, accent, onReset, onLogout }) {
  return (
    <div>
      <h1 className="text-lg font-bold mb-4">Configuración</h1>
      <div className={`rounded-lg border p-4 max-w-md mb-4 ${t.panel} ${t.border}`}>
        <div className="text-xs font-semibold mb-1">Restablecer datos</div>
        <p className={`text-[11px] mb-3 ${t.muted}`}>Elimina todos los equipos guardados en este panel. Esta acción no se puede deshacer.</p>
        <button onClick={onReset} className="rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: '#EF4444' }}>Borrar todos los datos</button>
      </div>
      <div className={`rounded-lg border p-4 max-w-md ${t.panel} ${t.border}`}>
        <div className="text-xs font-semibold mb-1">Sesión</div>
        <p className={`text-[11px] mb-3 ${t.muted}`}>Cierra tu sesión en este navegador. Te pedirá usuario y contraseña de nuevo.</p>
        <button onClick={onLogout} className={`rounded-md px-3 py-1.5 text-xs font-semibold border ${t.border}`}>Cerrar sesión</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* WRAPPER DE ACCESO                                                  */
/* ---------------------------------------------------------------- */
export default function App() {
  const [authed, setAuthed] = useState(() => {
    try { return localStorage.getItem('cmms-auth-ok') === 'true'; } catch (e) { return false; }
  });

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return <MainApp onLogout={() => { localStorage.removeItem('cmms-auth-ok'); setAuthed(false); }} />;
}
