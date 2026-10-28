// src/components/equipos/CalibracionesTab.jsx
// Pestaña "Calibraciones" del equipo — misma cuadrícula de tarjetas que DocumentosTab
// (mismo `onUpdate` de siempre), en vez de la lista inline (RecordList) que usan las
// demás pestañas (Preventivos, Correctivos, Instalaciones, Baja de Equipo).

import { useState, useMemo } from 'react';
import { ShieldCheck, Plus, MoreVertical, Pencil, Trash2, ExternalLink, X, AlertTriangle, Search, ArrowUpDown } from 'lucide-react';
import { Button, Badge, Field, TextInput } from '../ui.jsx';
import { uid } from '../../utils/id.js';
import { todayISO } from '../../utils/fechas.js';
import { SEMANTIC_HEX, CAL_HEX } from '../../data/equipos.js';
import { esUrlDocumentoValida } from './helpers.js';

const CALIBRACIONES_ORDEN = [
  { key: 'recientes', label: 'Más recientes' },
  { key: 'antiguos', label: 'Más antiguos' },
];

function EmptyCalibracionesState({ t, accent, readOnly, onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
      <ShieldCheck size={28} className={t.muted} />
      <div className="text-xs font-semibold mt-1">No hay calibraciones</div>
      <p className={`text-2xs max-w-56 ${t.muted}`}>Aún no se han registrado calibraciones para este equipo.</p>
      {!readOnly && (
        <Button variant="primary" accent={accent} icon={Plus} iconSize={13} className="mt-2" onClick={onAdd}>
          Agregar calibración
        </Button>
      )}
    </div>
  );
}

function CalibracionCard({ cal, t, accent, readOnly, menuOpen, onToggleMenu, onView, onEdit, onDelete }) {
  const tieneCertificado = esUrlDocumentoValida(cal.certificadoUrl || '');
  const fechaTexto = cal.fecha ? new Date(cal.fecha + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha';
  const color = tieneCertificado ? SEMANTIC_HEX.ok : SEMANTIC_HEX.neutral;

  return (
    <div className={`relative rounded-xl border p-3.5 flex flex-col gap-2 shadow-sm ${t.panel} ${t.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent + '1A', color: accent }}>
          <ShieldCheck size={17} />
        </div>
        {!readOnly && (
          <button onClick={onToggleMenu} aria-label="Más acciones" aria-haspopup="true" aria-expanded={menuOpen}
            className={`w-8 h-8 -mr-1 -mt-1 rounded-md flex items-center justify-center hover:opacity-70 shrink-0 ${t.muted}`}>
            <MoreVertical size={15} />
          </button>
        )}
        {menuOpen && (
          <div className={`absolute right-2 top-11 z-[56] w-36 rounded-lg border shadow-lg py-1 ${t.panel} ${t.border}`}>
            <button onClick={onEdit} className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs hover:opacity-80 ${t.text}`}>
              <Pencil size={13} /> Editar
            </button>
            <button onClick={onDelete} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-red-500 hover:opacity-80">
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        )}
      </div>

      <div><Badge color={color}>{tieneCertificado ? 'Con certificado' : 'Sin certificado'}</Badge></div>

      <div className="min-w-0">
        <div className={`text-xs font-semibold leading-snug ${t.text}`}>Calibración</div>
        <div className={`text-2xs mt-0.5 ${t.muted}`}>{fechaTexto}</div>
      </div>

      <div className="flex items-center gap-2 pt-1 mt-auto">
        <Button variant="outline" size="sm" t={t} icon={ExternalLink} iconSize={12} disabled={!tieneCertificado} onClick={onView} className="flex-1">
          Ver certificado
        </Button>
      </div>
    </div>
  );
}

