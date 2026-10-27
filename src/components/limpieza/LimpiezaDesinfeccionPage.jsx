// src/components/limpieza/LimpiezaDesinfeccionPage.jsx
// Un enlace externo (Drive/OneDrive/SharePoint) por sede · mes del año actual — nunca se
// sube el documento en sí, solo su URL. Tanto el enlace del mes como la plantilla por empresa
// respetan `readOnly` (rol LECTURA) y el aislamiento por empresa lo aplica la API.

import { useState } from 'react';
import { FileText, Eye, Download, MapPin, CheckCircle2, AlertCircle, SprayCan } from 'lucide-react';
import { Button, TextInput, PdfLink, DocumentoEstadoAcciones } from '../ui.jsx';
import { COMPANIES, companyOf } from '../../data/empresas.js';
import { MONTHS } from '../../data/equipos.js';

// Convierte un Data URI (archivoDatos) a un blob: URL temporal — usado solo para "Ver" en
// una pestaña nueva. Necesario porque los navegadores modernos bloquean la navegación de
// nivel superior directamente a una URL data: (política anti-phishing de Chrome desde 2019),
// pero sí permiten blob: URLs; para "Descargar" no hace falta este paso porque el atributo
// `download` de <a> ya evita ese bloqueo.
function dataUriAUrlTemporal(dataUri) {
  const [header, base64 = ''] = dataUri.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'application/octet-stream';
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
function verPlantillaLimpieza(plantilla) {
  if (!plantilla?.archivoDatos) return;
  const url = dataUriAUrlTemporal(plantilla.archivoDatos);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function descargarPlantillaLimpieza(plantilla) {
  if (!plantilla?.archivoDatos) return;
  const a = document.createElement('a');
  a.href = plantilla.archivoDatos;
  a.download = plantilla.nombre || 'plantilla';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Tarjeta de un documento de "Formatos de limpieza y desinfección" (la plantilla del formato,
// o el checklist de dotación) de UNA empresa — reutiliza DocumentoEstadoAcciones para el
// estado/edición del enlace, igual que el resto de "documentos" de la app (nunca se sube el
// archivo, solo su URL). `legacyArchivo` es el registro de ANTES de este cambio (cuando sí se
// subía el archivo real como Data URI base64): si todavía existe para esta empresa, se ofrece
// verlo/descargarlo una última vez — desaparece solo en cuanto se guarda una URL nueva, que lo
// reemplaza en el servidor.
function DocumentoLimpiezaCard({ empresa, url, legacyArchivo, onChange, readOnly, t, accent, titulo }) {
  return (
    <div className={`max-w-md rounded-xl border overflow-hidden shadow-sm ${t.panel} ${t.border}`}>
      <div className="h-1" style={{ background: empresa.color }} />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={18} style={{ color: empresa.color }} />
          <div className="text-xs font-semibold">{titulo}</div>
        </div>

        {legacyArchivo && (
          <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-dashed border-slate-700/30">
            <span className={`text-3xs ${t.muted}`}>Archivo cargado antes del enlace — {legacyArchivo.nombre}:</span>
            <Button variant="outline" size="sm" t={t} icon={Eye} iconSize={12} onClick={() => verPlantillaLimpieza(legacyArchivo)}>Ver</Button>
            <Button variant="outline" size="sm" t={t} icon={Download} iconSize={12} onClick={() => descargarPlantillaLimpieza(legacyArchivo)}>Descargar</Button>
          </div>
        )}

        <DocumentoEstadoAcciones url={url} onChange={v => onChange(empresa.key, v)} readOnly={readOnly} t={t} accent={empresa.color || accent} />
      </div>
    </div>
  );
}

// Empresas que NO tienen checklist de inventario de dotación por consultorio (pedido
// explícito) — hoy solo MACROMED; se revisa aquí y también en el servidor
// (api/checklist-dotacion.js), igual que el resto de exclusiones de empresa en la app.
const CHECKLIST_DOTACION_EMPRESA_EXCLUIDA = 'MACROMED';

// Interpreta un registro de plantilla/checklist: un string es la forma NUEVA (solo la URL);
// un objeto con `.archivoDatos` es la forma VIEJA (archivo real subido antes de este cambio;
// ver DocumentoLimpiezaCard) — cualquier otra cosa (undefined, string vacío) es "sin cargar".
function urlYLegacyDeDocumentoLimpieza(valor) {
  if (typeof valor === 'string') return { url: valor, legacy: null };
  if (valor && typeof valor === 'object' && valor.archivoDatos) return { url: '', legacy: valor };
  return { url: '', legacy: null };
}

export default function LimpiezaDesinfeccionPage({ data, activeCompany, t, accent, onUpdate, plantillas, onUpdatePlantilla,
  checklistDotacion, onUpdateChecklist, formatoTempHumedad, onUpdateTempHumedad, readOnly }) {
  const [empresaSelLocal, setEmpresaSelLocal] = useState(null);
  const [sedeSel, setSedeSel] = useState(null);
  const [openMes, setOpenMes] = useState(null);
  // Igual que en Tecnovigilancia: con una empresa activa en el selector superior, esta
  // página queda fija en ella (sin selector propio desincronizado).
  const modoGlobal = activeCompany !== 'TODAS';
  const empresaSel = modoGlobal ? activeCompany : empresaSelLocal;
  // Si cambia la empresa activa del selector superior, se limpia la sede/mes ya elegidos
  // (ajuste de estado durante el render, como recomienda React, en vez de un efecto).
  const [prevActiveCompany, setPrevActiveCompany] = useState(activeCompany);
  if (activeCompany !== prevActiveCompany) {
    setPrevActiveCompany(activeCompany);
    setSedeSel(null);
    setOpenMes(null);
  }

  const year = new Date().getFullYear();
  const empresa = empresaSel ? companyOf(empresaSel) : null;
  const anioData = (empresaSel && sedeSel) ? (data?.[empresaSel]?.[sedeSel]?.[year] || {}) : {};
  const cargados = MONTHS.filter(m => anioData[m.idx]?.url).length;

  const resetSede = () => { setSedeSel(null); setOpenMes(null); };
  const resetEmpresa = () => { setEmpresaSelLocal(null); setSedeSel(null); setOpenMes(null); };

  return (
    <div>
      <h1 className="text-lg font-bold mb-1 flex items-center gap-2">
        <SprayCan size={19} style={{ color: accent }} /> Formatos de limpieza y desinfección
      </h1>
      <p className={`text-xs mb-5 ${t.muted}`}>
        Enlace externo (Drive/OneDrive/SharePoint) al formato de limpieza y desinfección de cada sede, mes a mes, para {year}. El documento no se sube a la aplicación — solo se guarda el enlace.
      </p>

      {!empresaSel && (
        <div>
          <p className={`text-2xs mb-3 ${t.muted}`}>Selecciona una empresa.</p>
          <div className="grid md:grid-cols-3 gap-4">
            {COMPANIES.map(c => (
              <button key={c.key} onClick={() => setEmpresaSelLocal(c.key)}
                className={`text-left rounded-xl border overflow-hidden hover:-translate-y-0.5 transition ${t.panel} ${t.border}`}>
                <div className="h-2" style={{ background: c.gradient }} />
                <div className="p-5">
                  <div className="text-sm font-bold" style={{ color: c.color }}>{c.key}</div>
                  <div className={`text-2xs mt-1 ${t.muted}`}>{c.sedes.length} sede{c.sedes.length !== 1 ? 's' : ''}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {empresaSel && !sedeSel && (
        <div>
          {!modoGlobal && <button onClick={resetEmpresa} className={`text-2xs font-mono uppercase mb-3 hover:underline ${t.muted}`}>← Cambiar empresa</button>}
          <div className="text-sm font-bold mb-3" style={{ color: empresa.color }}>{empresa.key}</div>

          <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-start mb-6">
            <DocumentoLimpiezaCard empresa={empresa} titulo="Formato de limpieza y desinfección"
              {...urlYLegacyDeDocumentoLimpieza(plantillas[empresaSel])}
              onChange={onUpdatePlantilla} readOnly={readOnly} t={t} accent={accent} />
            {empresaSel !== CHECKLIST_DOTACION_EMPRESA_EXCLUIDA && (
              <DocumentoLimpiezaCard empresa={empresa} titulo="Checklist de inventario de dotación por consultorio"
                {...urlYLegacyDeDocumentoLimpieza(checklistDotacion[empresaSel])}
                onChange={onUpdateChecklist} readOnly={readOnly} t={t} accent={accent} />
            )}
            <DocumentoLimpiezaCard empresa={empresa} titulo="Formato de temperatura y humedad"
              {...urlYLegacyDeDocumentoLimpieza(formatoTempHumedad[empresaSel])}
              onChange={onUpdateTempHumedad} readOnly={readOnly} t={t} accent={accent} />
          </div>

          <p className={`text-2xs mb-3 ${t.muted}`}>Selecciona una sede.</p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {empresa.sedes.map(sede => {
              const sedeAnioData = data?.[empresaSel]?.[sede]?.[year] || {};
              const sedeCargados = MONTHS.filter(m => sedeAnioData[m.idx]?.url).length;
              return (
                <button key={sede} onClick={() => setSedeSel(sede)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left hover:-translate-y-0.5 transition ${t.panel} ${t.border}`}>
                  <MapPin size={15} style={{ color: empresa.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{sede}</div>
                    <div className={`text-3xs ${t.muted}`}>{sedeCargados}/{MONTHS.length} meses cargados</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {empresaSel && sedeSel && (
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 text-2xs font-mono uppercase">
            {!modoGlobal && (<><button onClick={resetEmpresa} className={`hover:underline ${t.muted}`}>Empresa</button><span className={t.muted}>/</span></>)}
            <button onClick={resetSede} className={`hover:underline ${t.muted}`}>{empresa.key}</button>
            <span className={t.muted}>/</span>
            <span style={{ color: empresa.color }}>{sedeSel}</span>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm font-bold font-mono">{year}</span>
            <span className={`text-2xs ${t.muted}`}>{cargados}/{MONTHS.length} meses cargados</span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {MONTHS.map(m => {
              const registro = anioData[m.idx];
              const cargado = !!registro?.url;
              const open = openMes === m.idx;
              return (
                <div key={m.k} className={`rounded-xl border overflow-hidden shadow-sm ${t.panel} ${t.border}`}>
                  <button onClick={() => setOpenMes(open ? null : m.idx)} className="w-full text-left p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold">{m.full}</span>
                      {cargado
                        ? <CheckCircle2 size={16} style={{ color: '#22C55E' }} />
                        : <AlertCircle size={16} style={{ color: '#F59E0B' }} />}
                    </div>
                    <span className="text-2xs font-medium" style={{ color: cargado ? '#22C55E' : '#F59E0B' }}>
                      {cargado ? 'Cargado' : 'Pendiente'}
                    </span>
                    {registro?.updatedAt && (
                      <div className={`text-3xs mt-1 ${t.muted}`}>Actualizado {new Date(registro.updatedAt).toLocaleDateString('es-CO')}</div>
                    )}
                  </button>
                  {open && (
                    <div className={`p-3 border-t space-y-2 ${t.border} ${t.panel3}`}>
                      <TextInput t={t} value={registro?.url} placeholder="URL del formato" disabled={readOnly}
                        onChange={v => onUpdate(empresaSel, sedeSel, year, m.idx, v)} />
                      <PdfLink url={registro?.url} t={t} label="Ver / Descargar" title={`${m.full} · ${sedeSel}`} emptyLabel="Enlace no cargado" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
