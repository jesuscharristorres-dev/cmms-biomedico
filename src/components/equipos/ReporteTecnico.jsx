// src/components/equipos/ReporteTecnico.jsx
// Reporte técnico de mantenimiento (Preventivo / Correctivo / Instalación / Baja): el botón
// que abre el modal desde cada registro de EquipoDrawer, el modal en sí, y la exportación a
// PDF (ventana nueva + impresión del navegador). Todo privado a este archivo salvo
// ReporteTecnicoButton, que es lo único que EquipoDrawer necesita.

import { useState } from 'react';
import { X, Lock, FileText, Trash2, FileBarChart } from 'lucide-react';
import { Field, TextInput, FirmaInput, Button } from '../ui.jsx';
import { formatFechaCorta, todayISO } from '../../utils/fechas.js';
import { companyOf } from '../../data/empresas.js';
import { MONTHS } from '../../data/equipos.js';

const TIPOS_REPORTE_LABEL = {
  Preventivo: 'Mantenimiento Preventivo',
  Correctivo: 'Mantenimiento Correctivo',
  Instalación: 'Instalación de Equipo',
  Baja: 'Baja de Equipo',
};

// Datos del formato controlado — cada empresa tiene su propio código/versión/vigencia
// de documento; el encabezado del reporte se elige automáticamente según equipo.empresa.
const DOC_CONTROL_POR_EMPRESA = {
  DIAGNOSTIK: { codigo: 'DLC-GEB-F-01', version: '2.0', tipoCopia: 'CONTROLADA', vigencia: '21/01/2027', pagina: '1 DE 1' },
  MACROMED: { codigo: 'F432', version: '1.0', tipoCopia: 'CONTROLADA', vigencia: '24/06/2027', pagina: '1 DE 1' },
  'NP MEDICAL': { codigo: 'FSE-002', version: '4.0', tipoCopia: 'CONTROLADA', vigencia: '21/01/2027', pagina: '1 DE 1' },
  'AUNAR SALUD': { codigo: 'AS-SGB-F04', version: '2.0', tipoCopia: 'CONTROLADA', vigencia: '31/12/2026', pagina: '1 DE 1' },
  MEIDE: { codigo: 'ME-GF-F-001', version: '1.0', tipoCopia: 'CONTROLADA', vigencia: '27/06/2027', pagina: '1 DE 1' },
};
const DOC_CONTROL_DEFAULT = DOC_CONTROL_POR_EMPRESA.DIAGNOSTIK;
const docControlDe = (empresaKey) => DOC_CONTROL_POR_EMPRESA[empresaKey] || DOC_CONTROL_DEFAULT;

// Checklist "CARACTERÍSTICAS A INSPECCIONAR" — mismo orden y texto que el formato en Excel.
const CHECKLIST_ITEMS = [
  'PUEBA DE FUNCIONAMIENTO INICIAL', 'ESTADO FÍSICO', 'COMPONENTES MECANICOS', 'COMPONENTES ELECTRICOS',
  'BOTONES DE MANDO', 'ADAPTADOR CA', 'BATERIAS', 'PIEZAS MOVILES', 'MEDICION DE PARAMETROS', 'SENSORES',
  'LUBRICACION', 'REMPLAZO DE COMPONENTES', 'ESCALA DE MEDIDA', 'MANGUERAS', 'CALIBRACION', 'REFRIGERANTE',
  'PRUEBA DE FUNCIONAMIENTO FINAL', 'LIMPIEZA Y DESINFECCION',
];
const CHECK_ESTADOS = [
  { key: 'no_aplica', label: 'No aplica', color: '#7fbef8' },
  { key: 'bueno', label: 'Buen estado', color: '#22C55E' },
  { key: 'malo', label: 'Mal estado', color: '#EF4444' },
];
function defaultChecklist() {
  const c = {};
  CHECKLIST_ITEMS.forEach(item => { c[item] = { estado: 'no_aplica', obs: '' }; });
  return c;
}
const TIPO_INTERVENCION_MAP = { Preventivo: 'Preventivo', Correctivo: 'Correctivo', Instalación: 'Instalación', Baja: 'Baja de Equipo' };

