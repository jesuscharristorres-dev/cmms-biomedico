// src/components/equipos/EquipoDrawer.jsx
// Hoja de vida del equipo — el drawer que se abre desde Inventario con las 9 pestañas
// (Información General, Cronograma, Preventivos, Correctivos, Calibraciones, Instalaciones,
// Baja de Equipo, Documentos, Historial). Orquesta CalibracionesTab, DocumentosTab y
// ReporteTecnicoButton; el resto de pestañas siguen usando el RecordList genérico.

import { useState } from 'react';
import { Lock, ExternalLink, X, IdCard, Image as ImageIcon, FileBarChart } from 'lucide-react';
import { Field, SelectInput, TextInput, PdfLink, RecordList } from '../ui.jsx';
import { companyOf, COMPANIES, themeOf, normSede } from '../../data/empresas.js';
import { MONTHS, STATUS_LABEL, STATUS_HEX, CLASIFICACIONES } from '../../data/equipos.js';
import { calibStatus, aplicaCalibracionEfectiva } from '../../services/alertLogic';
import { preventivoDelMes } from '../../services/preventivoSchedule';
import { formatFechaCorta, todayISO } from '../../utils/fechas.js';
import { uid } from '../../utils/id.js';
import CalibracionesTab from './CalibracionesTab.jsx';
import DocumentosTab from './DocumentosTab.jsx';
import ReporteTecnicoButton from './ReporteTecnico.jsx';
import logoIngenieriaClinica from '../../assets/logo-ingenieria-clinica.png';

