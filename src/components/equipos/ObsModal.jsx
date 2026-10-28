// src/components/equipos/ObsModal.jsx
// Modal simple para editar la observación de un equipo desde Inventario (el ícono de
// observaciones), sin pasar por el drawer completo.

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui.jsx';

export default function ObsModal({ equipo, onClose, onSave, t, accent, readOnly }) {
  const [val, setVal] = useState(equipo.observaciones || '');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`animate-modal-in relative w-full max-w-md rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-semibold">Observaciones — {equipo.equipo}</div>
          <button onClick={onClose} aria-label="Cerrar" className="flex items-center justify-center w-11 h-11 -mr-2 -mt-2"><X size={16} /></button>
        </div>
        <textarea rows={5} value={val} disabled={readOnly} onChange={e => setVal(e.target.value)} className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input} ${readOnly ? 'opacity-60' : ''}`} />
        {!readOnly && <Button variant="primary" accent={accent} className="mt-3" onClick={() => { onSave(val); onClose(); }}>Guardar</Button>}
      </div>
    </div>
  );
}