function CalibracionFormModal({ mode, initial, onClose, onSave, t, accent }) {
  const [fecha, setFecha] = useState(initial?.fecha || todayISO());
  const [certificadoUrl, setCertificadoUrl] = useState(initial?.certificadoUrl || '');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!fecha) { setError('Selecciona la fecha de la calibración.'); return; }
    if (certificadoUrl.trim() && !esUrlDocumentoValida(certificadoUrl)) {
      setError('El enlace del certificado no es una URL válida. Debe comenzar con https:// o http://.');
      return;
    }
    setError('');
    onSave({ fecha, certificadoUrl: certificadoUrl.trim() });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <form onSubmit={submit} className={`animate-modal-in relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-xl border p-5 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-start mb-1">
          <div>
            <div className="text-sm font-bold">{mode === 'edit' ? 'Editar calibración' : 'Agregar calibración'}</div>
            <p className={`text-2xs mt-0.5 ${t.muted}`}>Registra una calibración realizada a este equipo.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className={`w-9 h-9 -mr-1 -mt-1 flex items-center justify-center shrink-0 rounded-md ${t.muted} hover:opacity-70`}><X size={18} /></button>
        </div>

        <div className="space-y-3 mt-4">
          <Field label="Fecha de calibración">
            <TextInput t={t} type="date" value={fecha} onChange={setFecha} />
          </Field>
          <Field label="Certificado (URL, opcional)">
            <TextInput t={t} value={certificadoUrl} placeholder="https://drive.google.com/..." onChange={setCertificadoUrl} />
            <p className={`text-3xs mt-1 ${t.muted}`}>Pega el enlace externo del certificado (Drive, OneDrive, Dropbox, etc.).</p>
          </Field>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="outline" t={t} onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" accent={accent}>Guardar calibración</Button>
        </div>
      </form>
    </div>
  );
}

function DeleteCalibracionDialog({ fecha, onCancel, onConfirm, t }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className={`animate-modal-in relative w-full max-w-xs rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="text-sm font-bold mb-1">¿Eliminar calibración?</div>
        <p className={`text-2xs mb-4 ${t.muted}`}>
          {fecha ? `La calibración del ${fecha} se ` : 'Se '}eliminará de este equipo. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" t={t} onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm}>Eliminar</Button>
        </div>
      </div>
    </div>
  );
}

