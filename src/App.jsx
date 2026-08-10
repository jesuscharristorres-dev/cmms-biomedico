import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Plus, Trash2, Copy, Download, Upload, Sun, Moon, X, Menu,
  MessageCircle, FileText, LayoutDashboard, Building2, ListTree, CalendarClock,
  ShieldCheck, Wrench, FileBarChart, Settings, ArrowUpDown, BellRing, Mail, AlertTriangle, Lock,
  User, Eye, EyeOff, Image as ImageIcon
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line
} from 'recharts';
import * as XLSX from 'xlsx';
import {
  notifyFallaReportada, notifyCorrectivoRegistrado, notifyPreventivoProximo, notifyCalibracionProxima,
  sendAlertsSummary, getNotifiedIds, markNotified,
} from './services/emailService';
import { PREVENTIVO_ALERTA_DIAS, calibStatus, buildAlerts } from './services/alertLogic';

/* ---------------------------------------------------------------- */
/* CONFIG                                                            */
/* ---------------------------------------------------------------- */

const NEUTRAL_ACCENT = '#4FD1C5';
// Modo invitado: cuando es true, toda la app queda en solo lectura (ver ConfigPage "Cerrar sesión"
// y el wrapper App() al final del archivo). Se consume con useContext(ReadOnlyContext).
const ReadOnlyContext = React.createContext(false);
// Sello de versión — actualízalo cuando reemplaces App.jsx, así confirmas en Configuración
// que el navegador está sirviendo la versión más reciente y no una copia en caché.
const APP_BUILD = '2026-08-02 · Resumen diario automático de alertas (8am, Vercel Cron + KV)';

const COMPANIES = [
  { key: 'MACROMED', color: '#002485', gradient: 'linear-gradient(135deg, #002485 0%, #1F4FB8 100%)', sedes: ['Bogotá'] },
  { key: 'MEIDE', color: '#24546A', gradient: 'linear-gradient(135deg, #24546A 0%, #3B7088 100%)', sedes: ['Armenia Berlín','Armenia Fundadores','Manizales Belén','Manizales Arboleda','La Dorada','Unidad Móvil'] },
  { key: 'NP MEDICAL', color: '#3F8E6F', gradient: 'linear-gradient(135deg, #3F8E6F 0%, #63B48F 100%)', sedes: ['Bogotá Samper','Bogotá Sur','Fontibón','Girardot'] },
  { key: 'DIAGNOSTIK', color: '#C62828', gradient: 'linear-gradient(135deg, #C62828 0%, #E53935 100%)', sedes: ['Armenia Berlín','Armenia Fundadores','Manizales Berlín','Manizales Belén','Bogotá','Chapinero','Villavicencio','La Dorada'] },
  { key: 'AUNAR SALUD', color: '#009EB7', gradient: 'linear-gradient(135deg, #009EB7 0%, #33C4D8 100%)', sedes: ['Bogotá','Villavicencio','Neiva'] },
];
const companyOf = (key) => COMPANIES.find(c => c.key === key);