const DRAWER_TABS = ['Información General', 'Cronograma', 'Preventivos', 'Correctivos', 'Calibraciones', 'Instalaciones', 'Baja de Equipo', 'Documentos', 'Historial'];
const PROPIEDAD_OPCIONES = ['Propio', 'Comodato'];
const PERIODICIDADES = ['Mensual', 'Bimestral', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual', 'N/A'];

// Delegado a preventivoSchedule.js (única fuente de verdad): la próxima fecha se calcula
// automáticamente a partir de la periodicidad del equipo y el último preventivo EJECUTADO
// (o su fecha de instalación si nunca ha tenido uno) — ya no depende de que exista un
// registro manual "programado" para ese mes exacto.
function getMonthStatus(equipo, monthIdx, year) {
  return preventivoDelMes(equipo, monthIdx, year).status;
}

function historialDe(equipo) {
  const rows = [];
  (equipo.preventivos || []).forEach(p => rows.push({ fecha: p.fecha, tipo: 'Preventivo', detalle: `${p.responsable || 'Sin responsable'} · ${p.estado || ''}`, reporte: !!p.reporteTecnico }));
  (equipo.correctivos || []).forEach(c => rows.push({ fecha: c.fecha, tipo: 'Correctivo', detalle: `${c.responsable || 'Sin responsable'} · ${c.estado || ''}`, reporte: !!c.reporteTecnico }));
  (equipo.calibraciones || []).forEach(c => rows.push({ fecha: c.fecha, tipo: 'Calibración', detalle: c.certificadoUrl ? 'Con certificado' : 'Sin certificado' }));
  (equipo.instalaciones || []).forEach(i => rows.push({ fecha: i.fecha, tipo: 'Instalación', detalle: i.proveedor || '', reporte: !!i.reporteTecnico }));
  (equipo.bajas || []).forEach(b => rows.push({ fecha: b.fecha, tipo: 'Baja de equipo', detalle: b.motivo || '', reporte: !!b.reporteTecnico }));
  return rows.filter(r => r.fecha).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

// Opciones del selector de sede de la hoja de vida: siempre incluye la sede ACTUAL del equipo
// (aunque no esté en la lista de la empresa) — sin esto el <select> mostraría otra sede que
// no es la del equipo, y cualquier clic podía cambiarla sin querer.
function opcionesSede(sedes, actual) {
  if (!actual || sedes.some(s => normSede(s) === normSede(actual))) return sedes;
  return [actual, ...sedes];
}

export default function EquipoDrawer({ equipo, onClose, onUpdate, t, readOnly }) {
  const [tab, setTab] = useState('Información General');
  const c = calibStatus(equipo);
  const year = new Date().getFullYear();
  // La hoja de vida siempre usa el color de LA EMPRESA DEL EQUIPO, sin importar el filtro activo del Dashboard.
  const brand = themeOf(equipo.empresa);
  const accent = brand.solid;
  const accentBg = brand.bg;

  const patch = (field, value) => onUpdate({ ...equipo, [field]: value });
  const patchList = (field, list) => onUpdate({ ...equipo, [field]: list });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`animate-drawer-in relative w-full sm:w-1/2 sm:min-w-[640px] max-w-full h-full overflow-hidden ${t.panel} border-l ${t.border}`}>
        {/* Marca de agua — el mismo logo del Login (logoIngenieriaClinica), fija dentro del
            panel mientras el contenido hace scroll: vive en este contenedor no-scrolleable,
            detrás del div interno que sí scrollea. pointer-events-none para no interferir
            con clics/selección de texto debajo. */}
        <div className="absolute inset-0 flex items-center justify-start pointer-events-none" aria-hidden="true">
          <img src={logoIngenieriaClinica} alt=""
            style={{ width: 'min(120%, 47rem)', height: 'auto', objectFit: 'contain', opacity: 0.13, transform: 'translateX(-6%)' }} />
        </div>
        <div className="relative h-full overflow-y-auto">
        <div className="sticky top-0 z-10 px-5 py-4 border-b flex items-center justify-between" style={{ background: accentBg, borderColor: accent }}>
          <div>
            <div className="text-white/70 text-3xs uppercase tracking-wide flex items-center gap-1.5">
              {equipo.empresa} · {equipo.sede} {readOnly && <span className="inline-flex items-center gap-1 bg-black/25 rounded-full px-1.5 py-0.5"><Lock size={9} /> solo lectura</span>}
            </div>
            <div className="text-white text-lg font-bold">{equipo.equipo || 'Equipo sin nombre'}</div>
          </div>
          <div className="flex items-center gap-1.5">
            {equipo.empresa === 'MACROMED' && (
              <button onClick={() => window.open('https://kawak.com.co/macromed/ce_control_equipos/equ_consulta.php?oxm_id=61', '_blank', 'noopener,noreferrer')}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold bg-black/20 text-white hover:bg-black/30 transition">
                <ExternalLink size={13} /> KAWAK
              </button>
            )}
            <button onClick={onClose} aria-label="Cerrar" className="flex items-center justify-center w-11 h-11 -mr-2 text-white/80 hover:text-white"><X size={20} /></button>
          </div>
        </div>

        <div className="flex overflow-x-auto border-b sticky top-[60px] z-10 bg-inherit" style={{ borderColor: 'inherit' }}>
          {DRAWER_TABS.map(tb => (
            <button key={tb} onClick={() => setTab(tb)}
              className={`px-3 min-h-11 flex items-center whitespace-nowrap text-xs border-b-2 transition ${tab === tb ? 'font-semibold' : `${t.muted} border-transparent`}`}
              style={tab === tb ? { borderColor: accent, color: accent } : {}}>
              {tb}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'Información General' && (
            <div className="relative pr-40 sm:pr-72">
              <div className="flex items-center gap-2 mb-3">
                <IdCard size={16} style={{ color: accent }} />
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: accent }}>Hoja de vida</h2>
              </div>
              {/* Fotografía — flotante en la esquina superior derecha, fuera del flujo de la grilla
                  para que los campos de la izquierda no dependan de su altura. Más pequeña en
                  pantallas angostas (drawer a ancho completo) para no aplastar la grilla. */}
              <div className="absolute top-0 right-0 w-36 sm:w-64">
                <div className={`w-36 h-36 sm:w-64 sm:h-64 rounded-lg border overflow-hidden flex items-center justify-center ${t.panel3} ${t.border}`}>
                  {equipo.fotografiaUrl
                    ? <img src={equipo.fotografiaUrl} alt="Equipo" className="w-full h-full object-contain" />
                    : (
                      <div className={`flex flex-col items-center gap-1 text-center px-2 ${t.muted}`}>
                        <ImageIcon size={36} />
                        <span className="text-3xs leading-tight">Sin fotografía</span>
                      </div>
                    )}
                </div>
                {!readOnly && (
                  <input value={equipo.fotografiaUrl || ''} placeholder="URL de la foto" onChange={e => patch('fotografiaUrl', e.target.value)}
                    className={`mt-1.5 w-36 sm:w-64 rounded-md px-1.5 py-1 text-3xs border ${t.input}`} />
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                <Field dense label="Empresa"><SelectInput dense t={t} disabled={readOnly} value={equipo.empresa} options={COMPANIES.map(c => c.key)} onChange={v => onUpdate({ ...equipo, empresa: v, sede: companyOf(v).sedes[0] })} /></Field>
                <Field dense label="Sede"><SelectInput dense upper t={t} disabled={readOnly} value={equipo.sede} options={opcionesSede(companyOf(equipo.empresa).sedes, equipo.sede)} onChange={v => patch('sede', v)} /></Field>
                <Field dense label="Equipo"><TextInput dense t={t} disabled={readOnly} value={equipo.equipo} onChange={v => patch('equipo', v)} /></Field>
                <Field dense label="Marca"><TextInput dense t={t} disabled={readOnly} value={equipo.marca} onChange={v => patch('marca', v)} /></Field>
                <Field dense label="Modelo"><TextInput dense t={t} disabled={readOnly} value={equipo.modelo} onChange={v => patch('modelo', v)} /></Field>
                <Field dense label="Serie"><TextInput dense t={t} disabled={readOnly} value={equipo.numeroSerie} onChange={v => patch('numeroSerie', v)} /></Field>
                <Field dense label="Registro INVIMA"><TextInput dense t={t} disabled={readOnly} value={equipo.registroInvima} onChange={v => patch('registroInvima', v)} /></Field>
                <Field dense label="Clasificación de riesgo"><SelectInput dense t={t} disabled={readOnly} value={equipo.clasificacionRiesgo} options={CLASIFICACIONES} onChange={v => patch('clasificacionRiesgo', v)} /></Field>
                <Field dense label="Inventario"><TextInput dense t={t} disabled={readOnly} value={equipo.inventario} onChange={v => patch('inventario', v)} /></Field>
                <Field dense label="Propiedad"><SelectInput dense t={t} disabled={readOnly} value={equipo.propiedad || 'Propio'} options={PROPIEDAD_OPCIONES} onChange={v => patch('propiedad', v)} /></Field>
                <Field dense label="Estado"><TextInput dense t={t} value={equipo.estado} disabled onChange={() => {}} /></Field>
                <Field dense label="Fecha de instalación"><TextInput dense t={t} disabled={readOnly} type="date" value={equipo.fechaInstalacion} onChange={v => patch('fechaInstalacion', v)} /></Field>
                <Field dense label="Ubicación"><TextInput dense t={t} disabled={readOnly} value={equipo.ubicacion} onChange={v => patch('ubicacion', v)} /></Field>
                <Field dense label="Periodicidad de mantenimiento">
                  <SelectInput dense t={t} disabled={readOnly} value={equipo.periodicidadMantenimiento} options={PERIODICIDADES}
                    onChange={v => onUpdate({ ...equipo, periodicidadMantenimiento: v, aplicaPreventivo: v !== 'N/A' })} />
                </Field>
                <Field dense label="Periodicidad de calibración">
                  <select value={equipo.periodicidadCalibracion || ''} disabled={readOnly}
                    onChange={e => onUpdate({ ...equipo, periodicidadCalibracion: e.target.value, aplicaCalibracion: e.target.value !== 'N/A' })}
                    className={`rounded-md border px-2 py-1 text-2xs ${t.input} ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <option value="" disabled>Seleccionar período</option>
                    <option value="ANUAL">ANUAL</option>
                    <option value="N/A">N/A</option>
                  </select>
                </Field>

                <div>
                  <Field dense label="Hoja de vida (URL)">
                    <div className="flex gap-2">
                      <div className="flex-1 min-w-0"><TextInput dense t={t} disabled={readOnly} value={equipo.hojaVidaUrl} placeholder="https://drive.google.com/..." onChange={v => patch('hojaVidaUrl', v)} /></div>
                      <PdfLink url={equipo.hojaVidaUrl} title="Ver hoja de vida" t={t} />
                    </div>
                  </Field>
                  {!readOnly && <p className={`text-3xs mt-1 ${t.muted}`}>Sube la hoja de vida a Drive/OneDrive/SharePoint y pega aquí el enlace.</p>}
                </div>

                <div className="col-span-2 flex gap-4 mt-1 items-center">
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={aplicaCalibracionEfectiva(equipo)} disabled={readOnly} onChange={e => patch('aplicaCalibracion', e.target.checked)} /> Aplica calibración</label>
                  <span className="text-xs">Mantenimiento preventivo: <span className="font-semibold">{equipo.aplicaPreventivo ? 'Aplicable' : 'No aplica'}</span></span>
                </div>
              </div>
            </div>
          )}

          {tab === 'Cronograma' && (
            <div>
              <p className={`text-xs mb-3 ${t.muted}`}>Estado del mantenimiento preventivo durante {year}.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {MONTHS.map(m => {
                  const st = getMonthStatus(equipo, m.idx, year);
                  const dotColor = st === 'no_aplica' ? '#94A3B8' : STATUS_HEX[st];
                  const label = st === 'no_aplica' ? 'Sin registro' : STATUS_LABEL[st];
                  return (
                    <div key={m.k} className={`rounded-lg border p-3 text-center ${t.panel3} ${t.border}`}>
                      <div className="text-2xs font-mono uppercase mb-1.5" translate="no" lang="es">{m.full}</div>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} role="img" aria-label={label} />
                        <span className="text-2xs font-medium" style={{ color: dotColor }}>{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'Preventivos' && (
            <RecordList t={t} records={equipo.preventivos} readOnly={readOnly}
              fields={[
                { key: 'fecha', label: 'Fecha', type: 'date' },
                { key: 'responsable', label: 'Responsable' },
                { key: 'pdfUrl', label: 'PDF (URL)', type: 'url' },
              ]}
              onAdd={(d) => patchList('preventivos', [...equipo.preventivos, { id: uid('pv'), fecha: todayISO(), estado: 'Ejecutado', ...d }])}
              onRemove={(i) => patchList('preventivos', equipo.preventivos.filter((_, idx) => idx !== i))}
              onUpdate={(i, k, v) => { const list = [...equipo.preventivos]; list[i] = { ...list[i], [k]: v }; patchList('preventivos', list); }}
              renderExtra={(r, i) => (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-3xs uppercase tracking-wide text-slate-400">Estado: <span className="font-semibold normal-case">{r.estado}</span></span>
                  {r.estado === 'Ejecutado' && (
                    <ReporteTecnicoButton equipo={equipo} record={r} tipoKey="Preventivo" accent={accent} t={t} readOnly={readOnly}
                      onSave={(rep) => { const list = [...equipo.preventivos]; list[i] = { ...list[i], reporteTecnico: rep }; patchList('preventivos', list); }} />
                  )}
                </div>
              )}
            />
          )}

          {tab === 'Correctivos' && (
            <RecordList t={t} records={equipo.correctivos} readOnly={readOnly}
              fields={[
                { key: 'fecha', label: 'Fecha', type: 'date' },
                { key: 'responsable', label: 'Responsable' },
                { key: 'estado', label: 'Estado', type: 'select', options: ['Programado', 'Ejecutado'] },
                { key: 'pdfUrl', label: 'PDF (URL)', type: 'url' },
              ]}
              onAdd={(d) => {
                const nuevo = { id: uid('cv'), fecha: todayISO(), estado: 'Programado', ...d };
                patchList('correctivos', [...equipo.correctivos, nuevo]);
              }}
              onRemove={(i) => patchList('correctivos', equipo.correctivos.filter((_, idx) => idx !== i))}
              onUpdate={(i, k, v) => { const list = [...equipo.correctivos]; list[i] = { ...list[i], [k]: v }; patchList('correctivos', list); }}
              renderExtra={(r, i) => (r.estado ? r.estado === 'Ejecutado' : true) && (
                <ReporteTecnicoButton equipo={equipo} record={r} tipoKey="Correctivo" accent={accent} t={t} readOnly={readOnly}
                  onSave={(rep) => { const list = [...equipo.correctivos]; list[i] = { ...list[i], reporteTecnico: rep }; patchList('correctivos', list); }} />
              )}
            />
          )}

          {tab === 'Calibraciones' && (
            <CalibracionesTab equipo={equipo} onUpdate={onUpdate} readOnly={readOnly} t={t} accent={accent} c={c} />
          )}

          {tab === 'Instalaciones' && (
            <RecordList t={t} records={equipo.instalaciones} readOnly={readOnly}
              fields={[
                { key: 'fecha', label: 'Fecha', type: 'date' },
                { key: 'proveedor', label: 'Proveedor' },
                { key: 'acta', label: 'Acta (URL)', type: 'url' },
                // Campo "garantia" oculto a pedido del usuario: ya no se muestra en el
                // formulario, pero se deja intacto en los registros existentes que lo tengan
                // (RecordList solo renderiza los campos listados aquí, nunca borra los demás).
                { key: 'observaciones', label: 'Observaciones' },
              ]}
              onAdd={(d) => patchList('instalaciones', [...equipo.instalaciones, { id: uid('in'), fecha: todayISO(), ...d }])}
              onRemove={(i) => patchList('instalaciones', equipo.instalaciones.filter((_, idx) => idx !== i))}
              onUpdate={(i, k, v) => { const list = [...equipo.instalaciones]; list[i] = { ...list[i], [k]: v }; patchList('instalaciones', list); }}
              renderExtra={(r, i) => (
                <ReporteTecnicoButton equipo={equipo} record={r} tipoKey="Instalación" accent={accent} t={t} readOnly={readOnly}
                  onSave={(rep) => { const list = [...equipo.instalaciones]; list[i] = { ...list[i], reporteTecnico: rep }; patchList('instalaciones', list); }} />
              )}
            />
          )}

          {tab === 'Baja de Equipo' && (
            <RecordList t={t} records={equipo.bajas || []} readOnly={readOnly}
              fields={[
                { key: 'fecha', label: 'Fecha', type: 'date' },
                { key: 'motivo', label: 'Motivo de la baja' },
                { key: 'responsable', label: 'Responsable' },
                { key: 'actaUrl', label: 'Acta de baja (URL)', type: 'url' },
              ]}
              onAdd={(d) => patchList('bajas', [...(equipo.bajas || []), { id: uid('bj'), fecha: todayISO(), ...d }])}
              onRemove={(i) => patchList('bajas', (equipo.bajas || []).filter((_, idx) => idx !== i))}
              onUpdate={(i, k, v) => { const list = [...(equipo.bajas || [])]; list[i] = { ...list[i], [k]: v }; patchList('bajas', list); }}
              renderExtra={(r, i) => (
                <ReporteTecnicoButton equipo={equipo} record={r} tipoKey="Baja" accent={accent} t={t} readOnly={readOnly}
                  onSave={(rep) => { const list = [...(equipo.bajas || [])]; list[i] = { ...list[i], reporteTecnico: rep }; onUpdate({ ...equipo, bajas: list, estado: 'Dado de baja' }); }} />
              )}
            />
          )}

          {tab === 'Documentos' && (
            <DocumentosTab equipo={equipo} onUpdate={onUpdate} readOnly={readOnly} t={t} accent={accent} />
          )}

          {tab === 'Historial' && (
            <div className="space-y-2">
              {historialDe(equipo).length === 0 && <div className={`text-xs text-center py-6 ${t.muted}`}>Sin eventos registrados todavía</div>}
              {historialDe(equipo).map((r, i) => (
                <div key={i} className={`rounded-lg border p-2.5 flex gap-3 items-start ${t.panel3} ${t.border}`}>
                  <div className="text-2xs font-mono w-20 shrink-0 pt-0.5">{formatFechaCorta(r.fecha)}</div>
                  <div className="flex-1">
                    <div className="text-2xs font-semibold uppercase" style={{ color: accent }}>{r.tipo}</div>
                    <div className="text-xs">{r.detalle}</div>
                  </div>
                  {r.reporte && <FileBarChart size={13} style={{ color: accent }} title="Con reporte técnico" />}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
