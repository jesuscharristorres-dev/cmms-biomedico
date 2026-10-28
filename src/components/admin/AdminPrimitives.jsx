// src/components/admin/AdminPrimitives.jsx
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';

export function AdminMensaje({ msg }) {
  if (!msg) return null;
  const ok = msg.type === 'success';
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 border mb-3"
      style={{ color: ok ? '#15803D' : '#DC2626', background: ok ? '#22C55E14' : '#EF444414', borderColor: ok ? '#22C55E55' : '#EF444455' }}>
      {ok ? <CheckCircle2 size={13} className="shrink-0 mt-px" /> : <AlertTriangle size={13} className="shrink-0 mt-px" />}
      <span>{msg.text}</span>
    </div>
  );
}

export function FieldError({ error }) {
  return error ? <span className="text-3xs" style={{ color: '#DC2626' }}>{error}</span> : null;
}

export function AdminModal({ t, accent, subtitulo, titulo, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`animate-modal-in relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl border p-5 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-3xs uppercase tracking-wide" style={{ color: accent }}>{subtitulo}</div>
            <div className="text-sm font-bold">{titulo}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex items-center justify-center w-11 h-11 -mr-2 -mt-2"><X size={18} /></button>
        </div>
        {children}
        <div className="flex justify-end gap-2 mt-5">{footer}</div>
      </div>
    </div>
  );
}