// Aclara (percent > 0) u oscurece (percent < 0) un color HEX — usado para generar variantes
// de una misma marca en gráficas, sin mezclar el color de otra empresa.
function shade(hex, percent) {
  const f = parseInt(hex.slice(1), 16), t = percent < 0 ? 0 : 255, p = Math.abs(percent);
  const R = f >> 16, G = (f >> 8) & 0x00FF, B = f & 0x0000FF;
  return '#' + (0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 + (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1);
}

// Tema único por empresa: todos los componentes reutilizan estos mismos valores.
// Para cambiar la identidad visual de una empresa, basta con editar COMPANIES arriba.
function themeOf(companyKey) {
  if (!companyKey || companyKey === 'TODAS') {
    return { key: 'TODAS', solid: NEUTRAL_ACCENT, bg: NEUTRAL_ACCENT, light: shade(NEUTRAL_ACCENT, 0.4), dark: shade(NEUTRAL_ACCENT, -0.25), shades: [0.45, 0.25, 0.05, -0.15, -0.32, -0.48].map(p => shade(NEUTRAL_ACCENT, p)) };
  }
  const c = companyOf(companyKey) || COMPANIES[0];
  return { key: c.key, solid: c.color, bg: c.gradient, light: shade(c.color, 0.4), dark: shade(c.color, -0.25), shades: [0.5, 0.3, 0.12, -0.1, -0.28, -0.45, -0.58].map(p => shade(c.color, p)) };
}

// Clases de superficie claro/oscuro — única fuente de verdad, la usa MainApp y
// también las pantallas públicas (ReporteFallaForm) para no divergir del resto del CMMS.
function uiTheme(dark) {
  return dark
    ? { bg: 'bg-slate-950', panel: 'bg-slate-900', panel3: 'bg-slate-800/60', border: 'border-slate-700/60', text: 'text-slate-100', muted: 'text-slate-400', input: 'bg-slate-950 border-slate-700 text-slate-100' }
    : { bg: 'bg-slate-50', panel: 'bg-white', panel3: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-900', muted: 'text-slate-500', input: 'bg-white border-slate-300 text-slate-900' };
}

const MONTHS = [
  { k: 'ene', l: 'Ene', full: 'Enero', idx: 0 }, { k: 'feb', l: 'Feb', full: 'Febrero', idx: 1 }, { k: 'mar', l: 'Mar', full: 'Marzo', idx: 2 },
  { k: 'abr', l: 'Abr', full: 'Abril', idx: 3 }, { k: 'may', l: 'May', full: 'Mayo', idx: 4 }, { k: 'jun', l: 'Jun', full: 'Junio', idx: 5 },
  { k: 'jul', l: 'Jul', full: 'Julio', idx: 6 }, { k: 'ago', l: 'Ago', full: 'Agosto', idx: 7 }, { k: 'sep', l: 'Sep', full: 'Septiembre', idx: 8 },
  { k: 'oct', l: 'Oct', full: 'Octubre', idx: 9 }, { k: 'nov', l: 'Nov', full: 'Noviembre', idx: 10 }, { k: 'dic', l: 'Dic', full: 'Diciembre', idx: 11 },
];
function formatFechaCorta(fechaStr) {
  const d = new Date(fechaStr + 'T00:00:00');
  if (isNaN(d.getTime())) return fechaStr;
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()].l} ${d.getFullYear()}`;
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
// Acceso simple — cámbialo por tus propios datos.
const AUTH_USER = 'jesus.charris';
const AUTH_PASS = 'biomedica2026';

const CLASIFICACIONES = ['I', 'IIA', 'IIB', 'III'];
const ESTADOS_EQUIPO = ['Operativo', 'Fuera de servicio', 'En mantenimiento', 'Dado de baja'];
const PERIODICIDADES = ['Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual'];
const MENU = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'alertas', label: 'Alertas', icon: BellRing },
  { key: 'fallas', label: 'Reportes de falla', icon: AlertTriangle },
  { key: 'empresas', label: 'Empresas', icon: Building2 },
  { key: 'inventario', label: 'Inventario', icon: ListTree },
  { key: 'mantenimientos', label: 'Mantenimientos', icon: CalendarClock },
  { key: 'calibraciones', label: 'Calibraciones', icon: ShieldCheck },
  { key: 'correctivos', label: 'Correctivos', icon: Wrench },
  { key: 'reportes', label: 'Reportes', icon: FileBarChart },
  { key: 'configuracion', label: 'Configuración', icon: Settings },
];
// Semáforo semántico compartido — mantenimientos y calibraciones usan el mismo
// significado de color (verde=bien, ámbar=próximo, rojo=vencido, gris=sin dato),
// antes duplicado como dos mapas hex idénticos con llaves distintas.
const SEMANTIC_HEX = { ok: '#22C55E', warn: '#F59E0B', danger: '#EF4444', neutral: '#475569' };
const STATUS_HEX = { realizado: SEMANTIC_HEX.ok, programado: SEMANTIC_HEX.warn, vencido: SEMANTIC_HEX.danger, no_aplica: SEMANTIC_HEX.neutral };
const STATUS_LABEL = { realizado: 'Realizado', programado: 'Programado', vencido: 'Vencido', no_aplica: 'No aplica' };
const CAL_HEX = { vigente: SEMANTIC_HEX.ok, proximo: SEMANTIC_HEX.warn, vencido: SEMANTIC_HEX.danger, sin_dato: SEMANTIC_HEX.neutral };

const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);

function newEquipo(empresaKey) {
  const c = companyOf(empresaKey) || COMPANIES[0];
  return {
    id: uid('eq'),
    empresa: c.key, sede: c.sedes[0],
    equipo: '', marca: '', modelo: '', numeroSerie: '', registroInvima: '',
    clasificacionRiesgo: 'IIB', inventario: '',
    fechaInstalacion: '',
    fotografiaUrl: '', ubicacion: '', estado: 'Operativo', actaEntregaUrl: '', hojaVidaUrl: '',
    periodicidadMantenimiento: 'Anual', periodicidadCalibracion: 'Anual',
    aplicaCalibracion: true, aplicaPreventivo: true,
    fechaUltimaCalibracion: '', certificadoUrl: '', observaciones: '',
    preventivos: [], correctivos: [], calibraciones: [], instalaciones: [], documentos: [], bajas: [],
  };
}

/* ---------------------------------------------------------------- */
/* HELPERS DE CÁLCULO                                                 */
/* ---------------------------------------------------------------- */

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
  (equipo.preventivos || []).forEach(p => rows.push({ fecha: p.fecha, tipo: 'Preventivo', detalle: `${p.responsable || 'Sin responsable'} · ${p.estado || ''}`, reporte: !!p.reporteTecnico }));
  (equipo.correctivos || []).forEach(c => rows.push({ fecha: c.fecha, tipo: 'Correctivo', detalle: `${c.responsable || 'Sin responsable'} · ${c.estado || ''}`, reporte: !!c.reporteTecnico }));
  (equipo.calibraciones || []).forEach(c => rows.push({ fecha: c.fecha, tipo: 'Calibración', detalle: c.certificadoUrl ? 'Con certificado' : 'Sin certificado' }));
  (equipo.instalaciones || []).forEach(i => rows.push({ fecha: i.fecha, tipo: 'Instalación', detalle: i.proveedor || '', reporte: !!i.reporteTecnico }));
  (equipo.bajas || []).forEach(b => rows.push({ fecha: b.fecha, tipo: 'Baja de equipo', detalle: b.motivo || '', reporte: !!b.reporteTecnico }));
  return rows.filter(r => r.fecha).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

/* ---------------------------------------------------------------- */
/* REPORTES TÉCNICOS (Preventivo / Correctivo / Instalación / Baja)  */
/* ---------------------------------------------------------------- */
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
  { key: 'no_aplica', label: 'No aplica', color: '#64748B' },
  { key: 'bueno', label: 'Buen estado', color: '#22C55E' },
  { key: 'malo', label: 'Mal estado', color: '#EF4444' },
];
function defaultChecklist() {
  const c = {};
  CHECKLIST_ITEMS.forEach(item => { c[item] = { estado: 'no_aplica', obs: '' }; });
  return c;
}
const TIPO_INTERVENCION_MAP = { Preventivo: 'Preventivo', Correctivo: 'Correctivo', Instalación: 'Instalación', Baja: 'Baja de Equipo' };

function generarReportePDF(equipo, tipoKey, rep) {
  const co = companyOf(equipo.empresa);
  const docControl = docControlDe(equipo.empresa);
  const tipoLabel = TIPOS_REPORTE_LABEL[tipoKey] || tipoKey;
  const win = window.open('', '_blank');
  if (!win) { alert('El navegador bloqueó la ventana emergente. Habilítala para generar el PDF.'); return; }
  const esc = (v) => (v || '—');
  const box = (checked) => checked ? '☑' : '☐';

  // El reporte no incluye la columna de observaciones del checklist (formato unificado).
  const checklistRows = CHECKLIST_ITEMS.map(item => {
    const c = (rep.checklist && rep.checklist[item]) || { estado: 'no_aplica', obs: '' };
    return `<tr>
      <td>${item}</td>
      <td style="text-align:center;">${c.estado === 'no_aplica' ? '✔' : ''}</td>
      <td style="text-align:center;">${c.estado === 'bueno' ? '✔' : ''}</td>
      <td style="text-align:center;">${c.estado === 'malo' ? '✔' : ''}</td>
    </tr>`;
  }).join('');

  // La fecha de próximo mantenimiento solo muestra mes y año (formato unificado).
  const fechaProximoTxt = formatMesAnio(rep.fechaProximo);

  const repuestosTxt = (rep.repuestos || []).length
    ? rep.repuestos.map(r => `${r.item}${r.cantidad ? ' — ' + r.cantidad : ''}`).join('<br/>')
    : '—';

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
      .headleft { flex:1; padding:10px 14px; border-right:1.5px solid #1e293b; }
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
      .firmas { display:flex; margin-top:26px; }
      .firma { flex:1; border-top:1px solid #1e293b; margin:0 30px; padding-top:5px; text-align:center; font-size:10.5px; }
      .firma .cargo { color:#64748b; font-size:10px; }
      .firma-col { flex:1; margin:0 30px; text-align:center; font-size:10.5px; }
      .firma-slot { height:46px; display:flex; align-items:flex-end; justify-content:center; }
      .firma-slot img { max-height:44px; max-width:170px; object-fit:contain; }
      .firma-info { border-top:1px solid #1e293b; padding-top:5px; }
      .firma-info .cargo { color:#64748b; font-size:10px; }
      @media print { body { padding:14px; } }
    </style></head>
    <body>
      <div class="headwrap">
        <div class="headleft">
          <div class="brand">${equipo.empresa}</div>
          <h1>Reporte ${tipoLabel}</h1>
          <div class="sub">GESTIÓN DE EQUIPOS BIOMÉDICOS</div>
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
        <tr><td class="label">FECHA DE MANTENIMIENTO</td><td>${esc(rep.fecha)}</td><td class="label">FECHA PRÓX. MANTENIMIENTO</td><td colspan="3">${esc(fechaProximoTxt)}</td></tr>
      </table>
      <div class="tipos">
        <span>${box(tipoKey === 'Preventivo')} PREVENTIVO</span>
        <span>${box(tipoKey === 'Correctivo')} CORRECTIVO</span>
        <span>${box(tipoKey === 'Instalación')} INSTALACIÓN</span>
        <span>${box(tipoKey === 'Baja')} BAJA DE EQUIPO</span>
      </div>

      <h2 class="section">Descripción del estado inicial del equipo</h2>
      <div class="box">${esc(rep.estadoInicial)}</div>

      <h2 class="section" style="margin-top:14px;">Características a inspeccionar</h2>
      <table class="checklist">
        <thead><tr><th style="text-align:left;">Ítem</th><th>No aplica</th><th>Buen estado</th><th>Mal estado</th></tr></thead>
        <tbody>${checklistRows}</tbody>
      </table>

      <h2 class="section" style="margin-top:14px;">Descripción del trabajo realizado</h2>
      <div class="box">${esc(rep.trabajoRealizado)}</div>

      <h2 class="section" style="margin-top:14px;">Repuestos utilizados en el servicio</h2>
      <div class="box">${repuestosTxt}</div>
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

function ReporteTecnicoButton({ equipo, record, tipoKey, onSave, accent, t, readOnly }) {
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

/* ---------------------------------------------------------------- */
/* PERSISTENCIA                                                      */
/* ---------------------------------------------------------------- */

async function loadEquipos() {
  try {
    const raw = localStorage.getItem('cmms-equipos');
    if (raw) return JSON.parse(raw);
  } catch { /* sin datos aún */ }
  return [];
}
async function saveEquipos(equipos) {
  try { localStorage.setItem('cmms-equipos', JSON.stringify(equipos)); }
  catch (e) { console.error('Error guardando', e); }
}

/* ---------------------------------------------------------------- */
/* REPORTES DE FALLA (coordinadores de sede)                         */
/* ---------------------------------------------------------------- */
// Capa de datos aislada a propósito: hoy usa localStorage (un solo navegador).
// Para que los coordinadores reporten desde otras sedes en tiempo real,
// reemplaza SOLO estas 3 funciones por llamadas a Firebase/Supabase —
// el resto de la app (formulario, tablero, estados) no necesita cambiar.
const REPORTES_KEY = 'cmms-reportes-falla';
async function loadReportes() {
  try {
    const raw = localStorage.getItem(REPORTES_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* sin datos aún */ }
  return [];
}
async function saveReportes(reportes) {
  try { localStorage.setItem(REPORTES_KEY, JSON.stringify(reportes)); }
  catch (e) { console.error('Error guardando reportes', e); }
}
function newReporte(empresa, sede) {
  return {
    id: uid('rf'),
    empresa, sede, equipoId: '', equipoNombre: '',
    fecha: todayISO(), personaReporta: '', descripcion: '', prioridad: 'Media',
    adjuntos: [],
    estado: 'Reportado', tecnicoAsignado: '', fechaCierre: '', observacionesReparacion: '',
    visto: false,
  };
}
const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Crítica'];
const PRIORIDAD_HEX = { Baja: '#22C55E', Media: '#F59E0B', Alta: '#F97316', 'Crítica': '#EF4444' };
const REPORTE_ESTADOS = ['Reportado', 'En revisión', 'En proceso', 'Finalizado'];
const REPORTE_ESTADO_HEX = { Reportado: '#EF4444', 'En revisión': '#F59E0B', 'En proceso': '#0EA5E9', Finalizado: '#22C55E' };

/* ---------------------------------------------------------------- */
/* COMPONENTES REUTILIZABLES                                         */
/* ---------------------------------------------------------------- */

// Botón compartido — variantes primary/outline/danger/ghost. Reemplaza las
// reimplementaciones inline de className+style repetidas por toda la app.
// Incluye active:scale-[0.97] (feedback de presión) por defecto en todas las variantes.
const BUTTON_SIZE_CLS = {
  sm: 'px-2.5 py-1.5 text-2xs',
  md: 'px-3 py-1.5 text-xs',
  lg: 'px-4 py-2 text-xs',
};
function Button({ variant = 'outline', size = 'md', accent, t, icon: Icon, iconSize = 13, className = '', style, children, ...props }) {
  const sizeCls = BUTTON_SIZE_CLS[size] || BUTTON_SIZE_CLS.md;
  const base = `inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 ${sizeCls}`;
  let variantCls = '';
  let variantStyle = style;
  if (variant === 'primary') variantStyle = { background: accent, color: '#fff', ...style };
  else if (variant === 'danger') variantStyle = { background: '#EF4444', color: '#fff', ...style };
  else if (variant === 'outline') variantCls = `border ${t ? t.border : 'border-slate-300'}`;
  else if (variant === 'ghost') variantCls = `border ${t ? t.border : 'border-slate-300'} ${t ? t.muted : 'text-slate-500'} hover:opacity-80`;
  return (
    <button className={`${base} ${variantCls} ${className}`} style={variantStyle} {...props}>
      {Icon && <Icon size={iconSize} />} {children}
    </button>
  );
}

// Badge compartido — pill de estado con fondo translúcido del mismo color del texto.
function Badge({ color, mono = true, children }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-3xs ${mono ? 'font-mono uppercase' : ''}`} style={{ background: color + '22', color }}>
      {children}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-3xs uppercase tracking-wide text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, t, type = 'text', placeholder, disabled }) {
  return (
    <input
      type={type} value={value || ''} placeholder={placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={`w-full rounded-md px-2.5 py-1.5 text-xs border ${t.input} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    />
  );
}
function SelectInput({ value, onChange, options, t, disabled }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled} className={`rounded-md px-2.5 py-1.5 text-xs border ${t.input} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// Componente único para presentar cualquier campo de documento (certificados, actas,
// hojas de vida, manuales, adjuntos, etc.) en toda la app. Nunca se muestra la URL cruda:
// solo un botón con ícono de PDF, o un estado "Sin documento" si está vacío. El enlace
// real se conserva intacto en los datos — esto solo cambia la presentación visual.
// Cualquier campo nuevo de documento debe reutilizar este mismo componente.
function PdfLink({ url, label = 'Ver PDF', title, t }) {
  if (!url) {
    return (
      <span title="Sin documento"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs shrink-0 cursor-default select-none ${t ? t.border : 'border-slate-300'} ${t ? t.muted : 'text-slate-400'}`}>
        <FileText size={13} /> Sin documento
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title={title || label}
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold shrink-0 transition-colors hover:bg-[#DC2626]/10"
      style={{ borderColor: '#DC2626', color: '#DC2626' }}>
      <FileText size={13} /> {label}
    </a>
  );
}

// Carga + vista previa de una imagen de firma (PNG). El valor se guarda como Data URI,
// así se imprime directamente en el reporte sin depender de almacenamiento externo.
function FirmaInput({ value, onChange, readOnly, alt, t }) {
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsDataURL(file);
  };
  return (
    <div className={`rounded-lg border p-2 flex items-center gap-2 ${t.panel3} ${t.border}`}>
      <div className={`w-20 h-11 rounded-md border overflow-hidden flex items-center justify-center shrink-0 bg-white ${t.border}`}>
        {value
          ? <img src={value} alt={alt} className="w-full h-full object-contain" />
          : <span className={`text-3xs px-1 text-center leading-tight ${t.muted}`}>Sin firma</span>}
      </div>
      {!readOnly && (
        <div className="flex-1 min-w-0">
          <input type="file" accept="image/png" onChange={handleFile} className={`w-full text-3xs ${t.muted}`} />
          {value && <button type="button" onClick={() => onChange('')} className="text-3xs text-red-400 mt-0.5">Quitar firma</button>}
        </div>
      )}
    </div>
  );
}

/** Editor genérico de listas de registros (preventivos, correctivos, etc.) */
function RecordList({ t, records, fields, onAdd, onRemove, onUpdate, renderExtra, readOnly }) {
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
                  <label className="text-3xs uppercase text-slate-400">{f.label}</label>
                  {f.type === 'select'
                    ? <SelectInput t={t} value={r[f.key]} options={f.options} disabled={readOnly} onChange={v => onUpdate(i, f.key, v)} />
                    : f.type === 'url'
                      ? (
                        <div className="flex gap-1.5">
                          <div className="flex-1 min-w-0"><TextInput t={t} value={r[f.key]} disabled={readOnly} onChange={v => onUpdate(i, f.key, v)} /></div>
                          <PdfLink url={r[f.key]} title={`Ver ${f.label.replace(' (URL)', '')}`} t={t} />
                        </div>
                      )
                      : <TextInput t={t} type={f.type || 'text'} value={r[f.key]} disabled={readOnly} onChange={v => onUpdate(i, f.key, v)} />}
                </div>
              ))}
              {!readOnly && <button onClick={() => onRemove(i)} aria-label="Eliminar registro" className="self-end text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button>}
            </div>
            {renderExtra && <div className="mt-2 pt-2 border-t border-dashed border-slate-700/40">{renderExtra(r, i)}</div>}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className={`rounded-lg border p-2.5 ${t.panel3} ${t.border}`}>
          <div className="flex flex-wrap gap-2">
            {fields.map(f => (
              <div key={f.key} className="flex-1 min-w-[120px]">
                <label className="text-3xs uppercase text-slate-400">{f.label}</label>
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
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* DRAWER — HOJA DE VIDA                                              */
/* ---------------------------------------------------------------- */

const DRAWER_TABS = ['Información General', 'Cronograma', 'Preventivos', 'Correctivos', 'Calibraciones', 'Instalaciones', 'Baja de Equipo', 'Documentos', 'Historial'];

function EquipoDrawer({ equipo, onClose, onUpdate, t, readOnly, alertEmails }) {
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
      <div className={`animate-drawer-in relative w-full sm:w-[640px] h-full overflow-y-auto ${t.panel} border-l ${t.border}`}>
        <div className="sticky top-0 z-10 px-5 py-4 border-b flex items-center justify-between" style={{ background: accentBg, borderColor: accent }}>
          <div>
            <div className="text-white/70 text-3xs uppercase tracking-wide flex items-center gap-1.5">
              {equipo.empresa} · {equipo.sede} {readOnly && <span className="inline-flex items-center gap-1 bg-black/25 rounded-full px-1.5 py-0.5"><Lock size={9} /> solo lectura</span>}
            </div>
            <div className="text-white text-lg font-bold">{equipo.equipo || 'Equipo sin nombre'}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex items-center justify-center w-11 h-11 -mr-2 text-white/80 hover:text-white"><X size={20} /></button>
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
            <div className="relative pr-36">
              {/* Fotografía — flotante en la esquina superior derecha, fuera del flujo de la grilla
                  para que los campos de la izquierda no dependan de su altura. */}
              <div className="absolute top-0 right-0 w-32">
                <div className={`w-32 h-32 rounded-lg border overflow-hidden flex items-center justify-center ${t.panel3} ${t.border}`}>
                  {equipo.fotografiaUrl
                    ? <img src={equipo.fotografiaUrl} alt="Equipo" className="w-full h-full object-contain" />
                    : (
                      <div className={`flex flex-col items-center gap-1 text-center px-2 ${t.muted}`}>
                        <ImageIcon size={20} />
                        <span className="text-3xs leading-tight">Sin fotografía</span>
                      </div>
                    )}
                </div>
                {!readOnly && (
                  <input value={equipo.fotografiaUrl || ''} placeholder="URL de la foto" onChange={e => patch('fotografiaUrl', e.target.value)}
                    className={`mt-1.5 w-32 rounded-md px-1.5 py-1 text-3xs border ${t.input}`} />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Empresa"><SelectInput t={t} disabled={readOnly} value={equipo.empresa} options={COMPANIES.map(c => c.key)} onChange={v => onUpdate({ ...equipo, empresa: v, sede: companyOf(v).sedes[0] })} /></Field>
                <Field label="Sede"><SelectInput t={t} disabled={readOnly} value={equipo.sede} options={companyOf(equipo.empresa).sedes} onChange={v => patch('sede', v)} /></Field>
                <Field label="Equipo"><TextInput t={t} disabled={readOnly} value={equipo.equipo} onChange={v => patch('equipo', v)} /></Field>
                <Field label="Marca"><TextInput t={t} disabled={readOnly} value={equipo.marca} onChange={v => patch('marca', v)} /></Field>
                <Field label="Modelo"><TextInput t={t} disabled={readOnly} value={equipo.modelo} onChange={v => patch('modelo', v)} /></Field>
                <Field label="Serie"><TextInput t={t} disabled={readOnly} value={equipo.numeroSerie} onChange={v => patch('numeroSerie', v)} /></Field>
                <Field label="Registro INVIMA"><TextInput t={t} disabled={readOnly} value={equipo.registroInvima} onChange={v => patch('registroInvima', v)} /></Field>
                <Field label="Clasificación de riesgo"><SelectInput t={t} disabled={readOnly} value={equipo.clasificacionRiesgo} options={CLASIFICACIONES} onChange={v => patch('clasificacionRiesgo', v)} /></Field>
                <Field label="Inventario"><TextInput t={t} disabled={readOnly} value={equipo.inventario} onChange={v => patch('inventario', v)} /></Field>
                <Field label="Estado"><SelectInput t={t} disabled={readOnly} value={equipo.estado} options={ESTADOS_EQUIPO} onChange={v => patch('estado', v)} /></Field>
                <Field label="Fecha de instalación"><TextInput t={t} disabled={readOnly} type="date" value={equipo.fechaInstalacion} onChange={v => patch('fechaInstalacion', v)} /></Field>
                <Field label="Ubicación"><TextInput t={t} disabled={readOnly} value={equipo.ubicacion} onChange={v => patch('ubicacion', v)} /></Field>
                <Field label="Periodicidad de mantenimiento"><SelectInput t={t} disabled={readOnly} value={equipo.periodicidadMantenimiento} options={PERIODICIDADES} onChange={v => patch('periodicidadMantenimiento', v)} /></Field>
                <Field label="Periodicidad de calibración"><SelectInput t={t} disabled={readOnly} value={equipo.periodicidadCalibracion} options={PERIODICIDADES} onChange={v => patch('periodicidadCalibracion', v)} /></Field>

                <div>
                  <Field label="Acta de entrega (URL)">
                    <div className="flex gap-2">
                      <div className="flex-1 min-w-0"><TextInput t={t} disabled={readOnly} value={equipo.actaEntregaUrl} placeholder="https://drive.google.com/..." onChange={v => patch('actaEntregaUrl', v)} /></div>
                      <PdfLink url={equipo.actaEntregaUrl} title="Ver acta de entrega" t={t} />
                    </div>
                  </Field>
                  {!readOnly && <p className={`text-3xs mt-1 ${t.muted}`}>Sube el acta firmada a Drive/OneDrive/SharePoint y pega aquí el enlace.</p>}
                </div>
                <div>
                  <Field label="Hoja de vida (URL)">
                    <div className="flex gap-2">
                      <div className="flex-1 min-w-0"><TextInput t={t} disabled={readOnly} value={equipo.hojaVidaUrl} placeholder="https://drive.google.com/..." onChange={v => patch('hojaVidaUrl', v)} /></div>
                      <PdfLink url={equipo.hojaVidaUrl} title="Ver hoja de vida" t={t} />
                    </div>
                  </Field>
                  {!readOnly && <p className={`text-3xs mt-1 ${t.muted}`}>Sube la hoja de vida a Drive/OneDrive/SharePoint y pega aquí el enlace.</p>}
                </div>

                <div className="col-span-2 flex gap-4 mt-1">
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={equipo.aplicaCalibracion} disabled={readOnly} onChange={e => patch('aplicaCalibracion', e.target.checked)} /> Aplica calibración</label>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={equipo.aplicaPreventivo} disabled={readOnly} onChange={e => patch('aplicaPreventivo', e.target.checked)} /> Aplica preventivo</label>
                </div>
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
                      <div className="w-3 h-3 rounded-full mx-auto mb-1.5" style={{ background: STATUS_HEX[st] }} role="img" aria-label={STATUS_LABEL[st]} title={STATUS_LABEL[st]} />
                      <div className="text-2xs font-mono uppercase" translate="no" lang="es">{m.full}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-3 flex-wrap text-2xs">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_HEX.realizado }} />Realizado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_HEX.programado }} />Programado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_HEX.vencido }} />Vencido</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_HEX.no_aplica }} />No aplica</span>
              </div>
            </div>
          )}

          {tab === 'Preventivos' && (
            <RecordList t={t} records={equipo.preventivos} readOnly={readOnly}
              fields={[
                { key: 'fecha', label: 'Fecha', type: 'date' },
                { key: 'responsable', label: 'Responsable' },
                { key: 'estado', label: 'Estado', type: 'select', options: ['Programado', 'Ejecutado'] },
                { key: 'pdfUrl', label: 'PDF (URL)', type: 'url' },
              ]}
              onAdd={(d) => patchList('preventivos', [...equipo.preventivos, { id: uid('pv'), fecha: todayISO(), estado: 'Programado', ...d }])}
              onRemove={(i) => patchList('preventivos', equipo.preventivos.filter((_, idx) => idx !== i))}
              onUpdate={(i, k, v) => { const list = [...equipo.preventivos]; list[i] = { ...list[i], [k]: v }; patchList('preventivos', list); }}
              renderExtra={(r, i) => r.estado === 'Ejecutado' && (
                <ReporteTecnicoButton equipo={equipo} record={r} tipoKey="Preventivo" accent={accent} t={t} readOnly={readOnly}
                  onSave={(rep) => { const list = [...equipo.preventivos]; list[i] = { ...list[i], reporteTecnico: rep }; patchList('preventivos', list); }} />
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
                try { notifyCorrectivoRegistrado(equipo, nuevo, alertEmails); } catch (err) { console.error('No se pudo notificar el correctivo por correo', err); }
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
              <RecordList t={t} records={equipo.calibraciones} readOnly={readOnly}
                fields={[
                  { key: 'fecha', label: 'Fecha calibración', type: 'date' },
                  { key: 'certificadoUrl', label: 'Certificado (URL)', type: 'url' },
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
            <RecordList t={t} records={equipo.instalaciones} readOnly={readOnly}
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
            <RecordList t={t} records={equipo.documentos} readOnly={readOnly}
              fields={[
                { key: 'tipo', label: 'Tipo', type: 'select', options: ['Manuales', 'Fichas técnicas', 'Guías de uso rápido', 'Registro INVIMA', 'Certificado de calibración', 'Factura', 'Otros'] },
                { key: 'nombre', label: 'Nombre' },
                { key: 'url', label: 'Enlace (URL)', type: 'url' },
              ]}
              onAdd={(d) => patchList('documentos', [...equipo.documentos, { id: uid('doc'), tipo: 'Otros', ...d }])}
              onRemove={(i) => patchList('documentos', equipo.documentos.filter((_, idx) => idx !== i))}
              onUpdate={(i, k, v) => { const list = [...equipo.documentos]; list[i] = { ...list[i], [k]: v }; patchList('documentos', list); }}
            />
          )}

          {tab === 'Historial' && (
            <div className="space-y-2">
              {historialDe(equipo).length === 0 && <div className={`text-xs text-center py-6 ${t.muted}`}>Sin eventos registrados todavía</div>}
              {historialDe(equipo).map((r, i) => (
                <div key={i} className={`rounded-lg border p-2.5 flex gap-3 items-start ${t.panel3} ${t.border}`}>
                  <div className="text-2xs font-mono w-20 shrink-0 pt-0.5">{r.fecha}</div>
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
  );
}

/* ---------------------------------------------------------------- */
/* MODAL SIMPLE (observaciones)                                      */
/* ---------------------------------------------------------------- */
function ObsModal({ equipo, onClose, onSave, t, accent, readOnly }) {
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

/* ---------------------------------------------------------------- */
/* LOGO — INGENIERÍA CLÍNICA (recreación vectorial de la marca)       */
/* ---------------------------------------------------------------- */
// Paleta institucional tomada del logo oficial: verde arriba, celeste/azul
// a los lados, azul institucional (el tono más denso) a la izquierda, con
// acentos cálidos (naranja/gris) en el arco derecho.
const LOGO_RING_STOPS = [
  { angle: 0, color: '#3CAA55' },
  { angle: 50, color: '#F2994A' },
  { angle: 95, color: '#93A0B8' },
  { angle: 140, color: '#E8A33D' },
  { angle: 180, color: '#2F8FBF' },
  { angle: 225, color: '#6EC6EA' },
  { angle: 270, color: '#173B6C' },
  { angle: 315, color: '#4FC3E7' },
  { angle: 360, color: '#3CAA55' },
];
function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 0xFF, ag = (a >> 8) & 0xFF, ab = a & 0xFF;
  const br = (b >> 16) & 0xFF, bg = (b >> 8) & 0xFF, bb = b & 0xFF;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + bl).toString(16).slice(1);
}
function colorAtAngle(deg) {
  const a = ((deg % 360) + 360) % 360;
  for (let i = 0; i < LOGO_RING_STOPS.length - 1; i++) {
    const s1 = LOGO_RING_STOPS[i], s2 = LOGO_RING_STOPS[i + 1];
    if (a >= s1.angle && a <= s2.angle) return lerpColor(s1.color, s2.color, (a - s1.angle) / (s2.angle - s1.angle));
  }
  return LOGO_RING_STOPS[0].color;
}
// PRNG determinista (mulberry32) — el patrón de nodos debe ser siempre el mismo
// entre renders, así que no se puede usar Math.random() en el cuerpo del componente.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Anillo de nodos tipo red molecular, inspirado en el logo oficial de Ingeniería Clínica.
// Se calcula una sola vez a nivel de módulo: la disposición no depende de props.
const LOGO_NODES = (() => {
  const rand = mulberry32(20260805);
  const count = 84;
  const arr = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360 + (rand() - 0.5) * 8;
    const radius = 76 + (rand() - 0.5) * 34;
    const rad = (angle * Math.PI) / 180;
    return {
      cx: 150 + radius * Math.sin(rad), cy: 150 - radius * Math.cos(rad),
      r: 2.2 + rand() * 4.2, color: colorAtAngle(angle), angle,
    };
  });
  return arr.sort((a, b) => a.angle - b.angle);
})();
function LogoMark({ size = 120, withWordmark = true, className = '' }) {
  return (
    <div className={className} style={{ width: size, textAlign: 'center' }}>
      <svg viewBox="0 0 300 300" width={size} height={size} role="img" aria-label="Logo Ingeniería Clínica">
        {LOGO_NODES.map((n, i) => {
          const next = LOGO_NODES[(i + 1) % LOGO_NODES.length];
          return (
            <g key={i}>
              <line x1={n.cx} y1={n.cy} x2={next.cx} y2={next.cy} stroke={n.color} strokeWidth="0.6" opacity="0.3" />
              <circle cx={n.cx} cy={n.cy} r={n.r} fill={n.color} opacity="0.9" />
            </g>
          );
        })}
      </svg>
      {withWordmark && (
        <div style={{ marginTop: size * -0.05 }}>
          <div className="font-bold" style={{ color: '#173B6C', fontSize: size * 0.115, letterSpacing: '0.22em' }}>INGENIERÍA</div>
          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            <span style={{ width: size * 0.13, height: 2, background: '#173B6C' }} />
            <span className="font-bold" style={{ color: '#3CAA55', fontSize: size * 0.1, letterSpacing: '0.22em' }}>CLÍNICA</span>
            <span style={{ width: size * 0.13, height: 2, background: '#3CAA55' }} />
          </div>
        </div>
      )}
    </div>
  );
}
// Marca de agua institucional — el mismo isotipo (anillo, sin texto), muy grande y
// casi imperceptible, solo para dar profundidad de fondo sin competir con el formulario.
function LogoWatermark({ size = 820, opacity = 0.035 }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
      <div style={{ opacity, filter: 'blur(2px)' }}>
        <LogoMark size={size} withWordmark={false} />
      </div>
    </div>
  );
}
// Degradado institucional casi imperceptible (azul · celeste · verde sobre blanco) —
// solo para el modo claro; el modo oscuro conserva el fondo sólido habitual del CMMS.
const REPORTE_BG_LIGHT = 'linear-gradient(160deg, #FFFFFF 0%, #EEF6FB 24%, #FFFFFF 48%, #EFF9F2 76%, #FFFFFF 100%)';

/* ---------------------------------------------------------------- */
/* PANTALLA DE ACCESO                                                 */
/* ---------------------------------------------------------------- */
function LoginScreen({ onLogin, onGuest, onReportarFalla }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(true);

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

  const BENEFICIOS = [
    { icon: ListTree, label: 'Inventario Inteligente', desc: 'Control total de tus equipos biomédicos.' },
    { icon: Wrench, label: 'Mantenimientos Preventivos', desc: 'Programa y asegura el rendimiento.' },
    { icon: ShieldCheck, label: 'Calibraciones', desc: 'Cumple con estándares y normativas.' },
    { icon: FileBarChart, label: 'Reportes Técnicos', desc: 'Información clara para mejores decisiones.' },
  ];

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 lg:p-8" style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: 'linear-gradient(160deg, #EDF6FB 0%, #F3FAF6 55%, #FFFFFF 100%)' }}>
      <style>{`
        @keyframes login-card-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes illus-float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        .login-card-wrap { width: 100%; animation: login-card-in .5s ease both; }
        @media (min-width: 1024px) { .login-card-wrap { width: 80%; max-width: 1180px; } }
        .login-illus { animation: illus-float 5s ease-in-out infinite; }
        .login-benefit:hover { transform: translateY(-3px); box-shadow: 0 14px 28px -10px rgba(15,23,42,0.18); }
        .login-input:focus { box-shadow: 0 0 0 3px rgba(47,143,209,0.22); border-color: #2F8FD1; }
        .login-btn-primary { background: linear-gradient(135deg, #173B6C 0%, #2F8FD1 100%); transition: filter 250ms ease, transform 250ms ease; }
        .login-btn-primary:hover { filter: brightness(1.08); }
        .login-btn-primary:active { transform: scale(0.98); }
        .login-fast { transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease, background-color 200ms ease, color 200ms ease; }
      `}</style>

      <div className="login-card-wrap flex flex-col lg:flex-row bg-white overflow-hidden" style={{ borderRadius: 28, boxShadow: '0 30px 70px -20px rgba(15,23,42,0.25)' }}>

        {/* LADO IZQUIERDO — identidad institucional (logo Ingeniería Clínica) */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between gap-6 p-10"
          style={{ background: 'linear-gradient(180deg, #F2F9FC 0%, #FFFFFF 50%)' }}>

          {/* formas orgánicas de fondo — paleta institucional */}
          <div className="absolute -top-24 -left-28 w-96 h-96" style={{ background: 'linear-gradient(135deg, #4FC3E7 0%, #BFE6F5 100%)', opacity: 0.45, borderRadius: '62% 38% 55% 45% / 48% 42% 58% 52%' }} />
          <div className="absolute top-10 left-14 w-16 h-16 rounded-full border-2 border-white/70" />
          <div className="absolute -bottom-32 -left-10 w-80 h-80" style={{ background: 'linear-gradient(135deg, #3CAA55 0%, #D2EFDB 100%)', opacity: 0.4, borderRadius: '45% 55% 60% 40% / 55% 45% 55% 45%' }} />
          <div className="absolute bottom-10 right-10 w-10 h-10 rounded-full border-2" style={{ borderColor: '#BEE3F2' }} />
          <div className="absolute grid grid-cols-6 gap-1.5 top-8 right-10 opacity-40">
            {Array.from({ length: 18 }).map((_, i) => <span key={i} className="w-1 h-1 rounded-full" style={{ background: '#4FC3E7' }} />)}
          </div>
          <div className="absolute grid grid-cols-8 gap-1.5 bottom-6 left-10 opacity-30">
            {Array.from({ length: 16 }).map((_, i) => <span key={i} className="w-1 h-1 rounded-full bg-slate-400" />)}
          </div>
          {/* patrón discreto de conexiones — inspirado en redes biomédicas */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.14]" viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true">
            <path d="M20,70 L92,45 L162,92 L232,52 M92,45 L112,124" stroke="#173B6C" strokeWidth="1.2" fill="none" />
            <path d="M34,428 L104,462 L182,414 L262,452 M104,462 L124,384" stroke="#3CAA55" strokeWidth="1.2" fill="none" />
            {[[20,70],[92,45],[162,92],[232,52],[112,124]].map(([cx,cy],i)=><circle key={'a'+i} cx={cx} cy={cy} r="3" fill="#173B6C" />)}
            {[[34,428],[104,462],[182,414],[262,452],[124,384]].map(([cx,cy],i)=><circle key={'b'+i} cx={cx} cy={cy} r="3" fill="#3CAA55" />)}
          </svg>

          {/* texto */}
          <div className="relative">
            <h1 className="text-5xl font-extrabold tracking-tight" style={{ color: '#173B6C' }}>BIENVENIDO</h1>
            <div className="w-12 h-1 rounded-full mt-3 mb-4" style={{ background: 'linear-gradient(90deg, #173B6C 0%, #3CAA55 100%)' }} />
            <p className="text-lg leading-snug">
              <span className="text-slate-700">Sistema Integral para la</span><br />
              <span className="font-bold" style={{ color: '#3CAA55' }}>Gestión de Equipos Biomédicos</span>
            </p>
            <p className="text-sm text-slate-500 mt-3 max-w-sm">Controla, gestiona y optimiza el ciclo de vida de tus equipos biomédicos de forma inteligente y eficiente.</p>
          </div>

          {/* LOGO — elemento principal de la pantalla */}
          <div className="login-illus relative flex-1 flex items-center justify-center min-h-[170px]">
            <LogoMark size={168} />
          </div>

          {/* highlights de producto — sin cifras ficticias */}
          <div className="relative grid grid-cols-2 gap-3 max-w-sm">
            {BENEFICIOS.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="login-benefit login-fast rounded-2xl bg-white/85 p-3.5" style={{ boxShadow: '0 8px 20px -8px rgba(23,59,108,0.14)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: '#E7F4FB' }}>
                  <Icon size={15} style={{ color: '#2F8FD1' }} />
                </div>
                <div className="text-xs font-bold text-slate-800 leading-tight">{label}</div>
                <div className="text-2xs text-slate-400 mt-1 leading-snug">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* LADO DERECHO — formulario */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center p-8 sm:p-12">
          <div className="w-full max-w-sm mx-auto">
            <div className="mb-4"><LogoMark size={56} withWordmark={false} /></div>
            <div className="text-xl font-bold tracking-wide" style={{ color: '#173B6C' }}>CMMS BIOMÉDICA</div>
            <div className="text-3xs uppercase font-semibold" style={{ color: '#3CAA55', letterSpacing: '0.18em' }}>Ingeniería Clínica</div>
            <p className="text-xs text-slate-400 mt-1 mb-7">Inicie sesión para continuar.</p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-3xs uppercase tracking-wide text-slate-500 font-semibold">Usuario</label>
                <div className="relative mt-1">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus value={user} onChange={e => { setUser(e.target.value); setError(''); }}
                    className="login-input login-fast w-full rounded-lg pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 text-slate-800 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-3xs uppercase tracking-wide text-slate-500 font-semibold">Contraseña</label>
                <div className="relative mt-1">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPass ? 'text' : 'password'} value={pass} onChange={e => { setPass(e.target.value); setError(''); }}
                    className="login-input login-fast w-full rounded-lg pl-9 pr-9 py-2.5 text-sm bg-slate-50 border border-slate-200 text-slate-800 outline-none"
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)} aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-500 select-none cursor-pointer">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 accent-[#2F8FD1]" />
                Mantener sesión iniciada
              </label>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle size={13} className="shrink-0" /> {error}
                </div>
              )}

              <button type="submit" className="login-btn-primary w-full rounded-lg py-2.5 text-sm font-semibold text-white">
                Iniciar sesión
              </button>
            </form>

            <button type="button" onClick={onGuest}
              className="login-fast w-full mt-3 rounded-lg py-2.5 text-sm font-semibold border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50/50">
              Ingresar como Invitado
            </button>

            <div className="flex items-center gap-2 mt-5 mb-1">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-3xs uppercase tracking-wide text-slate-400 font-semibold">¿Eres coordinador de sede?</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <button onClick={onReportarFalla} type="button"
              className="login-fast w-full mt-2 rounded-lg py-3 text-sm font-bold text-white flex items-center justify-center gap-2 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' }}>
              <Wrench size={16} /> Reportar una falla de equipo
            </button>

            <div className="flex items-center gap-1.5 justify-center text-2xs text-slate-400 mt-6">
              <Lock size={11} /> Conexión segura — Los datos están protegidos.
            </div>
            <div className="text-center text-3xs text-slate-300 mt-2">Versión 2.0</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* FORMULARIO PÚBLICO — REPORTE DE FALLA (coordinadores de sede)     */
/* ---------------------------------------------------------------- */
function ReporteFallaForm({ onBack }) {
  const [equipos, setEquipos] = useState([]);
  const [empresa, setEmpresa] = useState(COMPANIES[0].key);
  const [sede, setSede] = useState(COMPANIES[0].sedes[0]);
  const [equipoId, setEquipoId] = useState('');
  const [persona, setPersona] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState('Media');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [dark, setDark] = useState(false);
  const t = uiTheme(dark);

  useEffect(() => { loadEquipos().then(setEquipos); }, []);

  const equiposFiltrados = equipos.filter(e => e.empresa === empresa && e.sede === sede);

  const submit = async (e) => {
    e.preventDefault();
    if (!equipoId) {
      setError('Selecciona el equipo biomédico afectado.');
      return;
    }
    if (!descripcion.trim()) {
      setError('Describe el daño o la novedad detectada.');
      return;
    }
    if (!persona.trim()) {
      setError('Debe ingresar el nombre de la persona que reporta la falla.');
      return;
    }
    setError('');
    const eq = equipos.find(x => x.id === equipoId);
    const reportes = await loadReportes();
    const nuevo = {
      ...newReporte(empresa, sede),
      equipoId, equipoNombre: eq ? eq.equipo : '(equipo no encontrado en inventario)',
      personaReporta: persona, descripcion, prioridad,
    };
    await saveReportes([...reportes, nuevo]);
    setSent(true);
    // Notificación por correo — no bloquea el flujo si falla el envío.
    try {
      const destinatarios = JSON.parse(localStorage.getItem('cmms-alert-emails') || '[]');
      notifyFallaReportada(nuevo, destinatarios);
    } catch (err) { console.error('No se pudo notificar el reporte de falla por correo', err); }
  };

  if (sent) {
    return (
      <div className={`min-h-dvh flex items-center justify-center p-6 text-center relative overflow-hidden ${dark ? t.bg : ''} ${t.text}`}
        style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: dark ? undefined : REPORTE_BG_LIGHT }}>
        <LogoWatermark />
        <div className={`relative max-w-sm w-full rounded-xl border p-8 ${t.panel} ${t.border}`}>
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-lg font-bold mb-2">Reporte enviado</h1>
          <p className={`text-sm mb-5 ${t.muted}`}>Ingeniería Biomédica ha sido notificada.</p>
          <button onClick={onBack} className="rounded-md px-4 py-2 text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg, #173B6C 0%, #2F8FD1 100%)' }}>Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-dvh p-6 relative overflow-hidden ${dark ? t.bg : ''} ${t.text}`}
      style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: dark ? undefined : REPORTE_BG_LIGHT }}>
      <LogoWatermark />
      <div className="max-w-lg mx-auto relative">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className={`text-xs ${t.muted}`}>&larr; Volver</button>
          <Button variant="outline" size="sm" t={t} icon={dark ? Sun : Moon} iconSize={12} onClick={() => setDark(d => !d)}>{dark ? 'Modo claro' : 'Modo oscuro'}</Button>
        </div>

        <div className={`rounded-xl border p-6 ${t.panel} ${t.border}`}>
          <div className="text-3xs uppercase tracking-widest mb-1" style={{ color: '#2F8FD1' }}>CMMS Biomédico</div>
          <h1 className="text-lg font-bold mb-1">Reportar falla de equipo</h1>
          <p className={`text-xs mb-5 ${t.muted}`}>Diligencia este formulario si detectas una novedad o daño en un equipo.</p>

          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Empresa">
                <SelectInput t={t} value={empresa} options={COMPANIES.map(c => c.key)}
                  onChange={v => { setEmpresa(v); setSede(companyOf(v).sedes[0]); setEquipoId(''); }} />
              </Field>
              <Field label="Sede">
                <SelectInput t={t} value={sede} options={companyOf(empresa).sedes}
                  onChange={v => { setSede(v); setEquipoId(''); }} />
              </Field>
            </div>

            <Field label="Equipo biomédico">
              <select value={equipoId} onChange={e => setEquipoId(e.target.value)}
                className={`w-full rounded-md px-2.5 py-1.5 text-xs border ${t.input}`}>
                <option value="">Selecciona un equipo…</option>
                {equiposFiltrados.map(e => <option key={e.id} value={e.id}>{e.equipo}{e.inventario ? ` (${e.inventario})` : ''}</option>)}
              </select>
              {equiposFiltrados.length === 0 && <p className="text-2xs mt-1" style={{ color: '#D97706' }}>No hay equipos cargados para esta sede todavía en este dispositivo.</p>}
            </Field>

            <Field label="Fecha del reporte"><TextInput t={t} disabled value={todayISO()} onChange={() => {}} /></Field>

            <Field label="Persona que reporta">
              <TextInput t={t} value={persona} placeholder="Nombre completo" onChange={v => { setPersona(v); setError(''); }} />
            </Field>

            <Field label="Descripción del daño o novedad">
              <textarea rows={4} value={descripcion} onChange={e => setDescripcion(e.target.value)}
                className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input}`} />
            </Field>

            <Field label="Prioridad">
              <div className="flex gap-2">
                {PRIORIDADES.map(p => (
                  <button type="button" key={p} onClick={() => setPrioridad(p)}
                    className="flex-1 rounded-md py-2 text-xs font-semibold border"
                    style={prioridad === p ? { background: PRIORIDAD_HEX[p] + '22', borderColor: PRIORIDAD_HEX[p], color: PRIORIDAD_HEX[p] } : { borderColor: dark ? '#334155' : '#CBD5E1', color: dark ? '#94A3B8' : '#64748B' }}>
                    {p}
                  </button>
                ))}
              </div>
            </Field>

            {error && (
              <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${dark ? 'text-red-400 bg-red-500/10 border-red-500/30' : 'text-red-600 bg-red-50 border-red-200'}`}>
                <AlertTriangle size={13} className="shrink-0" /> {error}
              </div>
            )}

            <button type="submit" className="w-full rounded-md py-2.5 text-sm font-semibold mt-2 text-white" style={{ background: 'linear-gradient(135deg, #173B6C 0%, #2F8FD1 100%)' }}>Enviar reporte</button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* AMBIENTACIÓN DINÁMICA DEL ÁREA DE CONTENIDO                        */
/* ---------------------------------------------------------------- */
// Fondo ambiental del panel principal (NO el sidebar) — reutiliza el mismo `theme`
// que ya calcula themeOf(activeCompany) para el resto de la UI (accent, degradados),
// así que cambiar de empresa reambienta el fondo sin ninguna lógica nueva de color.
// Son manchas difuminadas de color sólido (no gradientes) para que el cambio entre
// empresas transicione con un simple `transition-colors`, sin parpadeos.
function AmbientBackground({ theme, dark }) {
  const isNeutral = theme.key === 'TODAS';
  const c1 = isNeutral ? '#0EA5E9' : theme.solid; // "azul tenue" neutro, o color de marca
  const c2 = isNeutral ? '#94A3B8' : theme.light; // "gris claro" neutro, o variante clara de marca
  const c3 = isNeutral ? '#CBD5E1' : theme.dark;  // variante suave adicional, o variante oscura de marca
  const op = dark ? 0.24 : 0.14; // intensidad baja — la legibilidad manda

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute rounded-full transition-colors duration-500 ease-out"
        style={{ width: '34rem', height: '34rem', top: '-10rem', right: '-8rem', backgroundColor: c1, opacity: op, filter: 'blur(95px)' }} />
      <div className="absolute rounded-full transition-colors duration-500 ease-out"
        style={{ width: '30rem', height: '30rem', bottom: '-12rem', left: '-8rem', backgroundColor: c2, opacity: op, filter: 'blur(100px)' }} />
      <div className="absolute rounded-full transition-colors duration-500 ease-out"
        style={{ width: '26rem', height: '26rem', top: '30%', left: '42%', backgroundColor: c3, opacity: op * 0.65, filter: 'blur(110px)' }} />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* NAVEGACIÓN LATERAL — compartida entre el sidebar de escritorio    */
/* (columna fija) y el drawer móvil (superpuesto con backdrop)       */
/* ---------------------------------------------------------------- */
function SidebarNav({ menu, onNavigate, nuevosReportes, accent, accentBg, t, dark, setDark, onLogout, readOnly, onCloseMobile }) {
  return (
    <>
      <div className="h-1" style={{ background: accentBg }} />
      <div className="px-4 py-5 border-b flex items-center justify-between" style={{ borderColor: 'inherit' }}>
        <div>
          <div className="text-3xs uppercase tracking-widest" style={{ color: accent }}>CMMS Biomédico</div>
          <div className="text-sm font-bold mt-0.5">Gestión de equipos</div>
        </div>
        {onCloseMobile && (
          <button onClick={onCloseMobile} aria-label="Cerrar menú" className={`flex items-center justify-center w-11 h-11 -mr-2 ${t.muted}`}>
            <X size={18} />
          </button>
        )}
      </div>
      <div className="flex-1 py-3 overflow-y-auto">
        {MENU.map(m => {
          const Icon = m.icon;
          const active = menu === m.key;
          return (
            <button key={m.key} onClick={() => onNavigate(m.key)}
              className={`w-full flex items-center gap-2.5 px-4 min-h-11 text-xs text-left transition ${active ? 'font-semibold' : t.muted}`}
              style={active ? { background: accent + '1A', color: accent, borderRight: `2px solid ${accent}` } : {}}>
              <Icon size={15} /> {m.label}
              {m.key === 'fallas' && nuevosReportes > 0 && (
                <span className="ml-auto rounded-full text-3xs font-mono px-1.5 py-0.5" style={{ background: '#EF4444', color: '#fff' }}>{nuevosReportes}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="p-4 border-t space-y-2" style={{ borderColor: 'inherit' }}>
        <button onClick={() => setDark(!dark)} className={`w-full flex items-center justify-center gap-2 rounded-md min-h-11 text-xs border ${t.border}`}>
          {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? 'Modo claro' : 'Modo oscuro'}
        </button>
        <button onClick={onLogout} className={`w-full flex items-center justify-center rounded-md min-h-11 text-xs border ${t.border} ${t.muted}`}>
          {readOnly ? 'Salir del modo invitado' : 'Cerrar sesión'}
        </button>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* APP PRINCIPAL                                                     */
/* ---------------------------------------------------------------- */

function MainApp({ onLogout, readOnly }) {
  const [equipos, setEquipos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState('dashboard');
  const [activeCompany, setActiveCompany] = useState('TODAS');
  const [filters, setFilters] = useState({ sede: '', ubicacion: '', estado: '', marca: '', clasificacion: '' });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'equipo', dir: 1 });
  const [drawerId, setDrawerId] = useState(null);
  const [obsModalId, setObsModalId] = useState(null);
  const [alertEmails, setAlertEmails] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cmms-alert-emails') || '[]'); } catch { return []; }
  });
  const [reportesFalla, setReportesFalla] = useState([]);
  const [reportesLoaded, setReportesLoaded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => { loadEquipos().then(d => { setEquipos(d); setLoaded(true); }); }, []);
  useEffect(() => { if (loaded) saveEquipos(equipos); }, [equipos, loaded]);
  // Sincroniza hacia Vercel KV (con un pequeño debounce) para que el cron de las 8am
  // tenga datos reales que revisar — el servidor no puede leer localStorage.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      fetch('/api/sync-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipos, alertEmails }),
      }).catch(err => console.error('No se pudo sincronizar con Vercel KV', err));
    }, 1500);
    return () => clearTimeout(timer);
  }, [equipos, alertEmails, loaded]);
  useEffect(() => { localStorage.setItem('cmms-alert-emails', JSON.stringify(alertEmails)); }, [alertEmails]);
  useEffect(() => { loadReportes().then(d => { setReportesFalla(d); setReportesLoaded(true); }); }, []);
  useEffect(() => { if (reportesLoaded) saveReportes(reportesFalla); }, [reportesFalla, reportesLoaded]);
  // Notificación en vivo: si otra pestaña del mismo navegador guarda un reporte nuevo, este lo recoge de inmediato.
  useEffect(() => {
    const handler = (e) => { if (e.key === REPORTES_KEY) loadReportes().then(setReportesFalla); };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);
  const updateReporte = (updated) => setReportesFalla(prev => prev.map(r => r.id === updated.id ? updated : r));
  const nuevosReportes = reportesFalla.filter(r => !r.visto).length;

  // Notificación automática de preventivos/calibraciones próximos a vencer o vencidos.
  // Corre cada vez que cambian los equipos o los correos configurados. No hay backend con
  // cron en esta app, así que esto se dispara cuando alguien tiene el CMMS abierto — y cada
  // alerta se notifica UNA sola vez (se guarda un registro local para no reenviar en cada visita).
  useEffect(() => {
    if (readOnly || !loaded || alertEmails.length === 0) return;
    const alerts = buildAlerts(equipos);
    if (alerts.length === 0) return;
    const notified = getNotifiedIds();
    const pendientes = alerts.filter(a => !notified.has(`${a.tipo}:${a.equipoId}:${a.status}`));
    if (pendientes.length === 0) return;
    (async () => {
      const idsEnviados = [];
      for (const a of pendientes) {
        const equipo = equipos.find(e => e.id === a.equipoId);
        if (!equipo) continue;
        const fn = a.tipo === 'Calibración' ? notifyCalibracionProxima : notifyPreventivoProximo;
        const res = await fn(equipo, a, alertEmails);
        if (res.success) idsEnviados.push(`${a.tipo}:${a.equipoId}:${a.status}`);
      }
      if (idsEnviados.length > 0) markNotified(idsEnviados);
    })();
  }, [equipos, alertEmails, loaded, readOnly]);

  const theme = themeOf(activeCompany);
  const accent = theme.solid;
  const accentBg = theme.bg;

  const t = uiTheme(dark);

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
      row['PERIODICIDAD DE MANTENIMIENTO'] = e.periodicidadMantenimiento;
      row['PERIODICIDAD DE CALIBRACION'] = e.periodicidadCalibracion;
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
  const parseExcelDate = (val) => {
    if (!val) return '';
    if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().slice(0, 10);
    if (typeof val === 'number') {
      // Fecha serial de Excel (días desde 1899-12-30)
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
    const str = val.toString().trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str; // ya viene en AAAA-MM-DD
    const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // DD/MM/AAAA
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const d = new Date(str);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
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
          periodicidadMantenimiento: r['PERIODICIDAD DE MANTENIMIENTO'] || 'Anual', periodicidadCalibracion: r['PERIODICIDAD DE CALIBRACION'] || 'Anual',
          ubicacion: r['UBICACIÓN'] || '', fechaUltimaCalibracion: parseExcelDate(r['FECHA DE ULTIMA CALIBRACION']),
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
    <div className={`flex flex-col min-h-dvh font-sans ${t.bg} ${t.text}`} style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {readOnly && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 text-2xs font-semibold text-white" style={{ background: '#B45309' }}>
          <Lock size={12} /> Modo invitado — solo lectura, no se pueden guardar cambios
        </div>
      )}
      {/* BARRA SUPERIOR MÓVIL — solo <lg, abre el sidebar como drawer */}
      <div className={`lg:hidden shrink-0 flex items-center justify-between px-2 border-b ${t.panel} ${t.border}`} style={{ minHeight: 52 }}>
        <button onClick={() => setMobileNavOpen(true)} aria-label="Abrir menú"
          className={`flex items-center justify-center w-11 h-11 rounded-md ${t.muted}`}>
          <Menu size={20} />
        </button>
        <div className="text-sm font-bold">Gestión de equipos</div>
        <div className="w-11 h-11" aria-hidden="true" />
      </div>

      <div className="flex flex-1 min-h-0 relative">
      {/* BACKDROP — solo mientras el drawer móvil está abierto */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      )}

      {/* SIDEBAR — escritorio: columna fija en el flujo normal, oculta en <lg */}
      <div className={`hidden lg:flex lg:w-56 lg:shrink-0 border-r flex-col ${t.panel} ${t.border}`}>
        <SidebarNav menu={menu} onNavigate={setMenu} nuevosReportes={nuevosReportes} accent={accent} accentBg={accentBg}
          t={t} dark={dark} setDark={setDark} onLogout={onLogout} readOnly={readOnly} />
      </div>

      {/* SIDEBAR — móvil: drawer superpuesto, invisible por completo en lg+ */}
      <div className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 border-r flex flex-col ${t.panel} ${t.border}`}
        style={{ transform: mobileNavOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 300ms cubic-bezier(0.23,1,0.32,1)' }}>
        <SidebarNav menu={menu} onNavigate={(k) => { setMenu(k); setMobileNavOpen(false); }} nuevosReportes={nuevosReportes} accent={accent} accentBg={accentBg}
          t={t} dark={dark} setDark={setDark} onLogout={onLogout} readOnly={readOnly} onCloseMobile={() => setMobileNavOpen(false)} />
      </div>

      {/* MAIN */}
      <div className="flex-1 relative overflow-hidden">
        <AmbientBackground theme={theme} dark={dark} />
        <div className="absolute inset-0 overflow-y-auto p-6">
        {/* Empresa pills */}
        <div className="flex gap-2 flex-wrap mb-5">
          <button onClick={() => setActiveCompany('TODAS')}
            className={`px-3 min-h-11 flex items-center rounded-full text-2xs font-mono border transition ${t.border}`}
            style={activeCompany === 'TODAS' ? { background: NEUTRAL_ACCENT + '1A', borderColor: NEUTRAL_ACCENT, color: NEUTRAL_ACCENT } : {}}>
            Todas las empresas
          </button>
          {COMPANIES.map(c => (
            <button key={c.key} onClick={() => setActiveCompany(c.key)}
              className={`px-3 min-h-11 flex items-center rounded-full text-2xs font-mono border transition ${activeCompany === c.key ? 'text-white font-semibold' : t.border}`}
              style={activeCompany === c.key ? { background: c.gradient, borderColor: c.color } : {}}>
              {c.key}
            </button>
          ))}
        </div>

        {menu === 'dashboard' && <Dashboard equipos={equipos} reportesFalla={reportesFalla} activeCompany={activeCompany} accent={accent} theme={theme} t={t} readOnly={readOnly} onGoAlerts={() => setMenu('alertas')} onGoFallas={() => setMenu('fallas')} onGoInventario={() => setMenu('inventario')} />}
        {menu === 'alertas' && <AlertasPage equipos={equipos} activeCompany={activeCompany} t={t} accent={accent} alertEmails={alertEmails} onOpen={setDrawerId} readOnly={readOnly} />}
        {menu === 'empresas' && <EmpresasPage equipos={equipos} t={t} onSelect={(k) => { setActiveCompany(k); setMenu('inventario'); }} />}
        {(menu === 'inventario' || menu === 'mantenimientos' || menu === 'calibraciones' || menu === 'correctivos') && (
          <InventarioPage
            mode={menu} equipos={filtered} allEquipos={equipos} t={t} accent={accent} accentBg={accentBg}
            filters={filters} setFilters={setFilters} search={search} setSearch={setSearch}
            sort={sort} setSort={setSort} uniqueVals={uniqueVals} activeCompany={activeCompany}
            onOpen={setDrawerId} onObs={setObsModalId}
            onAdd={addEquipo} onDuplicate={duplicateEquipo} onRemove={removeEquipo}
            onExport={exportExcel} onImport={importExcel} readOnly={readOnly}
            onClearFilters={() => {
              setActiveCompany('TODAS');
              setFilters({ sede: '', ubicacion: '', estado: '', marca: '', clasificacion: '' });
              setSearch('');
              setSort({ key: 'equipo', dir: 1 });
            }}
          />
        )}
        {menu === 'fallas' && <ReportesFallaPage reportes={reportesFalla} t={t} accent={accent} onUpdate={updateReporte} readOnly={readOnly} />}
        {menu === 'reportes' && <ReportesPage equipos={equipos} t={t} accent={accent} onExport={exportExcel} />}
        {menu === 'configuracion' && <ConfigPage t={t} accent={accent} onReset={() => { if (confirm('¿Borrar todos los equipos guardados?')) setEquipos([]); }} onLogout={onLogout} alertEmails={alertEmails} setAlertEmails={setAlertEmails} readOnly={readOnly} />}
        </div>
      </div>

      {drawerEquipo && <EquipoDrawer equipo={drawerEquipo} onClose={() => setDrawerId(null)} onUpdate={updateEquipo} t={t} accent={accent} readOnly={readOnly} alertEmails={alertEmails} />}
      {obsEquipo && <ObsModal equipo={obsEquipo} onClose={() => setObsModalId(null)} onSave={(v) => updateEquipo({ ...obsEquipo, observaciones: v })} t={t} accent={accent} readOnly={readOnly} />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PÁGINA: DASHBOARD                                                  */
/* ---------------------------------------------------------------- */
function Dashboard({ equipos, reportesFalla, activeCompany, accent, theme, t, readOnly, onGoAlerts, onGoFallas, onGoInventario }) {
  if (equipos.length === 0) {
    return (
      <div className={`rounded-xl border p-10 text-center ${t.panel} ${t.border}`}>
        <ListTree size={32} className={`mx-auto mb-3 ${t.muted}`} />
        <h2 className="text-sm font-bold mb-1">Todavía no hay equipos cargados</h2>
        <p className={`text-xs mb-5 max-w-sm mx-auto ${t.muted}`}>
          {readOnly
            ? 'En modo invitado puedes explorar el CMMS, pero necesitas iniciar sesión para agregar equipos.'
            : 'Agrega tu primer equipo biomédico al inventario para empezar a ver el dashboard con datos reales.'}
        </p>
        {!readOnly && <Button variant="primary" accent={accent} icon={Plus} onClick={onGoInventario}>Agregar equipo</Button>}
      </div>
    );
  }

  const scoped = activeCompany === 'TODAS' ? equipos : equipos.filter(e => e.empresa === activeCompany);
  const alertCount = buildAlerts(scoped).length;
  const year = new Date().getFullYear(); const month = new Date().getMonth();

  const reportesScoped = activeCompany === 'TODAS' ? (reportesFalla || []) : (reportesFalla || []).filter(r => r.empresa === activeCompany);
  const fallasReportadas = reportesScoped.length;
  const fallasSolucionadas = reportesScoped.filter(r => r.estado === 'Finalizado').length;
  const fallasPorEstado = REPORTE_ESTADOS.map(s => ({ name: s, value: reportesScoped.filter(r => r.estado === s).length, fill: REPORTE_ESTADO_HEX[s] }));

  let prevProgramados = 0, prevEjecutados = 0;
  let calVigente = 0, calProximo = 0, calVencido = 0;
  let fueraServicio = 0;
  scoped.forEach(e => {
    (e.preventivos || []).forEach(p => {
      if (!p.fecha) return;
      const d = new Date(p.fecha + 'T00:00:00');
      if (d.getFullYear() === year && d.getMonth() === month) { prevProgramados++; if (p.estado === 'Ejecutado') prevEjecutados++; }
    });
    const cs = calibStatus(e);
    if (cs.status === 'vigente') calVigente++; else if (cs.status === 'proximo') calProximo++; else if (cs.status === 'vencido') calVencido++;
    if (e.estado === 'Fuera de servicio') fueraServicio++;
  });
  const disponibilidad = scoped.length ? Math.round(((scoped.length - fueraServicio) / scoped.length) * 100) : 0;

  const isCompanyView = activeCompany !== 'TODAS';
  // Tonos de la MISMA marca de la empresa activa — nunca colores de otra empresa.
  const SEDE_SHADES = theme.shades;

  // Cuando se ve "Todas las empresas": comparar empresas (cada una con su propio color).
  // Cuando se ve UNA empresa: comparar sus sedes, todas en variantes del mismo color de marca.
  const porGrupo = isCompanyView
    ? companyOf(activeCompany).sedes.map((sede, i) => ({
        name: sede,
        preventivos: scoped.filter(e => e.sede === sede).reduce((acc, e) => acc + (e.preventivos || []).length, 0),
        fill: SEDE_SHADES[i % SEDE_SHADES.length],
      }))
    : COMPANIES.map(c => ({
        name: c.key.length > 10 ? c.key.slice(0, 9) + '…' : c.key,
        preventivos: equipos.filter(e => e.empresa === c.key).reduce((acc, e) => acc + (e.preventivos || []).length, 0),
        fill: c.color,
      }));

  // Desglose por sede: equipos, alertas, fallas y calibraciones vencidas de cada sede de la empresa activa.
  const sedeBreakdown = isCompanyView
    ? companyOf(activeCompany).sedes.map((sede, i) => {
        const eqSede = scoped.filter(e => e.sede === sede);
        const repSede = reportesScoped.filter(r => r.sede === sede);
        return {
          sede, color: SEDE_SHADES[i % SEDE_SHADES.length],
          equipos: eqSede.length,
          alertas: buildAlerts(eqSede).length,
          fallasAbiertas: repSede.length - repSede.filter(r => r.estado === 'Finalizado').length,
          calVencidas: eqSede.filter(e => calibStatus(e).status === 'vencido').length,
        };
      })
    : [];

  const estadoPie = ESTADOS_EQUIPO.map((s, i) => ({ name: s, value: scoped.filter(e => e.estado === s).length, fill: ['#22C55E', '#EF4444', '#F59E0B', '#64748B'][i] }));

  const alertasSuaves = alertCount; // preventivos+calibraciones próximos/vencidos
  const fallasAbiertas = fallasReportadas - fallasSolucionadas;
  const pctPreventivo = prevProgramados ? Math.round((prevEjecutados / prevProgramados) * 100) : 0;
  const totalCal = calVigente + calProximo + calVencido;
  const porGrupoOrdenado = [...porGrupo].sort((a, b) => b.preventivos - a.preventivos);
  const maxPorGrupo = Math.max(...porGrupoOrdenado.map(p => p.preventivos), 1);

  const topCorrectivos = scoped
    .map(e => ({ nombre: e.equipo || 'Sin nombre', empresa: e.empresa, sede: e.sede, count: (e.correctivos || []).length }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Próximo mantenimiento preventivo pendiente (fecha más cercana, aún no vencida) por empresa —
  // siempre las 5 empresas, sin importar el filtro activo del Dashboard.
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const proximosPorEmpresa = COMPANIES.map(c => {
    let best = null;
    equipos.filter(e => e.empresa === c.key && e.aplicaPreventivo).forEach(e => {
      (e.preventivos || []).forEach(p => {
        if (p.estado === 'Ejecutado' || !p.fecha) return;
        const d = new Date(p.fecha + 'T00:00:00');
        if (isNaN(d.getTime())) return;
        const diffDays = Math.round((d - today0) / 86400000);
        if (diffDays < 0) return;
        if (!best || diffDays < best.diffDays) best = { equipo: e.equipo || 'Sin nombre', fecha: p.fecha, diffDays };
      });
    });
    return { company: c, next: best };
  });

  return (
    <div>
      {alertCount > 0 && (
        <button onClick={onGoAlerts} className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-5 border text-left" style={{ background: '#F59E0B1A', borderColor: '#F59E0B' }}>
          <BellRing size={16} style={{ color: '#F59E0B' }} />
          <span className="text-xs font-semibold" style={{ color: '#F59E0B' }}>
            {alertCount} alerta{alertCount !== 1 ? 's' : ''} activa{alertCount !== 1 ? 's' : ''} — preventivos a {PREVENTIVO_ALERTA_DIAS / 30} meses de vencer o calibraciones próximas/vencidas.
          </span>
          <span className="ml-auto text-2xs underline" style={{ color: '#F59E0B' }}>Ver alertas</span>
        </button>
      )}

      {isCompanyView && (
        <div className={`rounded-xl border p-5 mb-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Desglose por sede — {activeCompany}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className={`border-b ${t.border}`}>
                  <th className={`text-left px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Sede</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Equipos</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Alertas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Fallas abiertas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Calib. vencidas</th>
                </tr>
              </thead>
              <tbody>
                {sedeBreakdown.map(s => (
                  <tr key={s.sede} className={`border-b ${t.border}`}>
                    <td className="px-2 py-2 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                      {s.sede}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{s.equipos}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.alertas > 0 ? { color: '#F59E0B' } : {}}>{s.alertas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.fallasAbiertas > 0 ? { color: '#EF4444' } : {}}>{s.fallasAbiertas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.calVencidas > 0 ? { color: '#EF4444' } : {}}>{s.calVencidas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HERO — métricas principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <HeroStat t={t} label="Equipos activos" value={scoped.length} sub={`${fueraServicio} fuera de servicio`} color={accent} brandBg={theme.bg} />
        <HeroStat t={t} label="Disponibilidad" value={disponibilidad + '%'} sub="operacional" color="#0EA5E9" ring={disponibilidad} brandBg={theme.bg} />
        <HeroStat t={t} label="Alertas activas" value={alertasSuaves} sub="preventivos y calibraciones" color="#F59E0B" onClick={onGoAlerts} brandBg={theme.bg} />
        <HeroStat t={t} label="Fallas abiertas" value={Math.max(fallasAbiertas, 0)} sub={`${fallasSolucionadas} solucionadas`} color="#EF4444" onClick={onGoFallas} brandBg={theme.bg} />
      </div>

      {/* CLUSTERS TEMÁTICOS */}
      <div className="grid md:grid-cols-3 gap-4 mb-5">
        <ClusterCard t={t} title="Preventivos del mes" color="#F59E0B" brandBg={theme.bg}>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xl font-bold font-mono">{pctPreventivo}%</span>
            <span className={`text-2xs ${t.muted}`}>ejecutados</span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden mb-3 ${t.panel3}`}>
            <div className="h-full rounded-full" style={{ width: `${pctPreventivo}%`, background: '#22C55E' }} />
          </div>
          <MiniRow label="Programados" value={prevProgramados} t={t} />
          <MiniRow label="Ejecutados" value={prevEjecutados} t={t} color="#22C55E" />
          <MiniRow label="Pendientes" value={Math.max(prevProgramados - prevEjecutados, 0)} t={t} color="#F59E0B" />
        </ClusterCard>

        <ClusterCard t={t} title="Calibraciones" color="#22C55E" brandBg={theme.bg}>
          <div className={`h-2.5 rounded-full overflow-hidden flex mb-3 ${t.panel3}`}>
            {totalCal > 0 ? (
              <>
                <div style={{ width: `${(calVigente / totalCal) * 100}%`, background: '#22C55E' }} />
                <div style={{ width: `${(calProximo / totalCal) * 100}%`, background: '#F59E0B' }} />
                <div style={{ width: `${(calVencido / totalCal) * 100}%`, background: '#EF4444' }} />
              </>
            ) : <div className="w-full" />}
          </div>
          <MiniRow label="Vigentes" value={calVigente} t={t} color="#22C55E" />
          <MiniRow label="Próximas a vencer" value={calProximo} t={t} color="#F59E0B" />
          <MiniRow label="Vencidas" value={calVencido} t={t} color="#EF4444" />
        </ClusterCard>

        <ClusterCard t={t} title="Fallas reportadas" color="#EF4444" onClick={onGoFallas} brandBg={theme.bg}>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-xl font-bold font-mono">{fallasReportadas}</span>
            <span className={`text-2xs ${t.muted}`}>reportadas en total</span>
          </div>
          {REPORTE_ESTADOS.map(s => (
            <MiniRow key={s} label={s} value={reportesScoped.filter(r => r.estado === s).length} t={t} color={REPORTE_ESTADO_HEX[s]} />
          ))}
        </ClusterCard>
      </div>

      {/* PRÓXIMOS MANTENIMIENTOS PREVENTIVOS POR EMPRESA */}
      <div className={`rounded-xl border p-5 mb-5 ${t.panel} ${t.border}`}>
        <div className="text-xs font-semibold mb-4 uppercase tracking-wide" style={{ color: accent }}>Próximos mantenimientos preventivos por empresa</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {proximosPorEmpresa.map(({ company, next }) => (
            <div key={company.key} className={`rounded-lg border p-3 min-w-0 ${t.panel3} ${t.border}`}>
              <div className="flex items-center gap-1.5 mb-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: company.color }} />
                <span className="text-3xs font-semibold uppercase tracking-wide truncate" title={company.key}>{company.key}</span>
              </div>
              {next ? (
                <>
                  <div className="text-xs font-medium truncate" title={next.equipo}>{next.equipo}</div>
                  <div className={`text-3xs font-mono mt-0.5 ${t.muted}`}>{formatFechaCorta(next.fecha)}</div>
                  <div className="text-2xs font-mono font-semibold mt-1.5" style={{ color: next.diffDays <= PREVENTIVO_ALERTA_DIAS ? '#F59E0B' : '#22C55E' }}>
                    {next.diffDays === 0 ? 'Hoy' : `En ${next.diffDays} día${next.diffDays !== 1 ? 's' : ''}`}
                  </div>
                </>
              ) : (
                <div className={`text-2xs italic ${t.muted}`}>Sin mantenimientos próximos</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* BENTO — comparativos */}
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className={`lg:col-span-2 rounded-xl border p-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-4 uppercase tracking-wide" style={{ color: accent }}>{isCompanyView ? 'Preventivos por sede' : 'Preventivos por empresa'}</div>
          <div className="space-y-3">
            {porGrupoOrdenado.map(p => (
              <div key={p.name} className="flex items-center gap-3">
                <div className={`w-28 text-2xs font-mono shrink-0 truncate ${t.muted}`} title={p.name}>{p.name}</div>
                <div className={`flex-1 h-3 rounded-full overflow-hidden ${t.panel3}`}>
                  <div className="h-full rounded-full" style={{ width: `${(p.preventivos / maxPorGrupo) * 100}%`, background: p.fill }} />
                </div>
                <div className="w-8 text-right text-2xs font-mono font-semibold">{p.preventivos}</div>
              </div>
            ))}
          </div>
        </div>
        <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Estado de equipos</div>
          <div className="relative">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={estadoPie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
                  {estadoPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: -10 }}>
              <div className="text-xl font-bold font-mono">{scoped.length}</div>
              <div className={`text-3xs uppercase ${t.muted}`}>equipos</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
            {estadoPie.map((e, i) => (
              <span key={i} className="flex items-center gap-1 text-3xs">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.fill }} />
                <span className={t.muted}>{e.name}</span>
                <span className="font-mono font-semibold">{e.value}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <HeatmapMantenimientos scoped={scoped} activeCompany={activeCompany} t={t} accent={accent} />
      </div>

      <div className="mb-4">
        <EvolucionAnual scoped={scoped} activeCompany={activeCompany} theme={theme} t={t} accent={accent} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Equipos con más correctivos</div>
          {topCorrectivos.length === 0 && <div className={`text-xs text-center py-6 ${t.muted}`}>Sin correctivos registrados en este filtro</div>}
          <div className="space-y-2.5">
            {topCorrectivos.map((c, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="text-3xs font-mono w-4 shrink-0" style={{ color: accent }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{c.nombre}</div>
                  <div className={`text-3xs ${t.muted}`}>{c.empresa} · {c.sede}</div>
                </div>
                <span className="text-2xs font-mono font-semibold shrink-0" style={{ color: '#EF4444' }}>{c.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={`lg:col-span-2 rounded-xl border p-5 cursor-pointer ${t.panel} ${t.border}`} onClick={onGoFallas}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Fallas por estado</div>
            {fallasReportadas > 0 && <span className="text-2xs font-mono" style={{ color: accent }}>{fallasSolucionadas}/{fallasReportadas} cerradas</span>}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={fallasPorEstado} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={90} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                {fallasPorEstado.map((f, i) => <Cell key={i} fill={f.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

const TIPOS_HEATMAP = ['Preventivo', 'Correctivo', 'Instalación', 'Baja'];

function countsForType(equipos, tipo, year) {
  const counts = new Array(12).fill(0);
  equipos.forEach(e => {
    let items = [];
    if (tipo === 'Preventivo') items = (e.preventivos || []).filter(p => p.estado === 'Ejecutado');
    else if (tipo === 'Correctivo') items = e.correctivos || [];
    else if (tipo === 'Instalación') items = e.instalaciones || [];
    else if (tipo === 'Baja') items = e.bajas || [];
    items.forEach(it => {
      if (!it.fecha) return;
      const d = new Date(it.fecha + 'T00:00:00');
      if (isNaN(d.getTime()) || d.getFullYear() !== year) return;
      counts[d.getMonth()]++;
    });
  });
  return counts;
}

function HeatmapMantenimientos({ scoped, activeCompany, t, accent }) {
  const [sede, setSede] = useState('TODAS');
  const sedesDisponibles = activeCompany === 'TODAS' ? [] : companyOf(activeCompany).sedes;

  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear()]);
    scoped.forEach(e => {
      ['preventivos', 'correctivos', 'instalaciones', 'bajas'].forEach(k => {
        (e[k] || []).forEach(it => {
          if (!it.fecha) return;
          const y = new Date(it.fecha + 'T00:00:00').getFullYear();
          if (!isNaN(y)) set.add(y);
        });
      });
    });
    return [...set].sort((a, b) => b - a);
  }, [scoped]);
  const [year, setYear] = useState(new Date().getFullYear());

  const filtrados = sede === 'TODAS' ? scoped : scoped.filter(e => e.sede === sede);
  const matrix = TIPOS_HEATMAP.map(tipo => countsForType(filtrados, tipo, year));
  const maxVal = Math.max(...matrix.flat(), 1);
  const totalAnio = matrix.flat().reduce((a, b) => a + b, 0);

  const heatBg = (v) => {
    if (!v) return null;
    const alpha = 0.18 + (v / maxVal) * 0.72;
    return accent + Math.round(alpha * 255).toString(16).padStart(2, '0');
  };

  return (
    <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Mapa de calor — mantenimientos ejecutados</div>
        <div className="flex gap-2">
          {activeCompany !== 'TODAS' && (
            <select value={sede} onChange={e => setSede(e.target.value)} className={`rounded-md px-2 py-1 text-2xs border ${t.input}`}>
              <option value="TODAS">Todas las sedes</option>
              {sedesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select value={year} onChange={e => setYear(Number(e.target.value))} className={`rounded-md px-2 py-1 text-2xs border ${t.input}`}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <p className={`text-2xs mb-3 ${t.muted}`}>{totalAnio} intervenciones en {year}{sede !== 'TODAS' ? ` · ${sede}` : ''}</p>

      <div className="overflow-x-auto">
        <table className="text-3xs" style={{ borderSpacing: 4, borderCollapse: 'separate' }}>
          <thead>
            <tr>
              <th className="w-20"></th>
              {MONTHS.map(m => <th key={m.k} className={`font-mono font-normal pb-1 px-1 ${t.muted}`} translate="no" lang="es">{m.l}</th>)}
            </tr>
          </thead>
          <tbody>
            {TIPOS_HEATMAP.map((tipo, ti) => (
              <tr key={tipo}>
                <td className={`pr-2 text-right font-mono whitespace-nowrap align-middle ${t.muted}`}>{tipo}</td>
                {matrix[ti].map((v, mi) => (
                  <td key={mi}
                    title={`${tipo} · ${MONTHS[mi].l} ${year}: ${v} mantenimiento${v !== 1 ? 's' : ''}`}
                    className={`text-center align-middle rounded-md font-mono font-semibold ${v ? '' : t.panel3}`}
                    style={{ background: heatBg(v) || undefined, minWidth: 30, height: 26 }}>
                    {v || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Colores fijos y distinguibles para el modo neutro ("Todas las empresas").
const TIPO_LINEA_NEUTRO = { Preventivo: '#4FD1C5', Correctivo: '#F87171', 'Instalación': '#60A5FA', Baja: '#94A3B8' };

function EvolucionAnual({ scoped, activeCompany, theme, t, accent }) {
  const [sede, setSede] = useState('TODAS');
  const sedesDisponibles = activeCompany === 'TODAS' ? [] : companyOf(activeCompany).sedes;

  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear()]);
    scoped.forEach(e => {
      ['preventivos', 'correctivos', 'instalaciones', 'bajas'].forEach(k => {
        (e[k] || []).forEach(it => {
          if (!it.fecha) return;
          const y = new Date(it.fecha + 'T00:00:00').getFullYear();
          if (!isNaN(y)) set.add(y);
        });
      });
    });
    return [...set].sort((a, b) => b - a);
  }, [scoped]);
  const [year, setYear] = useState(new Date().getFullYear());

  const filtrados = sede === 'TODAS' ? scoped : scoped.filter(e => e.sede === sede);
  const isCompanyView = activeCompany !== 'TODAS';

  // Mismos tonos de marca usados en el resto del Dashboard cuando hay una empresa activa;
  // paleta fija y distinguible cuando se ve "Todas las empresas".
  const lineColor = (tipo, idx) => isCompanyView ? theme.shades[(idx * 2) % theme.shades.length] : TIPO_LINEA_NEUTRO[tipo];

  const data = useMemo(() => {
    const matrix = TIPOS_HEATMAP.map(tipo => countsForType(filtrados, tipo, year));
    return MONTHS.map((m, mi) => {
      const row = { name: m.l };
      TIPOS_HEATMAP.forEach((tipo, ti) => { row[tipo] = matrix[ti][mi]; });
      return row;
    });
  }, [filtrados, year]);
  const totalAnio = TIPOS_HEATMAP.reduce((acc, tipo) => acc + data.reduce((a, d) => a + d[tipo], 0), 0);

  return (
    <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Evolución anual de mantenimientos</div>
        <div className="flex gap-2">
          {isCompanyView && (
            <select value={sede} onChange={e => setSede(e.target.value)} className={`rounded-md px-2 py-1 text-2xs border ${t.input}`}>
              <option value="TODAS">Todas las sedes</option>
              {sedesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select value={year} onChange={e => setYear(Number(e.target.value))} className={`rounded-md px-2 py-1 text-2xs border ${t.input}`}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <p className={`text-2xs mb-3 ${t.muted}`}>{totalAnio} intervenciones en {year}{sede !== 'TODAS' ? ` · ${sede}` : ''} — eje X: meses, eje Y: intervenciones realizadas</p>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {TIPOS_HEATMAP.map((tipo, i) => (
            <Line key={tipo} type="monotone" dataKey={tipo} stroke={lineColor(tipo, i)} strokeWidth={2.2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HeroStat({ t, label, value, sub, color, onClick, brandBg }) {
  return (
    <div onClick={onClick} className={`rounded-xl p-4 border relative overflow-hidden ${t.panel} ${t.border} ${onClick ? 'cursor-pointer' : ''}`}>
      {brandBg && <div className="absolute top-0 left-0 w-full h-[3px]" style={{ background: brandBg }} />}
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-[0.07]" style={{ background: color }} />
      <div className={`text-3xs uppercase tracking-wide mb-1 ${t.muted}`}>{label}</div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold font-mono" style={{ color }}>{value}</span>
      </div>
      <div className={`text-2xs mt-1 ${t.muted}`}>{sub}</div>
    </div>
  );
}

function ClusterCard({ t, title, color, children, onClick, brandBg }) {
  return (
    <div onClick={onClick} className={`rounded-xl border p-4 relative overflow-hidden ${t.panel} ${t.border} ${onClick ? 'cursor-pointer' : ''}`}>
      {brandBg && <div className="absolute top-0 left-0 w-full h-[3px]" style={{ background: brandBg }} />}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  );
}

function MiniRow({ label, value, t, color }) {
  return (
    <div className="flex items-center justify-between py-1 text-2xs">
      <span className={t.muted}>{label}</span>
      <span className="font-mono font-semibold" style={color ? { color } : {}}>{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PÁGINA: ALERTAS                                                    */
/* ---------------------------------------------------------------- */
function AlertasPage({ equipos, activeCompany, t, accent, alertEmails, onOpen, readOnly }) {
  const scoped = activeCompany === 'TODAS' ? equipos : equipos.filter(e => e.empresa === activeCompany);
  const alerts = buildAlerts(scoped);
  const vencidas = alerts.filter(a => a.status === 'vencido');
  const proximas = alerts.filter(a => a.status === 'proximo');
  const [sendState, setSendState] = useState('idle'); // idle | sending | sent | error

  const badgeColor = (a) => a.status === 'vencido' ? '#EF4444' : '#F59E0B';
  const daysTxt = (a) => a.status === 'vencido' ? `Vencida hace ${Math.abs(a.diffDays)} días` : `Faltan ${a.diffDays} días`;

  const handleSendAlerts = async () => {
    setSendState('sending');
    const res = await sendAlertsSummary(alerts, alertEmails);
    setSendState(res.success ? 'sent' : 'error');
    setTimeout(() => setSendState('idle'), 3000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-bold">Alertas</h1>
        {!readOnly && alerts.length > 0 && (
          alertEmails.length > 0
            ? (
              <Button variant="primary" accent={accent} icon={Mail} disabled={sendState === 'sending'}
                style={sendState === 'error' ? { background: '#EF4444' } : undefined}
                onClick={handleSendAlerts}>
                {sendState === 'sending' ? 'Enviando…' : sendState === 'sent' ? 'Enviado ✓' : sendState === 'error' ? 'Error al enviar' : 'Enviar alertas por correo'}
              </Button>
            )
            : <span className={`text-2xs ${t.muted}`}>Agrega correos en Configuración para poder enviarlas</span>
        )}
      </div>
      <p className={`text-xs mb-5 ${t.muted}`}>
        Preventivos pendientes a {PREVENTIVO_ALERTA_DIAS / 30} meses o menos de su fecha, y calibraciones próximas a vencer (≤30 días) o vencidas.
      </p>

      {alerts.length === 0 && <div className={`text-sm text-center py-10 ${t.muted}`}>No hay alertas activas en este momento 👍</div>}

      {vencidas.length > 0 && (
        <div className="mb-6">
          <div className="text-2xs font-mono uppercase tracking-wide mb-2 text-red-400">Vencidas ({vencidas.length})</div>
          <div className="space-y-2">
            {vencidas.map((a, i) => (
              <div key={i} onClick={() => onOpen(a.equipoId)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`} style={{ borderLeftColor: badgeColor(a), borderLeftWidth: 3 }}>
                <Badge color={badgeColor(a)}>{a.tipo}</Badge>
                <div className="flex-1">
                  <div className="text-xs font-semibold">{a.equipo}</div>
                  <div className={`text-2xs ${t.muted}`}>{a.empresa} · {a.sede}</div>
                </div>
                <div className="text-2xs font-mono" style={{ color: badgeColor(a) }}>{daysTxt(a)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {proximas.length > 0 && (
        <div>
          <div className="text-2xs font-mono uppercase tracking-wide mb-2 text-amber-400">Próximas a vencer ({proximas.length})</div>
          <div className="space-y-2">
            {proximas.map((a, i) => (
              <div key={i} onClick={() => onOpen(a.equipoId)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`} style={{ borderLeftColor: badgeColor(a), borderLeftWidth: 3 }}>
                <Badge color={badgeColor(a)}>{a.tipo}</Badge>
                <div className="flex-1">
                  <div className="text-xs font-semibold">{a.equipo}</div>
                  <div className={`text-2xs ${t.muted}`}>{a.empresa} · {a.sede}</div>
                </div>
                <div className="text-2xs font-mono" style={{ color: badgeColor(a) }}>{daysTxt(a)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmpresasPage({ equipos, t, onSelect }) {
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

/* ---------------------------------------------------------------- */
/* PÁGINA: INVENTARIO / MANTENIMIENTOS / CALIBRACIONES / CORRECTIVOS   */
/* ---------------------------------------------------------------- */
const INVENTORY_HEAD = [
  { key: 'equipo', label: 'EQUIPO' }, { key: 'marca', label: 'MARCA' }, { key: 'modelo', label: 'MODELO' },
  { key: 'numeroSerie', label: 'N° SERIE' }, { key: 'registroInvima', label: 'REG. INVIMA' },
  { key: 'clasificacionRiesgo', label: 'RIESGO' }, { key: 'inventario', label: 'INVENTARIO' },
];

function InventarioPage({ mode, equipos, t, accent, accentBg, filters, setFilters, search, setSearch, setSort, uniqueVals, onOpen, onObs, onAdd, onDuplicate, onRemove, onExport, onImport, activeCompany, onClearFilters, readOnly }) {
  const year = new Date().getFullYear();
  const title = { inventario: 'Inventario de equipos', mantenimientos: 'Mantenimientos preventivos', calibraciones: 'Calibraciones', correctivos: 'Correctivos' }[mode];
  const hayFiltrosActivos = Boolean(
    (activeCompany && activeCompany !== 'TODAS') || search.trim() ||
    filters.sede || filters.ubicacion || filters.estado || filters.marca || filters.clasificacion
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
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files[0] && onImport(e.target.files[0])} />
              </label>
            )}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border ${t.border} ${t.panel}`}>
          <Search size={13} className={t.muted} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar equipo, marca, serie…" className={`bg-transparent text-xs w-40 ${t.text}`} />
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
        {hayFiltrosActivos && (
          <Button variant="ghost" t={t} icon={X} iconSize={12} onClick={onClearFilters}>Limpiar filtros</Button>
        )}
      </div>

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
                      const tip = `${STATUS_LABEL[st]}${items.length ? ' — ' + items.map(p => p.fecha).join(', ') : ''}`;
                      return <td key={m.k} className="px-2 py-2 text-center" title={tip}><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STATUS_HEX[st] }} role="img" aria-label={tip} /></td>;
                    })}
                    <td className="px-3 py-2 text-center">{e.aplicaCalibracion ? '✓' : '—'}</td>
                    <td className="px-3 py-2 text-center">{e.aplicaPreventivo ? '✓' : '—'}</td>
                    <td className="px-3 py-2">{e.periodicidadMantenimiento || '—'}</td>
                    <td className="px-3 py-2">{e.periodicidadCalibracion || '—'}</td>
                    <td className="px-3 py-2">{e.ubicacion || '—'}</td>
                    <td className="px-3 py-2">{cs.next ? cs.next.toISOString().slice(0, 10) : '—'}</td>
                    <td className="px-3 py-2">
                      <Badge mono={false} color={e.estado === 'Operativo' ? '#22C55E' : e.estado === 'Dado de baja' ? '#EF4444' : '#F59E0B'}>{e.estado}</Badge>
                    </td>
                    <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => onObs(e.id)} title="Observaciones" aria-label="Observaciones" className="p-2.5 -m-1.5 flex items-center justify-center">
                          <MessageCircle size={14} className={e.observaciones ? '' : t.muted} style={e.observaciones ? { color: accent } : {}} />
                        </button>
                        {!readOnly && (
                          <>
                            <button onClick={() => onDuplicate(e)} title="Duplicar" aria-label="Duplicar" className="p-2.5 -m-1.5 flex items-center justify-center"><Copy size={13} className={t.muted} /></button>
                            <button onClick={() => onRemove(e.id)} title="Eliminar" aria-label="Eliminar" className="p-2.5 -m-1.5 flex items-center justify-center"><Trash2 size={13} className="text-red-400" /></button>
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
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .map((p, i) => (
              <div key={i} onClick={() => onOpen(p.equipoId)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.estado === 'Ejecutado' ? '#22C55E' : '#F59E0B' }} />
                <div className="flex-1">
                  <div className="text-xs font-semibold">{p.equipoNombre}</div>
                  <div className={`text-2xs ${t.muted}`}>{p.empresa} · {p.sede} · {p.responsable || 'sin responsable'}</div>
                </div>
                <div className="text-2xs font-mono">{p.fecha}</div>
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
                <div className="text-2xs font-mono">{c.fecha}</div>
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
/* ---------------------------------------------------------------- */
/* PÁGINA: REPORTES DE FALLA (Ingeniería Biomédica)                   */
/* ---------------------------------------------------------------- */
function ReportesFallaPage({ reportes, t, onUpdate, readOnly }) {
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [openId, setOpenId] = useState(null);

  const list = reportes
    .filter(r => (!filtroEstado || r.estado === filtroEstado) && (!filtroPrioridad || r.prioridad === filtroPrioridad))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const openReport = (r) => {
    setOpenId(openId === r.id ? null : r.id);
    if (!r.visto && !readOnly) onUpdate({ ...r, visto: true });
  };

  return (
    <div>
      <h1 className="text-lg font-bold mb-1">Reportes de falla</h1>
      <p className={`text-xs mb-4 ${t.muted}`}>Solicitudes enviadas por los coordinadores de sede.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo estado</option>
          {REPORTE_ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filtroPrioridad} onChange={e => setFiltroPrioridad(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda prioridad</option>
          {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {list.length === 0 && <div className={`text-sm text-center py-10 ${t.muted}`}>Sin reportes de falla todavía</div>}

      <div className="space-y-2">
        {list.map(r => (
          <div key={r.id} className={`rounded-lg border overflow-hidden ${t.panel} ${t.border}`}>
            <div onClick={() => openReport(r)} className="p-3 flex items-center gap-3 cursor-pointer flex-wrap">
              {!r.visto && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Nuevo" />}
              <Badge color={PRIORIDAD_HEX[r.prioridad]}>{r.prioridad}</Badge>
              <div className="flex-1 min-w-[160px]">
                <div className="text-xs font-semibold">{r.equipoNombre || 'Equipo sin especificar'}</div>
                <div className={`text-2xs ${t.muted}`}>{r.empresa} · {r.sede} · reportó {r.personaReporta || 'sin nombre'}</div>
              </div>
              <Badge color={REPORTE_ESTADO_HEX[r.estado]}>{r.estado}</Badge>
              <span className="text-2xs font-mono">{r.fecha}</span>
            </div>
            {openId === r.id && (
              <div className={`p-3 border-t space-y-3 ${t.border} ${t.panel3}`}>
                <div>
                  <div className="text-3xs uppercase text-slate-400 mb-1">Descripción</div>
                  <div className="text-xs">{r.descripcion}</div>
                </div>
                {r.adjuntos && r.adjuntos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.adjuntos.map((a, i) => (
                      <PdfLink key={i} url={a.url} label={a.nombre || 'Ver PDF'} title={a.nombre || 'Ver adjunto'} t={t} />
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Estado">
                    <SelectInput t={t} value={r.estado} options={REPORTE_ESTADOS} disabled={readOnly}
                      onChange={v => onUpdate({ ...r, estado: v, fechaCierre: v === 'Finalizado' ? (r.fechaCierre || todayISO()) : r.fechaCierre })} />
                  </Field>
                  <Field label="Técnico asignado">
                    <TextInput t={t} value={r.tecnicoAsignado} disabled={readOnly} onChange={v => onUpdate({ ...r, tecnicoAsignado: v })} />
                  </Field>
                  <Field label="Fecha de cierre">
                    <TextInput t={t} type="date" value={r.fechaCierre} disabled={readOnly} onChange={v => onUpdate({ ...r, fechaCierre: v })} />
                  </Field>
                </div>
                <Field label="Observaciones de la reparación">
                  <textarea rows={3} value={r.observacionesReparacion || ''} disabled={readOnly} onChange={e => onUpdate({ ...r, observacionesReparacion: e.target.value })} className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input} ${readOnly ? 'opacity-60' : ''}`} />
                </Field>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportesPage({ t, accent, onExport }) {
  const reportes = [
    'Reporte mensual', 'Reporte anual', 'Reporte por empresa', 'Reporte por sede',
    'Reporte por técnico', 'Reporte de calibraciones', 'Reporte de correctivos', 'Reporte de preventivos',
  ];
  return (
    <div>
      <h1 className="text-lg font-bold mb-4">Reportes</h1>
      <p className={`text-xs mb-5 ${t.muted}`}>Exporta el inventario completo con todos los datos actuales a Excel.</p>
      <div className="grid md:grid-cols-2 gap-3">
        {reportes.map(r => (
          <div key={r} className={`rounded-lg border p-4 flex items-center justify-between ${t.panel} ${t.border}`}>
            <span className="text-xs font-semibold">{r}</span>
            <Button variant="primary" size="sm" accent={accent} icon={Download} iconSize={12} onClick={onExport}>Excel</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PÁGINA: CONFIGURACIÓN                                              */
/* ---------------------------------------------------------------- */
function ConfigPage({ t, accent, onReset, onLogout, alertEmails, setAlertEmails, readOnly }) {
  const [draft, setDraft] = useState('');
  const addEmail = () => {
    if (readOnly) return;
    const v = draft.trim();
    if (!v) return;
    if (!/^\S+@\S+\.\S+$/.test(v)) return;
    if (alertEmails.includes(v)) { setDraft(''); return; }
    setAlertEmails([...alertEmails, v]);
    setDraft('');
  };
  return (
    <div>
      <h1 className="text-lg font-bold mb-1">Configuración</h1>
      <p className={`text-2xs mb-4 font-mono ${t.muted}`}>Versión del panel: {APP_BUILD}</p>

      <div className={`rounded-lg border p-4 max-w-md mb-4 ${t.panel} ${t.border}`}>
        <div className="text-xs font-semibold mb-1">Correos para alertas</div>
        <p className={`text-2xs mb-3 ${t.muted}`}>
          Se usan en el botón "Enviar alertas por correo" dentro de la sección Alertas. Abre tu programa de correo con estos destinatarios y el resumen ya redactado — no se envían solos.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {alertEmails.length === 0 && <span className={`text-2xs ${t.muted}`}>Sin correos agregados todavía</span>}
          {alertEmails.map(email => (
            <span key={email} className="flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 text-2xs" style={{ background: accent + '1A', color: accent }}>
              {email}
              {!readOnly && <button onClick={() => setAlertEmails(alertEmails.filter(e => e !== email))} className="hover:opacity-70"><X size={11} /></button>}
            </span>
          ))}
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <input
              value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addEmail()}
              placeholder="correo@empresa.com" type="email"
              className={`flex-1 rounded-md px-2.5 py-1.5 text-xs border ${t.input}`}
            />
            <Button variant="primary" accent={accent} onClick={addEmail}>Agregar</Button>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className={`rounded-lg border p-4 max-w-md mb-4 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold mb-1">Restablecer datos</div>
          <p className={`text-2xs mb-3 ${t.muted}`}>Elimina todos los equipos guardados en este panel. Esta acción no se puede deshacer.</p>
          <Button variant="danger" onClick={onReset}>Borrar todos los datos</Button>
        </div>
      )}
      <div className={`rounded-lg border p-4 max-w-md ${t.panel} ${t.border}`}>
        <div className="text-xs font-semibold mb-1">Sesión</div>
        <p className={`text-2xs mb-3 ${t.muted}`}>{readOnly ? 'Sales del modo invitado en este navegador.' : 'Cierra tu sesión en este navegador. Te pedirá usuario y contraseña de nuevo.'}</p>
        <Button variant="outline" t={t} onClick={onLogout}>{readOnly ? 'Salir del modo invitado' : 'Cerrar sesión'}</Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* WRAPPER DE ACCESO                                                  */
/* ---------------------------------------------------------------- */
export default function App() {
  const [authed, setAuthed] = useState(() => {
    try { return localStorage.getItem('cmms-auth-ok') === 'true'; } catch { return false; }
  });
  const [guestMode, setGuestMode] = useState(false);
  const [publicView, setPublicView] = useState(null); // null | 'reporte'

  if (publicView === 'reporte' && !authed && !guestMode) {
    return <ReporteFallaForm onBack={() => setPublicView(null)} />;
  }

  if (!authed && !guestMode) {
    return <LoginScreen onLogin={() => setAuthed(true)} onGuest={() => setGuestMode(true)} onReportarFalla={() => setPublicView('reporte')} />;
  }

  const salir = () => {
    localStorage.removeItem('cmms-auth-ok');
    setAuthed(false);
    setGuestMode(false);
  };

  return (
    <ReadOnlyContext.Provider value={guestMode}>
      <MainApp onLogout={salir} readOnly={guestMode} />
    </ReadOnlyContext.Provider>
  );
}