export default function CalibracionesTab({ equipo, onUpdate, readOnly, t, accent, c }) {
  const calibraciones = equipo.calibraciones || [];
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('recientes');
  const [openPanel, setOpenPanel] = useState(null); // null | 'orden' | <calId>
  const [formAbierto, setFormAbierto] = useState(null); // null | { mode: 'create' } | { mode: 'edit', cal }
  const [porEliminar, setPorEliminar] = useState(null);

  const guardarCalibracion = (datos, id) => {
    const list = id
      ? calibraciones.map(cal => cal.id === id ? { ...cal, ...datos } : cal)
      : [...calibraciones, { id: uid('cb'), ...datos }];
    const latest = [...list].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
    onUpdate({ ...equipo, calibraciones: list, fechaUltimaCalibracion: latest.fecha, certificadoUrl: latest.certificadoUrl || equipo.certificadoUrl });
  };
  const eliminarCalibracion = (id) => onUpdate({ ...equipo, calibraciones: calibraciones.filter(cal => cal.id !== id) });

  const filtradas = useMemo(() => {
    let list = equipo.calibraciones || [];
    const q = busqueda.trim().toLowerCase();
    if (q) {
      list = list.filter(cal => {
        const fechaTexto = cal.fecha ? new Date(cal.fecha + 'T00:00:00').toLocaleDateString('es-CO') : '';
        const estadoTexto = cal.certificadoUrl ? 'con certificado' : 'sin certificado';
        return [fechaTexto, estadoTexto].join(' ').toLowerCase().includes(q);
      });
    }
    return [...list].sort((a, b) => {
      const fa = a.fecha || '';
      const fb = b.fecha || '';
      return orden === 'antiguos' ? fa.localeCompare(fb) : fb.localeCompare(fa);
    });
  }, [equipo.calibraciones, busqueda, orden]);

  return (
    <div>
      <div className={`rounded-lg border p-4 mb-4 flex items-center gap-3 ${t.panel3} ${t.border}`}>
        <span className="w-3 h-3 rounded-full" style={{ background: CAL_HEX[c.status] }} />
        <div>
          <div className="text-sm font-semibold capitalize">{c.status.replace('_', ' ')}</div>
          <div className={`text-2xs ${t.muted}`}>
            {c.status === 'sin_dato' ? 'Aún no hay fecha de última calibración' :
              c.status === 'vencido' ? `Vencida hace ${Math.abs(c.diffDays)} días` : `Próxima calibración en ${c.diffDays} días`}
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div>
          <h2 className="text-sm font-bold">Calibraciones</h2>
          <p className={`text-2xs mt-0.5 ${t.muted}`}>Historial de calibraciones realizadas a este equipo.</p>
        </div>
        {!readOnly && (
          <Button variant="primary" accent={accent} icon={Plus} iconSize={13} onClick={() => setFormAbierto({ mode: 'create' })}>
            Agregar calibración
          </Button>
        )}
      </div>

      {calibraciones.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-4 mb-3">
          <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border flex-1 min-w-40 ${t.border} ${t.panel3}`}>
            <Search size={13} className={t.muted} />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar calibraciones…"
              aria-label="Buscar calibraciones" className={`bg-transparent text-xs w-full outline-none ${t.text}`} />
          </div>

          <div className="relative">
            <button onClick={() => setOpenPanel(p => p === 'orden' ? null : 'orden')} aria-haspopup="true" aria-expanded={openPanel === 'orden'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs border shrink-0 ${t.border} ${t.muted}`}>
              <ArrowUpDown size={13} /> {CALIBRACIONES_ORDEN.find(o => o.key === orden)?.label}
            </button>
            {openPanel === 'orden' && (
              <div className={`absolute right-0 top-full mt-1 z-[56] w-40 rounded-lg border shadow-lg py-1 ${t.panel} ${t.border}`}>
                {CALIBRACIONES_ORDEN.map(op => (
                  <button key={op.key} onClick={() => { setOrden(op.key); setOpenPanel(null); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:opacity-80 ${op.key === orden ? 'font-semibold' : t.text}`}
                    style={op.key === orden ? { color: accent } : {}}>
                    {op.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {calibraciones.length === 0 ? (
        <EmptyCalibracionesState t={t} accent={accent} readOnly={readOnly} onAdd={() => setFormAbierto({ mode: 'create' })} />
      ) : filtradas.length === 0 ? (
        <div className={`text-center py-8 ${t.muted}`}>
          <div className="text-xs font-semibold mb-1">No encontramos calibraciones</div>
          <p className="text-2xs">Prueba con otro término de búsqueda.</p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
          {filtradas.map(cal => (
            <CalibracionCard key={cal.id} cal={cal} t={t} accent={accent} readOnly={readOnly}
              menuOpen={openPanel === cal.id} onToggleMenu={() => setOpenPanel(p => p === cal.id ? null : cal.id)}
              onView={() => window.open(cal.certificadoUrl, '_blank', 'noopener,noreferrer')}
              onEdit={() => { setOpenPanel(null); setFormAbierto({ mode: 'edit', cal }); }}
              onDelete={() => { setOpenPanel(null); setPorEliminar(cal); }} />
          ))}
        </div>
      )}

      {openPanel && <div className="fixed inset-0 z-[55]" onClick={() => setOpenPanel(null)} />}

      {formAbierto && (
        <CalibracionFormModal mode={formAbierto.mode} initial={formAbierto.cal} t={t} accent={accent}
          onClose={() => setFormAbierto(null)}
          onSave={(datos) => { guardarCalibracion(datos, formAbierto.cal?.id); setFormAbierto(null); }} />
      )}
      {porEliminar && (
        <DeleteCalibracionDialog t={t}
          fecha={porEliminar.fecha ? new Date(porEliminar.fecha + 'T00:00:00').toLocaleDateString('es-CO') : ''}
          onCancel={() => setPorEliminar(null)}
          onConfirm={() => { eliminarCalibracion(porEliminar.id); setPorEliminar(null); }} />
      )}
    </div>
  );
}
