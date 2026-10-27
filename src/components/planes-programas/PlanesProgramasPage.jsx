// src/components/planes-programas/PlanesProgramasPage.jsx
// Documentación institucional que NO es transversal: cada empresa tiene sus propios
// documentos de Mantenimiento y Capacitaciones, nunca mezclados entre sí. Distinta de
// la pestaña "Documentos" de cada equipo (esa es por equipo; esta es por empresa).

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { COMPANIES, companyOf } from '../../data/empresas.js';
import { DocumentoEstadoAcciones } from '../ui.jsx';

const PLANES_CATEGORIAS = [
  { key: 'mantenimiento', label: 'Mantenimiento', icon: '📋', documentos: [
    { key: 'programaMantenimiento', label: 'Programa de mantenimiento', descripcion: 'Documento institucional para la gestión del mantenimiento' },
    { key: 'planMantenimiento', label: 'Plan de mantenimiento', descripcion: 'Documento institucional para la planeación del mantenimiento' },
  ] },
  { key: 'capacitaciones', label: 'Capacitaciones', icon: '🎓', documentos: [
    { key: 'planCapacitaciones', label: 'Plan de capacitaciones', descripcion: 'Documento institucional para la planeación de capacitaciones' },
    // La clave interna sigue siendo `programaCapacitaciones` (así se guardó siempre en la
    // base de datos compartida) — solo cambia la etiqueta visible a "Cronograma de
    // capacitaciones" para no perder los documentos ya cargados bajo esa clave.
    { key: 'programaCapacitaciones', label: 'Cronograma de capacitaciones', descripcion: 'Documento institucional con el cronograma de capacitaciones' },
  ] },
];

// Tarjeta de un documento institucional (Planes y programas). Reutiliza
// DocumentoEstadoAcciones para el estado/botones; solo aporta el encabezado
// (ícono, título, descripción corta).
function PlanDocumentoCard({ doc, url, onChange, readOnly, t, accent }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${t.panel} ${t.border}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent + '1A', color: accent }}>
          <FileText size={20} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{doc.label}</div>
          <div className={`text-2xs mt-0.5 ${t.muted}`}>{doc.descripcion}</div>
        </div>
      </div>
      <DocumentoEstadoAcciones url={url} onChange={onChange} readOnly={readOnly} t={t} accent={accent} />
    </div>
  );
}

export default function PlanesProgramasPage({ planesProgramas, activeCompany, t, onUpdate, readOnly }) {
  const [empresaSelLocal, setEmpresaSelLocal] = useState(null);
  // Con una empresa activa en el selector superior, este módulo queda fijo en ella —
  // ya no hay un selector propio que pueda quedar desincronizado del contexto global.
  // El selector interno solo existe para navegar entre empresas en la vista "Todas las empresas".
  const modoGlobal = activeCompany !== 'TODAS';
  const empresaSel = modoGlobal ? activeCompany : empresaSelLocal;

  if (!empresaSel) {
    return (
      <div>
        <h1 className="text-lg font-bold mb-1">Planes y programas</h1>
        <p className={`text-xs mb-4 ${t.muted}`}>Documentación institucional de mantenimiento y capacitaciones, organizada por empresa. Selecciona una empresa para ver sus documentos.</p>
        <div className="grid md:grid-cols-3 gap-4">
          {COMPANIES.map(c => (
            <button key={c.key} onClick={() => setEmpresaSelLocal(c.key)}
              className={`text-left rounded-xl border overflow-hidden hover:-translate-y-0.5 transition ${t.panel} ${t.border}`}>
              <div className="h-2" style={{ background: c.gradient }} />
              <div className="p-5">
                <div className="text-sm font-bold" style={{ color: c.color }}>{c.key}</div>
                <div className={`text-2xs mt-1 ${t.muted}`}>Ver documentación institucional</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const empresa = companyOf(empresaSel);
  const datos = planesProgramas[empresaSel] || {};

  return (
    <div>
      {!modoGlobal && (
        <button onClick={() => setEmpresaSelLocal(null)} className={`text-2xs font-mono uppercase mb-3 hover:underline ${t.muted}`}>
          ← Cambiar empresa
        </button>
      )}
      <h1 className="text-lg font-bold mb-1" style={{ color: empresa.color }}>{empresa.key}</h1>
      <p className={`text-xs mb-4 ${t.muted}`}>Planes y programas — documentación institucional exclusiva de esta empresa.</p>

      <div className="space-y-6">
        {PLANES_CATEGORIAS.map(cat => (
          <div key={cat.key}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2" style={{ color: empresa.color }}>
              <span>{cat.icon}</span> {cat.label}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cat.documentos.map(doc => (
                <PlanDocumentoCard key={doc.key} doc={doc} url={datos[doc.key]} readOnly={readOnly} t={t} accent={empresa.color}
                  onChange={v => onUpdate(empresaSel, doc.key, v)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
