// src/components/empresas/EmpresasPage.jsx
// Vista "Empresas": una tarjeta por empresa, con conteo de equipos y calibraciones vencidas —
// clic en una tarjeta activa esa empresa en el resto de la app (vía onSelect).

import { calibStatus } from '../../services/alertLogic';
import { COMPANIES } from '../../data/empresas.js';

export default function EmpresasPage({ equipos, t, onSelect }) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {COMPANIES.map(c => {
        const list = equipos.filter(e => e.empresa === c.key);
        const vencidas = list.filter(e => calibStatus(e).status === 'vencido').length;
        return (
          <button key={c.key} onClick={() => onSelect(c.key)}
            className={`text-left rounded-xl border overflow-hidden hover:-translate-y-0.5 transition ${t.panel} ${t.border}`}>
            <div className="h-2" style={{ background: c.gradient }} />
            <div className="p-5">
              <div className="text-sm font-bold mb-1" style={{ color: c.color }}>{c.key}</div>
              <div className={`text-2xs ${t.muted} mb-3`}>{c.sedes.length} sede{c.sedes.length !== 1 ? 's' : ''}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono">{list.length}</span>
                <span className={`text-2xs ${t.muted}`}>equipos</span>
              </div>
              {vencidas > 0 && <div className="text-2xs mt-2 text-red-400">{vencidas} calibración(es) vencida(s)</div>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