// Escapa entidades HTML antes de interpolar texto libre (nombres de equipo, descripciones,
// observaciones...) dentro del HTML que arman los generadores de reporte con
// `win.document.write(...)`. Sin esto, un campo con `<script>` o `<img onerror=...>` se
// ejecuta cuando cualquiera abre o imprime el reporte — XSS almacenado.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Solo mes y año (ej. "Agosto 2026") — usado en el reporte de mantenimiento preventivo,
// donde no se necesita el día exacto de la próxima intervención.
function formatMesAnio(fechaStr) {
  if (!fechaStr) return '';
  // Soporta tanto "AAAA-MM" (input type="month") como "AAAA-MM-DD".
  const iso = fechaStr.length === 7 ? `${fechaStr}-01` : fechaStr;
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? fechaStr : `${MONTHS[d.getMonth()].full} ${d.getFullYear()}`;
}

function generarReportePDF(equipo, tipoKey, rep) {
  const co = companyOf(equipo.empresa);
  const docControl = docControlDe(equipo.empresa);
  const tipoLabel = TIPOS_REPORTE_LABEL[tipoKey] || tipoKey;
  const win = window.open('', '_blank');
  if (!win) { alert('El navegador bloqueó la ventana emergente. Habilítala para generar el PDF.'); return; }
  const esc = (v) => escapeHtml(v || '—');
  const box = (checked) => checked ? '☑' : '☐';

  const checklistRows = CHECKLIST_ITEMS.map(item => {
    const c = (rep.checklist && rep.checklist[item]) || { estado: 'no_aplica', obs: '' };
    return `<tr>
      <td>${item}</td>
      <td style="text-align:center;">${c.estado === 'no_aplica' ? '✔' : ''}</td>
      <td style="text-align:center;">${c.estado === 'bueno' ? '✔' : ''}</td>
      <td style="text-align:center;">${c.estado === 'malo' ? '✔' : ''}</td>
      <td>${esc(c.obs)}</td>
    </tr>`;
  }).join('');

  // La fecha de próximo mantenimiento solo muestra mes y año (formato unificado).
  const fechaProximoTxt = formatMesAnio(rep.fechaProximo);

  // Nota: "Repuestos utilizados en el servicio" ya NO se imprime en el PDF (a pedido del
  // usuario, para que el reporte quepa en una sola hoja) — pero el dato sigue existiendo tal
  // cual en el formulario y en lo guardado (rep.repuestos, ver ReporteTecnicoModal más abajo);
  // solo se dejó de mostrar aquí.

  // Cada firma cargada se imprime como imagen sobre su línea correspondiente (formato unificado).
  const firmasHtml = `
      <div class="firmas">
        <div class="firma-col">
          <div class="firma-slot">${rep.firmaRealiza ? `<img src="${rep.firmaRealiza}" alt="Firma de quien realiza" />` : ''}</div>
          <div class="firma-info">
            <div>${esc(rep.quienRealizaNombre)}</div>
            <div style="margin-top:2px;">Nombre y firma de quien realiza</div>
          </div>
        </div>
        <div class="firma-col">
          <div class="firma-slot">${rep.firmaRecibe ? `<img src="${rep.firmaRecibe}" alt="Firma de quien recibe" />` : ''}</div>
          <div class="firma-info">
            <div>${esc(rep.quienRecibeNombre)}</div>
            <div style="margin-top:2px;">Nombre y firma de quien recibe</div>
          </div>
        </div>
      </div>`;

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte de mantenimiento — ${equipo.equipo || ''}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color:#1e293b; padding:30px; font-size:11.5px; }
      table { border-collapse: collapse; width:100%; }
      .headwrap { display:flex; justify-content:space-between; align-items:stretch; border:1.5px solid #1e293b; margin-bottom:2px; }
      .headleft { flex:1; padding:10px 14px; border-right:1.5px solid #1e293b; display:flex; align-items:center; gap:12px; }
      .headleft .logo { max-height:40px; max-width:130px; object-fit:contain; flex-shrink:0; }
      .headleft .brandblock { min-width:0; }
      .headleft .brand { font-size:10px; letter-spacing:.06em; color:${co.color}; font-weight:bold; text-transform:uppercase; }
      .headleft h1 { font-size:15px; margin:4px 0 2px; text-transform:uppercase; }
      .headleft .sub { font-size:11px; font-weight:bold; }
      .headright table td { border:1px solid #1e293b; padding:3px 8px; font-size:9.5px; }
      .headright table td.k { background:#f1f5f9; font-weight:bold; text-align:right; }
      table.info { margin-bottom:0; }
      table.info td { border:1px solid #1e293b; padding:5px 8px; font-size:11px; }
      table.info td.label { background:#f1f5f9; font-weight:bold; width:16%; }
      .tipos { display:flex; gap:26px; border:1px solid #1e293b; border-top:none; padding:6px 10px; font-size:11px; font-weight:bold; }
      h2.section { font-size:10.5px; text-transform:uppercase; background:#1e293b; color:#fff; padding:4px 10px; margin:0; letter-spacing:.03em; }
      .box { border:1px solid #1e293b; border-top:none; padding:8px 10px; min-height:34px; white-space:pre-wrap; line-height:1.45; margin-bottom:0; }
      table.checklist td, table.checklist th { border:1px solid #1e293b; padding:4px 6px; font-size:10px; }
      table.checklist th { background:#f1f5f9; text-align:center; }
      .firmas { display:flex; margin-top:20px; }
      .firma { flex:1; border-top:1px solid #1e293b; margin:0 30px; padding-top:5px; text-align:center; font-size:10.5px; }
      .firma .cargo { color:#64748b; font-size:10px; }
      .firma-col { flex:1; margin:0 30px; text-align:center; font-size:10.5px; }
      .firma-slot { height:46px; display:flex; align-items:flex-end; justify-content:center; }
      .firma-slot img { max-height:44px; max-width:170px; object-fit:contain; }
      .firma-info { border-top:1px solid #1e293b; padding-top:5px; }
      .firma-info .cargo { color:#64748b; font-size:10px; }
      /* Reglas de paginación — no cambian el diseño, solo le dicen al navegador DÓNDE puede
         partir la página al imprimir/exportar a PDF. Sin esto, el bloque de firmas podía
         quedar cortado a la mitad entre dos páginas (la imagen de la firma en una página y
         el nombre en la siguiente) en vez de moverse completo a la página siguiente cuando
         no cabía. Las tablas SÍ pueden partirse entre páginas (evita páginas casi vacías),
         pero nunca a la mitad de una fila. */
      .headwrap, table.info, .tipos, .box { break-inside: avoid; page-break-inside: avoid; }
      table.info tr, table.checklist tr { break-inside: avoid; page-break-inside: avoid; }
      h2.section { break-after: avoid; page-break-after: avoid; }
      .firmas, .firma-col { break-inside: avoid; page-break-inside: avoid; }
      @media print { body { padding:14px; } }
    </style></head>
    <body>
      <div class="headwrap">
        <div class="headleft">
          ${co.logo ? `<img class="logo" src="${co.logo}" alt="${equipo.empresa}" />` : ''}
          <div class="brandblock">
            <div class="brand">${equipo.empresa}</div>
            <h1>Reporte ${tipoLabel}</h1>
            <div class="sub">GESTIÓN DE EQUIPOS BIOMÉDICOS</div>
          </div>
        </div>
        <div class="headright">
          <table>
            <tr><td class="k">Código</td><td>${docControl.codigo}</td></tr>
            <tr><td class="k">Versión</td><td>${docControl.version}</td></tr>
            <tr><td class="k">Tipo de copia</td><td>${docControl.tipoCopia}</td></tr>
            <tr><td class="k">Vigencia</td><td>${docControl.vigencia}</td></tr>
            <tr><td class="k">Página</td><td>${docControl.pagina}</td></tr>
          </table>
        </div>
      </div>

      <table class="info">
        <tr><td class="label">EQUIPO</td><td>${esc(equipo.equipo)}</td><td class="label">MARCA</td><td>${esc(equipo.marca)}</td><td class="label">N° ACTIVO</td><td>${esc(equipo.inventario)}</td></tr>
        <tr><td class="label">SERIE</td><td>${esc(equipo.numeroSerie)}</td><td class="label">MODELO</td><td>${esc(equipo.modelo)}</td><td class="label">UBICACIÓN</td><td>${esc(equipo.ubicacion)}</td></tr>
        <tr><td class="label">FECHA DE MANTENIMIENTO</td><td>${esc(formatFechaCorta(rep.fecha))}</td><td class="label">FECHA PRÓX. MANTENIMIENTO</td><td colspan="3">${esc(fechaProximoTxt)}</td></tr>
      </table>
      <div class="tipos">
        <span>${box(tipoKey === 'Preventivo')} PREVENTIVO</span>
        <span>${box(tipoKey === 'Correctivo')} CORRECTIVO</span>
        <span>${box(tipoKey === 'Instalación')} INSTALACIÓN</span>
        <span>${box(tipoKey === 'Baja')} BAJA DE EQUIPO</span>
      </div>

      <h2 class="section">Descripción del estado inicial del equipo</h2>
      <div class="box">${esc(rep.estadoInicial)}</div>

      <h2 class="section" style="margin-top:10px;">Características a inspeccionar</h2>
      <table class="checklist">
        <thead><tr><th style="text-align:left;">Ítem</th><th>No aplica</th><th>Buen estado</th><th>Mal estado</th><th style="text-align:left;">Observaciones</th></tr></thead>
        <tbody>${checklistRows}</tbody>
      </table>

      <h2 class="section" style="margin-top:10px;">Descripción del trabajo realizado</h2>
      <div class="box">${esc(rep.trabajoRealizado)}</div>

      ${firmasHtml}
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}

function ReporteTecnicoModal({ equipo, record, tipoKey, onClose, onSave, accent, t, readOnly }) {
  const existing = record.reporteTecnico || {};
  const docControl = docControlDe(equipo.empresa);
  // La fecha de mantenimiento es la que se registró al crear el registro (record.fecha)
  // — es la única fuente de verdad, nunca se sobrescribe con un valor distinto guardado
  // previamente en el reporte. Formato unificado para Preventivos, Correctivos,
  // Instalaciones y Baja de Equipo.
  const [fecha] = useState(record.fecha || todayISO());
  const [fechaProximo, setFechaProximo] = useState(existing.fechaProximo || '');
  const [estadoInicial, setEstadoInicial] = useState(existing.estadoInicial || record.fallaReportada || '');
  const [checklist, setChecklist] = useState(existing.checklist || defaultChecklist());
  const [trabajoRealizado, setTrabajoRealizado] = useState(existing.trabajoRealizado || record.observaciones || '');
  const [repuestos, setRepuestos] = useState(existing.repuestos || []);
  const [repDraft, setRepDraft] = useState({ item: '', cantidad: '' });
  const [quienRealizaNombre, setQuienRealizaNombre] = useState(existing.quienRealizaNombre || record.responsable || '');
  const [quienRecibeNombre, setQuienRecibeNombre] = useState(existing.quienRecibeNombre || '');
  const [firmaRealiza, setFirmaRealiza] = useState(existing.firmaRealiza || '');
  const [firmaRecibe, setFirmaRecibe] = useState(existing.firmaRecibe || '');

  const setItemEstado = (item, estado) => !readOnly && setChecklist({ ...checklist, [item]: { ...checklist[item], estado } });
  const setItemObs = (item, obs) => !readOnly && setChecklist({ ...checklist, [item]: { ...checklist[item], obs } });

  const buildReport = () => ({
    fecha, fechaProximo, estadoInicial, checklist, trabajoRealizado, repuestos,
    quienRealizaNombre, quienRecibeNombre,
    firmaRealiza, firmaRecibe,
    generadoEl: existing.generadoEl || new Date().toISOString(),
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/70" onClick={onClose} />
      <div className={`animate-modal-in relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl border p-5 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-start mb-1">
          <div>
            <div className="text-3xs uppercase tracking-wide" style={{ color: accent }}>Reporte de mantenimiento — {docControl.codigo}</div>
            <div className="text-sm font-bold">{equipo.equipo || 'Equipo sin nombre'}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex items-center justify-center w-11 h-11 -mr-2 -mt-2"><X size={18} /></button>
        </div>
        <div className={`text-3xs mb-4 ${t.muted}`}>
          Versión {docControl.version} · Vigencia {docControl.vigencia} · Tipo: {TIPO_INTERVENCION_MAP[tipoKey]}
          {readOnly && <span className="ml-2 inline-flex items-center gap-1"><Lock size={9} /> solo lectura</span>}
        </div>

        <div className={`rounded-lg border p-3 mb-4 grid grid-cols-3 gap-x-3 gap-y-1 text-2xs ${t.panel3} ${t.border}`}>
          <div><span className={t.muted}>Equipo: </span>{equipo.equipo}</div>
          <div><span className={t.muted}>Marca: </span>{equipo.marca || '—'}</div>
          <div><span className={t.muted}>N° activo: </span>{equipo.inventario || '—'}</div>
          <div><span className={t.muted}>Serie: </span>{equipo.numeroSerie || '—'}</div>
          <div><span className={t.muted}>Modelo: </span>{equipo.modelo || '—'}</div>
          <div><span className={t.muted}>Ubicación: </span>{equipo.ubicacion || '—'}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-1">
          <div>
            <Field label="Fecha de mantenimiento"><TextInput t={t} type="date" value={fecha} disabled onChange={() => {}} /></Field>
            <p className={`text-3xs mt-1 ${t.muted}`}>Definida al registrar el mantenimiento — no se puede modificar aquí.</p>
          </div>
          <Field label="Fecha de próximo mantenimiento"><TextInput t={t} type="month" value={fechaProximo} disabled={readOnly} onChange={setFechaProximo} /></Field>
        </div>

        <Field label="Descripción del estado inicial del equipo">
          <textarea rows={2} value={estadoInicial} disabled={readOnly} onChange={e => setEstadoInicial(e.target.value)} className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input} ${readOnly ? 'opacity-60' : ''}`} />
        </Field>

        <div className="mt-4 mb-1">
          <label className="text-3xs uppercase tracking-wide text-slate-400">Características a inspeccionar</label>
        </div>
        <div className={`rounded-lg border divide-y ${t.panel3} ${t.border}`} style={{ borderColor: 'inherit' }}>
          {CHECKLIST_ITEMS.map(item => (
            <div key={item} className="p-2 flex flex-wrap items-center gap-2" style={{ borderColor: 'inherit' }}>
              <span className="text-2xs flex-1 min-w-[150px]">{item}</span>
              <div className="flex gap-1">
                {CHECK_ESTADOS.map(ce => (
                  <button key={ce.key} type="button" disabled={readOnly} onClick={() => setItemEstado(item, ce.key)}
                    className="text-3xs font-semibold px-2 py-1 rounded border"
                    style={checklist[item]?.estado === ce.key ? { background: ce.color + '22', borderColor: ce.color, color: ce.color } : { borderColor: '#475569', color: '#64748b' }}>
                    {ce.label}
                  </button>
                ))}
              </div>
              <input type="text" value={checklist[item]?.obs || ''} disabled={readOnly} placeholder="Observaciones"
                onChange={e => setItemObs(item, e.target.value)}
                className={`w-full sm:w-56 rounded-md px-2 py-1 text-2xs border ${t.input} ${readOnly ? 'opacity-60' : ''}`} />
            </div>
          ))}
        </div>

        <div className="mt-4">
          <Field label="Descripción del trabajo realizado">
            <textarea rows={3} value={trabajoRealizado} disabled={readOnly} onChange={e => setTrabajoRealizado(e.target.value)} className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input} ${readOnly ? 'opacity-60' : ''}`} />
          </Field>
        </div>

        <label className="text-3xs uppercase tracking-wide text-slate-400 mt-3 block">Repuestos utilizados en el servicio</label>
        <div className="space-y-1.5 my-1.5">
          {repuestos.map((r, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${t.panel3} ${t.border}`}>
              <span className="text-xs flex-1">{r.item}</span>
              <span className="text-xs w-16 text-right">{r.cantidad}</span>
              {!readOnly && <button type="button" onClick={() => setRepuestos(repuestos.filter((_, idx) => idx !== i))} aria-label="Quitar repuesto" className="text-red-400"><Trash2 size={12} /></button>}
            </div>
          ))}
          {repuestos.length === 0 && <div className={`text-xs text-center py-2 ${t.muted}`}>Sin repuestos registrados</div>}
        </div>
        {!readOnly && (
          <div className="flex gap-2 mb-3">
            <TextInput t={t} value={repDraft.item} placeholder="Repuesto" onChange={v => setRepDraft({ ...repDraft, item: v })} />
            <TextInput t={t} value={repDraft.cantidad} placeholder="Cantidad" onChange={v => setRepDraft({ ...repDraft, cantidad: v })} />
            <button type="button" onClick={() => { if (repDraft.item) { setRepuestos([...repuestos, repDraft]); setRepDraft({ item: '', cantidad: '' }); } }} className="rounded-md px-3 text-xs font-semibold border" style={{ borderColor: accent, color: accent }}>+</button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mt-2">
          <div>
            <div className="text-3xs uppercase tracking-wide text-slate-400 mb-1">Nombre de quien realiza</div>
            <TextInput t={t} value={quienRealizaNombre} disabled={readOnly} onChange={setQuienRealizaNombre} />
            <div className="text-3xs uppercase tracking-wide text-slate-400 mt-2 mb-1">Firma</div>
            <FirmaInput t={t} value={firmaRealiza} onChange={setFirmaRealiza} readOnly={readOnly} alt="Firma de quien realiza" />
          </div>
          <div>
            <div className="text-3xs uppercase tracking-wide text-slate-400 mb-1">Nombre de quien recibe</div>
            <TextInput t={t} value={quienRecibeNombre} disabled={readOnly} onChange={setQuienRecibeNombre} />
            <div className="text-3xs uppercase tracking-wide text-slate-400 mt-2 mb-1">Firma</div>
            <FirmaInput t={t} value={firmaRecibe} onChange={setFirmaRecibe} readOnly={readOnly} alt="Firma de quien recibe" />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          {!readOnly && <Button variant="primary" size="lg" accent={accent} onClick={() => onSave(buildReport())}>Guardar reporte</Button>}
          <Button variant="outline" size="lg" t={t} icon={FileText} onClick={() => generarReportePDF(equipo, tipoKey, buildReport())}>Exportar PDF</Button>
        </div>
      </div>
    </div>
  );
}

export default function ReporteTecnicoButton({ equipo, record, tipoKey, onSave, accent, t, readOnly }) {
  const [open, setOpen] = useState(false);
  const hasReport = !!record.reporteTecnico;
  if (readOnly && !hasReport) return null; // Sin reporte y sin permiso para crear uno: no se muestra nada.
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="text-3xs font-semibold px-2.5 py-1.5 rounded-md border flex items-center gap-1.5"
        style={hasReport ? { borderColor: accent, color: accent } : { borderColor: '#475569', color: '#94a3b8' }}>
        <FileBarChart size={12} /> {hasReport ? (readOnly ? 'Ver reporte' : 'Ver / editar reporte') : 'Generar reporte'}
      </button>
      {open && (
        <ReporteTecnicoModal
          equipo={equipo} record={record} tipoKey={tipoKey} accent={accent} t={t} readOnly={readOnly}
          onClose={() => setOpen(false)}
          onSave={(rep) => { onSave(rep); setOpen(false); }}
        />
      )}
    </>
  );
}
