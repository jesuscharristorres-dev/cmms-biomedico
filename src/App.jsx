import React, { useState, useEffect, useMemo, useRef, useContext } from 'react';
import {
  Search, Plus, Trash2, Copy, Download, Upload, Sun, Moon, X,
  MessageCircle, FileText, LayoutDashboard, Building2, ListTree, CalendarClock,
  ShieldCheck, Wrench, FileBarChart, Settings, ArrowUpDown, BellRing, AlertTriangle, Lock,
  User, Eye, EyeOff, Image as ImageIcon, FolderOpen, ShieldAlert, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, BookOpen, MapPin, Cpu, Activity, Share2, HeartPulse, Database, ArrowRight,
  IdCard, Save, SprayCan, ClipboardList, Paperclip, MoreVertical, Pencil, Filter, Zap, ExternalLink,
  GraduationCap, RefreshCw, Users, UserPlus, Power, UserCog, Link2, LayoutGrid, Layers, BriefcaseBusiness
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line
} from 'recharts';
// La v9 de `read-excel-file` movió la lectura de una sola hoja al export nombrado `readSheet`
// (el default export ahora devuelve TODAS las hojas del libro, envueltas en `{ sheet, data }`,
// no las filas directamente) — hay que usar `readSheet` para seguir recibiendo el arreglo de
// filas plano que el resto de esta función espera.
import { readSheet } from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import { PREVENTIVO_ALERTA_DIAS, CALIBRACION_ALERTA_DIAS, calibStatus, buildAlerts, aplicaCalibracionEfectiva } from './services/alertLogic';
import { preventivoDelMes } from './services/preventivoSchedule';
import { MODULOS, ESTADOS_MODULO, moduloPorKey, moduloDeMenu, menuDeModulo, modulosPermitidos } from './platform/modulos';
import { PlatformHeader, ModuloInfoPage, PortalPublico } from './platform/PortalInicio';
import { LANDING_ECOSISTEMA } from './platform/landing';
// Módulo Gestión Humana (demo): se carga solo cuando alguien entra al módulo.
const GestionHumana = React.lazy(() => import('./rrhh/GestionHumana'));
import { EMPRESAS_RRHH, empresaRRHHDeUsuario, nombreEmpresaRRHH } from './rrhh/empresas';
// Logo institucional real (ring + wordmark ya integrados en el PNG) — reemplaza al
// LogoMark generado por código únicamente en la pantalla de inicio de sesión.
import logoIngenieriaClinica from './assets/logo-ingenieria-clinica.png';
import logoMacromed from './assets/logo-macromed.jpg';

/* ---------------------------------------------------------------- */
/* ERROR BOUNDARY                                                     */
/* ---------------------------------------------------------------- */
// Sin esto, cualquier excepción de render en cualquier parte del árbol (p.ej. un dato
// inesperado que llega del servidor justo después del login) desmonta TODA la app sin
// avisar — pantalla en blanco, sin pista salvo un stack trace de React perdido en la
// consola. Con esto, el error queda visible en pantalla (con recarga de un clic) en vez
// de desaparecer silenciosamente.
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary] Error de render capturado:', error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh flex items-center justify-center p-6 bg-slate-50 text-slate-800">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h1 className="text-base font-bold text-red-600 mb-2">Ocurrió un error inesperado</h1>
            <p className="text-sm text-slate-600 mb-3">
              La aplicación encontró un problema y no pudo continuar. Recarga la página para intentar de nuevo.
            </p>
            <pre className="text-xs bg-slate-100 rounded-md p-3 overflow-auto mb-4 whitespace-pre-wrap">
              {String(this.state.error?.stack || this.state.error)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md px-3 py-2"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------------------------------------------------------- */
/* CONFIG                                                            */
/* ---------------------------------------------------------------- */

const NEUTRAL_ACCENT = '#4FD1C5';
// Solo lectura: true para usuarios con rol LECTURA (reemplaza al antiguo "Modo invitado"
// anónimo). Se consume con useContext(ReadOnlyContext). Es solo presentación: el servidor
// rechaza igual (403) cualquier escritura de un usuario de solo lectura.
const ReadOnlyContext = React.createContext(false);
// Usuario autenticado tal como lo describe el servidor (GET /api/login): { id, nombre,
// email, role, empresa_id, estado }. La UI lo usa para adaptar menú y selectores; la
// autorización real SIEMPRE la decide la API a partir de la sesión, nunca de este objeto.
const AuthUserContext = React.createContext(null);
const ROLE_LABELS = { SUPER_ADMIN: 'Super administrador', EMPRESA: 'Usuario de empresa', LECTURA: 'Solo lectura' };
// Sello de versión — actualízalo cuando reemplaces App.jsx, así confirmas en Configuración
// que el navegador está sirviendo la versión más reciente y no una copia en caché.
const APP_BUILD = '2026-09-29 · Arquitectura multiempresa (SUPER_ADMIN, empresas y usuarios)';

// Cierre de sesión por inactividad (ver useInactivityLogout más abajo, y AppInner donde
// se usa): 15 minutos sin actividad real cierran la sesión; el aviso aparece 1 minuto
// antes para dar oportunidad de seguir trabajando.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const IDLE_WARNING_MS = 60 * 1000;
const IDLE_ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

// Detecta inactividad del usuario (mouse, teclado, clics, toques, scroll) y dispara un
// aviso `onWarn` un minuto antes de `onTimeout` — este último es responsable de invalidar
// la sesión de verdad (ver `cerrarSesion` en AppInner: llama a POST /api/logout, que
// destruye el token en el servidor, no solo oculta la interfaz). `onActivity` se dispara
// en cada interacción real, para que quien esté mostrando el aviso pueda ocultarlo.
// Los callbacks se leen desde refs (no desde las dependencias del efecto) para poder
// reprogramar los timers sin desmontar/volver a montar los listeners en cada render.
function useInactivityLogout({ active, onWarn, onActivity, onTimeout }) {
  const warnTimer = useRef(null);
  const logoutTimer = useRef(null);
  const callbacks = useRef({ onWarn, onActivity, onTimeout });
  // Sincroniza en un efecto, no durante el render (mutar un ref mientras se renderiza es
  // un anti-patrón que React ya marca como error) — así los timers, que viven fuera del
  // ciclo de render, siempre llaman a la versión más reciente de cada callback.
  useEffect(() => {
    callbacks.current = { onWarn, onActivity, onTimeout };
  });

  useEffect(() => {
    if (!active) return undefined;

    const clearTimers = () => {
      clearTimeout(warnTimer.current);
      clearTimeout(logoutTimer.current);
    };

    const schedule = () => {
      clearTimers();
      warnTimer.current = setTimeout(() => callbacks.current.onWarn(), IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
      logoutTimer.current = setTimeout(() => callbacks.current.onTimeout(), IDLE_TIMEOUT_MS);
    };

    // mousemove/scroll disparan decenas de eventos por segundo — se limita a reprogramar
    // como máximo una vez por segundo, sin perder precisión real (el usuario sigue activo).
    let lastActivity = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivity < 1000) return;
      lastActivity = now;
      callbacks.current.onActivity();
      schedule();
    };

    IDLE_ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, handleActivity, { passive: true }));
    schedule();

    return () => {
      clearTimers();
      IDLE_ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, handleActivity));
    };
  }, [active]);
}

// Modal de aviso previo al cierre por inactividad — el conteo regresivo es solo visual
// (se deriva de `segundos`, que ya trae AppInner); "Seguir trabajando" cuenta como
// actividad real, así que basta con que el usuario haga clic aquí para reiniciar el
// temporizador completo.
function SessionWarningModal({ segundos, onContinuar, onCerrarAhora }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" />
      <div className="animate-modal-in relative w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 text-slate-100 p-5 shadow-2xl">
        <div className="flex items-center gap-2 mb-2 text-amber-400">
          <AlertTriangle size={18} />
          <div className="text-sm font-bold">Tu sesión está por cerrarse</div>
        </div>
        <p className="text-xs text-slate-300 mb-4">
          Por seguridad, la sesión se cierra automáticamente tras un período de inactividad.
          Se cerrará en <span className="font-mono font-bold text-amber-400">{segundos}s</span> si no hay actividad.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCerrarAhora}>Cerrar sesión ahora</Button>
          <Button variant="primary" accent="#2F8FD1" onClick={onContinuar}>Seguir trabajando</Button>
        </div>
      </div>
    </div>
  );
}

// MULTIEMPRESA: las empresas ya NO están fijas en el código — viven en el servidor
// (Administración → Empresas, api/admin.js) y se cargan al iniciar sesión (GET /api/login).
// DEFAULT_COMPANIES solo es el respaldo visual (colores/logos originales) de las 5 empresas
// sembradas y el valor inicial antes de cargar. `COMPANIES` es la lista VIGENTE: se reemplaza
// en sitio con setCompanies() — para un usuario de empresa contiene SOLO su empresa (el
// servidor no le envía las demás), así que selectores, pestañas y dashboards de toda la app
// se recortan solos. Esto es solo presentación: el aislamiento real lo aplica la API.
const DEFAULT_COMPANIES = [
  { key: 'MACROMED', color: '#002485', gradient: 'linear-gradient(135deg, #002485 0%, #1F4FB8 100%)', sedes: ['Bogotá'], logo: '/logos/MACROMED.png' },
  { key: 'MEIDE', color: '#24546A', gradient: 'linear-gradient(135deg, #24546A 0%, #3B7088 100%)', sedes: ['Armenia Berlín','Armenia Fundadores','Manizales Belén','Manizales Arboleda','La Dorada','Unidad Móvil'], logo: '/logos/MEIDE.png' },
  { key: 'NP MEDICAL', color: '#3F8E6F', gradient: 'linear-gradient(135deg, #3F8E6F 0%, #63B48F 100%)', sedes: ['Bogotá Samper','Bogotá Sur','Fontibón','Girardot','Tunja'], logo: '/logos/NP_MEDICAL.png' },
  { key: 'DIAGNOSTIK', color: '#C62828', gradient: 'linear-gradient(135deg, #C62828 0%, #E53935 100%)', sedes: ['Armenia Berlín','Armenia Fundadores','Manizales Belén','Bogotá','Chapinero','Villavicencio','La Dorada'], logo: '/logos/DIAGNOSTIK.png' },
  { key: 'AUNAR SALUD', color: '#009EB7', gradient: 'linear-gradient(135deg, #009EB7 0%, #33C4D8 100%)', sedes: ['Bogotá','Bogotá - Segundo Piso','Bogotá - Quinto Piso','Bogotá - Sexto Piso','Villavicencio','Neiva'], logo: '/logos/AUNAR.png' },
];
const COMPANIES = [...DEFAULT_COMPANIES];

// Convierte una empresa del servidor ({ id, nombre, color, sedes, logo, ... }) al formato que
// usa toda la UI ({ key, color, gradient, sedes, logo }). `key` es el empresa_id.
function empresaToCompany(e) {
  const base = DEFAULT_COMPANIES.find(c => c.key === e.id);
  const color = e.color || base?.color || NEUTRAL_ACCENT;
  return {
    key: e.id,
    nombre: e.nombre || e.id,
    estado: e.estado || 'activo',
    color,
    gradient: base && base.color === color ? base.gradient : `linear-gradient(135deg, ${color} 0%, ${shade(color, 0.25)} 100%)`,
    sedes: Array.isArray(e.sedes) && e.sedes.length ? e.sedes : ['Principal'],
    logo: e.logo || base?.logo || '',
  };
}
function setCompanies(empresas) {
  if (!Array.isArray(empresas) || empresas.length === 0) return;
  COMPANIES.splice(0, COMPANIES.length, ...empresas.map(empresaToCompany));
}

// Clave de comparación de sedes: sin tildes, sin mayúsculas y sin espacios repetidos, para
// que "BOGOTA SUR", "Bogotá  Sur" y "Bogotá Sur" se reconozcan como la misma sede.
function normSede(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

// Sedes EFECTIVAS de cada empresa = sedes configuradas (Administración → Empresas) + sedes
// que realmente tienen sus equipos (p. ej. las cargadas con el cronograma en Excel). Así una
// sede en uso nunca desaparece de la hoja de vida, los filtros ni los dashboards aunque la
// configuración de la empresa esté incompleta. `sedesConfig` conserva la lista configurada.
function registrarSedesEnUso(equipos) {
  COMPANIES.forEach(c => {
    const config = c.sedesConfig || c.sedes;
    c.sedesConfig = config;
    const vistas = new Set(config.map(normSede));
    const extra = [];
    (equipos || []).forEach(e => {
      if (e.empresa !== c.key || !e.sede) return;
      const k = normSede(e.sede);
      if (vistas.has(k)) return;
      vistas.add(k);
      extra.push(e.sede);
    });
    c.sedes = [...config, ...extra.sort((a, b) => a.localeCompare(b))];
  });
}
// Para una clave que no coincide con ninguna empresa (registros heredados sin empresa válida,
// que solo ve el SUPER_ADMIN hasta asignarlos en Administración → Empresas) se devuelve una
// empresa "placeholder" neutra en vez de undefined, para que ninguna vista se caiga.
const UNKNOWN_COMPANY_COLOR = '#94A3B8';
const companyOf = (key) => COMPANIES.find(c => c.key === key) || (key && key !== 'TODAS' ? {
  key, nombre: `${key} (sin empresa válida)`, estado: 'inactivo', color: UNKNOWN_COMPANY_COLOR,
  gradient: `linear-gradient(135deg, ${UNKNOWN_COMPANY_COLOR} 0%, #CBD5E1 100%)`, sedes: [], logo: '', desconocida: true,
} : undefined);

// Color fijo (independiente del tema de cada empresa) para resaltar el ícono de
// observaciones en el inventario cuando el equipo tiene una observación guardada.
const OBS_HIGHLIGHT_COLOR = '#F59E0B';

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
// Fondo de la barra lateral en modo claro — antes usaba el mismo `t.panel` (bg-white) que
// cualquier otro panel de la app; ahora es un degradado propio (verde menta → azul muy
// claro) para darle una identidad visual distinta, más "tecnológica", sin tocar `uiTheme`
// (que sigue rigiendo el resto de tarjetas/paneles). Modo oscuro no se toca — sigue con
// `t.panel` (bg-slate-900) tal como estaba, porque el pedido era específicamente sobre el
// fondo blanco/pálido del modo claro.
const SIDEBAR_GRADIENT_LIGHT = 'linear-gradient(180deg, #D9F7EF 0%, #E4F3FA 100%)';
// Ítem activo del menú (solo modo claro): el mismo degradado en un tono más intenso, para
// diferenciarse del resto sin recurrir a un color saturado ni al acento de la empresa activa.
const SIDEBAR_ACTIVE_GRADIENT_LIGHT = 'linear-gradient(135deg, #BFEEDF 0%, #CDE8F6 100%)';
const SIDEBAR_ACTIVE_ACCENT_LIGHT = '#1F9C82';

const MONTHS = [
  { k: 'ene', l: 'Ene', full: 'Enero', idx: 0 }, { k: 'feb', l: 'Feb', full: 'Febrero', idx: 1 }, { k: 'mar', l: 'Mar', full: 'Marzo', idx: 2 },
  { k: 'abr', l: 'Abr', full: 'Abril', idx: 3 }, { k: 'may', l: 'May', full: 'Mayo', idx: 4 }, { k: 'jun', l: 'Jun', full: 'Junio', idx: 5 },
  { k: 'jul', l: 'Jul', full: 'Julio', idx: 6 }, { k: 'ago', l: 'Ago', full: 'Agosto', idx: 7 }, { k: 'sep', l: 'Sep', full: 'Septiembre', idx: 8 },
  { k: 'oct', l: 'Oct', full: 'Octubre', idx: 9 }, { k: 'nov', l: 'Nov', full: 'Noviembre', idx: 10 }, { k: 'dic', l: 'Dic', full: 'Diciembre', idx: 11 },
];
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
// ÚNICA función de la app para mostrarle una fecha al usuario (ej. "24/08/2026") — todo
// componente que necesite pintar una fecha en pantalla, tabla, PDF o exportación debe
// pasar por aquí, en vez de interpolar `equipo.fecha` (AAAA-MM-DD) directamente. Acepta
// tanto un string ISO ("AAAA-MM-DD" o con hora) como un objeto Date ya construido (p. ej.
// `calibStatus(...).next`). Ancla los strings de solo fecha a medianoche LOCAL — sin esto,
// `new Date('2026-08-24')` se interpreta como medianoche UTC, que en Colombia (UTC-5) cae
// la tarde/noche del día 23, mostrando la fecha equivocada.
function formatFechaCorta(fecha) {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha.length === 10 ? `${fecha}T00:00:00` : fecha);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
// Fecha y hora legibles (ej. "10/08/2026 15:45") a partir de un timestamp ISO completo.
function formatFechaHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const fecha = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${fecha} ${hora}`;
}
// Duración legible (ej. "2d 5h 10min") a partir de una diferencia en milisegundos.
function formatDuracion(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const partes = [];
  if (d) partes.push(`${d}d`);
  if (d || h) partes.push(`${h}h`);
  partes.push(`${m}min`);
  return partes.join(' ');
}
// Resuelve el inicio/fin de atención de un reporte de falla. Para reportes creados
// antes de guardar hora exacta, cae a las fechas (solo día) que ya existían, así los
// registros antiguos siguen mostrando información en vez de quedar vacíos.
function reporteTimestamps(r) {
  const inicio = r.fechaHoraReporte || (r.fecha ? `${r.fecha}T00:00:00` : null);
  const fin = r.fechaHoraSolucion || (r.estado === 'Finalizado' && r.fechaCierre ? `${r.fechaCierre}T00:00:00` : null);
  return { inicio, fin };
}
// Tiempo de respuesta en milisegundos, o null si la falla aún no tiene fecha de solución.
function tiempoRespuestaMs(r) {
  const { inicio, fin } = reporteTimestamps(r);
  if (!inicio || !fin) return null;
  const ms = new Date(fin) - new Date(inicio);
  return isNaN(ms) ? null : Math.max(0, ms);
}
// El login ya NO se verifica aquí — antes AUTH_USER/AUTH_PASS vivían en este archivo,
// lo que significa que cualquiera podía leerlos abriendo "ver código fuente" en el
// navegador. Ahora la verificación real ocurre en el servidor (api/login.js), usando las
// variables de entorno AUTH_USER / AUTH_PASSWORD_HASH configuradas en Vercel.

const CLASIFICACIONES = ['I', 'IIA', 'IIB', 'III', 'N/A'];
const ESTADOS_EQUIPO = ['Operativo', 'Fuera de servicio', 'En mantenimiento', 'Dado de baja'];
// La vista "Mantenimientos preventivos" solo ofrece estos dos — "Dado de baja" únicamente
// aparece seleccionable en un equipo cuando ya tiene un reporte de baja (mismo campo
// equipo.estado de siempre; no es una lógica nueva, solo se acortan las opciones visibles aquí).
const ESTADOS_MANTENIMIENTOS = ['Operativo', 'Dado de baja'];
const PERIODICIDADES = ['Mensual', 'Bimestral', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual', 'N/A'];
// `guestHidden`: oculto para usuarios de SOLO LECTURA (rol LECTURA) — solo consulta, sin las
// secciones operativas/administrativas.
// `superOnly`: solo para SUPER_ADMIN (vista global de empresas, configuración y el grupo
// Administración). Ocultarlo del menú NO es la medida de seguridad: la API responde 403 igual.
// `group`: encabezado de sección en el sidebar.
const BIOMEDICA_MENU_KEYS = new Set(['dashboard', 'alertas', 'fallas', 'planes', 'capacitaciones', 'tecnovigilancia', 'personal', 'limpieza', 'empresas', 'inventario', 'configuracion']);
// PLATAFORMA: el menú se organiza por módulo (`modulo` = clave en src/platform/modulos.js).
// El portal de módulos vive en la landing pública (antes del login), así que dentro de la
// app no hay entradas 'inicio' ni 'modulos': el inicio es la pantalla de entrada del módulo
// en el que se está (Dashboard en Biomédica, tablero en Gestión Humana…). Las entradas del grupo Biomédica son exactamente las pantallas que ya
// existían (mismas claves), solo agrupadas; las áreas nuevas abren su pantalla informativa
// (`modulo_<clave>`) hasta que tengan pantallas propias.
const MENU = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'alertas', label: 'Alertas', icon: BellRing, guestHidden: true },
  { key: 'fallas', label: 'Reportes de falla', icon: AlertTriangle, guestHidden: true },
  { key: 'planes', label: 'Planes y programas', icon: FolderOpen },
  { key: 'capacitaciones', label: 'Capacitaciones', icon: GraduationCap },
  { key: 'tecnovigilancia', label: 'Tecnovigilancia', icon: ShieldAlert },
  { key: 'personal', label: 'Hojas de vida personal', icon: IdCard },
  { key: 'limpieza', label: 'Formatos de limpieza y desinfección', icon: SprayCan },
  { key: 'empresas', label: 'Empresas', icon: Building2, superOnly: true },
  { key: 'inventario', label: 'Inventario', icon: ListTree },
  // 'mantenimientos' / 'correctivos' / 'calibraciones' se ocultaron del menú principal a
  // pedido del usuario (menú más limpio, sin duplicar lo que ya se consulta desde la Hoja
  // de vida de cada equipo). Sus rutas y componentes (InventarioPage con mode='mantenimientos'
  // /'correctivos'/'calibraciones', más abajo en MainApp) siguen existiendo intactos — nada
  // de la base de datos ni la lógica se eliminó, solo dejaron de tener entrada en el sidebar.
  // 'reportes' se quitó del sidebar a pedido del usuario: era la única forma de llegar a esa
  // pantalla (ningún otro lugar de la app navegaba ahí), así que se eliminó también el
  // componente ReportesPage y las funciones que solo él usaba (generarInformeMensualPDF,
  // InformeF140Modal, generarF140PDF, computeInformeF140/Mensual, etc.).
  { key: 'configuracion', label: 'Configuración', icon: Settings, guestHidden: true, superOnly: true },
  ...MODULOS.filter(m => m.key !== 'biomedica' && !m.soloSuperAdmin && (m.principal || m.menuLateral))
    .map(m => ({ key: menuDeModulo(m.key), label: m.menuLabel || m.nombre, icon: m.icon, group: 'Áreas', modulo: m.key })),
  { key: 'admin_empresas', label: 'Empresas', icon: Building2, superOnly: true, group: 'Administración', modulo: 'administracion' },
  { key: 'admin_usuarios', label: 'Usuarios', icon: Users, superOnly: true, group: 'Administración', modulo: 'administracion' },
].map(m => (BIOMEDICA_MENU_KEYS.has(m.key) ? { ...m, group: 'Biomédica', modulo: 'biomedica' } : m));
// Vistas de Biomédica que existen pero no tienen entrada propia en el menú (ver arriba):
// se abren desde el portal con los mismos permisos que antes (nunca para solo lectura).
const MENU_OCULTAS = {
  mantenimientos: { key: 'mantenimientos', label: 'Mantenimientos', guestHidden: true, group: 'Biomédica', modulo: 'biomedica' },
  calibraciones: { key: 'calibraciones', label: 'Calibraciones', guestHidden: true, group: 'Biomédica', modulo: 'biomedica' },
  correctivos: { key: 'correctivos', label: 'Correctivos', guestHidden: true, group: 'Biomédica', modulo: 'biomedica' },
};
const menuDef = (key) => MENU.find(m => m.key === key) || MENU_OCULTAS[key] || null;
// Semáforo semántico compartido — mantenimientos y calibraciones usan el mismo
// significado de color (verde=bien, ámbar=próximo, rojo=vencido, gris=sin dato),
// antes duplicado como dos mapas hex idénticos con llaves distintas.
const SEMANTIC_HEX = { ok: '#22C55E', warn: '#F59E0B', danger: '#EF4444', neutral: '#475569' };
const STATUS_HEX = { realizado: SEMANTIC_HEX.ok, programado: SEMANTIC_HEX.warn, vencido: SEMANTIC_HEX.danger, no_aplica: SEMANTIC_HEX.neutral };
const STATUS_LABEL = { realizado: 'Realizado', programado: 'Programado', vencido: 'Vencido', no_aplica: 'No aplica' };
const CAL_HEX = { vigente: SEMANTIC_HEX.ok, proximo: SEMANTIC_HEX.warn, vencido: SEMANTIC_HEX.danger, sin_dato: SEMANTIC_HEX.neutral };

const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Fecha de HOY en formato AAAA-MM-DD, usando el reloj LOCAL del navegador. A propósito
// no usa `new Date().toISOString()` (que da la fecha en UTC): Colombia es UTC-5, así que
// entre las 7:00 p. m. y la medianoche locales, el UTC ya cayó en el día siguiente — con
// toISOString(), cualquier registro nuevo (preventivo, correctivo, reporte de falla, etc.)
// creado en esa ventana horaria se guardaba fechado un día por delante.
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function newEquipo(empresaKey) {
  const c = companyOf(empresaKey) || COMPANIES[0];
  return {
    id: uid('eq'),
    empresa: c.key, sede: c.sedes[0],
    equipo: '', marca: '', modelo: '', numeroSerie: '', registroInvima: '',
    clasificacionRiesgo: 'IIB', inventario: '',
    fechaInstalacion: '',
    fotografiaUrl: '', ubicacion: '', estado: 'Operativo', actaEntregaUrl: '', hojaVidaUrl: '',
    periodicidadMantenimiento: 'Anual', periodicidadCalibracion: 'ANUAL',
    aplicaCalibracion: true, aplicaPreventivo: true,
    fechaUltimaCalibracion: '', certificadoUrl: '', observaciones: '',
    preventivos: [], correctivos: [], calibraciones: [], instalaciones: [], documentos: [], bajas: [],
  };
}

/* ---------------------------------------------------------------- */
/* HELPERS DE CÁLCULO                                                 */
/* ---------------------------------------------------------------- */

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

// Envoltorio de fetch para la API de datos: si el servidor responde 401 (sesión expirada,
// usuario desactivado/eliminado o movido de empresa), avisa a AppInner para volver al login
// en vez de dejar la app mostrando datos que ya no se pueden refrescar.
async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) window.dispatchEvent(new Event('cmms:unauthorized'));
  return res;
}

// Las cachés locales (localStorage) son por navegador, no por usuario: si en el mismo equipo
// entra otro usuario, se borran para que nunca vea (ni siquiera sin conexión) datos en caché
// de otra empresa. CACHE_OWNER_KEY recuerda de qué usuario son las cachés actuales.
const CACHE_PREFIX = 'cmms-';
const CACHE_OWNER_KEY = 'cmms_cache_owner';
function clearDataCaches() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
  } catch { /* caché best-effort */ }
}
function claimDataCaches(user) {
  try {
    const owner = localStorage.getItem(CACHE_OWNER_KEY);
    // Primer inicio tras la actualización multiempresa: las cachés existentes eran del único
    // administrador que había — se conservan solo si quien entra es SUPER_ADMIN.
    if (owner ? owner !== user.id : user.role !== 'SUPER_ADMIN') clearDataCaches();
    localStorage.setItem(CACHE_OWNER_KEY, user.id);
  } catch { /* caché best-effort */ }
}

// Caché local best-effort compartida por todos los loadX/crearX/actualizarX de abajo — cada
// recurso sigue teniendo su propia clave y su propia lógica de fetch/migración (son distintas
// entre sí), pero el pequeño ritual de guardar/leer en localStorage sin que un error ahí
// tumbe la app era idéntico repetido ~28 veces.
function cacheSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* caché best-effort */ }
}
function cacheGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* sin caché aún */ }
  return fallback;
}
// Actualiza incrementalmente una caché de colección (arreglo de registros con `id`). Las
// escrituras de equipos/reportes/personal ya NO reciben la colección completa del servidor
// (reducción de Fast Origin Transfer): aplican aquí el cambio puntual sobre la copia local.
// Si todavía no hay caché, no se hace nada (la próxima lectura la crea).
function cacheMutar(key, fn) {
  const actual = cacheGet(key, null);
  if (!Array.isArray(actual)) return;
  cacheSet(key, fn(actual));
}
const cacheReemplazar = (key, registro) => registro && cacheMutar(key, list => list.map(r => r.id === registro.id ? registro : r));
const cacheAgregar = (key, registros) => cacheMutar(key, list => {
  const ids = new Set(registros.map(r => r.id));
  return [...list.filter(r => !ids.has(r.id)), ...registros];
});
const cacheQuitar = (key, id) => cacheMutar(key, list => list.filter(r => r.id !== id));

// Fuente de verdad COMPARTIDA del inventario de equipos (con sus preventivos, correctivos,
// calibraciones y bajas anidados): api/equipos.js (Vercel KV). localStorage queda como
// caché de lectura best-effort — nunca como almacenamiento principal.
const EQUIPOS_KEY = 'cmms-equipos';
async function loadEquipos() {
  try {
    const res = await apiFetch('/api/equipos');
    if (res.ok) {
      const { equipos } = await res.json();
      // Migración única: si el servidor aún no tiene nada pero este navegador sí tiene
      // equipos guardados de antes de este cambio (datos reales), se suben una sola vez
      // — el servidor decide por id, así que no hay riesgo de duplicar si se repite.
      if (equipos.length === 0) {
        let locales = [];
        try { locales = JSON.parse(localStorage.getItem(EQUIPOS_KEY) || '[]'); } catch { /* nada que migrar */ }
        if (locales.length > 0) {
          try {
            const migRes = await apiFetch('/api/equipos', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipos: locales }),
            });
            if (migRes.ok) {
              // El POST ya no devuelve la colección: se vuelve a leer una sola vez.
              const relectura = await apiFetch('/api/equipos');
              if (relectura.ok) {
                const { equipos: migrados } = await relectura.json();
                cacheSet(EQUIPOS_KEY, migrados);
                return migrados;
              }
            }
          } catch (err) { console.error('No se pudo migrar el inventario local al servidor compartido', err); }
        }
      }
      cacheSet(EQUIPOS_KEY, equipos);
      return equipos;
    }
    console.error('No se pudo consultar el inventario compartido: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar el inventario compartido', err);
  }
  return cacheGet(EQUIPOS_KEY, []);
}
// Las escrituras reciben solo lo afectado (no el inventario completo) y actualizan la caché
// local de forma incremental. Ningún llamador usa el valor devuelto (solo .catch / .then()).
async function crearEquipo(equipo) {
  const res = await apiFetch('/api/equipos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipo }) });
  if (!res.ok) throw new Error('No se pudo guardar el equipo en la base de datos compartida.');
  const { creados = [] } = await res.json();
  cacheAgregar(EQUIPOS_KEY, creados);
  return creados;
}
async function crearEquipos(nuevos) {
  const res = await apiFetch('/api/equipos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipos: nuevos }) });
  if (!res.ok) throw new Error('No se pudo importar los equipos a la base de datos compartida.');
  const { creados = [] } = await res.json();
  cacheAgregar(EQUIPOS_KEY, creados);
  return creados;
}
async function actualizarEquipo(id, patch) {
  const res = await apiFetch('/api/equipos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, patch }) });
  if (!res.ok) throw new Error('No se pudo actualizar el equipo en la base de datos compartida.');
  const { equipo } = await res.json();
  cacheReemplazar(EQUIPOS_KEY, equipo);
  return equipo;
}
async function eliminarEquipo(id) {
  const res = await apiFetch('/api/equipos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  if (!res.ok) throw new Error('No se pudo eliminar el equipo en la base de datos compartida.');
  cacheQuitar(EQUIPOS_KEY, id);
  return id;
}

/* ---------------------------------------------------------------- */
/* REPORTES DE FALLA (coordinadores de sede)                         */
/* ---------------------------------------------------------------- */
// Fuente de verdad COMPARTIDA entre todos los usuarios y computadores: api/reportes-falla.js
// (Vercel KV). localStorage queda como una caché de lectura best-effort — solo para no
// mostrar la pantalla vacía si falla la red — nunca como almacenamiento principal: toda
// escritura (crear, actualizar) va siempre al servidor, nunca solo al navegador local.
const REPORTES_KEY = 'cmms-reportes-falla';
async function loadReportes() {
  try {
    const res = await apiFetch('/api/reportes-falla');
    if (res.ok) {
      const { reportes } = await res.json();
      cacheSet(REPORTES_KEY, reportes);
      return reportes;
    }
    console.error('No se pudo consultar los reportes de falla compartidos: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar los reportes de falla compartidos', err);
  }
  // Sin backend disponible (sin red, o en desarrollo local con `npm run dev`, que no sirve
  // /api): se muestra la última copia conocida en vez de dejar la pantalla vacía.
  return cacheGet(REPORTES_KEY, []);
}
// Crea UN reporte en el servidor (nunca sobrescribe el arreglo completo desde el cliente):
// así dos coordinadores reportando casi al mismo tiempo desde computadores distintos no se
// pisan entre sí. Devuelve el arreglo completo ya actualizado.
async function crearReporteFalla(reporte) {
  const res = await apiFetch('/api/reportes-falla', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reporte }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = body.details ? Object.values(body.details)[0] : '';
    throw new Error(detalle || body.error || 'No se pudo guardar el reporte en la base de datos compartida.');
  }
  // Endpoint público: la respuesta trae solo el reporte creado, nunca el listado completo.
  return body.reporte;
}
// Actualiza UN reporte por id (estado, técnico asignado, observaciones, etc.) — mismo
// principio: el servidor hace el merge, el cliente nunca sobrescribe el arreglo completo.
async function actualizarReporteFalla(id, patch) {
  const res = await apiFetch('/api/reportes-falla', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, patch }),
  });
  if (!res.ok) throw new Error('No se pudo actualizar el reporte en la base de datos compartida.');
  const { reporte } = await res.json();
  cacheReemplazar(REPORTES_KEY, reporte);
  return reporte;
}
// Elimina UN reporte de falla por id (p. ej. uno duplicado o registrado por error) — a
// diferencia de vaciarReportesFalla(), no toca el resto del histórico.
async function eliminarReporteFalla(id) {
  const res = await apiFetch(`/api/reportes-falla?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('No se pudo eliminar el reporte de falla.');
  cacheQuitar(REPORTES_KEY, id);
  return id;
}
// Vacía TODO el histórico de reportes de falla en el servidor — pensado para limpiar datos
// de prueba, no para uso rutinario. Mismo principio de caché que crear/actualizar.
async function vaciarReportesFalla() {
  const res = await apiFetch('/api/reportes-falla', { method: 'DELETE' });
  if (!res.ok) throw new Error('No se pudo vaciar el histórico de reportes de falla.');
  // Mismo estado que muestra la interfaz tras vaciar (el servidor solo borra lo que el
  // usuario puede ver; la caché local solo contiene eso).
  cacheSet(REPORTES_KEY, []);
  return [];
}

// Documentación institucional por empresa (Planes y programas) — no transversal:
// cada empresa tiene sus propios documentos, guardados por separado bajo su clave.
// Fuente de verdad COMPARTIDA: api/planes-programas.js (Vercel KV).
const PLANES_KEY = 'cmms-planes-programas';
async function loadPlanesProgramas() {
  try {
    const res = await apiFetch('/api/planes-programas');
    if (res.ok) {
      const { data } = await res.json();
      if (Object.keys(data).length === 0) {
        let local = {};
        try { local = JSON.parse(localStorage.getItem(PLANES_KEY) || '{}'); } catch { /* nada que migrar */ }
        if (Object.keys(local).length > 0) {
          try {
            let migrado = data;
            for (const empresaKey of Object.keys(local)) {
              for (const campo of Object.keys(local[empresaKey] || {})) {
                migrado = await actualizarPlanPrograma(empresaKey, campo, local[empresaKey][campo]);
              }
            }
            return migrado;
          } catch (err) { console.error('No se pudo migrar planes y programas locales al servidor compartido', err); }
        }
      }
      cacheSet(PLANES_KEY, data);
      return data;
    }
    console.error('No se pudo consultar planes y programas compartidos: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar planes y programas compartidos', err);
  }
  return cacheGet(PLANES_KEY, {});
}
async function actualizarPlanPrograma(empresaKey, campo, valor) {
  const res = await apiFetch('/api/planes-programas', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresaKey, campo, valor }),
  });
  if (!res.ok) throw new Error('No se pudo guardar en la base de datos compartida.');
  const { data } = await res.json();
  cacheSet(PLANES_KEY, data);
  return data;
}
// Dashboard de capacitaciones — datos derivados de los formularios de Google Forms que
// usa el equipo de biomédicos (ver api/capacitaciones.js y lib/capacitaciones.js). El GET
// solo lee la última sincronización cacheada en Vercel KV; el botón "Actualizar" del
// dashboard dispara el POST (solo admin), que vuelve a consultar Google Sheets en vivo.
const CAPACITACIONES_KEY = 'cmms-capacitaciones';
async function loadCapacitaciones() {
  try {
    const res = await apiFetch('/api/capacitaciones');
    if (res.ok) {
      const { data } = await res.json();
      if (data) cacheSet(CAPACITACIONES_KEY, data);
      return data;
    }
    console.error('No se pudo consultar capacitaciones: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar capacitaciones', err);
  }
  return cacheGet(CAPACITACIONES_KEY, null);
}
async function sincronizarCapacitaciones() {
  const res = await apiFetch('/api/capacitaciones', { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo sincronizar las capacitaciones.');
  }
  const { data } = await res.json();
  cacheSet(CAPACITACIONES_KEY, data);
  return data;
}
// Empresa que agrupa respuestas cuyo texto libre no matchea ninguna de las 5 empresas del
// CMMS (p. ej. "UT", usado por los contratos ERON) — ver COMPANY_ALIASES en
// lib/capacitaciones.js, que es donde se decide a qué empresa cae cada respuesta.
const OTRAS_EMPRESA = 'OTRAS';

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

// Tecnovigilancia — documentación con una URL propia por empresa, y reportes trimestrales
// que se organizan por empresa · sede · año.
// Fuente de verdad COMPARTIDA: api/tecno-transversal.js (Vercel KV).
const TECNO_TRANSVERSAL_KEY = 'cmms-tecno-transversal';
async function loadTecnoTransversal() {
  try {
    const res = await apiFetch('/api/tecno-transversal');
    if (res.ok) {
      const { data } = await res.json();
      if (Object.keys(data).length === 0) {
        let local = {};
        try { local = JSON.parse(localStorage.getItem(TECNO_TRANSVERSAL_KEY) || '{}'); } catch { /* nada que migrar */ }
        if (Object.keys(local).length > 0) {
          try {
            let migrado = data;
            for (const docKey of Object.keys(local)) migrado = await actualizarTecnoTransversal(docKey, undefined, local[docKey]);
            return migrado;
          } catch (err) { console.error('No se pudo migrar la documentación transversal local al servidor compartido', err); }
        }
      }
      cacheSet(TECNO_TRANSVERSAL_KEY, data);
      return data;
    }
    console.error('No se pudo consultar la documentación transversal compartida: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar la documentación transversal compartida', err);
  }
  return cacheGet(TECNO_TRANSVERSAL_KEY, {});
}
// `empresaKey` en undefined solo lo usa la migración puntual desde localStorage (ver
// arriba) — para el uso normal (guardar la URL de UN documento para UNA empresa) siempre
// se pasan los tres argumentos.
async function actualizarTecnoTransversal(docKey, empresaKey, valor) {
  const res = await apiFetch('/api/tecno-transversal', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docKey, empresaKey, valor }),
  });
  if (!res.ok) throw new Error('No se pudo guardar en la base de datos compartida.');
  const { data } = await res.json();
  cacheSet(TECNO_TRANSVERSAL_KEY, data);
  return data;
}
// `porEmpresa: false` = un único documento/URL compartido por las 5 empresas (p. ej. un
// formato regulatorio de INVIMA, igual para todas); `porEmpresa: true` = cada empresa
// guarda su propia URL (p. ej. el manual interno, que puede variar por empresa).
const TECNO_DOCS = [
  { key: 'invima', label: 'ABC-Tecnovigilancia-INVIMA', icon: FileText, porEmpresa: false },
  { key: 'manual', label: 'DLC-GEB-MN-01 — Manual de Tecnovigilancia', icon: BookOpen, porEmpresa: true },
];

// Fuente de verdad COMPARTIDA: api/tecno-reportes.js (Vercel KV).
const TECNO_REPORTES_KEY = 'cmms-tecno-reportes';
async function loadTecnoReportes() {
  try {
    const res = await apiFetch('/api/tecno-reportes');
    if (res.ok) {
      const { data } = await res.json();
      if (Object.keys(data).length === 0) {
        let local = {};
        try { local = JSON.parse(localStorage.getItem(TECNO_REPORTES_KEY) || '{}'); } catch { /* nada que migrar */ }
        if (Object.keys(local).length > 0) {
          try {
            let migrado = data;
            for (const empresaKey of Object.keys(local)) {
              for (const sede of Object.keys(local[empresaKey] || {})) {
                for (const anio of Object.keys(local[empresaKey][sede] || {})) {
                  for (const trimestre of Object.keys(local[empresaKey][sede][anio] || {})) {
                    migrado = await actualizarTecnoReporte(empresaKey, sede, anio, trimestre, local[empresaKey][sede][anio][trimestre]);
                  }
                }
              }
            }
            return migrado;
          } catch (err) { console.error('No se pudo migrar los reportes de tecnovigilancia locales al servidor compartido', err); }
        }
      }
      cacheSet(TECNO_REPORTES_KEY, data);
      return data;
    }
    console.error('No se pudo consultar los reportes de tecnovigilancia compartidos: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar los reportes de tecnovigilancia compartidos', err);
  }
  return cacheGet(TECNO_REPORTES_KEY, {});
}
async function actualizarTecnoReporte(empresaKey, sede, anio, trimestre, valor) {
  const res = await apiFetch('/api/tecno-reportes', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresaKey, sede, anio, trimestre, valor }),
  });
  if (!res.ok) throw new Error('No se pudo guardar en la base de datos compartida.');
  const { data } = await res.json();
  cacheSet(TECNO_REPORTES_KEY, data);
  return data;
}
const TECNO_TRIMESTRES = [
  { key: 't1', label: '1.er trimestre' },
  { key: 't2', label: '2.º trimestre' },
  { key: 't3', label: '3.er trimestre' },
  { key: 't4', label: '4.º trimestre' },
];
// Ciudades/departamentos habilitados para reportes de Tecnovigilancia, por empresa.
// Es una lista propia del módulo (no las sedes operativas de COMPANIES): un reporte
// regional cubre todas las sedes de esa zona, así que aquí solo van ciudades, sin
// duplicar ni mezclar entre empresas.
const TECNO_CIUDADES = {
  MACROMED: ['Bogotá'],
  MEIDE: ['Armenia', 'Manizales', 'La Dorada', 'Bogotá'],
  'NP MEDICAL': ['Bogotá', 'Girardot'],
  DIAGNOSTIK: ['Bogotá', 'Villavicencio'],
  'AUNAR SALUD': ['Bogotá', 'Villavicencio', 'Neiva'],
};

// Hojas de vida del personal — un registro sencillo por trabajador (no un módulo de RRHH):
// datos básicos + una sola hoja de vida en PDF, asociado a una empresa existente.
// Fuente de verdad COMPARTIDA: api/personal.js (Vercel KV).
const PERSONAL_KEY = 'cmms-personal';
async function loadPersonal() {
  try {
    const res = await apiFetch('/api/personal');
    if (res.ok) {
      const { personal } = await res.json();
      if (personal.length === 0) {
        let locales = [];
        try { locales = JSON.parse(localStorage.getItem(PERSONAL_KEY) || '[]'); } catch { /* nada que migrar */ }
        if (locales.length > 0) {
          try {
            for (const record of locales) await crearPersonal(record);
            // POST ya no devuelve la colección: se vuelve a leer una sola vez tras migrar.
            const relectura = await apiFetch('/api/personal');
            if (relectura.ok) {
              const { personal: migrados } = await relectura.json();
              cacheSet(PERSONAL_KEY, migrados);
              return migrados;
            }
          } catch (err) { console.error('No se pudo migrar el personal local al servidor compartido', err); }
        }
      }
      cacheSet(PERSONAL_KEY, personal);
      return personal;
    }
    console.error('No se pudo consultar el personal compartido: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar el personal compartido', err);
  }
  return cacheGet(PERSONAL_KEY, []);
}
async function crearPersonal(record) {
  const res = await apiFetch('/api/personal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ record }) });
  if (!res.ok) throw new Error('No se pudo guardar el registro en la base de datos compartida.');
  const { record: guardado } = await res.json();
  if (guardado) cacheAgregar(PERSONAL_KEY, [guardado]);
  return guardado;
}
async function actualizarPersonal(id, patch) {
  const res = await apiFetch('/api/personal', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, patch }) });
  if (!res.ok) throw new Error('No se pudo actualizar el registro en la base de datos compartida.');
  const { record } = await res.json();
  cacheReemplazar(PERSONAL_KEY, record);
  return record;
}
const TIPOS_DOCUMENTO_PERSONAL = ['CC', 'CE', 'TI', 'Pasaporte'];
const ESTADOS_PERSONAL = ['Activo', 'Inactivo'];
const ESTADO_PERSONAL_HEX = { Activo: '#22C55E', Inactivo: '#94A3B8' };

// Formatos de limpieza y desinfección — un enlace externo (Drive/OneDrive/SharePoint) por
// sede · mes del año actual. Nunca se sube el documento en sí, solo su URL — igual que
// Planes y programas / Tecnovigilancia. Fuente de verdad COMPARTIDA: api/limpieza-desinfeccion.js
// (Vercel KV). Con la arquitectura multiempresa el PATCH exige sesión con permiso de escritura
// y solo sobre la empresa del usuario (antes era público para el antiguo Modo Invitado).
const LIMPIEZA_KEY = 'cmms-limpieza-desinfeccion';
async function loadLimpiezaDesinfeccion() {
  try {
    const res = await apiFetch('/api/limpieza-desinfeccion');
    if (res.ok) {
      const { data } = await res.json();
      cacheSet(LIMPIEZA_KEY, data);
      return data;
    }
    console.error('No se pudo consultar los formatos de limpieza y desinfección: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar los formatos de limpieza y desinfección', err);
  }
  return cacheGet(LIMPIEZA_KEY, {});
}
async function actualizarLimpiezaDesinfeccion(empresaKey, sede, anio, mes, url) {
  const res = await apiFetch('/api/limpieza-desinfeccion', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresaKey, sede, anio, mes, url }),
  });
  if (!res.ok) throw new Error('No se pudo guardar el enlace en la base de datos compartida.');
  const { data } = await res.json();
  cacheSet(LIMPIEZA_KEY, data);
  return data;
}

// Plantilla del formato de limpieza y desinfección: UN archivo real (PDF/Word/Excel) por
// empresa — a diferencia de arriba (que es solo un enlace externo por sede·mes), aquí el
// archivo se guarda tal cual en la base de datos compartida, como Data URI base64 (mismo
// mecanismo ya usado antes para documentos de equipo vía `archivoDatos`, ver abrirDocumento()
// más abajo), así que sí se puede ver/descargar sin depender de un servicio externo.
// Cargar/reemplazar/eliminar requieren un rol con escritura y solo sobre la empresa propia
// (api/limpieza-plantillas.js). Fuente de verdad: api/limpieza-plantillas.js.
const LIMPIEZA_PLANTILLAS_KEY = 'cmms-limpieza-plantillas';
async function loadLimpiezaPlantillas() {
  try {
    const res = await apiFetch('/api/limpieza-plantillas');
    if (res.ok) {
      const { data } = await res.json();
      cacheSet(LIMPIEZA_PLANTILLAS_KEY, data);
      return data;
    }
    console.error('No se pudo consultar las plantillas de limpieza y desinfección: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar las plantillas de limpieza y desinfección', err);
  }
  return cacheGet(LIMPIEZA_PLANTILLAS_KEY, {});
}
async function guardarLimpiezaPlantilla(empresaKey, { nombre, tipo, archivoDatos }) {
  const res = await apiFetch('/api/limpieza-plantillas', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empresaKey, nombre, tipo, archivoDatos }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'No se pudo guardar la plantilla en la base de datos compartida.');
  cacheSet(LIMPIEZA_PLANTILLAS_KEY, body.data);
  return body.data;
}
async function eliminarLimpiezaPlantillaRemota(empresaKey) {
  const res = await apiFetch('/api/limpieza-plantillas', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empresaKey }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'No se pudo eliminar la plantilla en la base de datos compartida.');
  cacheSet(LIMPIEZA_PLANTILLAS_KEY, body.data);
  return body.data;
}

function newPersonal(empresa) {
  return {
    id: uid('per'),
    nombreCompleto: '', tipoDocumento: 'CC', numeroDocumento: '',
    cargo: '', profesion: '', registroInvima: '', registroInvimaUrl: '', empresa, fechaIngreso: todayISO(),
    estado: 'Activo', hojaVidaUrl: '',
  };
}
function newReporte(empresa, sede) {
  return {
    id: uid('rf'),
    empresa, sede, equipoId: '', equipoNombre: '',
    fecha: todayISO(), personaReporta: '', descripcion: '', prioridad: 'Media',
    adjuntos: [],
    estado: 'Reportado', tecnicoAsignado: '', fechaCierre: '', observacionesReparacion: '',
    // Fecha y hora exactas de reporte y de solución — se generan automáticamente y
    // nunca se exponen como campos editables (trazabilidad del tiempo de atención).
    fechaHoraReporte: new Date().toISOString(), fechaHoraSolucion: '',
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

function Field({ label, children, dense }) {
  return (
    <div className={`flex flex-col ${dense ? 'gap-0.5' : 'gap-1'}`}>
      <label className="text-3xs uppercase tracking-wide text-slate-400">{label}</label>
      {children}
    </div>
  );
}

// Campo de fecha con máscara dd/mm/aaaa que se arma EN VIVO mientras el usuario escribe
// (a diferencia de un <input type="date"> nativo, cuyo valor no existe hasta completar
// los 3 segmentos — con eso, la pantalla parecía "no agregar nada" mientras se tecleaba).
// Es un <input type="text"> normal: cada tecla inserta un dígito y las diagonales se
// insertan solas; al completar los 8 dígitos (dd+mm+aaaa) con una fecha real, se confirma
// como ISO (aaaa-mm-dd, mismo formato de siempre para guardar). El ícono de calendario
// sigue abriendo el selector nativo del sistema para quien prefiera elegir en vez de
// escribir — ese <input type="date"> de respaldo queda invisible, del mismo tamaño que el
// ícono, y solo se usa vía showPicker().
function DateInput({ value, onChange, t, disabled, dense }) {
  const [text, setText] = useState(() => formatFechaCorta(value));
  const [prevValue, setPrevValue] = useState(value);
  // Si el valor llega/cambia desde afuera (se cargó el registro, o se eligió con el
  // calendario), resincroniza el texto visible — pero nunca mientras el usuario está a
  // mitad de tecleo (eso solo pasaría si `value` cambiara sin que este componente lo
  // haya pedido).
  if (value !== prevValue) { setPrevValue(value); setText(formatFechaCorta(value)); }

  const aplicarDigitos = (digits) => {
    let formatted = digits;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setText(formatted);
    if (digits.length === 8) {
      const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4, 8);
      const iso = `${yyyy}-${mm}-${dd}`;
      const d = new Date(`${iso}T00:00:00`);
      // Solo se confirma si día/mes/año forman una fecha real (evita guardar, p. ej., 31/02).
      if (!isNaN(d.getTime()) && d.getDate() === +dd && d.getMonth() + 1 === +mm) onChange(iso);
    } else if (digits.length === 0) {
      onChange('');
    }
  };

  const pickerRef = useRef(null);
  const abrirCalendario = () => { try { pickerRef.current?.showPicker?.(); } catch { /* navegador sin soporte para showPicker() — se sigue pudiendo escribir la fecha a mano */ } };

  const sizeCls = dense ? 'py-1 text-2xs' : 'py-1.5 text-xs';
  return (
    <div className={`flex items-center w-full rounded-md border ${t.input} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
      <input
        type="text" inputMode="numeric" autoComplete="off" placeholder="dd/mm/aaaa"
        value={text} disabled={disabled}
        onChange={e => aplicarDigitos(e.target.value.replace(/\D/g, '').slice(0, 8))}
        className={`flex-1 min-w-0 bg-transparent outline-none ${dense ? 'pl-2' : 'pl-2.5'} ${sizeCls} ${disabled ? 'cursor-not-allowed' : ''}`}
      />
      <div className="relative shrink-0">
        <button type="button" tabIndex={-1} disabled={disabled} onClick={abrirCalendario} aria-label="Elegir del calendario"
          className={`px-2 flex items-center ${dense ? 'py-1' : 'py-1.5'} ${disabled ? 'cursor-not-allowed' : ''} ${t.muted}`}>
          <CalendarClock size={dense ? 12 : 13} />
        </button>
        <input ref={pickerRef} type="date" tabIndex={-1} value={value || ''} disabled={disabled}
          onChange={e => { onChange(e.target.value); setText(formatFechaCorta(e.target.value)); }}
          className="absolute inset-0 opacity-0 pointer-events-none" aria-hidden="true" />
      </div>
    </div>
  );
}
function TextInput({ value, onChange, t, type = 'text', placeholder, disabled, dense }) {
  if (type === 'date') return <DateInput value={value} onChange={onChange} t={t} disabled={disabled} dense={dense} />;
  return (
    <input
      type={type} value={value || ''} placeholder={placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={`w-full rounded-md border ${dense ? 'px-2 py-1 text-2xs' : 'px-2.5 py-1.5 text-xs'} ${t.input} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    />
  );
}
function SelectInput({ value, onChange, options, t, disabled, dense, upper }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled} className={`rounded-md border ${dense ? 'px-2 py-1 text-2xs' : 'px-2.5 py-1.5 text-xs'} ${upper ? 'uppercase' : ''} ${t.input} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// Componente único para presentar cualquier campo de documento (certificados, actas,
// hojas de vida, manuales, adjuntos, etc.) en toda la app. Nunca se muestra la URL cruda:
// solo un botón con ícono de PDF, o un estado "Sin documento" si está vacío. El enlace
// real se conserva intacto en los datos — esto solo cambia la presentación visual.
// Cualquier campo nuevo de documento debe reutilizar este mismo componente.
function PdfLink({ url, label = 'Ver PDF', title, t, emptyLabel = 'Sin documento' }) {
  if (!url) {
    return (
      <span title={emptyLabel}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs shrink-0 cursor-default select-none ${t ? t.border : 'border-slate-300'} ${t ? t.muted : 'text-slate-400'}`}>
        <FileText size={13} /> {emptyLabel}
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

// Campo de URL dentro de un registro de RecordList (preventivos/correctivos/calibraciones/
// instalaciones/bajas). Si ya tiene un valor guardado queda fijo — no se puede editar ni
// borrar parte del enlace, solo eliminar el registro completo y volver a agregarlo — igual
// que antes. Pero si todavía está VACÍO (registros creados antes de que existiera este campo,
// o simplemente dejado en blanco al agregar el registro), sí se puede escribir y guardar por
// primera vez: sin esto, un campo vacío quedaba bloqueado para siempre sin forma de llenarlo.
// El campo usa un borrador local (`draft`) que solo se confirma con "Guardar", así no queda
// deshabilitado a mitad de escritura con la primera tecla.
function RecordUrlField({ t, value, onChange, label, readOnly }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const tieneValor = !!(value || '').trim();

  if (tieneValor) {
    return (
      <div className="flex gap-1.5">
        <div className="flex-1 min-w-0"><TextInput t={t} value={value} disabled onChange={() => {}} /></div>
        <PdfLink url={value} title={`Ver ${label.replace(' (URL)', '')}`} t={t} />
      </div>
    );
  }

  if (readOnly) {
    return <PdfLink url="" t={t} />;
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => { setDraft(''); setEditing(true); }}
        className={`text-2xs font-semibold underline underline-offset-2 hover:opacity-100 ${t.muted}`}>
        + Agregar URL
      </button>
    );
  }

  return (
    <div className="flex gap-1.5">
      <div className="flex-1 min-w-0"><TextInput t={t} value={draft} placeholder="https://..." onChange={setDraft} /></div>
      <button type="button" onClick={() => { onChange(draft.trim()); setEditing(false); }}
        className="rounded-md px-2.5 py-1.5 text-xs font-semibold shrink-0" style={{ background: '#4FD1C5', color: '#0F1419' }}>
        Guardar
      </button>
    </div>
  );
}

/** Editor genérico de listas de registros (preventivos, correctivos, etc.) */
function RecordList({ t, records, fields, onAdd, onRemove, onUpdate, renderExtra, readOnly }) {
  const [draft, setDraft] = useState({});
  // Orden de visualización, no de los datos: siempre el registro con fecha más reciente
  // primero (descendente); los que no tienen fecha van al final, sin alterar el arreglo
  // original — `i` conserva el índice real para que onUpdate/onRemove/renderExtra sigan
  // apuntando al registro correcto.
  const dateKey = fields.find(f => f.type === 'date')?.key || 'fecha';
  const sortedRecords = useMemo(() => {
    return records
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const da = a.r[dateKey];
        const db = b.r[dateKey];
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return new Date(db) - new Date(da);
      });
  }, [records, dateKey]);
  return (
    <div>
      {!readOnly && (
        <div className={`rounded-lg border p-2.5 mb-3 ${t.panel3} ${t.border}`}>
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
      <div className="space-y-2 mb-3">
        {records.length === 0 && <div className={`text-xs text-center py-4 ${t.muted}`}>Sin registros todavía</div>}
        {sortedRecords.map(({ r, i }) => (
          <div key={r.id} className={`rounded-lg border p-2.5 ${t.panel3} ${t.border}`}>
            <div className="flex flex-wrap gap-2">
              {fields.map(f => (
                <div key={f.key} className="flex-1 min-w-[120px]">
                  <label className="text-3xs uppercase text-slate-400">{f.label}</label>
                  {f.type === 'select'
                    ? <SelectInput t={t} value={r[f.key]} options={f.options} disabled={readOnly} onChange={v => onUpdate(i, f.key, v)} />
                    : f.type === 'url'
                      ? <RecordUrlField t={t} value={r[f.key]} label={f.label} readOnly={readOnly} onChange={v => onUpdate(i, f.key, v)} />
                      : <TextInput t={t} type={f.type || 'text'} value={r[f.key]} disabled={readOnly} onChange={v => onUpdate(i, f.key, v)} />}
                </div>
              ))}
              {!readOnly && <button onClick={() => onRemove(i)} aria-label="Eliminar registro" className="self-end text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button>}
            </div>
            {renderExtra && <div className="mt-2 pt-2 border-t border-dashed border-slate-700/40">{renderExtra(r, i)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* DRAWER — HOJA DE VIDA                                              */
/* ---------------------------------------------------------------- */

const DRAWER_TABS = ['Información General', 'Cronograma', 'Preventivos', 'Correctivos', 'Calibraciones', 'Instalaciones', 'Baja de Equipo', 'Documentos', 'Historial'];

/* ---------------------------------------------------------------- */
/* DOCUMENTOS DEL EQUIPO — vista de tarjetas                         */
/* ---------------------------------------------------------------- */
// Sigue guardando exactamente lo mismo que antes (un arreglo `equipo.documentos` dentro del
// equipo, escrito con el mismo `onUpdate`/PATCH /api/equipos de siempre — nada nuevo en el
// backend). Cada documento nuevo solo guarda su URL externa (Drive/OneDrive/Dropbox/etc.),
// nunca el archivo, así se evita consumir almacenamiento de la base de datos. Los documentos
// guardados antes de este cambio (con archivo en base64 en `archivoDatos`) se siguen mostrando
// y descargando sin problema — ver abrirDocumento() más abajo — así que no hay migración ni
// pérdida de datos.
const DOCUMENTO_TIPOS = [
  { key: 'Manual', icon: BookOpen, color: '#2F8FD1' },
  { key: 'Reporte de instalación', icon: ClipboardList, color: '#F59E0B' },
  { key: 'INVIMA', icon: ShieldCheck, color: '#8B5CF6' },
  { key: 'Guía de uso rápido', icon: Zap, color: '#22C55E' },
  { key: 'Ficha técnica', icon: FileText, color: '#0EA5E9' },
  { key: 'Otros', icon: Paperclip, color: '#64748B' },
];
const DOCUMENTO_TIPO_POR_DEFECTO = { icon: Paperclip, color: '#64748B' };
function documentoTipoInfo(tipo) {
  return DOCUMENTO_TIPOS.find(d => d.key === tipo) || DOCUMENTO_TIPO_POR_DEFECTO;
}
const DOCUMENTOS_ORDEN = [
  { key: 'recientes', label: 'Más recientes' },
  { key: 'antiguos', label: 'Más antiguos' },
  { key: 'az', label: 'Nombre A-Z' },
  { key: 'za', label: 'Nombre Z-A' },
];
// Los documentos nuevos solo guardan su URL externa (Drive/OneDrive/Dropbox/etc.) — nunca el
// archivo — para no consumir almacenamiento de la base de datos ni del servidor.
function esUrlDocumentoValida(value) {
  try {
    const u = new URL((value || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
// Abre un documento: los nuevos solo tienen `url` (enlace externo) y se abren en una pestaña
// nueva, sin descargar ni copiar nada localmente; los guardados antes de este cambio (con
// archivo en `archivoDatos`, un Data URI) se siguen descargando igual que siempre, para no
// perder acceso a lo que ya estaba guardado.
function abrirDocumento(doc) {
  if (doc.url) {
    window.open(doc.url, '_blank', 'noopener,noreferrer');
  } else if (doc.archivoDatos) {
    const a = document.createElement('a');
    a.href = doc.archivoDatos;
    a.download = doc.archivoNombre || doc.nombre || 'documento';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

// Convierte un Data URI (archivoDatos) a un blob: URL temporal — usado solo para "Ver" en
// una pestaña nueva. Necesario porque los navegadores modernos bloquean la navegación de
// nivel superior directamente a una URL data: (política anti-phishing de Chrome desde 2019),
// pero sí permiten blob: URLs; para "Descargar" no hace falta este paso porque el atributo
// `download` de <a> (como en abrirDocumento(), arriba) ya evita ese bloqueo.
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

function EmptyDocumentsState({ t, accent, readOnly, onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
      <FileText size={28} className={t.muted} />
      <div className="text-xs font-semibold mt-1">No hay documentos</div>
      <p className={`text-2xs max-w-56 ${t.muted}`}>Aún no se han agregado documentos para este equipo.</p>
      {!readOnly && (
        <Button variant="primary" accent={accent} icon={Plus} iconSize={13} className="mt-2" onClick={onAdd}>
          Agregar documento
        </Button>
      )}
    </div>
  );
}

function DocumentCard({ doc, t, readOnly, menuOpen, onToggleMenu, onView, onEdit, onDelete }) {
  const info = documentoTipoInfo(doc.tipo);
  const Icon = info.icon;
  const tieneArchivo = !!(doc.archivoDatos || doc.url);
  const fechaTexto = doc.actualizadoEn
    ? new Date(doc.actualizadoEn).toLocaleDateString('es-CO')
    : (doc.fecha ? new Date(doc.fecha + 'T00:00:00').toLocaleDateString('es-CO') : '');
  const metaTexto = [doc.extension, doc.tamano].filter(Boolean).join(' · ');

  return (
    <div className={`relative rounded-xl border p-3.5 flex flex-col gap-2 shadow-sm ${t.panel} ${t.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: info.color + '1A', color: info.color }}>
          <Icon size={17} />
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
            <button onClick={() => abrirDocumento(doc)} disabled={!tieneArchivo}
              className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed ${t.text}`}>
              <Download size={13} /> Descargar
            </button>
            <button onClick={onDelete} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-red-500 hover:opacity-80">
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        )}
      </div>

      <div><Badge color={info.color}>{doc.tipo || 'Otro'}</Badge></div>

      <div className="min-w-0">
        <div className={`text-xs font-semibold leading-snug ${t.text}`} title={doc.nombre}>{doc.nombre || 'Documento sin nombre'}</div>
        {doc.descripcion && <p className={`text-2xs mt-0.5 leading-snug line-clamp-2 ${t.muted}`}>{doc.descripcion}</p>}
      </div>

      <div className={`text-3xs font-mono mt-auto pt-1 ${t.muted}`}>
        {metaTexto && <div>{metaTexto}</div>}
        {fechaTexto && <div className="mt-0.5">Actualizado: {fechaTexto}</div>}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" t={t} icon={Eye} iconSize={12} disabled={!tieneArchivo} onClick={onView} className="flex-1">Ver</Button>
        <Button variant="outline" size="sm" t={t} icon={Download} iconSize={12} disabled={!tieneArchivo}
          onClick={() => abrirDocumento(doc)} className="flex-1">Descargar</Button>
      </div>
    </div>
  );
}

// "Ver" — vista previa. Un PDF (guardado como Data URI, o una URL externa antigua) se puede
// incrustar en un <iframe> — el navegador lo detecta por su MIME/extensión igual que abre
// cualquier PDF. Otros formatos (DOCX, XLSX) no tienen forma confiable de previsualizarse sin
// un visor externo, así que van directo al estado "no se puede previsualizar" de la especificación.
function DocumentPreviewModal({ doc, onClose, t, accent }) {
  const info = documentoTipoInfo(doc.tipo);
  const Icon = info.icon;
  const fuente = doc.archivoDatos || doc.url || '';
  const tieneArchivo = !!fuente;
  const esPdf = doc.archivoDatos
    ? doc.archivoDatos.startsWith('data:application/pdf')
    : (doc.extension || '').toUpperCase() === 'PDF' || /\.pdf(\?|#|$)/i.test(doc.url || '');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`animate-modal-in relative w-full max-w-2xl h-[85vh] flex flex-col rounded-xl border overflow-hidden ${t.panel} ${t.border}`}>
        <div className="flex items-start justify-between gap-3 p-4 border-b shrink-0" style={{ borderColor: 'inherit' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: info.color + '1A', color: info.color }}>
              <Icon size={17} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">{doc.nombre}</div>
              <div className={`text-2xs ${t.muted}`}>{[doc.tipo, doc.extension, doc.tamano].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className={`w-9 h-9 flex items-center justify-center shrink-0 -mr-1 -mt-1 rounded-md ${t.muted} hover:opacity-70`}><X size={18} /></button>
        </div>

        <div className={`flex-1 min-h-0 ${t.panel3}`}>
          {tieneArchivo && esPdf ? (
            <iframe src={fuente} title={doc.nombre} className="w-full h-full border-0" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <FileText size={32} className={t.muted} />
              <p className={`text-xs ${t.muted}`}>Este archivo no puede previsualizarse.</p>
              {tieneArchivo && (
                <Button variant="primary" accent={accent} icon={Download} iconSize={13} onClick={() => abrirDocumento(doc)}>
                  Descargar documento
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t shrink-0" style={{ borderColor: 'inherit' }}>
          <Button variant="outline" t={t} onClick={onClose}>Cerrar</Button>
          <Button variant="primary" accent={accent} icon={Download} iconSize={13} disabled={!tieneArchivo} onClick={() => abrirDocumento(doc)}>
            Descargar
          </Button>
        </div>
      </div>
    </div>
  );
}

// Un mismo formulario para crear y editar (`mode`), tal como pide la especificación — evita
// duplicar el modal.
function DocumentFormModal({ mode, initial, onClose, onSave, t, accent }) {
  const [tipo, setTipo] = useState(initial?.tipo || DOCUMENTO_TIPOS[0].key);
  const [nombre, setNombre] = useState(initial?.nombre || '');
  const [descripcion, setDescripcion] = useState(initial?.descripcion || '');
  // Solo se guarda la URL externa del documento (Drive/OneDrive/Dropbox/etc.) — nunca el
  // archivo. Al editar un documento antiguo que sí tenía archivo (`archivoDatos`), ese campo
  // no se toca aquí: `guardarDocumento` solo sobreescribe lo que este formulario envía, así
  // que el archivo ya guardado no se pierde por editar el nombre o la URL.
  const [url, setUrl] = useState(initial?.url || '');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!tipo) { setError('Selecciona el tipo de documento.'); return; }
    if (!nombre.trim()) { setError('Escribe un nombre para el documento.'); return; }
    if (!url.trim()) { setError('Ingresa el enlace externo del documento.'); return; }
    if (!esUrlDocumentoValida(url)) { setError('El enlace no es una URL válida. Debe comenzar con https:// o http://.'); return; }
    setError('');
    onSave({ tipo, nombre: nombre.trim(), descripcion: descripcion.trim(), url: url.trim() });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <form onSubmit={submit} className={`animate-modal-in relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-xl border p-5 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-start mb-1">
          <div>
            <div className="text-sm font-bold">{mode === 'edit' ? 'Editar documento' : 'Agregar documento'}</div>
            <p className={`text-2xs mt-0.5 ${t.muted}`}>Agrega un documento asociado a este equipo.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className={`w-9 h-9 -mr-1 -mt-1 flex items-center justify-center shrink-0 rounded-md ${t.muted} hover:opacity-70`}><X size={18} /></button>
        </div>

        <div className="space-y-3 mt-4">
          <Field label="Tipo de documento">
            <SelectInput t={t} value={tipo} options={DOCUMENTO_TIPOS.map(d => d.key)} onChange={setTipo} />
          </Field>
          <Field label="Nombre del documento">
            <TextInput t={t} value={nombre} placeholder="Ej. Manual de operación del equipo" onChange={setNombre} />
          </Field>
          <Field label="Descripción (opcional)">
            <textarea rows={2} value={descripcion} onChange={e => setDescripcion(e.target.value)}
              placeholder="Descripción breve del documento" className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input}`} />
          </Field>

          <Field label="Enlace del documento (URL externa)">
            <TextInput t={t} value={url} placeholder="https://drive.google.com/..." onChange={setUrl} />
            <p className={`text-3xs mt-1 ${t.muted}`}>Pega el enlace externo (Drive, OneDrive, Dropbox, etc.). El archivo no se sube a la aplicación.</p>
          </Field>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="outline" t={t} onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" accent={accent}>Guardar documento</Button>
        </div>
      </form>
    </div>
  );
}

function DeleteDocumentDialog({ nombre, onCancel, onConfirm, t }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className={`animate-modal-in relative w-full max-w-xs rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="text-sm font-bold mb-1">¿Eliminar documento?</div>
        <p className={`text-2xs mb-4 ${t.muted}`}>
          {nombre ? `"${nombre}" se ` : 'Se '}eliminará del equipo. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" t={t} onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm}>Eliminar</Button>
        </div>
      </div>
    </div>
  );
}

// Pestaña "Documentos" del equipo — mismo `onUpdate` de siempre (optimista, vía
// EquipoDrawer → MainApp → PATCH /api/equipos), ahora presentado como cuadrícula de tarjetas
// en vez de la lista genérica RecordList (que otras pestañas del drawer siguen usando sin
// cambios: Preventivos, Correctivos, Calibraciones, Instalaciones, Baja de Equipo).
//
// La cuadrícula usa `auto-fill`/`minmax` en vez de columnas fijas por breakpoint (lg:grid-cols-4,
// etc.): esta pestaña vive dentro del drawer, que mide como máximo 640px de ancho (no el ancho
// de la pantalla) — forzar 3-4 columnas ahí produciría tarjetas ilegibles de ~140px. auto-fill
// ya da 1 columna en el drawer angosto de un celular y 2 en su ancho fijo de escritorio, que es
// el máximo que ese contenedor puede ofrecer con tarjetas legibles.
//
// Sin skeleton/estado de error de carga: los documentos llegan como parte del `equipo` que ya
// está en memoria antes de que el drawer exista (todo el inventario se carga una sola vez al
// abrir la app) — no hay una petición de red propia de esta pestaña que loguee/falle, así que
// un loader o un botón "Reintentar" aquí no tendría nada real que mostrar u reintentar.
function DocumentosTab({ equipo, onUpdate, readOnly, t, accent }) {
  const documentos = equipo.documentos || [];
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [orden, setOrden] = useState('recientes');
  const [openPanel, setOpenPanel] = useState(null); // null | 'filtro' | 'orden' | <docId>
  const [formAbierto, setFormAbierto] = useState(null); // null | { mode: 'create' } | { mode: 'edit', doc }
  const [preview, setPreview] = useState(null);
  const [porEliminar, setPorEliminar] = useState(null);

  const guardarDocumento = (datos, id) => {
    const list = id
      ? documentos.map(d => d.id === id ? { ...d, ...datos, actualizadoEn: new Date().toISOString() } : d)
      : [...documentos, { id: uid('doc'), ...datos, actualizadoEn: new Date().toISOString() }];
    onUpdate({ ...equipo, documentos: list });
  };
  const eliminarDocumento = (id) => onUpdate({ ...equipo, documentos: documentos.filter(d => d.id !== id) });

  const filtrados = useMemo(() => {
    let list = equipo.documentos || [];
    if (filtroTipo !== 'Todos') list = list.filter(d => d.tipo === filtroTipo);
    const q = busqueda.trim().toLowerCase();
    if (q) list = list.filter(d => [d.nombre, d.descripcion, d.tipo].filter(Boolean).join(' ').toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (orden === 'az') return (a.nombre || '').localeCompare(b.nombre || '');
      if (orden === 'za') return (b.nombre || '').localeCompare(a.nombre || '');
      const fa = a.actualizadoEn || a.fecha || '';
      const fb = b.actualizadoEn || b.fecha || '';
      return orden === 'antiguos' ? fa.localeCompare(fb) : fb.localeCompare(fa);
    });
  }, [equipo.documentos, filtroTipo, busqueda, orden]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div>
          <h2 className="text-sm font-bold">Documentos</h2>
          <p className={`text-2xs mt-0.5 ${t.muted}`}>Gestiona la documentación técnica asociada a este equipo.</p>
        </div>
        {!readOnly && (
          <Button variant="primary" accent={accent} icon={Plus} iconSize={13} onClick={() => setFormAbierto({ mode: 'create' })}>
            Agregar documento
          </Button>
        )}
      </div>

      {documentos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-4 mb-3">
          <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border flex-1 min-w-40 ${t.border} ${t.panel3}`}>
            <Search size={13} className={t.muted} />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar documentos…"
              aria-label="Buscar documentos" className={`bg-transparent text-xs w-full outline-none ${t.text}`} />
          </div>

          <div className="relative">
            <button onClick={() => setOpenPanel(p => p === 'filtro' ? null : 'filtro')} aria-haspopup="true" aria-expanded={openPanel === 'filtro'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs border shrink-0 ${t.border} ${filtroTipo === 'Todos' ? t.muted : 'font-semibold'}`}
              style={filtroTipo !== 'Todos' ? { color: accent, borderColor: accent } : {}}>
              <Filter size={13} /> Filtrar
            </button>
            {openPanel === 'filtro' && (
              <div className={`absolute right-0 top-full mt-1 z-[56] w-48 max-h-64 overflow-y-auto rounded-lg border shadow-lg py-1 ${t.panel} ${t.border}`}>
                {['Todos', ...DOCUMENTO_TIPOS.map(d => d.key)].map(op => (
                  <button key={op} onClick={() => { setFiltroTipo(op); setOpenPanel(null); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:opacity-80 ${op === filtroTipo ? 'font-semibold' : t.text}`}
                    style={op === filtroTipo ? { color: accent } : {}}>
                    {op}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => setOpenPanel(p => p === 'orden' ? null : 'orden')} aria-haspopup="true" aria-expanded={openPanel === 'orden'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs border shrink-0 ${t.border} ${t.muted}`}>
              <ArrowUpDown size={13} /> {DOCUMENTOS_ORDEN.find(o => o.key === orden)?.label}
            </button>
            {openPanel === 'orden' && (
              <div className={`absolute right-0 top-full mt-1 z-[56] w-40 rounded-lg border shadow-lg py-1 ${t.panel} ${t.border}`}>
                {DOCUMENTOS_ORDEN.map(op => (
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

      {documentos.length === 0 ? (
        <EmptyDocumentsState t={t} accent={accent} readOnly={readOnly} onAdd={() => setFormAbierto({ mode: 'create' })} />
      ) : filtrados.length === 0 ? (
        <div className={`text-center py-8 ${t.muted}`}>
          <div className="text-xs font-semibold mb-1">No encontramos documentos</div>
          <p className="text-2xs">Prueba con otro nombre o cambia los filtros.</p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
          {filtrados.map(doc => (
            <DocumentCard key={doc.id} doc={doc} t={t} readOnly={readOnly}
              menuOpen={openPanel === doc.id} onToggleMenu={() => setOpenPanel(p => p === doc.id ? null : doc.id)}
              onView={() => { setOpenPanel(null); setPreview(doc); }}
              onEdit={() => { setOpenPanel(null); setFormAbierto({ mode: 'edit', doc }); }}
              onDelete={() => { setOpenPanel(null); setPorEliminar(doc); }} />
          ))}
        </div>
      )}

      {openPanel && <div className="fixed inset-0 z-[55]" onClick={() => setOpenPanel(null)} />}

      {formAbierto && (
        <DocumentFormModal mode={formAbierto.mode} initial={formAbierto.doc} t={t} accent={accent}
          onClose={() => setFormAbierto(null)}
          onSave={(datos) => { guardarDocumento(datos, formAbierto.doc?.id); setFormAbierto(null); }} />
      )}
      {preview && <DocumentPreviewModal doc={preview} t={t} accent={accent} onClose={() => setPreview(null)} />}
      {porEliminar && (
        <DeleteDocumentDialog t={t} nombre={porEliminar.nombre}
          onCancel={() => setPorEliminar(null)}
          onConfirm={() => { eliminarDocumento(porEliminar.id); setPorEliminar(null); }} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* CALIBRACIONES DEL EQUIPO — vista de tarjetas, misma estética que Documentos */
/* ---------------------------------------------------------------- */
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

// Pestaña "Calibraciones" del equipo — misma cuadrícula de tarjetas que DocumentosTab
// (mismo `onUpdate` de siempre), en vez de la lista inline (RecordList) que usan las
// demás pestañas (Preventivos, Correctivos, Instalaciones, Baja de Equipo).
function CalibracionesTab({ equipo, onUpdate, readOnly, t, accent, c }) {
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

// Opciones del selector de sede de la hoja de vida: siempre incluye la sede ACTUAL del equipo
// (aunque no esté en la lista de la empresa) — sin esto el <select> mostraría otra sede que
// no es la del equipo, y cualquier clic podía cambiarla sin querer.
function opcionesSede(sedes, actual) {
  if (!actual || sedes.some(s => normSede(s) === normSede(actual))) return sedes;
  return [actual, ...sedes];
}

function EquipoDrawer({ equipo, onClose, onUpdate, t, readOnly }) {
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
/* LANDING PAGE — puerta de entrada pública, antes del login             */
/* ---------------------------------------------------------------- */
// Estética tecnológica/médica premium (glassmorphism + red neuronal animada +
// glow azul/cian) — dirección confirmada explícitamente por el usuario tras
// revisar el sitio de referencia, en reemplazo del rediseño editorial sobrio
// de la iteración anterior. El video del héroe (public/media/hero-equipo-
// biomedico.mp4) es un graphic motion 3D generado con HyperFrames (Three.js:
// monitor de signos vitales estilizado, cámara orbital, partículas, bloom).
const LANDING_STYLES = `
  @keyframes landing-fade-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes landing-glow-pulse { 0%, 100% { opacity: 0.45; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.05); } }
  @keyframes landing-core-ring { 0% { transform: scale(0.85); opacity: 0.7; } 100% { transform: scale(1.6); opacity: 0; } }
  @keyframes landing-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  .landing-reveal { animation: landing-fade-up .7s cubic-bezier(0.16,1,0.3,1) both; }
  .landing-glow { animation: landing-glow-pulse 4.5s ease-in-out infinite; }
  .landing-ring { animation: landing-core-ring 3.6s ease-out infinite; }
  .landing-float { animation: landing-float 5.5s ease-in-out infinite; }
  .landing-btn { transition: transform 200ms cubic-bezier(0.16,1,0.3,1), box-shadow 200ms cubic-bezier(0.16,1,0.3,1), filter 200ms ease; }
  .landing-btn:hover { transform: translateY(-2px); filter: brightness(1.06); }
  .landing-btn:active { transform: translateY(0) scale(0.98); }
  .landing-btn-primary { background: #3B9FD6; box-shadow: 0 16px 32px -14px rgba(59,159,214,0.55); }
  .landing-btn-primary:hover { box-shadow: 0 22px 40px -14px rgba(59,159,214,0.65); }
  .landing-btn-outline-dark { border: 1.5px solid rgba(255,255,255,0.28); color: #FFFFFF; background: rgba(255,255,255,0.05); backdrop-filter: blur(6px); }
  .landing-btn-outline-dark:hover { border-color: rgba(125,211,252,0.6); background: rgba(125,211,252,0.1); }
  .landing-link { position: relative; transition: color 180ms ease; }
  .landing-link::after {
    content: ''; position: absolute; left: 0; right: 100%; bottom: -3px; height: 1px;
    background: currentColor; transition: right 220ms cubic-bezier(0.16,1,0.3,1);
  }
  .landing-link:hover::after { right: 0; }
  /* Glass — oscuro (héroe, CTA final) y claro (secciones sobre fondo pastel). */
  .landing-glass-dark {
    background: rgba(255,255,255,0.06);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 24px 60px -24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08);
  }
  .landing-glass-light {
    background: rgba(255,255,255,0.72);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255,255,255,0.9);
    box-shadow: 0 20px 45px -26px rgba(15,58,90,0.28), inset 0 1px 0 rgba(255,255,255,0.6);
    transition: transform 260ms cubic-bezier(0.16,1,0.3,1), box-shadow 260ms cubic-bezier(0.16,1,0.3,1), border-color 260ms ease;
  }
  .landing-glass-light:hover { transform: translateY(-4px); box-shadow: 0 28px 56px -24px rgba(15,58,90,0.34); border-color: rgba(125,211,252,0.7); }
  .landing-chip {
    transition: transform 200ms cubic-bezier(0.16,1,0.3,1), box-shadow 200ms ease, border-color 200ms ease;
  }
  .landing-chip:hover { transform: translateY(-3px); box-shadow: 0 16px 32px -16px rgba(15,58,90,0.3); border-color: rgba(59,159,214,0.5); }
  .landing-dotgrid-dark { background-image: radial-gradient(#ffffff16 1px, transparent 1px); background-size: 30px 30px; }
  .landing-dotgrid-light { background-image: radial-gradient(#17417a1a 1px, transparent 1px); background-size: 26px 26px; }
  /* Aparición al hacer scroll (la clase is-visible la pone useLandingInView). */
  .landing-inview { opacity: 0; transform: translateY(18px); transition: opacity .7s cubic-bezier(0.16,1,0.3,1), transform .7s cubic-bezier(0.16,1,0.3,1); }
  .landing-inview.is-visible { opacity: 1; transform: none; }
  .landing-inview.landing-glass-light.is-visible:hover { transform: translateY(-4px); transition-delay: 0ms !important; }
  /* Líneas del ecosistema: flujo continuo desde el núcleo hacia cada área. */
  @keyframes landing-dash { to { stroke-dashoffset: -20; } }
  .landing-flow { stroke-dasharray: 5 7; animation: landing-dash 1.4s linear infinite; }
  /* Las anclas no quedan tapadas por el encabezado fijo. */
  .landing-anchor { scroll-margin-top: 64px; }
  html:has(.landing-anchor) { scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) {
    .landing-reveal, .landing-glow, .landing-ring, .landing-float, .landing-flow { animation: none; }
    .landing-btn, .landing-link::after, .landing-glass-light, .landing-inview { transition: none; }
    .landing-inview { opacity: 1; transform: none; }
    html:has(.landing-anchor) { scroll-behavior: auto; }
  }
`;

/* ---------------------------------------------------------------- */
/* RED NEURONAL DE FONDO — nodos/aristas calculados una sola vez por         */
/* sección/redimensión; solo los pulsos que viajan por las conexiones se     */
/* animan, a ~30fps (nunca a la cadencia completa de rAF), para mantener el  */
/* costo de CPU/GPU bajo incluso en móviles.                                 */
/* ---------------------------------------------------------------- */
const CONFIG_DENSIDAD_RED = {
  alta: { desktop: 42, movil: 16, pulsosMax: 6 },
  media: { desktop: 28, movil: 12, pulsosMax: 3 },
  baja: { desktop: 18, movil: 9, pulsosMax: 2 },
};

const PALETA_RED = {
  oscuro: {
    linea: 'rgba(103, 216, 245, 0.28)',
    nodo: 'rgba(191, 233, 255, 0.8)',
    nodoGlow: 'rgba(103, 216, 245, 0.6)',
    pulsos: ['#7dd3fc', '#22d3ee', '#2dd4bf', '#22d3ee', '#7dd3fc'],
  },
  claro: {
    linea: 'rgba(59, 159, 214, 0.22)',
    nodo: 'rgba(59, 159, 214, 0.45)',
    nodoGlow: 'rgba(45, 212, 191, 0.5)',
    pulsos: ['#3B9FD6', '#22d3ee', '#2dd4bf'],
  },
};

function generarRedNeuronal(ancho, alto, cantidadNodos) {
  const nodos = [];
  const columnas = Math.max(1, Math.round(Math.sqrt((cantidadNodos * ancho) / alto)));
  const filas = Math.max(1, Math.ceil(cantidadNodos / columnas));
  const anchoCelda = ancho / columnas;
  const altoCelda = alto / filas;

  for (let f = 0; f < filas && nodos.length < cantidadNodos; f += 1) {
    for (let c = 0; c < columnas && nodos.length < cantidadNodos; c += 1) {
      nodos.push({
        x0: c * anchoCelda + anchoCelda / 2 + (Math.random() - 0.5) * anchoCelda * 0.7,
        y0: f * altoCelda + altoCelda / 2 + (Math.random() - 0.5) * altoCelda * 0.7,
        fase: Math.random() * Math.PI * 2,
      });
    }
  }

  const aristas = [];
  const vistas = new Set();
  nodos.forEach((nodo, indice) => {
    const vecinos = nodos
      .map((otro, otroIndice) => ({ otroIndice, dist: Math.hypot(otro.x0 - nodo.x0, otro.y0 - nodo.y0) }))
      .filter((v) => v.otroIndice !== indice)
      .sort((v1, v2) => v1.dist - v2.dist)
      .slice(0, 2 + Math.round(Math.random()));

    vecinos.forEach(({ otroIndice }) => {
      const clave = indice < otroIndice ? `${indice}-${otroIndice}` : `${otroIndice}-${indice}`;
      if (!vistas.has(clave)) {
        vistas.add(clave);
        aristas.push({ a: indice, b: otroIndice });
      }
    });
  });

  return { nodos, aristas };
}

function useRedNeuronal(canvasRef, tema, densidad) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const contenedor = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !contenedor || !ctx) return undefined;

    const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const esMovil = window.matchMedia('(max-width: 640px)').matches;
    const config = CONFIG_DENSIDAD_RED[densidad];
    const paleta = PALETA_RED[tema];
    const cantidadNodos = esMovil ? config.movil : config.desktop;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let nodos = [];
    let aristas = [];
    let pulsos = [];
    let activacion = [];
    let ancho = 0;
    let alto = 0;

    function posActual(nodo, tiempo) {
      if (movimientoReducido) return { x: nodo.x0, y: nodo.y0 };
      return {
        x: nodo.x0 + Math.sin(tiempo * 0.00012 + nodo.fase) * 5,
        y: nodo.y0 + Math.cos(tiempo * 0.00016 + nodo.fase) * 5,
      };
    }

    function dimensionar() {
      const rect = contenedor.getBoundingClientRect();
      ancho = Math.max(1, rect.width);
      alto = Math.max(1, rect.height);
      canvas.width = Math.round(ancho * dpr);
      canvas.height = Math.round(alto * dpr);
      canvas.style.width = `${ancho}px`;
      canvas.style.height = `${alto}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const generado = generarRedNeuronal(ancho, alto, cantidadNodos);
      nodos = generado.nodos;
      aristas = generado.aristas;
      activacion = new Array(nodos.length).fill(-Infinity);
      pulsos = [];
    }

    dimensionar();

    function dibujarBase(tiempo) {
      ctx.clearRect(0, 0, ancho, alto);
      ctx.strokeStyle = paleta.linea;
      ctx.lineWidth = 1;
      aristas.forEach(({ a, b }) => {
        const pa = posActual(nodos[a], tiempo);
        const pb = posActual(nodos[b], tiempo);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      });
      ctx.fillStyle = paleta.nodo;
      nodos.forEach((nodo) => {
        const p = posActual(nodo, tiempo);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (movimientoReducido) {
      dibujarBase(0);
      const alRedimensionar = () => { dimensionar(); dibujarBase(0); };
      window.addEventListener('resize', alRedimensionar);
      return () => window.removeEventListener('resize', alRedimensionar);
    }

    let enViewport = true;
    const observador = new IntersectionObserver(([entrada]) => { enViewport = Boolean(entrada?.isIntersecting); });
    observador.observe(contenedor);

    let frameId = 0;
    let ultimoDibujo = 0;
    let ultimoSpawn = 0;
    const INTERVALO_MS = 1000 / 30;

    function cuadro(tiempo) {
      frameId = requestAnimationFrame(cuadro);
      if (!enViewport || tiempo - ultimoDibujo < INTERVALO_MS) return;
      ultimoDibujo = tiempo;

      if (aristas.length > 0 && pulsos.length < config.pulsosMax && tiempo - ultimoSpawn > 650 + Math.random() * 900) {
        ultimoSpawn = tiempo;
        pulsos.push({
          arista: Math.floor(Math.random() * aristas.length),
          t: 0,
          velocidad: 0.00028 + Math.random() * 0.00026,
          color: paleta.pulsos[Math.floor(Math.random() * paleta.pulsos.length)],
        });
      }

      pulsos = pulsos.filter((pulso) => {
        pulso.t += pulso.velocidad * INTERVALO_MS;
        if (pulso.t >= 1) {
          activacion[aristas[pulso.arista].b] = tiempo;
          return false;
        }
        return true;
      });

      dibujarBase(tiempo);

      pulsos.forEach((pulso) => {
        const arista = aristas[pulso.arista];
        const pa = posActual(nodos[arista.a], tiempo);
        const pb = posActual(nodos[arista.b], tiempo);
        const x = pa.x + (pb.x - pa.x) * pulso.t;
        const y = pa.y + (pb.y - pa.y) * pulso.t;
        ctx.beginPath();
        ctx.fillStyle = pulso.color;
        ctx.shadowColor = pulso.color;
        ctx.shadowBlur = 8;
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      nodos.forEach((nodo, indice) => {
        const edad = tiempo - activacion[indice];
        if (edad < 500) {
          const intensidad = 1 - edad / 500;
          const p = posActual(nodo, tiempo);
          ctx.globalAlpha = intensidad;
          ctx.fillStyle = paleta.nodoGlow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2 + 4 * intensidad, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      });
    }

    frameId = requestAnimationFrame(cuadro);

    let temporizadorResize;
    const alRedimensionar = () => {
      clearTimeout(temporizadorResize);
      temporizadorResize = setTimeout(dimensionar, 250);
    };
    window.addEventListener('resize', alRedimensionar);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(temporizadorResize);
      window.removeEventListener('resize', alRedimensionar);
      observador.disconnect();
    };
  }, [canvasRef, tema, densidad]);
}

function RedNeuronalFondo({ tema, densidad = 'media' }) {
  const canvasRef = useRef(null);
  useRedNeuronal(canvasRef, tema, densidad);
  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" />;
}

// Núcleo digital — el "cerebro" abstracto del que salen las capacidades de la
// sección de beneficios (nunca un cerebro literal): un nodo central con
// anillos expansivos, CSS puro, respeta prefers-reduced-motion.
function NucleoDigital() {
  return (
    <div className="relative mx-auto mb-3 flex h-20 w-20 items-center justify-center" aria-hidden="true">
      <span className="landing-ring absolute inset-0 rounded-full border" style={{ borderColor: 'rgba(59,159,214,0.45)' }} />
      <span className="landing-ring absolute inset-0 rounded-full border" style={{ borderColor: 'rgba(63,145,66,0.35)', animationDelay: '1.2s' }} />
      <div className="relative flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'linear-gradient(135deg, #3B9FD6 0%, #1f6f5c 55%, #3F9142 100%)', boxShadow: '0 0 28px -4px rgba(59,159,214,0.65)' }}>
        <Settings size={20} className="text-white" />
      </div>
    </div>
  );
}

// Flujo de información del módulo Biomédica (funcionalidades reales en operación).
const LANDING_FLUJO = [
  { icon: ListTree, label: 'Inventario' },
  { icon: ClipboardList, label: 'Hoja de Vida' },
  { icon: Wrench, label: 'Mantenimiento' },
  { icon: ShieldCheck, label: 'Calibración' },
  { icon: FileText, label: 'Documentación' },
  { icon: BellRing, label: 'Alertas' },
  { icon: FileBarChart, label: 'Reportes' },
];



const LANDING_PASOS = [
  { numero: '01', icon: Share2, titulo: 'Centraliza', texto: 'Todos los procesos y áreas pueden gestionarse desde una misma plataforma.' },
  { numero: '02', icon: FolderOpen, titulo: 'Organiza', texto: 'Cada área puede contar con sus propios módulos, procesos, usuarios y permisos.' },
  { numero: '03', icon: Activity, titulo: 'Controla', texto: 'Obtén trazabilidad, indicadores y seguimiento de las actividades de la organización.' },
];

const LANDING_EVOLUCION = [
  { titulo: 'Biomédica', estado: 'En operación', color: '#16A34A', texto: 'Solución especializada: inventario, mantenimientos, calibraciones, hojas de vida y reportes de equipos biomédicos.' },
  { titulo: 'Multiárea', estado: 'En desarrollo', color: '#D97706', texto: 'Gestión Humana, SST y Calidad se incorporan sobre el mismo núcleo de usuarios, empresas y permisos.' },
  { titulo: 'Plataforma corporativa', estado: 'Visión', color: '#64748B', texto: 'Todas las áreas conectadas, con información e indicadores centralizados para la toma de decisiones.' },
];

const LANDING_BENEFICIOS = [
  { icon: LayoutGrid, titulo: 'Centralización', texto: 'Un solo punto de acceso para múltiples procesos.' },
  { icon: Activity, titulo: 'Trazabilidad', texto: 'Seguimiento de actividades, responsables y estados.' },
  { icon: Database, titulo: 'Información', texto: 'Información organizada y disponible para cada área.' },
  { icon: ShieldCheck, titulo: 'Seguridad', texto: 'Control de usuarios, roles y permisos.' },
  { icon: Layers, titulo: 'Escalabilidad', texto: 'Agregar nuevas áreas sin construir sistemas independientes.' },
  { icon: FileBarChart, titulo: 'Indicadores', texto: 'Información preparada para análisis y toma de decisiones.' },
];


// Colores de los estados sobre fondo oscuro (el verde/ámbar/gris de ESTADOS_MODULO se
// aclaran para mantener el contraste sobre las bandas oscuras de la página).
const LANDING_ESTADO_OSCURO = { ACTIVO: '#4ADE80', EN_DESARROLLO: '#FBBF24', PROXIMAMENTE: '#CBD5E1' };

function LandingEstado({ estado, oscuro }) {
  const e = ESTADOS_MODULO[estado] || ESTADOS_MODULO.PROXIMAMENTE;
  const color = oscuro ? LANDING_ESTADO_OSCURO[estado] || '#CBD5E1' : e.color;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-3xs font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ color, background: color + (oscuro ? '1F' : '14'), border: `1px solid ${color}${oscuro ? '55' : '40'}` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {e.label}
    </span>
  );
}

function LandingEncabezado({ etiqueta, titulo, texto, oscuro }) {
  return (
    <div className="landing-inview text-center max-w-3xl mx-auto">
      <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full"
        style={oscuro ? { background: 'rgba(255,255,255,0.08)', color: '#7dd3fc', border: '1px solid rgba(255,255,255,0.14)' } : { background: '#DCEEFA', color: '#1D6FA5' }}>
        {etiqueta}
      </span>
      <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: oscuro ? '#FFFFFF' : '#0F172A' }}>{titulo}</h2>
      {texto && <p className="mt-3 text-sm sm:text-base leading-relaxed" style={{ color: oscuro ? 'rgba(255,255,255,0.72)' : '#5B6B7C' }}>{texto}</p>}
    </div>
  );
}

// Ecosistema de la plataforma: un núcleo común y las áreas conectadas a él. En escritorio
// es un diagrama radial (líneas SVG animadas desde el núcleo); en móvil/tablet, el núcleo
// arriba y las áreas en grilla debajo.
const ECOSISTEMA_POSICIONES = [
  { x: 15, y: 20 }, { x: 85, y: 20 }, { x: 88, y: 74 }, { x: 12, y: 74 }, { x: 50, y: 90 },
];
const ECOSISTEMA_CENTRO = { x: 50, y: 44 };

function EcosistemaNodo({ rama }) {
  const Icon = rama.icon;
  return (
    <div className="landing-glass-light rounded-2xl p-4 w-full" style={{ borderColor: rama.color + '40' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: rama.color + '1A', color: rama.color }}>
            <Icon size={16} />
          </span>
          <span className="text-sm font-bold truncate" style={{ color: '#0F172A' }}>{rama.nombre}</span>
        </div>
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: ESTADOS_MODULO[rama.estado]?.color }} title={ESTADOS_MODULO[rama.estado]?.label} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {rama.procesos.map(p => (
          <span key={p} className="text-3xs font-medium px-2 py-1 rounded-md" style={{ background: '#F1F6FA', color: '#475569' }}>{p}</span>
        ))}
        {rama.mas && <span className="text-3xs font-medium px-2 py-1 rounded-md" style={{ background: '#F1F6FA', color: '#475569' }}>…</span>}
      </div>
    </div>
  );
}

function EcosistemaNucleo() {
  return (
    <div className="relative flex flex-col items-center text-center">
      <div className="relative flex h-28 w-28 items-center justify-center" aria-hidden="true">
        <span className="landing-ring absolute inset-0 rounded-full border-2" style={{ borderColor: 'rgba(59,159,214,0.45)' }} />
        <span className="landing-ring absolute inset-0 rounded-full border-2" style={{ borderColor: 'rgba(63,145,66,0.35)', animationDelay: '1.2s' }} />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'linear-gradient(135deg, #3B9FD6 0%, #1f6f5c 55%, #3F9142 100%)', boxShadow: '0 0 40px -6px rgba(59,159,214,0.7)' }}>
          <Layers size={32} className="text-white" />
        </div>
      </div>
      <div className="mt-3 rounded-xl px-4 py-2.5 border" style={{ background: '#F5FAFD', borderColor: 'rgba(59,159,214,0.25)' }}>
        <div className="text-sm font-bold uppercase tracking-wide" style={{ color: '#0F172A' }}>Plataforma integral</div>
        <div className="mt-1 text-2xs max-w-[15rem]" style={{ color: '#5B6B7C' }}>Núcleo común: usuarios · empresas · roles · permisos · seguridad</div>
      </div>
    </div>
  );
}

function EcosistemaPlataforma() {
  return (
    <>
      {/* Escritorio: diagrama radial */}
      <div className="landing-inview relative hidden lg:block mt-12" style={{ height: 600 }}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {ECOSISTEMA_POSICIONES.map((p, i) => (
            <line key={i} x1={ECOSISTEMA_CENTRO.x} y1={ECOSISTEMA_CENTRO.y} x2={p.x} y2={p.y}
              className="landing-flow" stroke={LANDING_ECOSISTEMA[i].color} strokeOpacity="0.55" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${ECOSISTEMA_CENTRO.x}%`, top: `${ECOSISTEMA_CENTRO.y}%` }}>
          <EcosistemaNucleo />
        </div>
        {LANDING_ECOSISTEMA.map((rama, i) => (
          <div key={rama.key} className="absolute -translate-x-1/2 -translate-y-1/2 w-60"
            style={{ left: `${ECOSISTEMA_POSICIONES[i].x}%`, top: `${ECOSISTEMA_POSICIONES[i].y}%` }}>
            <EcosistemaNodo rama={rama} />
          </div>
        ))}
      </div>
      {/* Móvil / tablet: núcleo arriba, áreas en grilla */}
      <div className="landing-inview lg:hidden mt-10">
        <EcosistemaNucleo />
        <div className="mx-auto my-5" style={{ width: 1, height: 28, borderLeft: '1.5px dashed rgba(59,159,214,0.5)' }} aria-hidden="true" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {LANDING_ECOSISTEMA.map(rama => <EcosistemaNodo key={rama.key} rama={rama} />)}
        </div>
      </div>
    </>
  );
}

// Revela las secciones al entrar en pantalla (una sola vez). Sin IntersectionObserver
// (navegadores muy viejos) o con movimiento reducido, todo queda visible de inmediato.
function useLandingInView() {
  useEffect(() => {
    const elementos = Array.from(document.querySelectorAll('.landing-inview'));
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducido || typeof IntersectionObserver === 'undefined') {
      elementos.forEach(el => el.classList.add('is-visible'));
      return undefined;
    }
    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('is-visible');
          observador.unobserve(entrada.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    elementos.forEach(el => observador.observe(el));
    return () => observador.disconnect();
  }, []);
}

function LandingPage({ onIniciarSesion, onReportarFalla, onIngresarModulo }) {
  useLandingInView();
  return (
    <div className="min-h-dvh" style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: '#EAF4FB' }}>
      <style>{LANDING_STYLES}</style>

      <header className="sticky top-0 z-30 backdrop-blur border-b" style={{ background: 'rgba(234,244,251,0.88)', borderColor: 'rgba(59,159,214,0.15)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <a href="#modulos" className="flex items-center gap-2.5 min-w-0">
            <img src={logoIngenieriaClinica} alt="" width={30} height={30} className="shrink-0" style={{ objectFit: 'contain' }} />
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-bold truncate" style={{ color: '#0F172A' }}>Plataforma Integral</span>
              <span className="block text-3xs font-semibold uppercase tracking-widest truncate" style={{ color: '#1D6FA5' }}>de Gestión</span>
            </span>
          </a>
          <nav className="hidden lg:flex items-center gap-7" aria-label="Secciones">
            <a href="#modulos" className="landing-link text-xs font-medium" style={{ color: '#334155' }}>Módulos</a>
            <a href="#como-funciona" className="landing-link text-xs font-medium" style={{ color: '#334155' }}>Cómo funciona</a>
            <a href="#ecosistema" className="landing-link text-xs font-medium" style={{ color: '#334155' }}>Plataforma</a>
            <a href="#evolucion" className="landing-link text-xs font-medium" style={{ color: '#334155' }}>Evolución</a>
            <a href="#beneficios" className="landing-link text-xs font-medium" style={{ color: '#334155' }}>Beneficios</a>
          </nav>
        </div>
      </header>

      {/* 2. MÓDULOS DE LA ORGANIZACIÓN — la MISMA interfaz del portal interno (bienvenida y
          tarjetas de módulos), ahora antes del login: cada botón lleva a iniciar sesión y, al
          entrar, directo a ese módulo (Biomédica, Gestión Humana…). */}
      <section id="modulos" className="landing-anchor relative overflow-hidden py-16 sm:py-20" style={{ background: 'linear-gradient(160deg, #F8FAFC 0%, #EEF4F9 55%, #F8FAFC 100%)' }}>
        <div className="relative px-4 sm:px-6">
          <PortalPublico t={uiTheme(false)} onIngresar={onIngresarModulo} />
        </div>
      </section>

      {/* MÓDULO ACTIVO: BIOMÉDICA — lo que hoy ya funciona, con el material real del proyecto
          (video del equipo y flujo de información). */}
      <section id="biomedica" className="landing-anchor relative overflow-hidden py-20" style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #F3F9FC 55%, #EAF4FB 100%)' }}>
        <RedNeuronalFondo tema="claro" densidad="baja" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="landing-inview min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full" style={{ background: '#DCEEFA', color: '#1D6FA5' }}>
                  Primer módulo
                </span>
                <LandingEstado estado="ACTIVO" />
              </div>
              <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: '#0F172A' }}>Biomédica: el módulo que ya está en operación</h2>
              <p className="mt-3 text-sm sm:text-base leading-relaxed" style={{ color: '#5B6B7C' }}>
                Inventario, hojas de vida, mantenimientos preventivos y correctivos, calibraciones, tecnovigilancia y reportes de falla
                de los equipos biomédicos de cada empresa y sede.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={onIniciarSesion} className="landing-btn landing-btn-primary rounded-lg px-5 py-2.5 text-sm font-semibold text-white inline-flex items-center gap-2">
                  Ingresar al módulo <ChevronRight size={15} />
                </button>
                <button type="button" onClick={onReportarFalla} className="landing-btn rounded-lg px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2 border" style={{ borderColor: 'rgba(59,159,214,0.4)', color: '#1D6FA5', background: '#FFFFFF' }}>
                  <Wrench size={15} /> Reportar una falla
                </button>
              </div>
            </div>
            <div className="landing-inview relative min-w-0">
              <div className="landing-glass-dark relative rounded-2xl p-3 overflow-hidden" style={{ background: 'linear-gradient(160deg, #081a2e 0%, #0d3455 100%)' }}>
                <video className="w-full h-auto rounded-xl block" autoPlay loop muted playsInline preload="metadata" aria-hidden="true">
                  {/* mp4 (H.264) primero: Safari/iOS no reproduce WebM. */}
                  <source src="/media/hero-equipo-biomedico.mp4" type="video/mp4" />
                  <source src="/media/hero-equipo-biomedico.webm" type="video/webm" />
                </video>
              </div>
            </div>
          </div>

          <div className="landing-inview landing-glass-light mt-10 rounded-2xl px-4 sm:px-6 py-6">
            <div className="text-center text-2xs font-semibold uppercase tracking-wide mb-5" style={{ color: '#5B6B7C' }}>
              Así fluye la información de cada equipo
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {LANDING_FLUJO.map(({ icon: Icon, label }, i) => (
                <div key={label} className="flex items-center gap-2 sm:gap-3">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EAF4FB', border: '1px solid rgba(59,159,214,0.25)' }}>
                      <Icon size={16} style={{ color: '#3B9FD6' }} />
                    </div>
                    <span className="text-2xs font-medium" style={{ color: '#334155' }}>{label}</span>
                  </div>
                  {i < LANDING_FLUJO.length - 1 && (
                    <div style={{ width: 20, height: 0, borderTop: '1px dashed rgba(59,159,214,0.4)' }} aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* 4. ¿CÓMO FUNCIONA? */}
      <section id="como-funciona" className="landing-anchor relative overflow-hidden py-20" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #0d3455 55%, #0f4a44 100%)' }}>
        <div className="absolute inset-0 landing-dotgrid-dark opacity-30 pointer-events-none" aria-hidden="true" />
        <RedNeuronalFondo tema="oscuro" densidad="media" />
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
          <LandingEncabezado oscuro etiqueta="¿Cómo funciona?" titulo="Tres pasos hacia una organización conectada" />
          <ol className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
            {LANDING_PASOS.map(({ numero, icon: Icon, titulo, texto }, i) => (
              <li key={numero} className="landing-inview landing-glass-dark rounded-2xl p-6 relative" style={{ transitionDelay: `${i * 90}ms` }}>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-bold tracking-tight" style={{ background: 'linear-gradient(90deg, #7dd3fc 0%, #6ee7b7 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{numero}</span>
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(125,211,252,0.12)', color: '#7dd3fc' }}>
                    <Icon size={20} />
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.72)' }}>{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 5. REPRESENTACIÓN VISUAL — un núcleo + muchas áreas. */}
      <section id="ecosistema" className="landing-anchor relative overflow-hidden py-20" style={{ background: 'linear-gradient(160deg, #F3F9FC 0%, #E3F0FA 55%, #EAF4FB 100%)' }}>
        <div className="absolute inset-0 landing-dotgrid-light opacity-50 pointer-events-none" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <LandingEncabezado etiqueta="La plataforma" titulo="Una plataforma para conectar, gestionar y controlar los procesos de toda la organización."
            texto="Centraliza las operaciones de tus diferentes áreas en un solo lugar, con usuarios, permisos, trazabilidad e información organizada." />
          <EcosistemaPlataforma />
        </div>
      </section>

      {/* 6. DE UNA SOLUCIÓN A UNA PLATAFORMA — storytelling para gerencia. */}
      <section id="evolucion" className="landing-anchor relative overflow-hidden py-20" style={{ background: '#FFFFFF' }}>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <LandingEncabezado etiqueta="De una solución a una plataforma" titulo="De la gestión biomédica a la gestión empresarial"
            texto="La plataforma nace como una solución especializada para la gestión biomédica. Su arquitectura permite evolucionar progresivamente hacia una solución transversal para diferentes áreas de la organización." />
          <ol className="mt-12 flex flex-col lg:flex-row items-stretch gap-3 lg:gap-0">
            {LANDING_EVOLUCION.map((paso, i) => (
              <React.Fragment key={paso.titulo}>
                {i > 0 && (
                  <li aria-hidden="true" className="flex items-center justify-center lg:px-3" style={{ color: '#94A3B8' }}>
                    <ChevronRight size={26} className="hidden lg:block" />
                    <ChevronRight size={24} className="lg:hidden rotate-90" />
                  </li>
                )}
                <li className="landing-inview flex-1 rounded-2xl p-6 border relative overflow-hidden" style={{ borderColor: paso.color + '40', background: `linear-gradient(160deg, ${paso.color}0D 0%, #FFFFFF 70%)`, transitionDelay: `${i * 120}ms` }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-3xs font-bold uppercase tracking-widest" style={{ color: paso.color }}>Etapa {i + 1}</span>
                    <span className="text-3xs font-bold uppercase tracking-wide px-2 py-1 rounded-full" style={{ color: paso.color, background: paso.color + '14' }}>{paso.estado}</span>
                  </div>
                  <h3 className="mt-3 text-lg font-bold" style={{ color: '#0F172A' }}>{paso.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: '#5B6B7C' }}>{paso.texto}</p>
                </li>
              </React.Fragment>
            ))}
          </ol>
        </div>
      </section>

      {/* 7. BENEFICIOS PARA LA ORGANIZACIÓN */}
      <section id="beneficios" className="landing-anchor relative overflow-hidden py-20" style={{ background: 'linear-gradient(160deg, #EAF4FB 0%, #DCEEFA 45%, #E3F0FA 100%)' }}>
        <RedNeuronalFondo tema="claro" densidad="baja" />
        <div className="absolute inset-0 landing-dotgrid-light opacity-50 pointer-events-none" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <LandingEncabezado etiqueta="Beneficios" titulo="Beneficios para la organización" />
          <NucleoDigital />
          <div className="mx-auto mb-10" style={{ width: 1, height: 28, borderLeft: '1px dashed rgba(59,159,214,0.4)' }} aria-hidden="true" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {LANDING_BENEFICIOS.map(({ icon: Icon, titulo, texto }, i) => (
              <div key={titulo} className="landing-inview landing-glass-light rounded-2xl p-5" style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, #3F9142 0%, #3B9FD6 100%)', boxShadow: '0 10px 20px -8px rgba(59,159,214,0.4)' }}>
                  <Icon size={18} className="text-white" />
                </div>
                <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>{titulo}</h3>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: '#5B6B7C' }}>{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. LLAMADO A LA ACCIÓN */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0d3455 0%, #1f6f5c 55%, #3F9142 100%)' }}>
        <div className="absolute inset-0 landing-dotgrid-dark opacity-30 pointer-events-none" aria-hidden="true" />
        <div className="absolute -top-20 -left-12 w-72 h-72 rounded-full pointer-events-none" style={{ background: '#7DD3FC', opacity: 0.22, filter: 'blur(100px)' }} aria-hidden="true" />
        <div className="landing-inview relative max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Comienza con el módulo que tu organización necesita</h2>
          <p className="mt-3 text-sm sm:text-base max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.8)' }}>
            Explora las capacidades de la plataforma y descubre cómo puede evolucionar junto con tu organización.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={onIniciarSesion} className="landing-btn rounded-lg px-6 py-3 text-sm font-semibold inline-flex items-center gap-2" style={{ background: '#FFFFFF', color: '#0F172A' }}>
              Ingresar a la plataforma <ChevronRight size={16} />
            </button>
            <a href="#modulos" className="landing-btn landing-btn-outline-dark rounded-lg px-6 py-3 text-sm font-semibold inline-flex items-center gap-2">
              <LayoutGrid size={15} /> Explorar módulos
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t" style={{ borderColor: '#DCE7F0', background: '#FFFFFF' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src={logoIngenieriaClinica} alt="" width={18} height={18} style={{ objectFit: 'contain' }} />
            <span className="text-2xs" style={{ color: '#8A97A6' }}>Plataforma Integral de Gestión · Primer módulo: Biomédica</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <button type="button" onClick={onReportarFalla} className="landing-link text-2xs font-medium" style={{ color: '#5B6B7C' }}>Reportar una falla</button>
            <button type="button" onClick={onIniciarSesion} className="landing-link text-2xs font-medium" style={{ color: '#5B6B7C' }}>Iniciar sesión</button>
            <span className="text-2xs" style={{ color: '#B4BCC6' }}>Versión 3.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PANTALLA DE ACCESO                                                 */
/* ---------------------------------------------------------------- */
// Fuera del componente a propósito: si viviera dentro de LoginScreen, React recrearía
// este string (y volvería a tocar el nodo <style>) en cada tecla que el usuario escribe
// en usuario/contraseña, justo la ventana en la que el formulario es más sensible a que
// un gestor de contraseñas u otra extensión también esté tocando ese mismo subárbol.
const LOGIN_SCREEN_STYLES = `
  @keyframes login-card-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes login-field-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes illus-float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
  @keyframes decor-float { 0%, 100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(-7px) scale(1.04); } }
  @keyframes bg-drift { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, -10px); } }
  @keyframes glow-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.6; } }
  .login-card-wrap { width: 100%; animation: login-card-in .5s ease both; }
  @media (min-width: 1024px) { .login-card-wrap { width: 82%; max-width: 1180px; } }
  .login-illus { animation: illus-float 5.5s ease-in-out infinite; }
  .login-decor { animation: decor-float 6.5s ease-in-out infinite; }
  .login-glow { animation: glow-pulse 5s ease-in-out infinite; }
  .login-bg-blob { animation: bg-drift 16s ease-in-out infinite; }
  .login-field-in { animation: login-field-in .5s ease both; }
  .login-input { background: #F8FAFC; border-color: #E2E8F0; }
  .login-input:hover { border-color: #CBD5E1; }
  .login-input:focus { background: #FFFFFF; box-shadow: 0 0 0 3px rgba(47,143,209,0.16); border-color: #2F8FD1; }
  .login-btn-primary { background: linear-gradient(135deg, #173B6C 0%, #2F8FD1 60%, #3CAA55 130%); box-shadow: 0 16px 32px -14px rgba(23,59,108,0.45); transition: filter 250ms ease, transform 250ms ease, box-shadow 250ms ease; }
  .login-btn-primary:hover { filter: brightness(1.08); box-shadow: 0 20px 36px -14px rgba(23,59,108,0.55); }
  .login-btn-primary:hover .login-btn-arrow { transform: translateX(3px); }
  .login-btn-primary:active { transform: scale(0.98); }
  .login-btn-arrow { transition: transform 200ms ease; }
  .login-btn-report { background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); box-shadow: 0 12px 24px -10px rgba(217,119,6,0.4); }
  .login-btn-report:hover { filter: brightness(1.06); box-shadow: 0 16px 28px -10px rgba(217,119,6,0.5); }
  .login-fast { transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease, background-color 200ms ease, color 200ms ease; }
  .login-dotgrid { background-image: radial-gradient(circle, #17417a20 1px, transparent 1px); background-size: 26px 26px; }
  @media (prefers-reduced-motion: reduce) {
    .login-illus, .login-decor, .login-glow, .login-bg-blob, .login-card-wrap, .login-field-in { animation: none; }
  }
`;
// Nombre del módulo al que lleva un menú ('dashboard' → Biomédica, 'modulo_rrhh' → Gestión
// Humana…), para avisar en el login a dónde se entrará.
function nombreModuloDeMenu(menu) {
  if (!menu) return '';
  const m = MODULOS.find(x => x.entrada === menu || `modulo_${x.key}` === menu || (x.funciones || []).some(f => f.menu === menu));
  return m?.nombre || '';
}

function LoginScreen({ notice, onLogin, onReportarFalla, onBack, destinoLabel }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  // `notice` llega desde AppInner cuando el cierre de sesión fue automático (por
  // inactividad) — se muestra en el mismo cuadro que los errores de credenciales, y
  // desaparece apenas el usuario empieza a escribir de nuevo (igual que un error normal).
  const [error, setError] = useState(notice || '');
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: user.trim(), pass, remember }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Usuario o contraseña incorrectos');
        setSubmitting(false);
        return;
      }
      // Éxito: App() va a desmontar LoginScreen para mostrar MainApp en su lugar.
      // A propósito NO se hace setSubmitting(false) aquí — este componente está a
      // punto de desaparecer, y actualizar su estado justo en ese instante compite
      // con el desmontaje en el mismo ciclo de React.
      onLogin();
    } catch {
      setError('No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.');
      setSubmitting(false);
    }
  };

  // Constelación decorativa alrededor del logo — puramente visual (sin texto, sin
  // datos), evoca ingeniería biomédica / tecnología / conectividad / equipos médicos /
  // gestión de información. A propósito NO es una grilla de 4 tarjetas.
  const DECOR_ICONS = [
    { Icon: Activity, style: { top: '6%', left: '2%' }, size: 34, color: '#2F8FD1', delay: '0s' },
    { Icon: Cpu, style: { top: '2%', right: '10%' }, size: 30, color: '#3CAA55', delay: '.7s' },
    { Icon: HeartPulse, style: { bottom: '22%', left: '-2%' }, size: 32, color: '#F2994A', delay: '1.3s' },
    { Icon: Share2, style: { bottom: '10%', right: '4%' }, size: 30, color: '#4FC3E7', delay: '.4s' },
    { Icon: Database, style: { top: '46%', right: '-4%' }, size: 28, color: '#173B6C', delay: '1s' },
  ];

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 lg:p-8 relative overflow-hidden"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: 'linear-gradient(160deg, #EAF5FB 0%, #F4FAF6 45%, #FFFFFF 75%, #EEF8F1 100%)' }}>
      <style>{LOGIN_SCREEN_STYLES}</style>

      {/* Fondo ambiental de toda la pantalla — degradado institucional + formas
          translúcidas a la deriva + patrón de puntos muy discreto (profundidad sin ruido) */}
      <div className="absolute inset-0 pointer-events-none login-dotgrid opacity-40" aria-hidden="true" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="login-bg-blob absolute rounded-full" style={{ width: '30rem', height: '30rem', top: '-12rem', left: '-8rem', background: '#2F8FD1', opacity: 0.16, filter: 'blur(90px)' }} />
        <div className="login-bg-blob absolute rounded-full" style={{ width: '26rem', height: '26rem', bottom: '-10rem', right: '-6rem', background: '#3CAA55', opacity: 0.14, filter: 'blur(90px)', animationDelay: '2s' }} />
        <div className="login-bg-blob absolute rounded-full" style={{ width: '18rem', height: '18rem', bottom: '10%', left: '8%', background: '#6EC6EA', opacity: 0.12, filter: 'blur(80px)', animationDelay: '4s' }} />
      </div>

      <div className="login-card-wrap flex flex-col lg:flex-row bg-white overflow-hidden relative" style={{ borderRadius: 28, boxShadow: '0 30px 70px -20px rgba(15,23,42,0.25)' }}>

        {/* LADO IZQUIERDO — identidad institucional (logo Ingeniería Clínica) */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between gap-6 p-10"
          style={{ background: 'linear-gradient(180deg, #F2F9FC 0%, #FFFFFF 55%, #F4FAF6 100%)' }}>

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
              <span className="font-bold" style={{ color: '#173B6C' }}>Plataforma Integral</span><br />
              <span className="font-bold" style={{ color: '#3CAA55' }}>de Gestión</span>
            </p>
            <p className="text-sm text-slate-500 mt-3 max-w-sm">Conecta, gestiona y controla los procesos de las diferentes áreas de tu organización en un solo lugar.</p>
            {destinoLabel && (
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: '#173B6C14', color: '#173B6C' }}>
                <ArrowRight size={13} /> Al iniciar sesión entrarás a {destinoLabel}
              </p>
            )}
          </div>

          {/* LOGO — elemento principal de la pantalla, con halo y constelación decorativa.
              Los íconos decorativos se anclan a una caja del mismo tamaño visual del logo
              (no al alto completo del panel), para que la constelación quede pegada a la marca. */}
          <div className="relative flex-1 flex items-center justify-center min-h-57.5">
            <div className="relative" style={{ width: 420, height: 394 }}>
              <div className="login-glow absolute rounded-full" style={{ width: 342, height: 342, left: '50%', top: '44%', transform: 'translate(-50%, -50%)', background: 'radial-gradient(circle, rgba(47,143,209,0.18) 0%, rgba(60,170,85,0.10) 55%, transparent 75%)' }} aria-hidden="true" />
              {DECOR_ICONS.map(({ Icon, style, size, color, delay }, i) => (
                <div key={i} className="login-decor absolute rounded-2xl flex items-center justify-center"
                  style={{ ...style, width: size, height: size, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)', boxShadow: '0 10px 22px -10px rgba(23,59,108,0.28)', animationDelay: delay }}>
                  <Icon size={size * 0.5} style={{ color }} />
                </div>
              ))}
              <div className="login-illus absolute inset-0 flex items-center justify-center z-10">
                <img src={logoIngenieriaClinica} alt="Ingeniería Clínica" width={300} height={300} style={{ objectFit: 'contain' }} />
              </div>
            </div>
          </div>
        </div>

        {/* LADO DERECHO — formulario */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center p-8 sm:p-12">
          <div className="w-full max-w-sm mx-auto">
            {onBack && (
              <button type="button" onClick={onBack} className="login-fast text-2xs font-semibold text-slate-400 hover:text-slate-600 mb-3 -mt-2">
                ← Volver al inicio
              </button>
            )}
            <div className="mb-3 flex items-center justify-center gap-3">
              <img src={logoIngenieriaClinica} alt="Ingeniería Clínica" width={96} height={96} style={{ objectFit: 'contain' }} />
              <img src={logoMacromed} alt="Macromed Coop." width={96} height={96} style={{ objectFit: 'contain' }} />
            </div>
            <div className="text-xl font-bold tracking-wide text-center" style={{ color: '#173B6C' }}>PLATAFORMA INTEGRAL</div>
            <p className="text-xs text-slate-400 mt-1 mb-7 text-center">Inicie sesión para continuar.</p>

            <form onSubmit={submit} className="space-y-4">
              <div className="login-field-in">
                <label className="text-3xs uppercase tracking-wide text-slate-500 font-semibold">Usuario o correo</label>
                <div className="relative mt-1.5">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-user" name="username" autoComplete="username"
                    autoFocus value={user} onChange={e => { setUser(e.target.value); setError(''); }}
                    className="login-input login-fast w-full rounded-xl pl-10 pr-3 py-3 text-sm border text-slate-800 outline-none"
                  />
                </div>
              </div>

              <div className="login-field-in" style={{ animationDelay: '.06s' }}>
                <label className="text-3xs uppercase tracking-wide text-slate-500 font-semibold">Contraseña</label>
                <div className="relative mt-1.5">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-pass" name="password" autoComplete="current-password"
                    type={showPass ? 'text' : 'password'} value={pass} onChange={e => { setPass(e.target.value); setError(''); }}
                    className="login-input login-fast w-full rounded-xl pl-10 pr-10 py-3 text-sm border text-slate-800 outline-none"
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)} aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="login-fast absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
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
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle size={13} className="shrink-0" /> {error}
                </div>
              )}

              <button type="submit" disabled={submitting} className="login-btn-primary w-full rounded-xl py-3 text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-70">
                {submitting ? 'Iniciando sesión…' : <>Iniciar sesión <ArrowRight size={15} className="login-btn-arrow" /></>}
              </button>
            </form>

            <div className="flex items-center gap-2 mt-5 mb-1">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-3xs uppercase tracking-wide text-slate-400 font-semibold">¿Eres coordinador de sede?</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <button onClick={onReportarFalla} type="button"
              className="login-fast login-btn-report w-full mt-2 rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2">
              <Wrench size={16} /> Reportar una falla de equipo
            </button>

            <div className="flex items-center justify-center gap-3 text-3xs text-slate-400 mt-6">
              <span className="flex items-center gap-1"><Lock size={10} /> Conexión segura</span>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1"><ShieldCheck size={10} /> Datos protegidos</span>
            </div>
            <div className="text-center text-3xs text-slate-300 mt-1.5">Versión 2.0</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Identifica un equipo por su nombre — marca — modelo — S/N. Compartida por el formulario
// público "Reportar falla" y la sección "Reporte de fallas" de la interfaz principal, para
// que ambas pantallas identifiquen el mismo equipo de la misma forma. Cualquier dato
// ausente se omite en vez de mostrar "undefined" o un separador vacío.
function equipoLabelCompleto(e) {
  const partes = [e.equipo, e.marca, e.modelo].filter(Boolean);
  if (e.numeroSerie) partes.push(`S/N: ${e.numeroSerie}`);
  return partes.join(' — ') || 'Equipo sin datos';
}

// Campo "Equipo biomédico" del formulario de Reportar falla — combobox con búsqueda en
// vez del <select> plano de antes, para no obligar a desplazarse por todo el inventario
// de la sede. Filtra por nombre, marca, modelo, número de serie o número de inventario,
// parcial y sin distinguir mayúsculas/minúsculas; `value`/`onChange` siguen manejando el
// mismo `equipoId` de siempre, así que el resto del formulario no se entera del cambio.
function EquipoSearchSelect({ t, equipos, value, onChange }) {
  const selected = equipos.find(e => e.id === value);
  const [query, setQuery] = useState(() => (selected ? equipoLabelCompleto(selected) : ''));
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Refleja el equipo seleccionado en el texto del campo — pero solo mientras el
  // desplegable está cerrado, para no pisar lo que el usuario está escribiendo ahora
  // mismo. Así también se limpia el campo si `value` se resetea desde afuera (p. ej.
  // al cambiar de empresa/sede). Ajuste de estado durante el render (patrón recomendado
  // por React) en vez de un efecto que dispare un render en cascada.
  const [prevSync, setPrevSync] = useState({ value, open });
  if (prevSync.value !== value || prevSync.open !== open) {
    setPrevSync({ value, open });
    if (!open) setQuery(selected ? equipoLabelCompleto(selected) : '');
  }

  useEffect(() => {
    const cerrar = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  const q = query.trim().toLowerCase();
  const resultados = q
    ? equipos.filter(e => [e.equipo, e.marca, e.modelo, e.numeroSerie, e.inventario].filter(Boolean).join(' ').toLowerCase().includes(q))
    : equipos;

  return (
    <div className="relative" ref={wrapRef}>
      <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 ${t.input}`}>
        <Search size={13} className={t.muted} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); } }}
          placeholder="Buscar por nombre, marca, modelo, serie o inventario…"
          aria-label="Buscar equipo biomédico"
          className={`flex-1 min-w-0 bg-transparent text-xs outline-none ${t.text}`}
        />
        {query && (
          <button type="button" onClick={() => { onChange(''); setQuery(''); setOpen(true); }}
            aria-label="Limpiar búsqueda" className={`shrink-0 ${t.muted} hover:opacity-70`}>
            <X size={13} />
          </button>
        )}
      </div>
      {open && (
        <div className={`absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-y-auto rounded-lg border shadow-lg py-1 ${t.panel} ${t.border}`}>
          {resultados.length === 0 ? (
            <div className={`px-3 py-2 text-2xs ${t.muted}`}>Sin coincidencias.</div>
          ) : resultados.map(e => (
            <button type="button" key={e.id}
              onClick={() => { onChange(e.id); setQuery(equipoLabelCompleto(e)); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:opacity-80 ${e.id === value ? 'font-semibold' : t.text}`}>
              {equipoLabelCompleto(e)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* FORMULARIO PÚBLICO — REPORTE DE FALLA (coordinadores de sede)     */
/* ---------------------------------------------------------------- */
// Catálogo PÚBLICO mínimo para el formulario de reporte de falla (sin sesión): empresas
// activas con sus sedes y los equipos solo con sus datos de identificación — ver
// api/reportes-falla.js → catalogoPublico. El inventario completo exige sesión.
async function loadCatalogoPublico() {
  try {
    const res = await fetch('/api/reportes-falla?catalogo=1');
    if (res.ok) return await res.json();
  } catch (err) {
    console.error('No se pudo cargar el catálogo público de equipos', err);
  }
  return null;
}

function ReporteFallaForm({ onBack }) {
  const [equipos, setEquipos] = useState([]);
  // Empresas del catálogo público (las activas en el servidor); mientras carga, las por defecto.
  const [empresas, setEmpresas] = useState(DEFAULT_COMPANIES);
  const [empresa, setEmpresa] = useState(DEFAULT_COMPANIES[0].key);
  const [sede, setSede] = useState(DEFAULT_COMPANIES[0].sedes[0]);
  const [equipoId, setEquipoId] = useState('');
  const [persona, setPersona] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState('Media');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [dark, setDark] = useState(false);
  const t = uiTheme(dark);

  useEffect(() => {
    loadCatalogoPublico().then(cat => {
      if (!cat) return;
      setEquipos(cat.equipos || []);
      if (Array.isArray(cat.empresas) && cat.empresas.length) {
        const lista = cat.empresas.map(empresaToCompany);
        setEmpresas(lista);
        setEmpresa(prev => lista.some(c => c.key === prev) ? prev : lista[0].key);
        setSede(prev => {
          const actual = lista.find(c => c.key === empresa) || lista[0];
          return actual.sedes.includes(prev) ? prev : actual.sedes[0];
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empresaActual = empresas.find(c => c.key === empresa) || empresas[0];
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
    const nuevo = {
      ...newReporte(empresa, sede),
      equipoId, equipoNombre: eq ? eq.equipo : '(equipo no encontrado en inventario)',
      personaReporta: persona, descripcion, prioridad,
    };
    try {
      await crearReporteFalla(nuevo);
    } catch (err) {
      console.error('No se pudo guardar el reporte de falla', err);
      setError(err.message || 'No se pudo enviar el reporte — verifica tu conexión e intenta de nuevo.');
      return;
    }
    setSent(true);
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
          <div className="flex items-center gap-3 mb-3">
            <img src={logoIngenieriaClinica} alt="Ingeniería Clínica" width={52} height={52} className="shrink-0" style={{ objectFit: 'contain' }} />
            <div className="min-w-0">
              <div className="text-3xs uppercase tracking-widest" style={{ color: '#2F8FD1' }}>CMMS Biomédico</div>
              <h1 className="text-lg font-bold">Reportar falla de equipo</h1>
            </div>
          </div>
          <p className={`text-xs mb-5 ${t.muted}`}>Diligencia este formulario si detectas una novedad o daño en un equipo.</p>

          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Empresa">
                <SelectInput t={t} value={empresa} options={empresas.map(c => c.key)}
                  onChange={v => { setEmpresa(v); setSede((empresas.find(c => c.key === v) || empresas[0]).sedes[0]); setEquipoId(''); }} />
              </Field>
              <Field label="Sede">
                <SelectInput upper t={t} value={sede} options={empresaActual.sedes}
                  onChange={v => { setSede(v); setEquipoId(''); }} />
              </Field>
            </div>

            <Field label="Equipo biomédico">
              <EquipoSearchSelect t={t} equipos={equiposFiltrados} value={equipoId} onChange={setEquipoId} />
              {equiposFiltrados.length === 0 && <p className="text-2xs mt-1" style={{ color: '#D97706' }}>No hay equipos registrados para esta sede todavía.</p>}
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
// `conLogo`: la marca de agua de Ingeniería Clínica es solo del área biomédica (no se muestra en Gestión Humana).
function AmbientBackground({ theme, dark, conLogo = true }) {
  const isNeutral = theme.key === 'TODAS';
  const c1 = isNeutral ? '#0EA5E9' : theme.solid; // "azul tenue" neutro, o color de marca
  const c2 = isNeutral ? '#94A3B8' : theme.light; // "gris claro" neutro, o variante clara de marca
  const c3 = isNeutral ? '#CBD5E1' : theme.dark;  // variante suave adicional, o variante oscura de marca
  const op = dark ? 0.24 : 0.14; // intensidad baja — la legibilidad manda
  // Marca de agua institucional — el mismo logo del login, grande y centrada en el área de
  // contenido. Vive aquí (y no en un componente nuevo) porque esta ya es la capa decorativa
  // que corre detrás de todo el contenido de MainApp: un único <img>, sin repetirse, sin
  // bloquear clics (pointer-events-none heredado del contenedor) y recortada por
  // overflow-hidden si la ventana es más chica que el logo. Opacidad deliberadamente alta
  // dentro de "sutil" (18–22%, no el 6–8% inicial) para que se identifique con claridad sin
  // competir con el contenido; un poco más en modo oscuro para que siga siendo perceptible
  // sobre el fondo sólido oscuro.
  const logoOpacity = dark ? 0.22 : 0.18;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute rounded-full transition-colors duration-500 ease-out"
        style={{ width: '34rem', height: '34rem', top: '-10rem', right: '-8rem', backgroundColor: c1, opacity: op, filter: 'blur(95px)' }} />
      <div className="absolute rounded-full transition-colors duration-500 ease-out"
        style={{ width: '30rem', height: '30rem', bottom: '-12rem', left: '-8rem', backgroundColor: c2, opacity: op, filter: 'blur(100px)' }} />
      <div className="absolute rounded-full transition-colors duration-500 ease-out"
        style={{ width: '26rem', height: '26rem', top: '30%', left: '42%', backgroundColor: c3, opacity: op * 0.65, filter: 'blur(110px)' }} />
      {conLogo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <img src={logoIngenieriaClinica} alt=""
            style={{ width: 'min(112vw, 59rem)', height: 'min(112vw, 59rem)', objectFit: 'contain', opacity: logoOpacity, transition: 'opacity 500ms ease-out' }} />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* NAVEGACIÓN LATERAL — compartida entre el sidebar de escritorio    */
/* (columna fija) y el drawer móvil (superpuesto con backdrop)       */
/* ---------------------------------------------------------------- */
// `itemsModulo`: cuando se está dentro de un módulo con menú propio (Gestión Humana), el panel
// muestra solo las opciones de ese módulo en lugar del menú completo de la plataforma.
function SidebarNav({ menu, onNavigate, nuevosReportes, accent, accentBg, t, dark, setDark, onLogout, readOnly, onCloseMobile, itemsModulo }) {
  const user = useContext(AuthUserContext);
  const isSuper = user?.role === 'SUPER_ADMIN';
  const permitidos = modulosPermitidos(user);
  const items = itemsModulo || MENU.filter(m => !(readOnly && m.guestHidden) && !(m.superOnly && !isSuper) && !(m.modulo && !permitidos.has(m.modulo)));
  return (
    <>
      <div className="h-1" style={{ background: accentBg }} />
      <div className="px-4 py-5 border-b flex items-center justify-between" style={{ borderColor: 'inherit' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={logoIngenieriaClinica} alt="Ingeniería Clínica" width={36} height={36} className="shrink-0" style={{ objectFit: 'contain' }} />
          <div className="min-w-0">
            <div className="text-3xs uppercase tracking-widest truncate" style={{ color: accent }}>Plataforma Integral</div>
            <div className="text-sm font-bold mt-0.5 truncate">de Gestión</div>
          </div>
        </div>
        {onCloseMobile && (
          <button onClick={onCloseMobile} aria-label="Cerrar menú" className={`flex items-center justify-center w-11 h-11 -mr-2 ${t.muted}`}>
            <X size={18} />
          </button>
        )}
      </div>
      <div className="flex-1 py-3 overflow-y-auto">
        {items.map((m, i) => {
          const Icon = m.icon;
          const active = m.activo ?? menu === m.key;
          const header = m.group && m.group !== items[i - 1]?.group;
          return (
            <React.Fragment key={m.key}>
            {header && (
              <div className={`px-4 pt-4 pb-1 text-3xs uppercase tracking-widest font-semibold ${t.muted}`}>{m.group}</div>
            )}
            <button onClick={() => onNavigate(m.key)}
              className={`w-full flex items-center gap-2.5 px-4 min-h-11 text-xs text-left transition ${active ? 'font-semibold' : t.muted}`}
              style={active
                ? (dark
                    ? { background: accent + '1A', color: accent, borderRight: `2px solid ${accent}` }
                    : { background: SIDEBAR_ACTIVE_GRADIENT_LIGHT, color: SIDEBAR_ACTIVE_ACCENT_LIGHT, borderRight: `2px solid ${SIDEBAR_ACTIVE_ACCENT_LIGHT}` })
                : {}}>
              <Icon size={15} /> {m.label}
              {m.key === 'fallas' && nuevosReportes > 0 && (
                <span className="ml-auto rounded-full text-3xs font-mono px-1.5 py-0.5" style={{ background: '#EF4444', color: '#fff' }}>{nuevosReportes}</span>
              )}
            </button>
            </React.Fragment>
          );
        })}
      </div>
      <div className="p-4 border-t space-y-2" style={{ borderColor: 'inherit' }}>
        {user && (
          <div className="flex items-center gap-2 min-w-0 pb-1">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: accent + '1A', color: accent }}>
              <UserCog size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate" title={user.email}>{user.nombre || user.email}</div>
              <div className={`text-3xs truncate ${t.muted}`}>
                {ROLE_LABELS[user.role] || user.role}{user.empresa_id ? ` · ${companyOf(user.empresa_id)?.nombre || user.empresa_id}` : ''}
              </div>
            </div>
          </div>
        )}
        <button onClick={() => setDark(!dark)} className={`w-full flex items-center justify-center gap-2 rounded-md min-h-11 text-xs border ${t.border}`}>
          {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? 'Modo claro' : 'Modo oscuro'}
        </button>
        <button onClick={onLogout} className={`w-full flex items-center justify-center rounded-md min-h-11 text-xs border ${t.border} ${t.muted}`}>
          Cerrar sesión
        </button>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- */
/* APP PRINCIPAL                                                     */
/* ---------------------------------------------------------------- */

function MainApp({ user, entorno, onLogout, readOnly, menuInicial }) {
  const [equipos, setEquipos] = useState([]);
  const [dark, setDark] = useState(false);
  // Pantalla de entrada: el portal corporativo de la plataforma (antes el dashboard biomédico,
  // que sigue existiendo dentro del módulo Biomédica).
  const [menu, setMenu] = useState(menuInicial || 'inicio');
  // Sección de Gestión Humana elegida desde el menú lateral (`n` cambia en cada clic).
  const [rrhhNav, setRrhhNav] = useState({ seccion: 'inicio', n: 0 });
  // Empresa activa dentro de Gestión Humana (sus empresas son propias del módulo).
  const [rrhhEmpresa, setRrhhEmpresa] = useState(() => (user.role === 'SUPER_ADMIN' ? 'TODAS' : empresaRRHHDeUsuario(user.empresa_id)));
  // MULTIEMPRESA: el SUPER_ADMIN empieza en "Todas" y puede filtrar por cualquier empresa.
  // Un usuario de empresa queda fijo en SU empresa (la que asignó el servidor) y no puede
  // cambiarla — y aunque lo intentara desde DevTools, la API solo le devuelve sus datos.
  const isSuper = user.role === 'SUPER_ADMIN';
  const lockedCompany = isSuper ? null : user.empresa_id;
  const [activeCompany, setActiveCompanyRaw] = useState(lockedCompany || 'TODAS');
  const setActiveCompany = (k) => setActiveCompanyRaw(lockedCompany || k);
  // Recarga completa de datos tras cambios que afectan a varias colecciones (p. ej. asignar
  // empresa a registros heredados desde Administración).
  const [dataVersion, setDataVersion] = useState(0);
  const [filters, setFilters] = useState({ sede: '', ubicacion: '', estado: '', marca: '', clasificacion: '' });
  const [search, setSearch] = useState('');
  const [searchText, setSearchText] = useState('');
  const [sort, setSort] = useState({ key: 'equipo', dir: 1 });
  const [drawerId, setDrawerId] = useState(null);
  const [obsModalId, setObsModalId] = useState(null);
  const [reportesFalla, setReportesFalla] = useState([]);
  const [planesProgramas, setPlanesProgramas] = useState({});
  const [capacitaciones, setCapacitaciones] = useState(null);
  const [capSincronizando, setCapSincronizando] = useState(false);
  // { type: 'success' | 'error', message } | null — se muestra como banner en el dashboard
  // de Capacitaciones (no un alert() bloqueante, a diferencia del resto del CMMS: el pedido
  // puntual acá era un estado de sincronización visible e inline: "Actualizando…",
  // "Actualizado correctamente" o el error). El éxito se autoculta; el error se queda fijo
  // hasta el próximo intento, para no perder el mensaje de qué falló.
  const [capSyncStatus, setCapSyncStatus] = useState(null);
  const [tecnoTransversal, setTecnoTransversal] = useState({});
  const [tecnoReportes, setTecnoReportes] = useState({});
  const [personal, setPersonal] = useState([]);
  const [limpiezaDesinfeccion, setLimpiezaDesinfeccion] = useState({});
  const [limpiezaPlantillas, setLimpiezaPlantillas] = useState({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => { loadEquipos().then(setEquipos); }, [dataVersion]);
  useEffect(() => { loadReportes().then(setReportesFalla); }, [dataVersion]);
  // Notificación en vivo: si otra pestaña del mismo navegador refresca la caché local, esta la recoge de inmediato.
  useEffect(() => {
    const handler = (e) => { if (e.key === REPORTES_KEY) loadReportes().then(setReportesFalla); };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);
  // Actualización optimista + persistencia puntual en el servidor (nunca se reescribe el
  // arreglo completo): si el PATCH falla, se revierte el cambio local para no mostrar un
  // estado que en realidad no quedó guardado para los demás usuarios.
  const updateReporte = (updated) => {
    const previous = reportesFalla.find(r => r.id === updated.id);
    setReportesFalla(prev => prev.map(r => r.id === updated.id ? updated : r));
    actualizarReporteFalla(updated.id, updated).catch(err => {
      console.error('No se pudo sincronizar el cambio del reporte con el servidor compartido', err);
      if (previous) setReportesFalla(prev => prev.map(r => r.id === updated.id ? previous : r));
    });
  };
  const nuevosReportes = reportesFalla.filter(r => !r.visto && (activeCompany === 'TODAS' || r.empresa === activeCompany)).length;
  // Elimina UN reporte de falla puntual (elegido por el usuario) — mismo revert-on-fail que
  // updateReporte/vaciarHistorialFallas: si el servidor rechaza el borrado, se restaura.
  const eliminarReporte = (id) => {
    const previous = reportesFalla;
    setReportesFalla(prev => prev.filter(r => r.id !== id));
    eliminarReporteFalla(id).catch(err => {
      console.error('No se pudo eliminar el reporte de falla en el servidor compartido', err);
      setReportesFalla(previous);
    });
  };
  // Vacía el histórico completo (pensado para limpiar datos de prueba) — misma revert-on-fail
  // que updateReporte: si el servidor rechaza el borrado, se restaura lo que había localmente.
  const vaciarHistorialFallas = () => {
    const previous = reportesFalla;
    setReportesFalla([]);
    vaciarReportesFalla().catch(err => {
      console.error('No se pudo vaciar el histórico de reportes de falla en el servidor', err);
      setReportesFalla(previous);
    });
  };

  useEffect(() => { loadPlanesProgramas().then(setPlanesProgramas); }, []);
  const updatePlanPrograma = (empresaKey, campo, valor) => {
    const previous = planesProgramas;
    setPlanesProgramas(prev => ({ ...prev, [empresaKey]: { ...(prev[empresaKey] || {}), [campo]: valor } }));
    actualizarPlanPrograma(empresaKey, campo, valor).catch(err => {
      console.error('No se pudo sincronizar el plan/programa con el servidor compartido', err);
      setPlanesProgramas(previous);
    });
  };

  useEffect(() => { loadCapacitaciones().then(setCapacitaciones); }, []);
  // A diferencia de updateEquipo/updatePlanPrograma, esto no es una edición optimista de un
  // campo puntual: es un refresh completo que solo tiene sentido esperar a que el servidor
  // termine (puede tardar unos segundos, consulta ~20 hojas de Google en vivo), así que el
  // botón queda deshabilitado con capSincronizando mientras corre.
  const actualizarCapacitaciones = async () => {
    setCapSincronizando(true);
    setCapSyncStatus(null);
    try {
      const data = await sincronizarCapacitaciones();
      setCapacitaciones(data);
      const conErrores = data.errores?.length > 0;
      setCapSyncStatus({
        type: conErrores ? 'error' : 'success',
        message: conErrores
          ? `Actualizado con errores: ${data.errores.length} formulario${data.errores.length !== 1 ? 's' : ''} no se pudo(ieron) sincronizar.`
          : 'Actualizado correctamente.',
      });
      if (!conErrores) setTimeout(() => setCapSyncStatus(null), 5000);
    } catch (err) {
      console.error('No se pudo sincronizar las capacitaciones', err);
      setCapSyncStatus({ type: 'error', message: err.message });
    } finally {
      setCapSincronizando(false);
    }
  };

  useEffect(() => { loadTecnoTransversal().then(setTecnoTransversal); }, []);
  // Cada documento guarda una URL distinta por empresa (ver api/tecno-transversal.js) —
  // mismo principio de merge puntual que updateTecnoReporte: solo se toca la hoja
  // [docKey][empresaKey], nunca se sobrescriben las URLs de las demás empresas.
  // `empresaKey` en null/undefined = documento único compartido por las 5 empresas (p. ej.
  // el formato de INVIMA): se guarda como un valor plano, igual que antes de diferenciar
  // por empresa. Con `empresaKey`, solo se toca la hoja [docKey][empresaKey] — nunca se
  // sobrescriben las URLs de las demás empresas (mismo principio que updateTecnoReporte).
  const updateTecnoTransversal = (docKey, empresaKey, valor) => {
    const previous = tecnoTransversal;
    setTecnoTransversal(prev => {
      if (!empresaKey) return { ...prev, [docKey]: valor };
      const docObj = (prev[docKey] && typeof prev[docKey] === 'object') ? prev[docKey] : {};
      return { ...prev, [docKey]: { ...docObj, [empresaKey]: valor } };
    });
    actualizarTecnoTransversal(docKey, empresaKey, valor).catch(err => {
      console.error('No se pudo sincronizar el documento con el servidor compartido', err);
      setTecnoTransversal(previous);
    });
  };

  useEffect(() => { loadTecnoReportes().then(setTecnoReportes); }, []);
  const updateTecnoReporte = (empresaKey, sede, anio, trimestre, valor) => {
    const previous = tecnoReportes;
    setTecnoReportes(prev => {
      const emp = prev[empresaKey] || {};
      const sedeObj = emp[sede] || {};
      const anioObj = sedeObj[anio] || {};
      return { ...prev, [empresaKey]: { ...emp, [sede]: { ...sedeObj, [anio]: { ...anioObj, [trimestre]: valor } } } };
    });
    actualizarTecnoReporte(empresaKey, sede, anio, trimestre, valor).catch(err => {
      console.error('No se pudo sincronizar el reporte de tecnovigilancia con el servidor compartido', err);
      setTecnoReportes(previous);
    });
  };

  useEffect(() => { loadPersonal().then(setPersonal); }, [dataVersion]);
  const addPersonal = (record) => {
    setPersonal(prev => [...prev, record]);
    crearPersonal(record).catch(err => {
      console.error('No se pudo guardar el registro de personal en el servidor compartido', err);
      setPersonal(prev => prev.filter(p => p.id !== record.id));
    });
  };
  const updatePersonal = (updated) => {
    const previous = personal.find(p => p.id === updated.id);
    setPersonal(prev => prev.map(p => p.id === updated.id ? updated : p));
    actualizarPersonal(updated.id, updated).catch(err => {
      console.error('No se pudo sincronizar el registro de personal con el servidor compartido', err);
      if (previous) setPersonal(prev => prev.map(p => p.id === updated.id ? previous : p));
    });
  };

  useEffect(() => { loadLimpiezaDesinfeccion().then(setLimpiezaDesinfeccion); }, []);
  const updateLimpiezaDesinfeccion = (empresaKey, sede, anio, mes, url) => {
    const previous = limpiezaDesinfeccion;
    setLimpiezaDesinfeccion(prev => {
      const emp = prev[empresaKey] || {};
      const sedeObj = emp[sede] || {};
      const anioObj = { ...(sedeObj[anio] || {}) };
      if (url && url.trim()) anioObj[mes] = { url: url.trim(), updatedAt: new Date().toISOString() };
      else delete anioObj[mes];
      return { ...prev, [empresaKey]: { ...emp, [sede]: { ...sedeObj, [anio]: anioObj } } };
    });
    actualizarLimpiezaDesinfeccion(empresaKey, sede, anio, mes, url).catch(err => {
      console.error('No se pudo sincronizar el formato de limpieza y desinfección con el servidor compartido', err);
      setLimpiezaDesinfeccion(previous);
    });
  };

  useEffect(() => { loadLimpiezaPlantillas().then(setLimpiezaPlantillas); }, []);
  // A diferencia de los demás updateX de arriba, estas dos NO actualizan el estado de forma
  // optimista: cargar/reemplazar/eliminar un archivo real depende de una respuesta del
  // servidor (éxito o error de validación/permisos) que la tarjeta necesita mostrarle al
  // usuario antes de dar por hecho el cambio, así que solo se refleja en pantalla una vez
  // confirmado — el error, si lo hay, lo captura y muestra el propio componente que llama a
  // estas funciones (ver PlantillaLimpiezaCard).
  const subirLimpiezaPlantilla = async (empresaKey, archivo) => {
    const actualizado = await guardarLimpiezaPlantilla(empresaKey, archivo);
    setLimpiezaPlantillas(actualizado);
  };
  const eliminarLimpiezaPlantilla = async (empresaKey) => {
    const actualizado = await eliminarLimpiezaPlantillaRemota(empresaKey);
    setLimpiezaPlantillas(actualizado);
  };

  // Sedes efectivas por empresa (configuradas + en uso por los equipos): se recalculan en el
  // mismo render en que cambian los equipos, antes de que los hijos lean COMPANIES.
  useMemo(() => registrarSedesEnUso(equipos), [equipos]);

  // PLATAFORMA — qué puede abrir este usuario. Replica exactamente las reglas con las que se
  // renderiza cada pantalla más abajo (solo lectura, SUPER_ADMIN, módulo habilitado) para que
  // el portal nunca ofrezca un botón hacia algo que después no se mostraría. La seguridad
  // real sigue en la API.
  const permitidos = useMemo(() => modulosPermitidos(user), [user]);
  const puedeAbrir = (key) => {
    const mod = moduloDeMenu(key);
    if (mod) return !!moduloPorKey(mod);
    const def = menuDef(key);
    if (!def) return false;
    if (readOnly && def.guestHidden) return false;
    if (def.superOnly && !isSuper) return false;
    if (def.modulo && !permitidos.has(def.modulo)) return false;
    return true;
  };
  const navegar = (key) => { if (puedeAbrir(key)) setMenu(key); };
  // Inicio de cada módulo = su pantalla de entrada ('dashboard' en Biomédica, 'modulo_rrhh'
  // en Gestión Humana…). Sin módulo elegido se entra a Biomédica o, si el usuario no la tiene,
  // al primer módulo que pueda abrir.
  const inicioDeModulo = (key) => moduloPorKey(key)?.entrada || (key ? menuDeModulo(key) : null);
  const inicioPorDefecto = puedeAbrir('dashboard') ? 'dashboard'
    : (MODULOS.map(m => m.entrada).find(e => e && puedeAbrir(e)) || 'dashboard');
  const moduloDelMenu = (key) => moduloDeMenu(key) || menuDef(key)?.modulo || null;
  // Menú lateral por módulo: dentro de Gestión Humana solo se muestran sus opciones.
  const enRRHH = moduloDeMenu(menu) === 'rrhh' && permitidos.has('rrhh');
  const itemsMenuModulo = enRRHH ? [
    { key: 'rrhh:inicio', label: 'Inicio', icon: LayoutDashboard, group: 'Gestión Humana', activo: rrhhNav.seccion === 'inicio' },
    { key: 'rrhh:colaboradores', label: 'Colaboradores', icon: Users, group: 'Gestión Humana', activo: rrhhNav.seccion === 'colaboradores' },
    { key: 'rrhh:capacitaciones', label: 'Capacitaciones de inducción y reinducción', icon: GraduationCap, group: 'Gestión Humana', activo: rrhhNav.seccion === 'capacitaciones' },
    { key: 'rrhh:funciones', label: 'Funciones del cargo', icon: BriefcaseBusiness, group: 'Gestión Humana', activo: rrhhNav.seccion === 'funciones' },
  ] : null;
  const navegarDesdeMenu = (key) => {
    if (key.startsWith('rrhh:')) {
      setMenu('modulo_rrhh');
      setRrhhNav(v => ({ seccion: key.slice(5), n: v.n + 1 }));
    } else {
      setMenu(key);
    }
  };
  const irAlInicioDelModulo = () => {
    const destino = inicioDeModulo(moduloDelMenu(menu));
    setMenu(destino && puedeAbrir(destino) ? destino : inicioPorDefecto);
  };
  // El módulo elegido en la landing solo se respeta si este usuario puede abrirlo; el antiguo
  // portal ('inicio' / 'modulos') ya no existe dentro de la app y redirige al inicio del módulo.
  if (menu === 'inicio' || menu === 'modulos' || !puedeAbrir(menu)) {
    const destino = menu === 'inicio' || menu === 'modulos' ? inicioPorDefecto : (puedeAbrir(inicioDeModulo(moduloDelMenu(menu))) ? inicioDeModulo(moduloDelMenu(menu)) : inicioPorDefecto);
    if (destino !== menu) setMenu(destino);
  }


  const empresaLabel = activeCompany === 'TODAS' ? 'Todas las empresas' : (companyOf(activeCompany)?.nombre || activeCompany);
  const moduloInfo = moduloPorKey(moduloDeMenu(menu));
  const menuActual = menuDef(menu);
  const seccion = moduloInfo?.key === 'rrhh' ? ['Gestión Humana']
    : moduloInfo ? ['Áreas', moduloInfo.menuLabel || moduloInfo.nombre]
    : menuActual?.group ? [menuActual.group, menuActual.label] : [menuActual?.label || ''];
  const mostrarEmpresas = !menu.startsWith('admin_') && !moduloInfo;

  const theme = themeOf(activeCompany);
  const accent = theme.solid;
  const accentBg = theme.bg;

  const t = uiTheme(dark);

  // Actualización optimista + persistencia puntual en el servidor (nunca se reescribe el
  // arreglo completo): si la operación falla, se revierte el cambio local para no mostrar
  // en pantalla algo que en realidad no quedó guardado para los demás usuarios/computadores.
  const updateEquipo = (updated) => {
    const previous = equipos.find(e => e.id === updated.id);
    setEquipos(prev => prev.map(e => e.id === updated.id ? updated : e));
    actualizarEquipo(updated.id, updated).catch(err => {
      console.error('No se pudo sincronizar el equipo con el servidor compartido', err);
      if (previous) setEquipos(prev => prev.map(e => e.id === updated.id ? previous : e));
    });
  };
  const removeEquipo = (id) => {
    const previous = equipos;
    setEquipos(prev => prev.filter(e => e.id !== id));
    eliminarEquipo(id).catch(err => {
      console.error('No se pudo eliminar el equipo en el servidor compartido', err);
      setEquipos(previous);
    });
  };
  const duplicateEquipo = (eq) => {
    const nuevo = { ...eq, id: uid('eq'), equipo: eq.equipo + ' (copia)' };
    setEquipos(prev => [...prev, nuevo]);
    crearEquipo(nuevo).catch(err => {
      console.error('No se pudo duplicar el equipo en el servidor compartido', err);
      setEquipos(prev => prev.filter(e => e.id !== nuevo.id));
    });
  };
  const addEquipo = () => {
    const n = newEquipo(activeCompany === 'TODAS' ? COMPANIES[0].key : activeCompany);
    setEquipos(prev => [...prev, n]);
    setDrawerId(n.id);
    crearEquipo(n).catch(err => {
      console.error('No se pudo crear el equipo en el servidor compartido', err);
      setEquipos(prev => prev.filter(e => e.id !== n.id));
    });
  };

  // Valores únicos para los <select> de filtro (equipo/sede/marca) — a propósito se calculan
  // sobre el inventario de la empresa activa SIN aplicar los demás filtros, para que las
  // opciones del desplegable no vayan desapareciendo a medida que el usuario filtra por otro
  // campo. "ubicacion" es la excepción: además de la empresa, respeta en cascada la sede
  // seleccionada (Empresa → Sede → Ubicación), para no ofrecer ubicaciones de otra sede.
  const uniqueOptions = useMemo(() => {
    const scopedEmpresa = activeCompany === 'TODAS' ? equipos : equipos.filter(e => e.empresa === activeCompany);
    const out = {};
    ['equipo', 'sede', 'marca'].forEach(field => {
      out[field] = [...new Set(scopedEmpresa.map(e => e[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    });
    const scopedParaUbicacion = filters.sede ? scopedEmpresa.filter(e => e.sede === filters.sede) : scopedEmpresa;
    out.ubicacion = [...new Set(scopedParaUbicacion.map(e => e.ubicacion).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return out;
  }, [equipos, activeCompany, filters.sede]);
  const uniqueVals = (field) => uniqueOptions[field] || [];

  // Cambia la empresa activa y, en el mismo gesto del usuario, limpia los filtros
  // dependientes (sede/ubicación) que hayan quedado inválidos para la nueva empresa —
  // jerarquía Empresa → Sede → Ubicación. Se hace aquí (evento), no en un useEffect, para no
  // disparar un set-state adicional fuera del gesto que lo origina.
  const changeCompany = (newCompany) => {
    setActiveCompany(newCompany);
    if (newCompany === 'TODAS') return;
    setFilters(f => {
      const scoped = equipos.filter(e => e.empresa === newCompany);
      const sede = (f.sede && scoped.some(e => e.sede === f.sede)) ? f.sede : '';
      const scopedUbicacion = sede ? scoped.filter(e => e.sede === sede) : scoped;
      const ubicacion = (f.ubicacion && scopedUbicacion.some(e => e.ubicacion === f.ubicacion)) ? f.ubicacion : '';
      if (sede === f.sede && ubicacion === f.ubicacion) return f;
      return { ...f, sede, ubicacion };
    });
  };

  // Misma idea que changeCompany, pero para cuando el usuario cambia manualmente la sede
  // (sin cambiar de empresa): si la ubicación ya elegida no pertenece a la nueva sede, se
  // limpia (p. ej. Sede A → Sede B debe soltar una ubicación exclusiva de Sede A). También
  // cubre volver a "Todas las sedes" (newSede === ''), revalidando contra todo el alcance
  // de la empresa activa.
  const changeSede = (newSede) => {
    setFilters(f => {
      const scopedEmpresa = activeCompany === 'TODAS' ? equipos : equipos.filter(e => e.empresa === activeCompany);
      const scoped = newSede ? scopedEmpresa.filter(e => e.sede === newSede) : scopedEmpresa;
      const ubicacion = (f.ubicacion && scoped.some(e => e.ubicacion === f.ubicacion)) ? f.ubicacion : '';
      return { ...f, sede: newSede, ubicacion };
    });
  };

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
    if (searchText.trim()) {
      const s = searchText.toLowerCase();
      list = list.filter(e => [
        e.equipo, e.marca, e.modelo, e.numeroSerie, e.inventario, e.registroInvima,
        e.ubicacion, e.empresa, e.sede, e.estado, e.clasificacionRiesgo,
        e.periodicidadMantenimiento, e.observaciones,
      ].filter(Boolean).join(' ').toLowerCase().includes(s));
    }
    list = [...list].sort((a, b) => {
      const av = (a[sort.key] || '').toString().toLowerCase();
      const bv = (b[sort.key] || '').toString().toLowerCase();
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
    });
    return list;
  }, [equipos, activeCompany, filters, search, searchText, sort]);

  const drawerEquipo = equipos.find(e => e.id === drawerId);
  const obsEquipo = equipos.find(e => e.id === obsModalId);

  /* ---- Excel export / import ---- */
  // `filtered` (definido arriba) ya es el resultado de aplicar empresa activa + todos los
  // filtros del panel (sede, ubicación, estado, marca, clasificación) + búsqueda — por eso
  // basta con exportar esa misma lista para que el Excel respete exactamente lo que se ve
  // en pantalla, sin repetir la lógica de filtrado aquí.
  const exportExcel = async () => {
    if (filtered.length === 0) {
      alert('No hay equipos para exportar con los filtros actuales.');
      return;
    }
    // Exportación simplificada: solo estas 9 columnas, en este orden exacto — el resto
    // de campos del inventario (calendario de mantenimientos, calibración, observaciones,
    // etc.) sigue intacto en la app, simplemente no se incluye en este archivo.
    const rows = filtered.map(e => ({
      EMPRESA: e.empresa,
      SEDE: e.sede,
      EQUIPO: e.equipo,
      MARCA: e.marca,
      MODELO: e.modelo,
      'NUMERO DE SERIE': e.numeroSerie,
      'REGISTRO INVIMA': e.registroInvima,
      'CLASIFICACION DE RIESGO': e.clasificacionRiesgo,
      'UBICACIÓN': e.ubicacion,
    }));
    const headers = Object.keys(rows[0] || {});

    const data = [
      headers.map(header => ({ value: header, fontWeight: 'bold' })),
      // Celda vacía en vez de "undefined"/"null" literal — no "N/R", para no dar a
      // entender que ese es un dato real del equipo cuando el campo simplemente está vacío.
      ...rows.map(row =>
        headers.map(header => ({ value: row[header] ?? '' }))
      ),
    ];

    // write-excel-file 4.x ya no descarga el archivo solo con pasarle `fileName` en las
    // opciones (eso es de la API vieja, 3.x) — ahora writeXlsxFile(...) devuelve un objeto
    // con métodos async `toFile()`/`toBlob()`, y hay que encadenar `.toFile(nombre)` para
    // que de verdad dispare la descarga en el navegador. Sin ese encadenado (como estaba
    // antes) la llamada no lanza ningún error, pero tampoco genera ni descarga nada — por
    // eso el botón "parecía" no hacer nada.
    try {
      await writeXlsxFile(data, { sheet: 'Inventario' }).toFile('inventario-biomedico.xlsx');
    } catch (err) {
      console.error('No se pudo generar el Excel del inventario', err);
      alert('No se pudo generar el archivo Excel. Intenta de nuevo; si el problema continúa, contacta al administrador.');
    }
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
    const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // se asume DD/MM/AAAA, como el resto de la app
    if (dmy) {
      let [, d, m] = dmy;
      // Si el "mes" no es un mes válido (>12) pero el "día" sí podría serlo, la celda
      // venía en MM/DD/AAAA (p. ej. de un Excel en inglés) — se corrige el orden en vez
      // de generar una fecha inválida.
      if (+m > 12 && +d <= 12) [d, m] = [m, d];
      return `${dmy[3]}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  };
  const importExcel = async (file) => {
  try {
    // `readSheet` solo lee valores ya calculados de la hoja (texto/número/fecha) — nunca
    // fórmulas ni contenido activo del archivo, así que el Excel se trata siempre como datos.
    const rows = await readSheet(file);

    if (!rows || rows.length < 2) {
      alert('El archivo Excel está vacío o no contiene datos.');
      return;
    }

    // Primera fila = encabezados
    const headers = rows[0].map(value =>
      (value ?? '').toString().trim()
    );

    if (!headers.some(h => h.toUpperCase() === 'EQUIPO')) {
      alert('El archivo no tiene el formato esperado: falta la columna "EQUIPO". Usa "Exportar Excel" para ver el formato correcto y cárgalo de nuevo.');
      return;
    }

    // Convertir las filas en objetos, igual que hacía sheet_to_json()
    const dataRows = rows.slice(1).map(row => {
      const obj = {};

      headers.forEach((header, index) => {
        obj[header] = row[index] ?? '';
      });

      return obj;
    });

    // Fila real en el Excel (la 1 son los encabezados) — para reportar problemas fila por fila.
    const errores = [];
    const imported = [];

    dataRows.forEach((r, i) => {
      const fila = i + 2;
      const nombreEquipo = (r.EQUIPO ?? '').toString().trim();
      if (!nombreEquipo) {
        // Solo se reporta si la fila trae algún otro dato — una fila totalmente vacía
        // (hueco al final de la hoja) no es un error, se ignora en silencio.
        if (Object.values(r).some(v => (v ?? '').toString().trim())) {
          errores.push(`fila ${fila}: falta el campo obligatorio EQUIPO`);
        }
        return;
      }

      const empresaTexto = (r.EMPRESA || '').toString().trim();
      const empresaMatch = COMPANIES.find(c => c.key.toUpperCase() === empresaTexto.toUpperCase());
      const empresaKey = empresaMatch?.key || (activeCompany === 'TODAS' ? COMPANIES[0].key : activeCompany);
      if (empresaTexto && !empresaMatch) {
        errores.push(`fila ${fila}: EMPRESA "${empresaTexto}" no reconocida, se asignó a ${empresaKey}`);
      }

      // Sede: si coincide (sin importar tildes/mayúsculas) con una sede conocida de la empresa,
      // se usa esa escritura; si no, se CONSERVA la del Excel — antes caía a la primera sede de
      // la empresa y podía mover equipos de sede sin avisar.
      const co = companyOf(empresaKey);
      const sedeTexto = (r.SEDE ?? '').toString().replace(/\s+/g, ' ').trim();
      const sedeConocida = sedeTexto ? co.sedes.find(s => normSede(s) === normSede(sedeTexto)) : null;
      const sedeVal = sedeConocida || sedeTexto || co.sedes[0];
      if (sedeTexto && !sedeConocida) {
        errores.push(`fila ${fila}: SEDE "${sedeTexto}" no está en la configuración de ${empresaKey}; se conservó tal cual (agrégala en Administración → Empresas si es correcta)`);
      } else if (!sedeTexto) {
        errores.push(`fila ${fila}: sin SEDE, se asignó ${sedeVal}`);
      }

      const fechaTexto = (r['FECHA DE ULTIMA CALIBRACION'] ?? '').toString().trim();
      const fechaUltimaCalibracion = parseExcelDate(r['FECHA DE ULTIMA CALIBRACION']);
      if (fechaTexto && !fechaUltimaCalibracion) {
        errores.push(`fila ${fila}: fecha de última calibración inválida, se dejó vacía`);
      }

      imported.push({
        ...newEquipo(empresaKey),

        sede: sedeVal,

        equipo: nombreEquipo,
        marca: r.MARCA || '',
        modelo: r.MODELO || '',

        numeroSerie: r['NUMERO DE SERIE'] || '',
        registroInvima: r['REGISTRO INVIMA'] || '',

        clasificacionRiesgo:
          r['CLASIFICACION DE RIESGO'] || 'IIB',

        inventario: r.INVENTARIO || '',

        periodicidadMantenimiento:
          r['PERIODICIDAD DE MANTENIMIENTO'] || 'Anual',

        periodicidadCalibracion:
          r['PERIODICIDAD DE CALIBRACION'] || 'ANUAL',
        aplicaCalibracion:
          (r['PERIODICIDAD DE CALIBRACION'] || 'ANUAL') !== 'N/A',

        ubicacion: r['UBICACIÓN'] || '',

        fechaUltimaCalibracion,

        estado: r.ESTADO || 'Operativo',

        certificadoUrl:
          r['CERTIFICADO DE CALIBRACION'] || '',

        observaciones:
          r.OBSERVACIONES || '',
      });
    });

    if (imported.length === 0) {
      alert(errores.length
        ? `No se importó ningún equipo:\n\n${errores.join('\n')}`
        : 'El archivo no tiene filas con el campo EQUIPO lleno.');
      return;
    }

    setEquipos(prev => [...prev, ...imported]);

    const idsImportados = new Set(
      imported.map(e => e.id)
    );

    crearEquipos(imported).then(() => {
      const resumen = `Se importaron ${imported.length} equipo${imported.length !== 1 ? 's' : ''} correctamente.`;
      alert(errores.length ? `${resumen}\n\nFilas con observaciones:\n${errores.join('\n')}` : resumen);
    }).catch(err => {
      console.error(
        'No se pudo importar los equipos al servidor compartido',
        err
      );

      setEquipos(prev =>
        prev.filter(e => !idsImportados.has(e.id))
      );
      alert('No se pudo guardar la importación en la base de datos compartida. Verifica tu conexión e intenta de nuevo.');
    });

  } catch (err) {
    console.error('Error al importar el archivo Excel:', err);
    alert(
      'No se pudo importar el archivo Excel. Verifica que sea un archivo .xlsx válido.'
    );
  }
};

  /* ---------------------------------------------------------------- */
  return (
    <div className={`flex flex-col h-dvh overflow-hidden font-sans ${t.bg} ${t.text}`} style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {entorno && entorno !== 'production' && (
        // Preview/development usan su propio espacio de datos (ver lib/db.js): se avisa para
        // que nadie confunda una URL de pruebas con el sistema real.
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 text-2xs font-semibold text-white" style={{ background: '#7C3AED' }}>
          <AlertTriangle size={12} /> Entorno de pruebas ({entorno}) — los datos de aquí NO son los de producción
        </div>
      )}
      {readOnly && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 text-2xs font-semibold text-white" style={{ background: '#B45309' }}>
          <Lock size={12} /> Usuario de solo lectura — no se pueden guardar cambios
        </div>
      )}
      {/* ENCABEZADO DE LA PLATAFORMA — todas las pantallas; en <lg además abre el menú lateral */}
      <PlatformHeader t={t} dark={dark} user={user} rolLabel={ROLE_LABELS[user.role] || user.role} empresaLabel={moduloDeMenu(menu) === 'rrhh' ? nombreEmpresaRRHH(rrhhEmpresa) : empresaLabel}
        seccion={seccion} logo={logoIngenieriaClinica}
        notificaciones={puedeAbrir('fallas') ? nuevosReportes : null}
        onNotificaciones={puedeAbrir('fallas') ? () => setMenu('fallas') : undefined}
        modulosHabilitados={MODULOS.filter(m => permitidos.has(m.key)).length}
        onLogout={onLogout} onOpenMenu={() => setMobileNavOpen(true)} onInicio={irAlInicioDelModulo} />

      <div className="flex flex-1 min-h-0 relative">
      {/* BACKDROP — solo mientras el drawer móvil está abierto */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      )}

      {/* SIDEBAR — escritorio: columna fija en el flujo normal, oculta en <lg */}
      <div className={`hidden lg:flex lg:w-56 lg:shrink-0 border-r flex-col ${t.panel} ${t.border}`}
        style={!dark ? { background: SIDEBAR_GRADIENT_LIGHT } : undefined}>
        <SidebarNav menu={menu} onNavigate={navegarDesdeMenu} itemsModulo={itemsMenuModulo} nuevosReportes={nuevosReportes} accent={accent} accentBg={accentBg}
          t={t} dark={dark} setDark={setDark} onLogout={onLogout} readOnly={readOnly} />
      </div>

      {/* SIDEBAR — móvil: drawer superpuesto, invisible por completo en lg+ */}
      <div className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 border-r flex flex-col ${t.panel} ${t.border}`}
        style={{
          transform: mobileNavOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 300ms cubic-bezier(0.23,1,0.32,1)',
          ...(!dark ? { background: SIDEBAR_GRADIENT_LIGHT } : {}),
        }}>
        <SidebarNav menu={menu} onNavigate={(k) => { navegarDesdeMenu(k); setMobileNavOpen(false); }} itemsModulo={itemsMenuModulo} nuevosReportes={nuevosReportes} accent={accent} accentBg={accentBg}
          t={t} dark={dark} setDark={setDark} onLogout={onLogout} readOnly={readOnly} onCloseMobile={() => setMobileNavOpen(false)} />
      </div>

      {/* MAIN */}
      <div className="flex-1 relative overflow-hidden">
        <AmbientBackground theme={theme} dark={dark} conLogo={moduloDeMenu(menu) !== 'rrhh'} />
        <div className="absolute inset-0 overflow-y-auto p-6">
        {/* Empresa pills — solo SUPER_ADMIN puede cambiar de empresa; un usuario de empresa
            ve únicamente la suya, fija. */}
        {!mostrarEmpresas ? null : !isSuper ? (
          <div className="flex gap-2 flex-wrap mb-5">
            <span className="px-3 min-h-11 flex items-center gap-1.5 rounded-full text-2xs font-mono border text-white font-semibold"
              style={{ background: companyOf(activeCompany)?.gradient, borderColor: companyOf(activeCompany)?.color }}>
              <Building2 size={12} /> {companyOf(activeCompany)?.nombre || activeCompany}
            </span>
          </div>
        ) : (
        <div className="flex gap-2 flex-wrap mb-5">
          <button onClick={() => changeCompany('TODAS')}
            className={`px-3 min-h-11 flex items-center rounded-full text-2xs font-mono border transition ${t.border}`}
            style={activeCompany === 'TODAS' ? { background: NEUTRAL_ACCENT + '1A', borderColor: NEUTRAL_ACCENT, color: NEUTRAL_ACCENT } : {}}>
            Todas las empresas
          </button>
          {COMPANIES.map(c => (
            <button key={c.key} onClick={() => changeCompany(c.key)}
              className={`px-3 min-h-11 flex items-center rounded-full text-2xs font-mono border transition ${activeCompany === c.key ? 'text-white font-semibold' : t.border}`}
              style={activeCompany === c.key ? { background: c.gradient, borderColor: c.color } : {}}>
              {c.nombre || c.key}{c.estado === 'inactivo' ? ' (inactiva)' : ''}
            </button>
          ))}
        </div>
        )}

        {moduloInfo?.key === 'rrhh' && permitidos.has('rrhh') && (
          <React.Suspense fallback={<div className={`py-24 text-center text-sm ${t.muted}`}>Cargando Gestión Humana…</div>}>
            <GestionHumana t={t} user={user} readOnly={readOnly} empresaLabel={nombreEmpresaRRHH(rrhhEmpresa)} empresa={rrhhEmpresa}
              empresas={EMPRESAS_RRHH}
              onCambiarEmpresa={isSuper ? setRrhhEmpresa : undefined}
              seccion={rrhhNav.seccion} onSeccion={(k) => setRrhhNav(v => ({ ...v, seccion: k }))} navegacion={rrhhNav.n} />
          </React.Suspense>
        )}
        {moduloInfo && !(moduloInfo.key === 'rrhh' && permitidos.has('rrhh')) && (
          <ModuloInfoPage key={moduloInfo.key} modulo={moduloInfo} t={t} permitido={permitidos.has(moduloInfo.key)} canOpen={puedeAbrir} onNavigate={navegar} />
        )}
        {menu === 'dashboard' && <Dashboard equipos={equipos} reportesFalla={reportesFalla} activeCompany={activeCompany} accent={accent} theme={theme} t={t} readOnly={readOnly} onGoAlerts={readOnly ? undefined : () => setMenu('alertas')} onGoFallas={readOnly ? undefined : () => setMenu('fallas')} onGoInventario={() => setMenu('inventario')} />}
        {menu === 'alertas' && !readOnly && <AlertasPage equipos={equipos} activeCompany={activeCompany} onChangeEmpresa={changeCompany} t={t} onOpen={setDrawerId} />}
        {menu === 'empresas' && isSuper && <EmpresasPage equipos={equipos} t={t} onSelect={(k) => { changeCompany(k); setMenu('inventario'); }} />}
        {(menu === 'inventario' || ((menu === 'mantenimientos' || menu === 'calibraciones' || menu === 'correctivos') && !readOnly)) && (
          <InventarioPage
            mode={menu} equipos={filtered} t={t} accent={accent} accentBg={accentBg}
            filters={filters} setFilters={setFilters} onChangeSede={changeSede} search={search} setSearch={setSearch}
            searchText={searchText} setSearchText={setSearchText}
            sort={sort} setSort={setSort} uniqueVals={uniqueVals} activeCompany={activeCompany}
            onOpen={setDrawerId} onObs={setObsModalId} selectedId={drawerId}
            onAdd={addEquipo} onDuplicate={duplicateEquipo} onRemove={removeEquipo}
            onExport={exportExcel} onImport={importExcel} readOnly={readOnly}
            onClearFilters={() => {
              setActiveCompany('TODAS');
              setFilters({ sede: '', ubicacion: '', estado: '', marca: '', clasificacion: '' });
              setSearch('');
              setSearchText('');
              setSort({ key: 'equipo', dir: 1 });
            }}
          />
        )}
        {menu === 'fallas' && !readOnly && <ReportesFallaPage reportes={reportesFalla} equipos={equipos} activeCompany={activeCompany} t={t} accent={accent} onUpdate={updateReporte} onEliminarReporte={eliminarReporte} onVaciarHistorial={vaciarHistorialFallas} readOnly={readOnly} />}
        {menu === 'planes' && <PlanesProgramasPage planesProgramas={planesProgramas} activeCompany={activeCompany} t={t} onUpdate={updatePlanPrograma} readOnly={readOnly} />}
        {menu === 'capacitaciones' && (
          <CapacitacionesPage capacitaciones={capacitaciones} activeCompany={activeCompany} onChangeEmpresa={setActiveCompany} t={t} accent={accent}
            onActualizar={actualizarCapacitaciones} sincronizando={capSincronizando} syncStatus={capSyncStatus} readOnly={readOnly || !isSuper} />
        )}
        {menu === 'tecnovigilancia' && <TecnovigilanciaPage transversal={tecnoTransversal} reportes={tecnoReportes} activeCompany={activeCompany} t={t} accent={accent} onUpdateTransversal={updateTecnoTransversal} onUpdateReporte={updateTecnoReporte} readOnly={readOnly} />}
        {menu === 'personal' && <PersonalPage personal={personal} activeCompany={activeCompany} t={t} accent={accent} onAdd={addPersonal} onUpdate={updatePersonal} readOnly={readOnly} />}
        {menu === 'limpieza' && (
          <LimpiezaDesinfeccionPage data={limpiezaDesinfeccion} activeCompany={activeCompany} t={t} accent={accent} onUpdate={updateLimpiezaDesinfeccion}
            plantillas={limpiezaPlantillas} onUploadPlantilla={subirLimpiezaPlantilla} onDeletePlantilla={eliminarLimpiezaPlantilla} readOnly={readOnly} />
        )}
        {menu === 'configuracion' && isSuper && <ConfigPage t={t} onLogout={onLogout} />}
        {menu === 'admin_empresas' && isSuper && <AdminEmpresasPage t={t} accent={accent} onDataChanged={() => setDataVersion(v => v + 1)} />}
        {menu === 'admin_usuarios' && isSuper && <AdminUsuariosPage t={t} accent={accent} currentUserId={user.id} />}
        </div>
      </div>

      {drawerEquipo && <EquipoDrawer equipo={drawerEquipo} onClose={() => setDrawerId(null)} onUpdate={updateEquipo} t={t} readOnly={readOnly} />}
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
            ? 'Tu usuario es de solo lectura: puedes explorar el CMMS, pero no agregar equipos.'
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

  // Desglose por sede: equipos, alertas, bajas, fallas y calibraciones vencidas de cada sede
  // de la empresa activa. "Bajas" usa la misma definición de baja que ya usa el resto del
  // sistema (equipo.estado === 'Dado de baja' — así se marca un equipo al guardar su registro
  // de baja en la pestaña "Baja de Equipo", y así lo excluye buildAlerts de las alertas).
  const sedeBreakdown = isCompanyView
    ? companyOf(activeCompany).sedes.map((sede, i) => {
        const eqSede = scoped.filter(e => e.sede === sede);
        const repSede = reportesScoped.filter(r => r.sede === sede);
        return {
          sede, color: SEDE_SHADES[i % SEDE_SHADES.length],
          equipos: eqSede.length,
          alertas: buildAlerts(eqSede).length,
          bajas: eqSede.filter(e => e.estado === 'Dado de baja').length,
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

  return (
    <div>
      {alertCount > 0 && (
        <button onClick={onGoAlerts} className="w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-5 border text-left" style={{ background: '#F59E0B1A', borderColor: '#F59E0B' }}>
          <BellRing size={16} style={{ color: '#F59E0B' }} />
          <span className="text-xs font-semibold" style={{ color: '#F59E0B' }}>
            {alertCount} alerta{alertCount !== 1 ? 's' : ''} activa{alertCount !== 1 ? 's' : ''} — preventivos a {PREVENTIVO_ALERTA_DIAS} días de vencer o calibraciones próximas/vencidas.
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
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Bajas</th>
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
                    <td className="px-2 py-2 text-right font-mono" style={s.bajas > 0 ? { color: '#EF4444' } : {}}>{s.bajas}</td>
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
          <MiniRow label="Programados" value={prevProgramados} t={t} noTranslate />
          <MiniRow label="Ejecutados" value={prevEjecutados} t={t} color="#22C55E" noTranslate />
          <MiniRow label="Pendientes" value={Math.max(prevProgramados - prevEjecutados, 0)} t={t} color="#F59E0B" noTranslate />
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
            <select value={sede} onChange={e => setSede(e.target.value)} className={`rounded-md px-2 py-1 text-2xs border uppercase ${t.input}`}>
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
            <select value={sede} onChange={e => setSede(e.target.value)} className={`rounded-md px-2 py-1 text-2xs border uppercase ${t.input}`}>
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

function MiniRow({ label, value, t, color, noTranslate }) {
  return (
    <div className="flex items-center justify-between py-1 text-2xs">
      <span className={t.muted} {...(noTranslate ? { translate: 'no', lang: 'es' } : {})}>{label}</span>
      <span className="font-mono font-semibold" style={color ? { color } : {}}>{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PÁGINA: ALERTAS                                                    */
/* ---------------------------------------------------------------- */
function AlertasPage({ equipos, activeCompany, onChangeEmpresa, t, onOpen }) {
  const isCompanyView = activeCompany !== 'TODAS';
  // Filtro de sede — local a esta pantalla (no comparte estado con el de Inventario) y
  // depende de la empresa activa, misma jerarquía Empresa → Sede que ya exige Inventario: si
  // la sede guardada ya no pertenece a la empresa activa, se ignora en el render (derivado,
  // sin useEffect ni setState adicional) en vez de dejar una combinación inválida.
  const sedesDisponibles = isCompanyView ? companyOf(activeCompany).sedes : [];
  const [sedeFiltro, setSedeFiltro] = useState('');
  const sedeEfectiva = sedesDisponibles.includes(sedeFiltro) ? sedeFiltro : '';

  // KPI seleccionado (clic en una de las 4 tarjetas) — filtra únicamente la lista de detalle
  // de más abajo; null = mostrar todas las alertas del alcance actual (empresa + sede).
  const [filtroKpi, setFiltroKpi] = useState(null);

  let scoped = isCompanyView ? equipos.filter(e => e.empresa === activeCompany) : equipos;
  if (sedeEfectiva) scoped = scoped.filter(e => e.sede === sedeEfectiva);

  // buildAlerts sigue siendo la ÚNICA fuente de verdad para vencido/próximo (calibStatus +
  // estadoActualPreventivo, con la ventana de PREVENTIVO_ALERTA_DIAS/CALIBRACION_ALERTA_DIAS
  // de siempre) y ya excluye equipos dados de baja — nada de eso se duplica ni se reinterpreta
  // aquí, solo se agrupa su salida por tipo/empresa/sede.
  const alerts = buildAlerts(scoped);
  const calVencidas = alerts.filter(a => a.tipo === 'Calibración' && a.status === 'vencido');
  const calProximas = alerts.filter(a => a.tipo === 'Calibración' && a.status === 'proximo');
  const mantVencidos = alerts.filter(a => a.tipo === 'Preventivo' && a.status === 'vencido');
  const mantProximos = alerts.filter(a => a.tipo === 'Preventivo' && a.status === 'proximo');

  const KPIS = [
    { tipo: 'Calibración', status: 'vencido', label: 'Calibraciones vencidas', sub: 'Requieren atención inmediata', color: '#EF4444', list: calVencidas },
    { tipo: 'Calibración', status: 'proximo', label: 'Calibraciones próximas', sub: `≤ ${CALIBRACION_ALERTA_DIAS} días`, color: '#F59E0B', list: calProximas },
    { tipo: 'Preventivo', status: 'vencido', label: 'Mantenimientos vencidos', sub: 'Requieren atención inmediata', color: '#EF4444', list: mantVencidos },
    { tipo: 'Preventivo', status: 'proximo', label: 'Mantenimientos próximos', sub: `≤ ${PREVENTIVO_ALERTA_DIAS} días`, color: '#F59E0B', list: mantProximos },
  ];
  const toggleKpi = (k) => setFiltroKpi(f => (f && f.tipo === k.tipo && f.status === k.status) ? null : { tipo: k.tipo, status: k.status, label: k.label });

  // Alertas por empresa — SIEMPRE sobre las 5 empresas del catálogo (no solo la activa), para
  // poder comparar entre ellas; un clic en una fila cambia la empresa activa (misma acción que
  // los "pills" de arriba, vía onChangeEmpresa). Solo se muestra en "Todas las empresas": con
  // una sola empresa activa esta tabla tendría una única fila, redundante con los KPI de arriba.
  const porEmpresa = COMPANIES.map(c => {
    const a = buildAlerts(equipos.filter(e => e.empresa === c.key));
    return {
      empresa: c.key, color: c.color,
      calVencidas: a.filter(x => x.tipo === 'Calibración' && x.status === 'vencido').length,
      calProximas: a.filter(x => x.tipo === 'Calibración' && x.status === 'proximo').length,
      mantVencidos: a.filter(x => x.tipo === 'Preventivo' && x.status === 'vencido').length,
      mantProximos: a.filter(x => x.tipo === 'Preventivo' && x.status === 'proximo').length,
      total: a.length,
    };
  });

  // Alertas por sede — mismo catálogo companyOf(...).sedes que ya usa el "Desglose por sede"
  // del Dashboard: si la vista es una empresa, solo sus sedes; en "Todas las empresas", las de
  // las 5 empresas juntas (con su empresa visible, para no mezclarlas entre sí). Ordenada de
  // mayor a menor total para responder de un vistazo "¿cuál sede tiene más alertas?".
  const empresasParaSedes = isCompanyView ? [companyOf(activeCompany)] : COMPANIES;
  const porSede = empresasParaSedes
    .flatMap(c => c.sedes.map(sede => {
      const a = buildAlerts(equipos.filter(e => e.empresa === c.key && e.sede === sede));
      return {
        sede, empresa: c.key, color: c.color,
        calVencidas: a.filter(x => x.tipo === 'Calibración' && x.status === 'vencido').length,
        calProximas: a.filter(x => x.tipo === 'Calibración' && x.status === 'proximo').length,
        mantVencidos: a.filter(x => x.tipo === 'Preventivo' && x.status === 'vencido').length,
        mantProximos: a.filter(x => x.tipo === 'Preventivo' && x.status === 'proximo').length,
        total: a.length,
      };
    }))
    .sort((a, b) => b.total - a.total);

  // Relabeling puramente visual — buildAlerts sigue devolviendo 'Preventivo' (mismo valor que
  // usa el resto del sistema, p. ej. ReporteTecnicoButton); aquí solo se traduce a como lo pidió
  // ver el usuario ("Mantenimiento"), sin tocar la clasificación real en ningún otro lado.
  const TIPO_LABEL = { 'Calibración': 'Calibración', 'Preventivo': 'Mantenimiento' };
  const ESTADO_LABEL = {
    'Calibración': { vencido: 'Vencida', proximo: 'Próxima' },
    'Preventivo': { vencido: 'Vencido', proximo: 'Próximo' },
  };
  const badgeColor = (a) => a.status === 'vencido' ? '#EF4444' : '#F59E0B';
  const daysTxt = (a) => a.status === 'vencido'
    ? `${ESTADO_LABEL[a.tipo].vencido} hace ${Math.abs(a.diffDays)} días`
    : `Vence en ${a.diffDays} días`;

  const detalle = filtroKpi ? alerts.filter(a => a.tipo === filtroKpi.tipo && a.status === filtroKpi.status) : alerts;
  const detalleVencidas = detalle.filter(a => a.status === 'vencido');
  const detalleProximas = detalle.filter(a => a.status === 'proximo');

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 className="text-lg font-bold">Alertas</h1>
        {isCompanyView && sedesDisponibles.length > 0 && (
          <select value={sedeEfectiva} onChange={e => setSedeFiltro(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border uppercase ${t.input}`}>
            <option value="">Todas las sedes</option>
            {sedesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
      <p className={`text-xs mb-5 ${t.muted}`}>
        Centro de alertas de mantenimiento biomédico: calibraciones vencidas o próximas a vencer (≤{CALIBRACION_ALERTA_DIAS} días) y mantenimientos preventivos vencidos o próximos (≤{PREVENTIVO_ALERTA_DIAS} días).
      </p>

      {/* KPI — 4 categorías separadas explícitamente (nunca mezcladas); clic filtra el detalle de abajo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {KPIS.map(k => {
          const active = filtroKpi && filtroKpi.tipo === k.tipo && filtroKpi.status === k.status;
          return (
            <div key={`${k.tipo}-${k.status}`} className="rounded-xl" style={active ? { boxShadow: `0 0 0 2px ${k.color}` } : {}}>
              <HeroStat t={t} label={k.label} value={k.list.length} sub={k.sub} color={k.color} onClick={() => toggleKpi(k)} />
            </div>
          );
        })}
      </div>

      {/* Alertas por empresa — solo en "Todas las empresas" (con una activa sería una sola fila) */}
      {!isCompanyView && (
        <div className={`rounded-xl border p-4 mb-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-3">Alertas por empresa</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className={`border-b ${t.border}`}>
                  <th className={`text-left px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Empresa</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Cal. vencidas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Cal. próximas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Mant. vencidos</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Mant. próximos</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {porEmpresa.map(e => (
                  <tr key={e.empresa} onClick={() => onChangeEmpresa(e.empresa)} className={`border-b cursor-pointer hover:bg-white/5 ${t.border}`}>
                    <td className="px-2 py-2 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
                      {e.empresa}
                    </td>
                    <td className="px-2 py-2 text-right font-mono" style={e.calVencidas > 0 ? { color: '#EF4444' } : {}}>{e.calVencidas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={e.calProximas > 0 ? { color: '#F59E0B' } : {}}>{e.calProximas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={e.mantVencidos > 0 ? { color: '#EF4444' } : {}}>{e.mantVencidos}</td>
                    <td className="px-2 py-2 text-right font-mono" style={e.mantProximos > 0 ? { color: '#F59E0B' } : {}}>{e.mantProximos}</td>
                    <td className="px-2 py-2 text-right font-mono font-semibold">{e.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alertas por sede — sedes de la empresa activa, o de las 5 empresas si es "Todas" */}
      {porSede.length > 0 && (
        <div className={`rounded-xl border p-4 mb-5 ${t.panel} ${t.border}`}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-3">Alertas por sede{isCompanyView ? ` — ${activeCompany}` : ''}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className={`border-b ${t.border}`}>
                  <th className={`text-left px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Sede</th>
                  {!isCompanyView && <th className={`text-left px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Empresa</th>}
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Cal. vencidas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Cal. próximas</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Mant. vencidos</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Mant. próximos</th>
                  <th className={`text-right px-2 py-2 font-mono text-3xs uppercase ${t.muted}`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {porSede.map(s => (
                  <tr key={`${s.empresa}-${s.sede}`}
                    onClick={() => { if (!isCompanyView) onChangeEmpresa(s.empresa); setSedeFiltro(s.sede); }}
                    className={`border-b cursor-pointer hover:bg-white/5 ${t.border} ${isCompanyView && sedeEfectiva === s.sede ? 'font-semibold' : ''}`}>
                    <td className="px-2 py-2 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                      {s.sede}
                    </td>
                    {!isCompanyView && <td className="px-2 py-2">{s.empresa}</td>}
                    <td className="px-2 py-2 text-right font-mono" style={s.calVencidas > 0 ? { color: '#EF4444' } : {}}>{s.calVencidas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.calProximas > 0 ? { color: '#F59E0B' } : {}}>{s.calProximas}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.mantVencidos > 0 ? { color: '#EF4444' } : {}}>{s.mantVencidos}</td>
                    <td className="px-2 py-2 text-right font-mono" style={s.mantProximos > 0 ? { color: '#F59E0B' } : {}}>{s.mantProximos}</td>
                    <td className="px-2 py-2 text-right font-mono font-semibold">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isCompanyView && sedeEfectiva && (
            <button onClick={() => setSedeFiltro('')} className={`mt-3 text-2xs underline ${t.muted}`}>Quitar filtro de sede ({sedeEfectiva})</button>
          )}
        </div>
      )}

      {/* Detalle de alertas — respeta el KPI seleccionado arriba */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide">
          {filtroKpi ? `${filtroKpi.label} (${detalle.length})` : `Todas las alertas (${detalle.length})`}
        </div>
        {filtroKpi && <button onClick={() => setFiltroKpi(null)} className={`text-2xs underline ${t.muted}`}>← Ver todas las alertas</button>}
      </div>

      {detalle.length === 0 && <div className={`text-sm text-center py-10 ${t.muted}`}>No hay alertas activas en este momento 👍</div>}

      {detalleVencidas.length > 0 && (
        <div className="mb-6">
          <div className="text-2xs font-mono uppercase tracking-wide mb-2 text-red-400">Vencidas ({detalleVencidas.length})</div>
          <div className="space-y-2">
            {detalleVencidas.map((a, i) => (
              <div key={i} onClick={() => onOpen(a.equipoId)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`} style={{ borderLeftColor: badgeColor(a), borderLeftWidth: 3 }}>
                <Badge mono={false} color={badgeColor(a)}>{TIPO_LABEL[a.tipo]} · {ESTADO_LABEL[a.tipo][a.status]}</Badge>
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

      {detalleProximas.length > 0 && (
        <div>
          <div className="text-2xs font-mono uppercase tracking-wide mb-2 text-amber-400">Próximas a vencer ({detalleProximas.length})</div>
          <div className="space-y-2">
            {detalleProximas.map((a, i) => (
              <div key={i} onClick={() => onOpen(a.equipoId)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`} style={{ borderLeftColor: badgeColor(a), borderLeftWidth: 3 }}>
                <Badge mono={false} color={badgeColor(a)}>{TIPO_LABEL[a.tipo]} · {ESTADO_LABEL[a.tipo][a.status]}</Badge>
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

// Confirmación previa a eliminar un equipo del inventario — mismo patrón visual que
// DeleteDocumentDialog/EliminarFallaDialog (fondo oscuro + tarjeta + Cancelar/Eliminar).
function EliminarEquipoDialog({ equipo, onCancel, onConfirm, t }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className={`animate-modal-in relative w-full max-w-xs rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="text-sm font-bold mb-1">¿Está seguro de que desea eliminar este equipo?</div>
        <p className={`text-2xs mb-4 ${t.muted}`}>
          <strong>{equipo?.equipo || 'Este equipo'}</strong>{equipo?.numeroSerie ? ` (N° serie ${equipo.numeroSerie})` : ''} se eliminará del inventario. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" t={t} onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm}>Eliminar</Button>
        </div>
      </div>
    </div>
  );
}

function InventarioPage({ mode, equipos, t, accentBg, filters, setFilters, onChangeSede, search, setSearch, searchText, setSearchText, setSort, uniqueVals, onOpen, onObs, onAdd, onDuplicate, onRemove, onExport, onImport, activeCompany, onClearFilters, readOnly, selectedId }) {
  const year = new Date().getFullYear();
  const title = { inventario: 'Inventario de equipos', mantenimientos: 'Mantenimientos preventivos', calibraciones: 'Calibraciones', correctivos: 'Correctivos' }[mode];
  // Filtro por mes del mantenimiento — exclusivo de la vista "Mantenimientos preventivos",
  // no forma parte del objeto `filters` compartido porque no aplica a las demás vistas.
  const [filtroMes, setFiltroMes] = useState('');
  // Equipo pendiente de confirmar eliminación (null = sin diálogo abierto) — la eliminación
  // real sigue siendo `onRemove`, solo se pospone hasta que el usuario confirme.
  const [equipoAEliminar, setEquipoAEliminar] = useState(null);
  const hayFiltrosActivos = Boolean(
    (activeCompany && activeCompany !== 'TODAS') || search.trim() || searchText.trim() ||
    filters.sede || filters.ubicacion || filters.estado || filters.marca || filters.clasificacion || filtroMes
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
                <input type="file" accept=".xlsx" className="hidden"
                  onChange={e => { const f = e.target.files[0]; if (f) onImport(f); e.target.value = ''; }} />
              </label>
            )}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border ${t.border} ${t.panel}`}>
          <Search size={13} className={t.muted} />
          <select value={search} onChange={e => setSearch(e.target.value)} className={`bg-transparent text-xs w-40 outline-none ${t.text}`}>
            <option value="">Todos los equipos</option>
            {uniqueVals('equipo').map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border ${t.border} ${t.panel}`}>
          <Search size={13} className={t.muted} />
          <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Buscar equipo..."
            className={`bg-transparent text-xs w-48 outline-none ${t.text}`} />
          {searchText.trim() && (
            <button onClick={() => setSearchText('')} aria-label="Limpiar búsqueda" className={t.muted}><X size={13} /></button>
          )}
        </div>
        <select value={filters.sede} onChange={e => onChangeSede(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border uppercase ${t.input}`}>
          <option value="">Todas las sedes</option>
          {uniqueVals('sede').map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.ubicacion} onChange={e => setFilters({ ...filters, ubicacion: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda ubicación</option>
          {uniqueVals('ubicacion').map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.estado} onChange={e => setFilters({ ...filters, estado: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo estado</option>
          {(mode === 'mantenimientos' ? ESTADOS_MANTENIMIENTOS : ESTADOS_EQUIPO).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.marca} onChange={e => setFilters({ ...filters, marca: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda marca</option>
          {uniqueVals('marca').map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={filters.clasificacion} onChange={e => setFilters({ ...filters, clasificacion: e.target.value })} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda clasificación</option>
          {CLASIFICACIONES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {mode === 'mantenimientos' && (
          <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
            <option value="">Todo mes</option>
            {MONTHS.map(m => <option key={m.k} value={m.idx}>{m.full}</option>)}
          </select>
        )}
        {hayFiltrosActivos && (
          <Button variant="ghost" t={t} icon={X} iconSize={12} onClick={() => { onClearFilters(); setFiltroMes(''); }}>Limpiar filtros</Button>
        )}
      </div>

      {mode === 'inventario' && (
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-3xs ${t.muted}`}>
          {[
            { st: 'realizado', label: 'Realizado' },
            { st: 'programado', label: 'Programado' },
            { st: 'vencido', label: 'Vencido' },
            { st: 'no_aplica', label: 'Sin programación' },
          ].map(({ st, label }) => (
            <span key={st} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STATUS_HEX[st] }} />
              {label}
            </span>
          ))}
        </div>
      )}

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
                // Resalta la fila del equipo con la Hoja de Vida abierta y atenúa las demás —
                // `selectedId` es el mismo `drawerId` que ya decide qué equipo muestra el drawer,
                // así que el resaltado sigue automáticamente al abrir/cerrar/cambiar de equipo.
                const isSelected = selectedId === e.id;
                const isDimmed = Boolean(selectedId) && !isSelected;
                return (
                  <tr key={e.id} className={`border-b cursor-pointer transition-opacity duration-150 ${t.border} ${isSelected ? '' : 'hover:bg-white/5'} ${isDimmed ? 'opacity-40' : ''}`}
                    style={{ borderLeft: `3px solid ${co.color}`, background: isSelected ? `${co.color}1F` : undefined }} onClick={() => onOpen(e.id)}>
                    <td className="px-3 py-2 font-semibold">{e.equipo || '—'}</td>
                    <td className="px-3 py-2">{e.marca || '—'}</td>
                    <td className="px-3 py-2">{e.modelo || '—'}</td>
                    <td className="px-3 py-2">{e.numeroSerie || '—'}</td>
                    <td className="px-3 py-2">{e.registroInvima || '—'}</td>
                    <td className="px-3 py-2">{e.clasificacionRiesgo}</td>
                    <td className="px-3 py-2">{e.inventario || '—'}</td>
                    {MONTHS.map(m => {
                      const { status: st, fecha } = preventivoDelMes(e, m.idx, year);
                      const tip = `${STATUS_LABEL[st]}${fecha ? ' — ' + formatFechaCorta(fecha) : ''}`;
                      return <td key={m.k} className="px-2 py-2 text-center" title={tip}><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STATUS_HEX[st] }} role="img" aria-label={tip} /></td>;
                    })}
                    <td className="px-3 py-2 text-center">{aplicaCalibracionEfectiva(e) ? '✓' : '✗'}</td>
                    <td className="px-3 py-2 text-center">{e.aplicaPreventivo ? '✓' : '—'}</td>
                    <td className="px-3 py-2">{e.periodicidadMantenimiento || '—'}</td>
                    <td className="px-3 py-2">{e.periodicidadCalibracion || '—'}</td>
                    <td className="px-3 py-2">{e.ubicacion || '—'}</td>
                    <td className="px-3 py-2">{cs.next ? formatFechaCorta(cs.next) : '—'}</td>
                    <td className="px-3 py-2">
                      <Badge mono={false} color={e.estado === 'Operativo' ? '#22C55E' : e.estado === 'Dado de baja' ? '#EF4444' : '#F59E0B'}>{e.estado}</Badge>
                    </td>
                    <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => onObs(e.id)} title={e.observaciones?.trim() ? 'Observaciones registradas' : 'Observaciones'} aria-label="Observaciones" className="p-2.5 -m-1.5 flex items-center justify-center">
                          <MessageCircle size={14} className={e.observaciones?.trim() ? '' : t.muted} fill={e.observaciones?.trim() ? OBS_HIGHLIGHT_COLOR : 'none'} style={e.observaciones?.trim() ? { color: OBS_HIGHLIGHT_COLOR } : {}} />
                        </button>
                        {!readOnly && (
                          <>
                            <button onClick={() => onDuplicate(e)} title="Duplicar" aria-label="Duplicar" className="p-2.5 -m-1.5 flex items-center justify-center"><Copy size={13} className={t.muted} /></button>
                            <button onClick={() => setEquipoAEliminar(e)} title="Eliminar" aria-label="Eliminar" className="p-2.5 -m-1.5 flex items-center justify-center"><Trash2 size={13} className="text-red-400" /></button>
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
            .filter(p => filtroMes === '' || (p.fecha && new Date(p.fecha + 'T00:00:00').getMonth() === +filtroMes))
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .map((p, i) => (
              <div key={i} onClick={() => onOpen(p.equipoId)} className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer ${t.panel} ${t.border}`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.estado === 'Ejecutado' ? '#22C55E' : '#F59E0B' }} />
                <div className="flex-1">
                  <div className="text-xs font-semibold">{p.equipoNombre}</div>
                  <div className={`text-2xs ${t.muted}`}>{p.empresa} · {p.sede} · {p.responsable || 'sin responsable'}</div>
                </div>
                <div className="text-2xs font-mono">{formatFechaCorta(p.fecha)}</div>
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
                <div className="text-2xs font-mono">{formatFechaCorta(c.fecha)}</div>
              </div>
            ))}
        </div>
      )}

      {equipoAEliminar && (
        <EliminarEquipoDialog
          equipo={equipoAEliminar}
          t={t}
          onCancel={() => setEquipoAEliminar(null)}
          onConfirm={() => { onRemove(equipoAEliminar.id); setEquipoAEliminar(null); }}
        />
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
// Confirmación para "Vaciar histórico" — mismo patrón que DeleteDocumentDialog, pero
// advirtiendo que es TODO el histórico compartido, no un solo registro.
function VaciarHistorialFallasDialog({ total, onCancel, onConfirm, t }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className={`animate-modal-in relative w-full max-w-xs rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="text-sm font-bold mb-1">¿Vaciar todo el histórico de fallas?</div>
        <p className={`text-2xs mb-4 ${t.muted}`}>
          Se eliminarán los {total} reporte{total !== 1 ? 's' : ''} de falla de la base de datos compartida, para todos los usuarios. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" t={t} onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm}>Vaciar histórico</Button>
        </div>
      </div>
    </div>
  );
}

function EliminarFallaDialog({ equipoLabel, fecha, onCancel, onConfirm, t }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className={`animate-modal-in relative w-full max-w-xs rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="text-sm font-bold mb-1">¿Eliminar este reporte?</div>
        <p className={`text-2xs mb-4 ${t.muted}`}>
          El reporte de falla de <strong>{equipoLabel}</strong> ({fecha}) se eliminará de la base de datos compartida, para todos los usuarios. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" t={t} onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm}>Eliminar</Button>
        </div>
      </div>
    </div>
  );
}

function ReportesFallaPage({ reportes, equipos, activeCompany, t, accent, onUpdate, onEliminarReporte, onVaciarHistorial, readOnly }) {
  // El reporte solo guarda equipoId + equipoNombre (foto del nombre al momento de crearse) —
  // para mostrar marca/modelo/serie se consulta el inventario ACTUAL por id, sin tocar lo
  // que ya está guardado en el reporte. Si el equipo ya no existe en el inventario (borrado
  // después de reportarse la falla), se conserva el nombre guardado como respaldo.
  const equipoLabel = (r) => {
    const eq = equipos.find(e => e.id === r.equipoId);
    return eq ? equipoLabelCompleto(eq) : (r.equipoNombre || 'Equipo sin especificar');
  };

  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [openId, setOpenId] = useState(null);
  const [confirmarVaciar, setConfirmarVaciar] = useState(false);
  const [porEliminar, setPorEliminar] = useState(null); // reporte individual a confirmar

  // Respeta el contexto global de empresa (selector superior) y estado/prioridad,
  // ANTES del filtro de mes — así el conteo mensual de abajo siempre refleja los
  // otros filtros activos, y se puede ver el total de todos los meses a la vez.
  const baseList = reportes
    .filter(r => activeCompany === 'TODAS' || r.empresa === activeCompany)
    .filter(r => (!filtroEstado || r.estado === filtroEstado) && (!filtroPrioridad || r.prioridad === filtroPrioridad));

  const list = baseList
    .filter(r => filtroMes === '' || (r.fecha && new Date(r.fecha + 'T00:00:00').getMonth() === +filtroMes))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // Conteo de fallas reportadas por mes (todos los años juntos, mismo criterio que
  // el filtro de mes de arriba) — para el KPI y la gráfica mensual.
  const conteoPorMes = MONTHS.map(m => ({
    mes: m.l,
    idx: m.idx,
    total: baseList.filter(r => r.fecha && new Date(r.fecha + 'T00:00:00').getMonth() === m.idx).length,
  }));
  const totalMesSeleccionado = filtroMes !== '' ? (conteoPorMes.find(c => c.idx === +filtroMes)?.total || 0) : baseList.length;

  const openReport = (r) => {
    setOpenId(openId === r.id ? null : r.id);
    if (!r.visto && !readOnly) onUpdate({ ...r, visto: true });
  };

  // Fallas con tiempo de respuesta calculable — base de la gráfica "Tiempo de atención por falla".
  const resueltas = list.map(r => ({ r, ms: tiempoRespuestaMs(r) })).filter(x => x.ms !== null);

  // Gráfica: tiempo de atención por falla (equipo · fecha del reporte · horas que tardó).
  const datosTiempo = resueltas
    .map(({ r, ms }) => ({
      equipo: r.equipoNombre || 'Equipo sin especificar',
      fechaTxt: formatFechaHora(reporteTimestamps(r).inicio),
      horas: +(ms / 3600000).toFixed(1),
    }))
    .sort((a, b) => b.horas - a.horas)
    .slice(0, 8);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold mb-1">Reportes de falla</h1>
          <p className={`text-xs mb-4 ${t.muted}`}>Solicitudes enviadas por los coordinadores de sede.</p>
        </div>
        {!readOnly && reportes.length > 0 && (
          <Button variant="danger" icon={Trash2} iconSize={13} onClick={() => setConfirmarVaciar(true)}>
            Vaciar histórico
          </Button>
        )}
      </div>

      <div className="max-w-xs mb-3">
        <HeroStat t={t} label={filtroMes !== '' ? `Fallas en ${MONTHS[+filtroMes].full}` : 'Fallas reportadas (total)'} color={accent}
          value={totalMesSeleccionado}
          sub={filtroMes !== '' ? 'Clic en una barra para cambiar de mes' : 'Todos los meses'} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div className={`rounded-xl border p-4 ${t.panel} ${t.border}`}>
          <div className="text-3xs font-semibold uppercase tracking-wide mb-2" style={{ color: accent }}>Fallas reportadas por mes</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={conteoPorMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} width={24} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} fill={accent} cursor="pointer"
                onClick={(d) => setFiltroMes(f => f === String(d.idx) ? '' : String(d.idx))} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {datosTiempo.length > 0 && (
          <div className={`rounded-xl border p-4 ${t.panel} ${t.border}`}>
            <div className="text-3xs font-semibold uppercase tracking-wide mb-2" style={{ color: accent }}>Tiempo de atención por falla</div>
            <ResponsiveContainer width="100%" height={Math.max(120, datosTiempo.length * 26)}>
              <BarChart data={datosTiempo} layout="vertical" margin={{ left: 10, top: 2, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} unit="h" />
                <YAxis type="category" dataKey="equipo" tick={{ fontSize: 10, fill: '#94a3b8' }} width={100} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }}
                  formatter={(v) => [`${v} h`, 'Tiempo de atención']}
                  labelFormatter={(label, payload) => payload?.[0]?.payload ? `${label} · reportada ${payload[0].payload.fechaTxt}` : label} />
                <Bar dataKey="horas" radius={[0, 4, 4, 0]} barSize={14} fill={accent} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo estado</option>
          {REPORTE_ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filtroPrioridad} onChange={e => setFiltroPrioridad(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda prioridad</option>
          {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo mes</option>
          {MONTHS.map(m => <option key={m.k} value={m.idx}>{m.full}</option>)}
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
                <div className="text-xs font-semibold">{equipoLabel(r)}</div>
                <div className={`text-2xs ${t.muted}`}>{r.empresa} · {r.sede} · reportó {r.personaReporta || 'sin nombre'}</div>
              </div>
              <Badge color={REPORTE_ESTADO_HEX[r.estado]}>{r.estado}</Badge>
              <span className="text-2xs font-mono">{formatFechaCorta(r.fecha)}</span>
              {!readOnly && (
                <button onClick={(e) => { e.stopPropagation(); setPorEliminar(r); }} aria-label="Eliminar este reporte"
                  title="Eliminar este reporte" className="text-red-400 hover:text-red-300 p-1 shrink-0">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {openId === r.id && <ReporteFallaDetalle r={r} onUpdate={onUpdate} readOnly={readOnly} t={t} accent={accent} />}
          </div>
        ))}
      </div>

      {porEliminar && (
        <EliminarFallaDialog t={t} equipoLabel={equipoLabel(porEliminar)} fecha={formatFechaCorta(porEliminar.fecha)}
          onCancel={() => setPorEliminar(null)}
          onConfirm={() => { onEliminarReporte(porEliminar.id); setPorEliminar(null); }} />
      )}

      {confirmarVaciar && (
        <VaciarHistorialFallasDialog t={t} total={reportes.length}
          onCancel={() => setConfirmarVaciar(false)}
          onConfirm={() => { onVaciarHistorial(); setConfirmarVaciar(false); }} />
      )}
    </div>
  );
}

// Detalle expandido de un reporte de falla: estado, persona asignada y observaciones de
// la reparación se editan en un borrador local y solo se envían al guardar (antes cada
// tecla disparaba un PATCH; ahora el coordinador confirma explícitamente con "Guardar").
function ReporteFallaDetalle({ r, onUpdate, readOnly, t, accent }) {
  const [draft, setDraft] = useState({
    estado: r.estado, tecnicoAsignado: r.tecnicoAsignado || '', observacionesReparacion: r.observacionesReparacion || '',
  });
  const [guardado, setGuardado] = useState(false);

  // Si el reporte cambia desde afuera (otro usuario lo actualizó, o falló el guardado y
  // se revirtió), el borrador se realinea con el dato real — ajuste durante el render.
  const [prevReporte, setPrevReporte] = useState(r);
  if (r.estado !== prevReporte.estado || r.tecnicoAsignado !== prevReporte.tecnicoAsignado || r.observacionesReparacion !== prevReporte.observacionesReparacion) {
    setPrevReporte(r);
    setDraft({ estado: r.estado, tecnicoAsignado: r.tecnicoAsignado || '', observacionesReparacion: r.observacionesReparacion || '' });
  }

  const hayCambios = draft.estado !== r.estado || draft.tecnicoAsignado !== (r.tecnicoAsignado || '') || draft.observacionesReparacion !== (r.observacionesReparacion || '');

  const guardar = () => {
    onUpdate({
      ...r,
      estado: draft.estado, tecnicoAsignado: draft.tecnicoAsignado, observacionesReparacion: draft.observacionesReparacion,
      fechaCierre: draft.estado === 'Finalizado' ? (r.fechaCierre || todayISO()) : r.fechaCierre,
      fechaHoraSolucion: draft.estado === 'Finalizado' ? (r.fechaHoraSolucion || new Date().toISOString()) : r.fechaHoraSolucion,
    });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  };

  return (
    <div className={`p-3 border-t space-y-3 ${t.border} ${t.panel3}`}>
      <div>
        <div className="text-3xs uppercase text-slate-400 mb-1">Descripción</div>
        <div className="text-xs">{r.descripcion}</div>
      </div>

      {(() => {
        const { inicio, fin } = reporteTimestamps(r);
        const ms = tiempoRespuestaMs(r);
        return (
          <div className={`rounded-lg border p-3 grid grid-cols-3 gap-3 ${t.panel3} ${t.border}`}>
            <div>
              <div className="text-3xs uppercase text-slate-400 mb-1">Reportada</div>
              <div className="text-xs font-mono">{formatFechaHora(inicio) || '—'}</div>
            </div>
            <div>
              <div className="text-3xs uppercase text-slate-400 mb-1">Solucionada</div>
              {fin
                ? <div className="text-xs font-mono">{formatFechaHora(fin)}</div>
                : <div className="text-xs font-semibold" style={{ color: '#F59E0B' }}>Pendiente de solución</div>}
            </div>
            <div>
              <div className="text-3xs uppercase text-slate-400 mb-1">Tiempo de respuesta</div>
              <div className="text-xs font-mono font-semibold" style={ms !== null ? { color: '#22C55E' } : {}}>
                {ms !== null ? formatDuracion(ms) : '—'}
              </div>
            </div>
          </div>
        );
      })()}

      {r.adjuntos && r.adjuntos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.adjuntos.map((a, i) => (
            <PdfLink key={i} url={a.url} label={a.nombre || 'Ver PDF'} title={a.nombre || 'Ver adjunto'} t={t} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estado">
          <SelectInput t={t} value={draft.estado} options={REPORTE_ESTADOS} disabled={readOnly}
            onChange={v => setDraft({ ...draft, estado: v })} />
        </Field>
        <Field label="Persona asignada">
          <TextInput t={t} value={draft.tecnicoAsignado} disabled={readOnly} onChange={v => setDraft({ ...draft, tecnicoAsignado: v })} />
        </Field>
      </div>
      <Field label="Observaciones de la reparación">
        <textarea rows={3} value={draft.observacionesReparacion} disabled={readOnly}
          onChange={e => setDraft({ ...draft, observacionesReparacion: e.target.value })}
          className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input} ${readOnly ? 'opacity-60' : ''}`} />
      </Field>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button variant="primary" accent={accent} t={t} icon={Save} iconSize={13} disabled={!hayCambios} onClick={guardar}>Guardar</Button>
          {guardado && <span className="text-2xs font-semibold" style={{ color: '#22C55E' }}>Reporte guardado</span>}
        </div>
      )}
    </div>
  );
}

// Estado + acciones de un documento institucional con URL externa (Drive/OneDrive/etc.):
// punto de estado (🟢 disponible / ⚪ sin documento), botón "Ver documento" cuando existe,
// y "Cargar documento"/"Reemplazar" que abre un modo de edición puntual — la URL cruda
// nunca se muestra fuera de ese modo. Presentación únicamente: `onChange` sigue siendo el
// mismo callback de siempre que guarda la URL en su fuente de datos original, sin cambiar
// dónde ni cómo se almacena. Compartido por Planes y programas y Tecnovigilancia para no
// duplicar esta lógica.
function DocumentoEstadoAcciones({ url, onChange, readOnly, t, accent }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url || '');
  const tieneDocumento = Boolean((url || '').trim());

  const abrirEdicion = () => { setDraft(url || ''); setEditing(true); };
  const guardar = () => { onChange(draft.trim()); setEditing(false); };
  const cancelar = () => { setDraft(url || ''); setEditing(false); };

  return (
    <>
      <div className="flex items-center gap-1.5 text-2xs">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tieneDocumento ? '#22C55E' : '#94A3B8' }} />
        <span className={tieneDocumento ? 'font-medium' : t.muted}>{tieneDocumento ? 'Documento disponible' : 'Sin documento'}</span>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2 pt-1 border-t border-dashed border-slate-700/30">
          <TextInput t={t} value={draft} placeholder="https://drive.google.com/..." onChange={setDraft} />
          <div className="flex gap-2">
            <Button variant="primary" size="sm" accent={accent} icon={Save} iconSize={12} onClick={guardar}>Guardar</Button>
            <Button variant="outline" size="sm" t={t} icon={X} iconSize={12} onClick={cancelar}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap pt-1">
          {tieneDocumento && (
            <Button variant="outline" size="sm" t={t} icon={FileText} iconSize={12}
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Ver documento</Button>
          )}
          {!readOnly && (
            <Button variant={tieneDocumento ? 'ghost' : 'primary'} size="sm" accent={accent} t={t}
              icon={tieneDocumento ? Pencil : Upload} iconSize={12} onClick={abrirEdicion}>
              {tieneDocumento ? 'Reemplazar' : 'Cargar documento'}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

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

// Documentación institucional que NO es transversal: cada empresa tiene sus propios
// documentos de Mantenimiento y Capacitaciones, nunca mezclados entre sí. Distinta de
// la pestaña "Documentos" de cada equipo (esa es por equipo; esta es por empresa).
function PlanesProgramasPage({ planesProgramas, activeCompany, t, onUpdate, readOnly }) {
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

// Etiqueta visible del bucket OTRAS_EMPRESA (empresas que no matchean ninguna de las 5 del
// CMMS). "UT" (contratos ERON) ya NO cae acá — lib/capacitaciones.js la excluye por completo
// antes de que sus registros lleguen al snapshot, así que este bucket solo agruparía alguna
// otra empresa desconocida que aparezca a futuro en los formularios. El valor interno se
// mantiene sin traducir para que coincida exactamente con lo que produce el servidor.
const EMPRESA_LABEL = { [OTRAS_EMPRESA]: 'Otras' };
const CAP_PAGE_SIZE = 20;

// Aplica todos los filtros del dashboard de Capacitaciones excepto el que se indique en
// `skip` — así cada gráfica que desglosa por una dimensión (empresa, sede, capacitación)
// puede seguir mostrando esa dimensión completa aunque el usuario ya haya elegido un valor
// puntual en su propio selector (si no, "por sede" colapsaría a una sola barra en cuanto se
// filtra por sede).
function filtrarCapacitaciones(records, filtros, skip) {
  const { empresa, sede, capacitacion, anio, mes, desde, hasta } = filtros;
  return records.filter(r => {
    if (skip !== 'empresa' && empresa && empresa !== 'TODAS' && r.empresa !== empresa) return false;
    if (skip !== 'sede' && sede && r.sede !== sede) return false;
    if (skip !== 'capacitacion' && capacitacion && r.capacitacion !== capacitacion) return false;
    if (anio && r.fecha?.slice(0, 4) !== anio) return false;
    if (mes && String(Number(r.fecha?.slice(5, 7)) - 1) !== mes) return false;
    if (desde && (!r.fecha || r.fecha.slice(0, 10) < desde)) return false;
    if (hasta && (!r.fecha || r.fecha.slice(0, 10) > hasta)) return false;
    return true;
  });
}
// Identidad de una persona para contarla una sola vez como "capacitada": el correo (siempre
// lo recoge Google Forms de quien responde) o, a falta de correo, nombre+empresa. Distinto
// de "registros": cada fila es una asistencia puntual a UNA capacitación, así que la misma
// persona en 3 capacitaciones distintas suma 3 registros pero 1 sola persona.
const identidadDe = (r) => r.email || `${(r.nombre || '').toLowerCase()}|${r.empresa}`;

// Dashboard de "Capacitaciones": respuestas de los formularios de Google Forms del personal
// (ver api/capacitaciones.js). El selector de empresa global del CMMS (activeCompany) sigue
// siendo el filtro de empresa — se reutiliza en vez de duplicarlo — y además tiene sus
// propios filtros (sede, capacitación, año, mes, rango de fechas) y una tabla de detalle con
// búsqueda/orden/paginación. El botón "Actualizar información" dispara una sincronización en
// vivo contra Google Sheets (solo admin).
function CapacitacionesPage({ capacitaciones, activeCompany, onChangeEmpresa, t, accent, onActualizar, sincronizando, syncStatus, readOnly }) {
  // Memoizado porque `capacitaciones?.records || []` crearía un array `[]` nuevo en cada
  // render cuando aún no hay datos, invalidando los useMemo de abajo que dependen de esto.
  const registros = useMemo(() => capacitaciones?.records || [], [capacitaciones]);

  const [sede, setSede] = useState('');
  const [capacitacionSel, setCapacitacionSel] = useState('');
  const [anio, setAnio] = useState('');
  const [mes, setMes] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [sort, setSort] = useState({ key: 'fecha', dir: -1 });
  const [pagina, setPagina] = useState(1);

  const filtros = { empresa: activeCompany, sede, capacitacion: capacitacionSel, anio, mes, desde, hasta };
  const hayFiltrosActivos = Boolean(activeCompany !== 'TODAS' || sede || capacitacionSel || anio || mes || desde || hasta);

  // Opciones de cada selector: relativas solo a la empresa activa (no a los demás filtros
  // locales), para que elegir una capacitación puntual no borre las sedes disponibles.
  const porEmpresaBase = useMemo(
    () => activeCompany === 'TODAS' ? registros : registros.filter(r => r.empresa === activeCompany),
    [registros, activeCompany]
  );
  const sedesDisponibles = useMemo(() => [...new Set(porEmpresaBase.map(r => r.sede).filter(Boolean))].sort(), [porEmpresaBase]);
  const capacitacionesDisponibles = useMemo(() => [...new Set(porEmpresaBase.map(r => r.capacitacion).filter(Boolean))].sort(), [porEmpresaBase]);
  const aniosDisponibles = useMemo(
    () => [...new Set(porEmpresaBase.map(r => r.fecha?.slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [porEmpresaBase]
  );

  // `filtrados`: con TODOS los filtros — alimenta los KPI, la tabla y "por mes". Cada gráfica
  // de desglose usa además su propia variante que ignora su dimensión (ver filtrarCapacitaciones).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtrados = useMemo(() => filtrarCapacitaciones(registros, filtros, null), [registros, activeCompany, sede, capacitacionSel, anio, mes, desde, hasta]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paraPorEmpresa = useMemo(() => filtrarCapacitaciones(registros, filtros, 'empresa'), [registros, activeCompany, sede, capacitacionSel, anio, mes, desde, hasta]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paraPorSede = useMemo(() => filtrarCapacitaciones(registros, filtros, 'sede'), [registros, activeCompany, sede, capacitacionSel, anio, mes, desde, hasta]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paraPorCapacitacion = useMemo(() => filtrarCapacitaciones(registros, filtros, 'capacitacion'), [registros, activeCompany, sede, capacitacionSel, anio, mes, desde, hasta]);

  // Las 3 métricas que el módulo debe diferenciar: capacitaciones (temas distintos con al
  // menos una respuesta), registros (cada fila = una asistencia puntual) y personas
  // (identidades únicas) — quien asistió a 3 capacitaciones suma 3 registros pero 1 persona.
  // Se cuenta por `capacitacion` (el nombre/tema), no por `capacitacionId` (la hoja): así, dos
  // hojas con el mismo tema (p. ej. "PRE Radiadores..." y "POS Radiadores..." configuradas con
  // el mismo label) cuentan como UNA sola capacitación, no dos — a propósito, para poder
  // filtrarlas y seleccionarlas juntas como un único tema en el dashboard.
  const totalCapacitaciones = useMemo(() => new Set(filtrados.map(r => r.capacitacion)).size, [filtrados]);
  const totalRegistros = filtrados.length;
  const personasUnicas = useMemo(() => new Set(filtrados.map(identidadDe)).size, [filtrados]);
  const conPuntaje = useMemo(() => filtrados.filter(r => r.porcentaje != null), [filtrados]);
  const promedioPct = conPuntaje.length
    ? Math.round(conPuntaje.reduce((a, r) => a + r.porcentaje, 0) / conPuntaje.length)
    : null;

  const porEmpresa = useMemo(() => {
    const map = {};
    paraPorEmpresa.forEach(r => { map[r.empresa] = (map[r.empresa] || 0) + 1; });
    return [...COMPANIES.map(c => c.key), OTRAS_EMPRESA]
      .filter(k => map[k])
      .map(k => ({ name: EMPRESA_LABEL[k] || k, value: map[k], fill: (companyOf(k) || {}).color || '#94A3B8' }));
  }, [paraPorEmpresa]);

  const porSede = useMemo(() => {
    const map = {};
    paraPorSede.forEach(r => { if (r.sede) map[r.sede] = (map[r.sede] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [paraPorSede]);

  const porCapacitacion = useMemo(() => {
    const map = {};
    paraPorCapacitacion.forEach(r => { map[r.capacitacion] = (map[r.capacitacion] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [paraPorCapacitacion]);

  const porMes = useMemo(() => {
    const map = {};
    filtrados.forEach(r => {
      if (!r.fecha) return;
      const k = r.fecha.slice(0, 7); // "AAAA-MM"
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([k, value]) => {
      const [y, m] = k.split('-');
      return { name: `${MONTHS[Number(m) - 1]?.l || m} ${y.slice(2)}`, value };
    });
  }, [filtrados]);

  // La capacitación con el peor promedio de puntaje — señal de alerta para reforzar esa
  // capacitación puntual. Se exige un mínimo de respuestas para no alarmar con 1-2 casos.
  const peorCapacitacion = useMemo(() => {
    const map = {};
    filtrados.forEach(r => {
      if (r.porcentaje == null) return;
      (map[r.capacitacion] ||= []).push(r.porcentaje);
    });
    let peor = null;
    Object.entries(map).forEach(([name, arr]) => {
      if (arr.length < 3) return;
      const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      if (!peor || avg < peor.avg) peor = { name, avg };
    });
    return peor;
  }, [filtrados]);

  // Comparación PRE/POS: cuando dos hojas comparten el mismo `capacitacion` (label) pero una
  // trae fase "pre" y la otra "pos" (evaluación antes/después de la capacitación), empareja
  // las respuestas de la MISMA persona (misma identidad) en ambas fases para mostrar la
  // mejora. Los temas sin ambas fases, o sin pareja para una persona puntual, no generan fila
  // acá — igual siguen viéndose sueltos en la tabla de detalle de abajo, con su fase marcada.
  const comparacionPrePost = useMemo(() => {
    const porTema = {};
    filtrados.forEach(r => {
      if (r.fase !== 'pre' && r.fase !== 'pos') return;
      const grupo = (porTema[r.capacitacion] ||= { pre: new Map(), pos: new Map() });
      grupo[r.fase].set(identidadDe(r), r);
    });
    const filas = [];
    Object.entries(porTema).forEach(([tema, { pre, pos }]) => {
      pre.forEach((rPre, identidad) => {
        const rPos = pos.get(identidad);
        if (!rPos) return;
        const mejora = (rPre.porcentaje != null && rPos.porcentaje != null)
          ? Math.round((rPos.porcentaje - rPre.porcentaje) * 10) / 10
          : null;
        filas.push({ tema, nombre: rPre.nombre || rPos.nombre, empresa: rPre.empresa, pre: rPre.porcentaje, pos: rPos.porcentaje, mejora });
      });
    });
    return filas;
  }, [filtrados]);

  // Tabla de detalle: búsqueda de texto libre + orden por columna + paginación, sobre
  // `filtrados` (ya con todos los filtros del dashboard aplicados).
  const buscados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filtrados;
    return filtrados.filter(r =>
      [r.nombre, r.empresa, r.sede, r.capacitacion, r.cargo, r.email, r.documento].some(v => (v || '').toLowerCase().includes(q))
    );
  }, [filtrados, busqueda]);

  const ordenados = useMemo(() => {
    const { key, dir } = sort;
    const copia = [...buscados];
    copia.sort((a, b) => {
      if (key === 'porcentaje') return ((a.porcentaje || 0) - (b.porcentaje || 0)) * dir;
      return String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'es') * dir;
    });
    return copia;
  }, [buscados, sort]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / CAP_PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const filasPagina = ordenados.slice((paginaActual - 1) * CAP_PAGE_SIZE, paginaActual * CAP_PAGE_SIZE);

  const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  const limpiarFiltros = () => {
    onChangeEmpresa('TODAS'); setSede(''); setCapacitacionSel(''); setAnio(''); setMes(''); setDesde(''); setHasta('');
  };

  const ActualizarBtn = !readOnly && (
    <Button variant="outline" t={t} accent={accent} icon={RefreshCw} onClick={onActualizar} disabled={sincronizando}>
      {sincronizando ? 'Actualizando…' : 'Actualizar información'}
    </Button>
  );
  // Acceso directo y muy visible (variant="primary") a la plataforma externa de formación —
  // a pedido del usuario, un botón que abra ese sitio en una pestaña nueva desde Capacitaciones.
  const FormacionBtn = (
    <Button variant="primary" t={t} accent={accent} icon={ExternalLink}
      onClick={() => window.open('https://formacionbiomedica.wordpress.com/', '_blank', 'noopener,noreferrer')}>
      Formación Biomédica
    </Button>
  );
  const EstadoSync = (
    <>
      {sincronizando && (
        <div className="rounded-xl border p-3 mb-4 text-2xs" style={{ borderColor: `${accent}55`, background: `${accent}15`, color: accent }}>
          Actualizando…
        </div>
      )}
      {!sincronizando && syncStatus && (
        <div className="rounded-xl border p-3 mb-4 text-2xs"
          style={syncStatus.type === 'error'
            ? { borderColor: '#EF444455', background: '#EF444415', color: '#EF4444' }
            : { borderColor: '#22C55E55', background: '#22C55E15', color: '#22C55E' }}>
          {syncStatus.type === 'error' ? '⚠ ' : '✓ '}{syncStatus.message}
        </div>
      )}
    </>
  );

  if (!capacitaciones) {
    return (
      <div className={`rounded-xl border p-10 text-center ${t.panel} ${t.border}`}>
        <GraduationCap size={32} className={`mx-auto mb-3 ${t.muted}`} />
        <h2 className="text-sm font-bold mb-1">Aún no hay datos de capacitaciones sincronizados</h2>
        <p className={`text-xs mb-5 max-w-sm mx-auto ${t.muted}`}>
          {readOnly
            ? 'El administrador global debe sincronizar los datos desde los formularios.'
            : 'Presiona "Actualizar información" para traer las respuestas desde los formularios de Google.'}
        </p>
        {EstadoSync}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {FormacionBtn}
          {ActualizarBtn}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h1 className="text-lg font-bold">Capacitaciones</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {FormacionBtn}
          {ActualizarBtn}
        </div>
      </div>
      <p className={`text-xs mb-3 ${t.muted}`}>
        Respuestas de los formularios de capacitación del personal, sincronizadas desde Google Forms.
        {capacitaciones.updatedAt && ` Última actualización: ${formatFechaHora(capacitaciones.updatedAt)}.`}
      </p>

      {EstadoSync}

      {capacitaciones.errores?.length > 0 && (
        <div className="rounded-xl border p-3 mb-4 text-2xs" style={{ borderColor: '#F59E0B55', background: '#F59E0B15', color: '#F59E0B' }}>
          <div className="font-semibold mb-1">
            No se pudieron sincronizar {capacitaciones.errores.length} formulario{capacitaciones.errores.length !== 1 ? 's' : ''}:
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            {capacitaciones.errores.map(e => <li key={e.id}>{e.label}: {e.error}</li>)}
          </ul>
        </div>
      )}

      <div className={`rounded-xl border p-3 mb-4 flex flex-wrap items-center gap-2 ${t.panel} ${t.border}`}>
        <Filter size={13} className={t.muted} />
        {/* Reutiliza el mismo `activeCompany` que ya gobierna el resto del CMMS (pestañas
            superiores) — no es un filtro local aparte, para no tener dos fuentes de verdad
            de "empresa activa" que puedan quedar desincronizadas entre sí. */}
        <select value={activeCompany} onChange={e => onChangeEmpresa(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border font-semibold ${t.input}`}>
          <option value="TODAS">Todas las empresas</option>
          {COMPANIES.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
        </select>
        <select value={sede} onChange={e => setSede(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda sede</option>
          {sedesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={capacitacionSel} onChange={e => setCapacitacionSel(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Toda capacitación</option>
          {capacitacionesDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={anio} onChange={e => setAnio(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo año</option>
          {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={mes} onChange={e => setMes(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo mes</option>
          {MONTHS.map(m => <option key={m.k} value={m.idx}>{m.full}</option>)}
        </select>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`} title="Desde" />
        <span className={`text-2xs ${t.muted}`}>a</span>
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`} title="Hasta" />
        {hayFiltrosActivos && <Button variant="ghost" t={t} icon={X} iconSize={12} onClick={limpiarFiltros}>Limpiar filtros</Button>}
      </div>

      {filtrados.length === 0 ? (
        <div className={`rounded-xl border p-10 text-center ${t.panel} ${t.border}`}>
          <p className={`text-xs ${t.muted}`}>Sin registros de capacitaciones para los filtros actuales.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <HeroStat t={t} label="Capacitaciones realizadas" value={totalCapacitaciones} sub="temas distintos con respuestas" color={accent} />
            <HeroStat t={t} label="Registros / respuestas" value={totalRegistros} sub="asistencias registradas" color="#3B82F6" />
            <HeroStat t={t} label="Personas capacitadas" value={personasUnicas} sub="identidades únicas" color="#22C55E" />
            <HeroStat t={t} label="Promedio de puntaje" value={promedioPct != null ? `${promedioPct}%` : '—'}
              sub={`${conPuntaje.length} evaluaciones con puntaje`} color={promedioPct != null && promedioPct < 70 ? '#EF4444' : '#8B5CF6'} />
            <HeroStat t={t} label="Menor promedio" value={peorCapacitacion ? `${peorCapacitacion.avg}%` : '—'}
              sub={peorCapacitacion ? peorCapacitacion.name : 'Sin suficientes datos'} color="#F59E0B" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
              <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Registros por empresa</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={porEmpresa} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                    {porEmpresa.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
                {porEmpresa.map((e, i) => (
                  <span key={i} className="flex items-center gap-1 text-3xs">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.fill }} />
                    <span className={t.muted}>{e.name}</span>
                    <span className="font-mono font-semibold">{e.value}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
              <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Registros por sede</div>
              <ResponsiveContainer width="100%" height={Math.max(160, porSede.length * 24)}>
                <BarChart data={porSede} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={110} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14} fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className={`rounded-xl border p-5 ${t.panel} ${t.border}`}>
              <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Top capacitaciones por respuestas</div>
              <ResponsiveContainer width="100%" height={Math.max(160, porCapacitacion.length * 22)}>
                <BarChart data={porCapacitacion} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} width={130} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12} fill={accent} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`rounded-xl border p-5 mb-4 ${t.panel} ${t.border}`}>
            <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: accent }}>Registros por mes</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={porMes} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke={accent} strokeWidth={2.2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {comparacionPrePost.length > 0 && (
            <div className={`rounded-xl border overflow-hidden mb-4 ${t.panel} ${t.border}`}>
              <div className="p-5 pb-3">
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Comparación Pre / Post</div>
                <p className={`text-2xs mt-1 ${t.muted}`}>Mismo participante, evaluado antes y después de la capacitación — mejora en puntos porcentuales.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-2xs">
                  <thead>
                    <tr className={`text-left ${t.muted} border-t ${t.border}`}>
                      <th className="px-5 py-2 font-mono uppercase text-3xs">Capacitación</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Participante</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Empresa</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs text-right">Pre</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs text-right">Post</th>
                      <th className="px-3 py-2 pr-5 font-mono uppercase text-3xs text-right">Mejora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparacionPrePost.map((f, i) => (
                      <tr key={i} className={`border-t ${t.border}`}>
                        <td className="px-5 py-2">{f.tema}</td>
                        <td className="px-3 py-2">{f.nombre || '—'}</td>
                        <td className="px-3 py-2">{EMPRESA_LABEL[f.empresa] || f.empresa}</td>
                        <td className="px-3 py-2 text-right font-mono">{f.pre != null ? `${f.pre}%` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{f.pos != null ? `${f.pos}%` : '—'}</td>
                        <td className="px-3 py-2 pr-5 text-right font-mono font-semibold" style={{ color: f.mejora == null ? undefined : f.mejora >= 0 ? '#22C55E' : '#EF4444' }}>
                          {f.mejora != null ? `${f.mejora >= 0 ? '+' : ''}${f.mejora} pts` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={`rounded-xl border overflow-hidden ${t.panel} ${t.border}`}>
            <div className="flex items-center justify-between flex-wrap gap-2 p-5 pb-3">
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Detalle de registros</div>
              <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${t.input}`}>
                <Search size={12} className={t.muted} />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, empresa, sede..."
                  className="bg-transparent text-xs outline-none w-48" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-2xs">
                <thead>
                  <tr className={`text-left ${t.muted} border-t ${t.border}`}>
                    {[
                      { key: 'fecha', label: 'Fecha' },
                      { key: 'capacitacion', label: 'Capacitación' },
                      { key: 'fase', label: 'Fase' },
                      { key: 'nombre', label: 'Participante' },
                      { key: 'empresa', label: 'Empresa' },
                      { key: 'sede', label: 'Sede' },
                      { key: 'cargo', label: 'Área / cargo' },
                    ].map(h => (
                      <th key={h.key} onClick={() => toggleSort(h.key)} className="px-3 py-2 font-mono uppercase text-3xs cursor-pointer select-none first:pl-5">
                        <span className="inline-flex items-center gap-1">{h.label}<ArrowUpDown size={9} /></span>
                      </th>
                    ))}
                    <th onClick={() => toggleSort('porcentaje')} className="px-3 py-2 pr-5 font-mono uppercase text-3xs cursor-pointer select-none text-right">
                      <span className="inline-flex items-center gap-1 justify-end">Resultado<ArrowUpDown size={9} /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filasPagina.map(r => (
                    <tr key={r.id} className={`border-t ${t.border}`}>
                      <td className="px-5 py-2 font-mono whitespace-nowrap">{r.fecha ? formatFechaCorta(r.fecha) : '—'}</td>
                      <td className="px-3 py-2">{r.capacitacion}</td>
                      <td className="px-3 py-2">{r.fase ? <Badge color={r.fase === 'pre' ? '#F59E0B' : '#22C55E'}>{r.fase}</Badge> : '—'}</td>
                      <td className="px-3 py-2">{r.nombre || '—'}</td>
                      <td className="px-3 py-2">{EMPRESA_LABEL[r.empresa] || r.empresa}</td>
                      <td className="px-3 py-2">{r.sede || '—'}</td>
                      <td className="px-3 py-2">{r.cargo || '—'}</td>
                      <td className="px-3 py-2 pr-5 text-right font-mono">{r.asistencia || (r.porcentaje != null ? `${r.porcentaje}%` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={`flex items-center justify-between px-5 py-3 border-t text-2xs ${t.border} ${t.muted}`}>
              <span>{ordenados.length} registro{ordenados.length !== 1 ? 's' : ''} — página {paginaActual} de {totalPaginas}</span>
              <div className="flex items-center gap-1">
                {/* Se basan en `paginaActual` (ya acotado a totalPaginas), no en el estado crudo
                    `pagina`: si un filtro reduce los resultados, `pagina` puede quedar apuntando
                    más allá del final, y partir de ahí haría falta más de un clic para que
                    "Anterior" reaccione. Partir de paginaActual lo corrige en un solo clic. */}
                <button onClick={() => setPagina(Math.max(1, paginaActual - 1))} disabled={paginaActual <= 1}
                  className={`p-1 rounded-md border disabled:opacity-40 ${t.border}`}><ChevronLeft size={13} /></button>
                <button onClick={() => setPagina(Math.min(totalPaginas, paginaActual + 1))} disabled={paginaActual >= totalPaginas}
                  className={`p-1 rounded-md border disabled:opacity-40 ${t.border}`}><ChevronRight size={13} /></button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Tecnovigilancia: documentación transversal (compartida por todas las empresas) +
// reportes trimestrales que se consultan empresa → sede → año → trimestre.
function TecnovigilanciaPage({ transversal, reportes, activeCompany, t, accent, onUpdateTransversal, onUpdateReporte, readOnly }) {
  // El documento único compartido por todas las empresas solo lo edita el SUPER_ADMIN (la
  // API lo exige igual: 403 para cualquier otro rol).
  const isSuper = useContext(AuthUserContext)?.role === 'SUPER_ADMIN';
  const [empresaSelLocal, setEmpresaSelLocal] = useState(null);
  const [sedeSel, setSedeSel] = useState(null);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [openTrimestre, setOpenTrimestre] = useState(null);
  // Igual que en Planes y programas: con una empresa activa en el selector superior, los
  // reportes de tecnovigilancia quedan fijos en ella (sin selector propio desincronizado).
  // La documentación de arriba ahora también respeta esa misma empresa activa: cada
  // documento tiene su propia URL por empresa (ver api/tecno-transversal.js).
  const modoGlobal = activeCompany !== 'TODAS';
  const empresaSel = modoGlobal ? activeCompany : empresaSelLocal;

  // Lee la URL de un documento. Si `doc.porEmpresa` es false (p. ej. el formato de
  // INVIMA, único para las 5 empresas), ignora `empresaKey` y siempre devuelve el mismo
  // valor plano. Si es true, busca la URL de esa empresa puntual — `transversal[doc.key]`
  // también puede ser un string suelto (formato heredado, o resultado de la migración
  // desde localStorage): en ese caso se muestra como "por defecto" para cualquier empresa
  // que todavía no tenga su propia URL guardada.
  const urlDeDoc = (doc, empresaKey) => {
    const v = transversal[doc.key];
    // `_default`: valor compartido heredado que el servidor conserva cuando un documento
    // plano pasa al formato por empresa (ver api/tecno-transversal.js).
    if (!doc.porEmpresa) return (v && typeof v === 'object') ? (v._default || '') : (v || '');
    if (v && typeof v === 'object') return v[empresaKey] || v._default || '';
    return v || '';
  };
  // Si cambia la empresa activa del selector superior, se limpia la sede/trimestre ya
  // elegidos (ajuste de estado durante el render, como recomienda React, en vez de un efecto).
  const [prevActiveCompany, setPrevActiveCompany] = useState(activeCompany);
  if (activeCompany !== prevActiveCompany) {
    setPrevActiveCompany(activeCompany);
    setSedeSel(null);
    setOpenTrimestre(null);
  }

  // Los documentos únicos (porEmpresa: false) cuentan como 1 solo slot, sin importar
  // cuántas empresas haya; los documentos por empresa cuentan uno por cada empresa visible
  // (con una empresa activa, solo esa; en "todas las empresas", las 5).
  const empresasKpi = modoGlobal ? COMPANIES.filter(c => c.key === activeCompany) : COMPANIES;
  const cargadosTransversal = TECNO_DOCS.reduce((acc, d) => {
    if (!d.porEmpresa) return acc + (urlDeDoc(d) ? 1 : 0);
    return acc + (modoGlobal ? (urlDeDoc(d, activeCompany) ? 1 : 0) : COMPANIES.filter(c => urlDeDoc(d, c.key)).length);
  }, 0);
  const totalSlotsTransversal = TECNO_DOCS.reduce((acc, d) => acc + (d.porEmpresa ? empresasKpi.length : 1), 0);
  const totalCiudades = empresasKpi.reduce((acc, c) => acc + (TECNO_CIUDADES[c.key] || []).length, 0);
  const anioActual = new Date().getFullYear();
  let cargadosAnioActual = 0;
  empresasKpi.forEach(c => {
    (TECNO_CIUDADES[c.key] || []).forEach(ciudad => {
      const anioData = reportes?.[c.key]?.[ciudad]?.[anioActual];
      if (anioData) TECNO_TRIMESTRES.forEach(tr => { if (anioData[tr.key]) cargadosAnioActual++; });
    });
  });
  const totalSlotsAnioActual = totalCiudades * TECNO_TRIMESTRES.length;
  const pendientesAnioActual = totalSlotsAnioActual - cargadosAnioActual;

  const empresa = empresaSel ? companyOf(empresaSel) : null;
  const anioData = (empresaSel && sedeSel) ? (reportes?.[empresaSel]?.[sedeSel]?.[anio] || {}) : {};

  const resetSede = () => { setSedeSel(null); setOpenTrimestre(null); };
  const resetEmpresa = () => { setEmpresaSelLocal(null); setSedeSel(null); setOpenTrimestre(null); };

  return (
    <div>
      <h1 className="text-lg font-bold mb-1 flex items-center gap-2">
        <ShieldAlert size={19} style={{ color: accent }} /> Tecnovigilancia
      </h1>
      <p className={`text-xs mb-5 ${t.muted}`}>Documentación y reportes trimestrales de tecnovigilancia por empresa y ciudad/departamento.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <HeroStat t={t} label="Documentos" color={accent}
          value={`${cargadosTransversal}/${totalSlotsTransversal}`} sub={modoGlobal ? `cargados · ${activeCompany}` : 'cargados (todas las empresas)'} />
        <HeroStat t={t} label="Empresas" color={accent}
          value={empresasKpi.length} sub="con módulo de tecnovigilancia" />
        <HeroStat t={t} label="Reportes del año" color="#22C55E"
          value={cargadosAnioActual} sub={`${anioActual} · de ${totalSlotsAnioActual} esperados`} />
        <HeroStat t={t} label="Reportes pendientes" color="#F59E0B"
          value={pendientesAnioActual} sub={`${anioActual} · trimestres sin cargar`} />
      </div>

      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wide mb-3">Documentación</div>
        {/* Cada tarjeta representa un único documento+empresa: el documento único (INVIMA)
            y, para el documento por empresa, una tarjeta por cada empresa — todas del mismo
            tamaño, como hermanas en la misma cuadrícula. Así ninguna tarjeta queda obligada a
            estirarse a la altura de una vecina más alta (antes las 5 empresas vivían apiladas
            dentro de una sola tarjeta "Manual", mucho más alta que la de INVIMA al lado). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
          {TECNO_DOCS.flatMap(doc => {
            if (!doc.porEmpresa) {
              return [{
                cardKey: doc.key, icon: doc.icon, titulo: doc.label, subtitulo: 'Documento único (todas las empresas)',
                url: urlDeDoc(doc), onChange: v => onUpdateTransversal(doc.key, null, v), color: accent, soloSuperAdmin: true,
              }];
            }
            if (modoGlobal) {
              return [{
                cardKey: `${doc.key}-${activeCompany}`, icon: doc.icon, titulo: doc.label, subtitulo: activeCompany,
                url: urlDeDoc(doc, activeCompany), onChange: v => onUpdateTransversal(doc.key, activeCompany, v), color: accent,
              }];
            }
            return COMPANIES.map(c => ({
              cardKey: `${doc.key}-${c.key}`, icon: doc.icon, titulo: doc.label, subtitulo: c.key,
              url: urlDeDoc(doc, c.key), onChange: v => onUpdateTransversal(doc.key, c.key, v), color: c.color,
            }));
          }).map(card => {
            const Icon = card.icon;
            return (
              <div key={card.cardKey} className={`rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition ${t.panel} ${t.border}`}>
                <div className="h-1" style={{ background: card.color }} />
                <div className="p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: card.color + '1A', color: card.color }}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold wrap-break-word">{card.titulo}</div>
                      <div className="text-2xs mt-0.5 font-semibold" style={{ color: card.color }}>{card.subtitulo}</div>
                    </div>
                  </div>
                  <DocumentoEstadoAcciones url={card.url} onChange={card.onChange} readOnly={readOnly || (card.soloSuperAdmin && !isSuper)} t={t} accent={card.color} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide mb-3">Reportes de tecnovigilancia</div>

        {!empresaSel && (
          <div>
            <p className={`text-2xs mb-3 ${t.muted}`}>Selecciona una empresa para consultar sus reportes.</p>
            <div className="grid md:grid-cols-3 gap-4">
              {COMPANIES.map(c => {
                const ciudades = TECNO_CIUDADES[c.key] || [];
                return (
                  <button key={c.key} onClick={() => setEmpresaSelLocal(c.key)}
                    className={`text-left rounded-xl border overflow-hidden hover:-translate-y-0.5 transition ${t.panel} ${t.border}`}>
                    <div className="h-2" style={{ background: c.gradient }} />
                    <div className="p-5">
                      <div className="text-sm font-bold" style={{ color: c.color }}>{c.key}</div>
                      <div className={`text-2xs mt-1 ${t.muted}`}>{ciudades.length} ciudad{ciudades.length !== 1 ? 'es' : ''}/departamento{ciudades.length !== 1 ? 's' : ''}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {empresaSel && !sedeSel && (
          <div>
            {!modoGlobal && <button onClick={resetEmpresa} className={`text-2xs font-mono uppercase mb-3 hover:underline ${t.muted}`}>← Cambiar empresa</button>}
            <div className="text-sm font-bold mb-3" style={{ color: empresa.color }}>{empresa.key}</div>
            <p className={`text-2xs mb-3 ${t.muted}`}>Selecciona una ciudad/departamento.</p>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {(TECNO_CIUDADES[empresaSel] || []).map(ciudad => (
                <button key={ciudad} onClick={() => setSedeSel(ciudad)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left hover:-translate-y-0.5 transition ${t.panel} ${t.border}`}>
                  <MapPin size={15} style={{ color: empresa.color }} />
                  <span className="text-xs font-semibold">{ciudad}</span>
                </button>
              ))}
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
              <button onClick={() => setAnio(a => a - 1)} className={`w-7 h-7 flex items-center justify-center rounded-md border ${t.border} ${t.muted} hover:opacity-70`}>
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm font-bold font-mono">{anio}</span>
              <button onClick={() => setAnio(a => a + 1)} className={`w-7 h-7 flex items-center justify-center rounded-md border ${t.border} ${t.muted} hover:opacity-70`}>
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {TECNO_TRIMESTRES.map(tr => {
                const url = anioData[tr.key];
                const cargado = !!url;
                const open = openTrimestre === tr.key;
                return (
                  <div key={tr.key} className={`rounded-xl border overflow-hidden shadow-sm ${t.panel} ${t.border}`}>
                    <button onClick={() => setOpenTrimestre(open ? null : tr.key)} className="w-full text-left p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold">{tr.label}</span>
                        {cargado
                          ? <CheckCircle2 size={16} style={{ color: '#22C55E' }} />
                          : <AlertCircle size={16} style={{ color: '#F59E0B' }} />}
                      </div>
                      <span className="text-2xs font-medium" style={{ color: cargado ? '#22C55E' : '#F59E0B' }}>
                        {cargado ? 'Cargado' : 'Pendiente'}
                      </span>
                    </button>
                    {open && (
                      <div className={`p-3 border-t space-y-2 ${t.border} ${t.panel3}`}>
                        <TextInput t={t} value={url} disabled={readOnly} placeholder="URL del reporte"
                          onChange={v => onUpdateReporte(empresaSel, sedeSel, anio, tr.key, v)} />
                        <PdfLink url={url} t={t} title={`${tr.label} · ${sedeSel}`} emptyLabel="Documento no cargado" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Hojas de vida del personal — control sencillo de quién trabaja en cada empresa, su
// cargo y si ya tiene su hoja de vida (PDF) cargada. No es un módulo de RRHH: un solo
// documento por persona, sin diplomas/certificados/otros anexos.
function PersonalPage({ personal, activeCompany, t, accent, onAdd, onUpdate, readOnly }) {
  const [filtroNombre, setFiltroNombre] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroCargo, setFiltroCargo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Activo');
  const [openId, setOpenId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Respeta el contexto global de empresa: con una empresa activa, toda la página (KPI,
  // filtros y listado) queda restringida a ella — sin filtro propio desincronizado.
  const modoGlobal = activeCompany !== 'TODAS';
  const personalScoped = modoGlobal ? personal.filter(p => p.empresa === activeCompany) : personal;

  const activos = personalScoped.filter(p => p.estado === 'Activo');
  const cargadas = activos.filter(p => p.hojaVidaUrl).length;
  const pendientes = activos.length - cargadas;
  const empresasConPersonal = new Set(personalScoped.map(p => p.empresa)).size;

  const cargoOptions = [...new Set(personalScoped.map(p => p.cargo).filter(Boolean))].sort();

  const list = personalScoped
    .filter(p => !filtroNombre.trim() || (p.nombreCompleto || '').toLowerCase().includes(filtroNombre.trim().toLowerCase()))
    .filter(p => modoGlobal || !filtroEmpresa || p.empresa === filtroEmpresa)
    .filter(p => !filtroCargo || p.cargo === filtroCargo)
    .filter(p => !filtroEstado || p.estado === filtroEstado)
    .sort((a, b) => (a.nombreCompleto || '').localeCompare(b.nombreCompleto || ''));

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <IdCard size={19} style={{ color: accent }} /> Gestión de hojas de vida del personal
        </h1>
        {!readOnly && (
          <Button variant="primary" accent={accent} icon={Plus} onClick={() => setShowForm(true)}>Agregar personal</Button>
        )}
      </div>
      <p className={`text-xs mb-5 ${t.muted}`}>Consulta y gestión de las hojas de vida del personal activo.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <HeroStat t={t} label="Personal activo" color={accent} value={activos.length} sub="registrados como activos" />
        <HeroStat t={t} label="Hojas de vida cargadas" color="#22C55E" value={cargadas} sub="del personal activo" />
        <HeroStat t={t} label="Hojas de vida pendientes" color="#F59E0B" value={pendientes} sub="del personal activo" />
        <HeroStat t={t} label="Empresas" color={accent} value={empresasConPersonal} sub="con personal registrado" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={filtroNombre} onChange={e => setFiltroNombre(e.target.value)} placeholder="Buscar por nombre…"
            className={`rounded-md pl-7 pr-2.5 py-1.5 text-xs border ${t.input}`} />
        </div>
        {!modoGlobal && (
          <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
            <option value="">Toda empresa</option>
            {COMPANIES.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
          </select>
        )}
        <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo cargo</option>
          {cargoOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo estado</option>
          {ESTADOS_PERSONAL.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {list.length === 0 && <div className={`text-sm text-center py-10 ${t.muted}`}>Sin personal registrado con estos filtros.</div>}

      {/* Cada persona es una tarjeta compacta (avatar + nombre + cargo + estado), del mismo
          estilo usado en Planes y programas / Tecnovigilancia: barra de acento superior,
          bordes redondeados, altura según su propio contenido (no se estiran entre sí). Al
          abrir una para editar, ocupa el ancho completo de la fila para no apretar el
          formulario contra sus vecinas. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
        {list.map(p => {
          const empresaCfg = companyOf(p.empresa);
          const empresaColor = empresaCfg ? empresaCfg.color : '#64748B';
          const open = openId === p.id;
          const initials = (p.nombreCompleto || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
          return (
            <div key={p.id} className={`rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition ${t.panel} ${t.border} ${open ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
              <div className="h-1" style={{ background: empresaColor }} />
              <div onClick={() => setOpenId(open ? null : p.id)} className="p-3.5 flex items-center gap-3 cursor-pointer">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white" style={{ background: empresaColor }}>
                  {initials || <User size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{p.nombreCompleto || 'Sin nombre'}</div>
                  <div className={`text-2xs truncate ${t.muted}`}>{p.cargo || 'Cargo sin definir'}{p.profesion ? ` · ${p.profesion}` : ''}</div>
                </div>
              </div>
              <div className="px-3.5 pb-3 flex items-center gap-1.5 flex-wrap">
                <Badge color={empresaColor}>{p.empresa}</Badge>
                <Badge color={ESTADO_PERSONAL_HEX[p.estado]}>{p.estado}</Badge>
              </div>
              <div className="px-3.5 pb-3.5">
                <PdfLink url={p.hojaVidaUrl} t={t} label="Ver hoja de vida" title={`Hoja de vida — ${p.nombreCompleto}`} emptyLabel="Pendiente de hoja de vida" />
              </div>
              {open && (
                <div className={`p-3.5 border-t space-y-3 ${t.border} ${t.panel3}`}>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Nombre completo"><TextInput t={t} value={p.nombreCompleto} disabled={readOnly} onChange={v => onUpdate({ ...p, nombreCompleto: v })} /></Field>
                    <Field label="Cargo"><TextInput t={t} value={p.cargo} disabled={readOnly} onChange={v => onUpdate({ ...p, cargo: v })} /></Field>
                    <Field label="Profesión"><TextInput t={t} value={p.profesion} disabled={readOnly} onChange={v => onUpdate({ ...p, profesion: v })} /></Field>
                    <Field label="Registro INVIMA"><TextInput t={t} value={p.registroInvima} disabled={readOnly} placeholder="Si aplica" onChange={v => onUpdate({ ...p, registroInvima: v })} /></Field>
                    <Field label="Empresa">
                      <SelectInput t={t} value={p.empresa} disabled={readOnly} options={COMPANIES.map(c => c.key)} onChange={v => onUpdate({ ...p, empresa: v })} />
                    </Field>
                    <Field label="Tipo de documento">
                      <SelectInput t={t} value={p.tipoDocumento} disabled={readOnly} options={TIPOS_DOCUMENTO_PERSONAL} onChange={v => onUpdate({ ...p, tipoDocumento: v })} />
                    </Field>
                    <Field label="Número de documento"><TextInput t={t} value={p.numeroDocumento} disabled={readOnly} onChange={v => onUpdate({ ...p, numeroDocumento: v })} /></Field>
                    <Field label="Fecha de ingreso"><TextInput t={t} type="date" value={p.fechaIngreso} disabled={readOnly} onChange={v => onUpdate({ ...p, fechaIngreso: v })} /></Field>
                    <Field label="Estado">
                      <SelectInput t={t} value={p.estado} disabled={readOnly} options={ESTADOS_PERSONAL} onChange={v => onUpdate({ ...p, estado: v })} />
                    </Field>
                  </div>
                  <Field label="Hoja de vida (URL del PDF)">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex-1 min-w-55">
                        <TextInput t={t} value={p.hojaVidaUrl} disabled={readOnly} placeholder="URL del PDF" onChange={v => onUpdate({ ...p, hojaVidaUrl: v })} />
                      </div>
                      <PdfLink url={p.hojaVidaUrl} t={t} label="Ver hoja de vida" title={`Hoja de vida — ${p.nombreCompleto}`} emptyLabel="Pendiente de hoja de vida" />
                    </div>
                  </Field>
                  <Field label="PDF del Registro INVIMA (opcional)">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex-1 min-w-55">
                        <TextInput t={t} value={p.registroInvimaUrl} disabled={readOnly} placeholder="URL del PDF" onChange={v => onUpdate({ ...p, registroInvimaUrl: v })} />
                      </div>
                      <PdfLink url={p.registroInvimaUrl} t={t} label="Ver registro INVIMA" title={`Registro INVIMA — ${p.nombreCompleto}`} emptyLabel="Documento no cargado" />
                    </div>
                  </Field>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showForm && !readOnly && (
        <PersonalFormModal t={t} accent={accent} activeCompany={activeCompany} onClose={() => setShowForm(false)}
          onSave={(record) => { onAdd(record); setShowForm(false); }} />
      )}
    </div>
  );
}

function PersonalFormModal({ t, accent, activeCompany, onClose, onSave }) {
  const [form, setForm] = useState(() => newPersonal(activeCompany && activeCompany !== 'TODAS' ? activeCompany : COMPANIES[0].key));
  const patch = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canSave = form.nombreCompleto.trim() && form.numeroDocumento.trim() && form.cargo.trim();

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`animate-modal-in relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl border p-5 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-3xs uppercase tracking-wide" style={{ color: accent }}>Nuevo registro</div>
            <div className="text-sm font-bold">Información del personal</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex items-center justify-center w-11 h-11 -mr-2 -mt-2"><X size={18} /></button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nombre completo"><TextInput t={t} value={form.nombreCompleto} placeholder="Nombre y apellidos" onChange={v => patch('nombreCompleto', v)} /></Field>
          <Field label="Tipo de documento"><SelectInput t={t} value={form.tipoDocumento} options={TIPOS_DOCUMENTO_PERSONAL} onChange={v => patch('tipoDocumento', v)} /></Field>
          <Field label="Número de documento"><TextInput t={t} value={form.numeroDocumento} onChange={v => patch('numeroDocumento', v)} /></Field>
          <Field label="Cargo"><TextInput t={t} value={form.cargo} placeholder="Ej. Ingeniero Biomédico" onChange={v => patch('cargo', v)} /></Field>
          <Field label="Profesión"><TextInput t={t} value={form.profesion} placeholder="Ej. Ingeniería Biomédica" onChange={v => patch('profesion', v)} /></Field>
          <Field label="Registro INVIMA"><TextInput t={t} value={form.registroInvima} placeholder="Si aplica" onChange={v => patch('registroInvima', v)} /></Field>
          <Field label="Empresa"><SelectInput t={t} value={form.empresa} options={COMPANIES.map(c => c.key)} onChange={v => patch('empresa', v)} /></Field>
          <Field label="Fecha de ingreso"><TextInput t={t} type="date" value={form.fechaIngreso} onChange={v => patch('fechaIngreso', v)} /></Field>
          <Field label="Estado"><SelectInput t={t} value={form.estado} options={ESTADOS_PERSONAL} onChange={v => patch('estado', v)} /></Field>
        </div>

        <div className="mt-3">
          <Field label="Cargar hoja de vida (URL del PDF)">
            <TextInput t={t} value={form.hojaVidaUrl} placeholder="https://…pdf" onChange={v => patch('hojaVidaUrl', v)} />
          </Field>
          <p className={`text-3xs mt-1 ${t.muted}`}>Pega el enlace del PDF de la hoja de vida. Puedes agregarlo después si aún no lo tienes.</p>
        </div>

        <div className="mt-3">
          <Field label="Cargar PDF del Registro INVIMA (opcional)">
            <TextInput t={t} value={form.registroInvimaUrl} placeholder="https://…pdf" onChange={v => patch('registroInvimaUrl', v)} />
          </Field>
          <p className={`text-3xs mt-1 ${t.muted}`}>Solo si el Registro INVIMA aplica a este profesional.</p>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" t={t} onClick={onClose}>Cancelar</Button>
          <Button variant="primary" accent={accent} disabled={!canSave} onClick={() => onSave(form)}>Guardar</Button>
        </div>
      </div>
    </div>
  );
}

// Formatos permitidos para la plantilla del formato de limpieza y desinfección — mismo set
// validado en el servidor (api/limpieza-plantillas.js). `accept` es lo que restringe el
// selector de archivos del navegador; `TIPOS` es lo que de verdad se valida antes de subir.
const PLANTILLA_LIMPIEZA_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx';
const PLANTILLA_LIMPIEZA_TIPOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
// 3 MB de archivo real: en base64 pesa ~33% más (~4 MB), quedando con margen bajo el límite
// de 4.5 MB que Vercel impone al cuerpo de una función serverless (api/limpieza-plantillas.js
// lo vuelve a validar del lado del servidor, no solo aquí).
const PLANTILLA_LIMPIEZA_MAX_BYTES = 3 * 1024 * 1024;

// Tarjeta de la plantilla del formato de limpieza y desinfección de UNA empresa — a
// diferencia del resto de "documentos" de la app (que solo guardan una URL externa), aquí el
// archivo se sube y se guarda de verdad (ver guardarLimpiezaPlantilla/loadLimpiezaPlantillas
// más arriba), reutilizando el mecanismo de Data URI base64 que ya existía para
// `archivoDatos`. Cargar/reemplazar/eliminar están gateados por `readOnly` en la UI (el rol
// LECTURA no ve esos botones) Y, además, el servidor (api/limpieza-plantillas.js) rechaza esas
// operaciones sin permiso de escritura o sobre otra empresa aunque alguien llame al endpoint
// directamente — la restricción no depende solo de ocultar el botón.
function PlantillaLimpiezaCard({ empresa, plantilla, onUpload, onDelete, readOnly, t }) {
  const [subiendo, setSubiendo] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState('');
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const inputRef = useRef(null);

  const tieneArchivo = !!plantilla?.archivoDatos;

  const handleFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (!PLANTILLA_LIMPIEZA_TIPOS.includes(file.type)) {
      setError('Formato no permitido. Solo se aceptan PDF, Word o Excel.');
      return;
    }
    if (file.size > PLANTILLA_LIMPIEZA_MAX_BYTES) {
      setError('El archivo supera el tamaño máximo permitido (3 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setSubiendo(true);
      setError('');
      try {
        await onUpload(empresa.key, { nombre: file.name, tipo: file.type, archivoDatos: ev.target.result });
      } catch (err) {
        setError(err.message || 'No se pudo cargar la plantilla.');
      } finally {
        setSubiendo(false);
      }
    };
    reader.onerror = () => setError('No se pudo leer el archivo.');
    reader.readAsDataURL(file);
  };

  const confirmarYEliminar = async () => {
    setEliminando(true);
    setError('');
    try {
      await onDelete(empresa.key);
      setConfirmarEliminar(false);
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la plantilla.');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className={`max-w-md rounded-xl border overflow-hidden shadow-sm ${t.panel} ${t.border}`}>
      <div className="h-1" style={{ background: empresa.color }} />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={18} style={{ color: empresa.color }} />
          <div className="text-xs font-semibold">Formato de limpieza y desinfección</div>
        </div>

        {tieneArchivo ? (
          <div className="space-y-2.5">
            <div className="flex items-start gap-2">
              <FileText size={14} className={`mt-0.5 shrink-0 ${t.muted}`} />
              <span className="text-xs font-medium wrap-break-word">{plantilla.nombre}</span>
            </div>
            {plantilla.updatedAt && (
              <div className={`text-3xs ${t.muted}`}>Actualizado {new Date(plantilla.updatedAt).toLocaleDateString('es-CO')}</div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" t={t} icon={Eye} iconSize={12} onClick={() => verPlantillaLimpieza(plantilla)}>Ver</Button>
              <Button variant="outline" size="sm" t={t} icon={Download} iconSize={12} onClick={() => descargarPlantillaLimpieza(plantilla)}>Descargar</Button>
            </div>
            {!readOnly && (
              <div className="flex flex-wrap items-center gap-2 pt-2 mt-1 border-t border-dashed border-slate-700/30">
                <Button variant="ghost" size="sm" t={t} icon={Upload} iconSize={12} disabled={subiendo}
                  onClick={() => inputRef.current?.click()}>{subiendo ? 'Cargando…' : 'Reemplazar'}</Button>
                {!confirmarEliminar ? (
                  <Button variant="outline" size="sm" t={t} icon={Trash2} iconSize={12} style={{ color: '#EF4444', borderColor: '#EF4444' }}
                    onClick={() => setConfirmarEliminar(true)}>Eliminar</Button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className={`text-3xs ${t.muted}`}>¿Eliminar?</span>
                    <Button variant="danger" size="sm" icon={Trash2} iconSize={12} disabled={eliminando} onClick={confirmarYEliminar}>
                      {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
                    </Button>
                    <Button variant="outline" size="sm" t={t} disabled={eliminando} onClick={() => setConfirmarEliminar(false)}>Cancelar</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className={`text-2xs mb-3 ${t.muted}`}>Esta empresa aún no tiene una plantilla cargada.</p>
            {!readOnly && (
              <Button variant="primary" accent={empresa.color} size="sm" icon={Upload} iconSize={12} disabled={subiendo}
                onClick={() => inputRef.current?.click()}>{subiendo ? 'Cargando…' : '+ Cargar plantilla'}</Button>
            )}
          </div>
        )}

        {!readOnly && (
          <input ref={inputRef} type="file" accept={PLANTILLA_LIMPIEZA_ACCEPT} className="hidden" onChange={handleFile} />
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-3xs text-red-500 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5 mt-2.5">
            <AlertTriangle size={11} className="shrink-0" /> {error}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PÁGINA: FORMATOS DE LIMPIEZA Y DESINFECCIÓN                        */
/* ---------------------------------------------------------------- */
// Un enlace externo (Drive/OneDrive/SharePoint) por sede · mes del año actual — nunca se
// sube el documento en sí, solo su URL. Tanto el enlace del mes como la plantilla por empresa
// respetan `readOnly` (rol LECTURA) y el aislamiento por empresa lo aplica la API.
function LimpiezaDesinfeccionPage({ data, activeCompany, t, accent, onUpdate, plantillas, onUploadPlantilla, onDeletePlantilla, readOnly }) {
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

          <div className="mb-6">
            <PlantillaLimpiezaCard empresa={empresa} plantilla={plantillas[empresaSel]}
              onUpload={onUploadPlantilla} onDelete={onDeletePlantilla} readOnly={readOnly} t={t} />
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

/* ---------------------------------------------------------------- */
/* PÁGINA: CONFIGURACIÓN                                              */
/* ---------------------------------------------------------------- */
/* ---------------------------------------------------------------- */
/* ADMINISTRACIÓN (solo SUPER_ADMIN) — EMPRESAS Y USUARIOS             */
/* ---------------------------------------------------------------- */
// Interfaz del módulo de administración multiempresa. Toda la autorización y validación
// real vive en api/admin.js (requireSuperAdmin + validaciones de lib/empresas.js y
// lib/usuarios.js); aquí solo se muestran los mensajes que devuelve el servidor.

// Llamada a la API de administración. Devuelve el JSON o lanza un Error con el mensaje del
// servidor y, si viene, el detalle por campo (err.details) para mostrarlo en el formulario.
async function adminApi(resource, { method = 'GET', id, body, query = {} } = {}) {
  const params = new URLSearchParams({ resource, ...(id ? { id } : {}), ...query });
  const res = await apiFetch(`/api/admin?${params.toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || MENSAJE_HTTP[res.status] || 'No se pudo completar la operación.');
    err.status = res.status;
    err.details = data.details || null;
    throw err;
  }
  return data;
}
const MENSAJE_HTTP = {
  401: 'Tu sesión expiró. Inicia sesión de nuevo.',
  403: 'No tienes permiso para realizar esta operación.',
  404: 'El registro ya no existe.',
  409: 'El registro entra en conflicto con uno existente.',
  422: 'Revisa los datos del formulario.',
  500: 'Error inesperado del servidor. Intenta de nuevo.',
};
const ESTADO_HEX = { activo: '#22C55E', inactivo: '#94A3B8' };

function AdminMensaje({ msg }) {
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

function FieldError({ error }) {
  return error ? <span className="text-3xs" style={{ color: '#DC2626' }}>{error}</span> : null;
}

function AdminModal({ t, accent, subtitulo, titulo, onClose, children, footer }) {
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

/* ---------- Empresas ---------- */

function EmpresaFormModal({ t, accent, empresa, onClose, onSaved }) {
  const editando = !!empresa;
  const [form, setForm] = useState(() => ({
    nombre: empresa?.nombre || '', nit: empresa?.nit || '', direccion: empresa?.direccion || '',
    telefono: empresa?.telefono || '', email: empresa?.email || '', estado: empresa?.estado || 'activo',
    color: empresa?.color || '#2F8FD1', sedes: (empresa?.sedes || []).join('\n'),
  }));
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const patch = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrores(e => ({ ...e, [k]: undefined })); };

  const guardar = async () => {
    const locales = {};
    if (!form.nombre.trim()) locales.nombre = 'Campo obligatorio.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) locales.email = 'Email no válido.';
    if (!form.sedes.split(/[\n,]/).some(x => x.trim())) locales.sedes = 'Agrega al menos una sede.';
    if (Object.keys(locales).length) { setErrores(locales); return; }
    setGuardando(true);
    setError('');
    try {
      const body = { ...form, sedes: form.sedes.split(/[\n,]/).map(x => x.trim()).filter(Boolean) };
      const data = editando
        ? await adminApi('empresas', { method: 'PATCH', id: empresa.id, body })
        : await adminApi('empresas', { method: 'POST', body });
      onSaved(data.empresa, editando);
    } catch (err) {
      setError(err.message);
      if (err.details) setErrores(err.details);
      setGuardando(false);
    }
  };

  return (
    <AdminModal t={t} accent={accent} subtitulo={editando ? `Editar empresa · ${empresa.id}` : 'Nueva empresa'} titulo="Información de la empresa" onClose={onClose}
      footer={<>
        <Button variant="outline" t={t} onClick={onClose}>Cancelar</Button>
        <Button variant="primary" accent={accent} icon={Save} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
      </>}>
      <AdminMensaje msg={error ? { type: 'error', text: error } : null} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nombre *"><TextInput t={t} value={form.nombre} onChange={v => patch('nombre', v)} /><FieldError error={errores.nombre} /></Field>
        <Field label="NIT / Identificador"><TextInput t={t} value={form.nit} onChange={v => patch('nit', v)} /><FieldError error={errores.nit} /></Field>
        <Field label="Dirección"><TextInput t={t} value={form.direccion} onChange={v => patch('direccion', v)} /><FieldError error={errores.direccion} /></Field>
        <Field label="Teléfono"><TextInput t={t} value={form.telefono} onChange={v => patch('telefono', v)} /><FieldError error={errores.telefono} /></Field>
        <Field label="Email"><TextInput t={t} type="email" value={form.email} onChange={v => patch('email', v)} /><FieldError error={errores.email} /></Field>
        <Field label="Estado"><SelectInput t={t} value={form.estado} options={['activo', 'inactivo']} onChange={v => patch('estado', v)} /></Field>
        <Field label="Color de la empresa">
          <div className="flex items-center gap-2">
            <input type="color" value={form.color} onChange={e => patch('color', e.target.value)} className="w-10 h-8 rounded border-0 bg-transparent" aria-label="Color" />
            <span className={`text-2xs font-mono ${t.muted}`}>{form.color}</span>
          </div>
          <FieldError error={errores.color} />
        </Field>
        <Field label="Sedes (una por línea) *">
          <textarea rows={4} value={form.sedes} onChange={e => patch('sedes', e.target.value)}
            className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input}`} />
          <FieldError error={errores.sedes} />
        </Field>
      </div>
      {!editando && <p className={`text-3xs mt-3 ${t.muted}`}>El identificador interno de la empresa se genera a partir del nombre y no cambia aunque luego se edite el nombre.</p>}
    </AdminModal>
  );
}

// Registros heredados (de antes de la arquitectura multiempresa) cuya empresa no coincide con
// ninguna empresa existente — el servidor los lista (migración 003) y aquí se asignan uno a uno.
function RegistrosSinEmpresa({ t, accent, empresas, onDataChanged }) {
  const [informe, setInforme] = useState(null);
  const [destino, setDestino] = useState({});
  const [msg, setMsg] = useState(null);
  const cargar = () => adminApi('sin-empresa').then(d => setInforme(d.informe)).catch(err => setMsg({ type: 'error', text: err.message }));
  useEffect(() => { cargar(); }, []);
  if (!informe || (informe.total === 0 && informe.clavesHuerfanas.length === 0)) return null;

  const asignar = async (item) => {
    const empresa = destino[`${item.coleccion}:${item.id}`];
    if (!empresa) return;
    try {
      const d = await adminApi('sin-empresa', { method: 'PATCH', body: { coleccion: item.coleccion, id: item.id, empresa } });
      setInforme(d.informe);
      setMsg({ type: 'success', text: 'Registro asignado correctamente.' });
      onDataChanged();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  return (
    <div className={`rounded-xl border p-4 mt-6 ${t.panel} ${t.border}`}>
      <div className="flex items-center gap-2 mb-1">
        <Link2 size={15} style={{ color: '#D97706' }} />
        <div className="text-xs font-semibold">Registros existentes sin empresa asignada ({informe.total})</div>
      </div>
      <p className={`text-2xs mb-3 ${t.muted}`}>
        Estos registros vienen de antes de la arquitectura multiempresa y su empresa no coincide con ninguna empresa registrada.
        No se borraron: solo el administrador global los ve hasta que se les asigne una empresa.
      </p>
      <AdminMensaje msg={msg} />
      <div className="space-y-2">
        {informe.items.map(item => {
          const k = `${item.coleccion}:${item.id}`;
          return (
            <div key={k} className={`flex flex-wrap items-center gap-2 text-2xs rounded-lg border px-3 py-2 ${t.border}`}>
              <Badge color="#D97706">{item.coleccion}</Badge>
              <span className="font-semibold flex-1 min-w-40">{item.etiqueta || item.id}</span>
              <span className={t.muted}>empresa actual: {item.empresaActual ? `"${item.empresaActual}"` : '(vacía)'}</span>
              <select value={destino[k] || ''} onChange={e => setDestino(d => ({ ...d, [k]: e.target.value }))}
                className={`rounded-md border px-2 py-1 text-2xs ${t.input}`} aria-label="Empresa destino">
                <option value="">Asignar a…</option>
                {empresas.filter(e => e.estado === 'activo').map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <Button size="sm" variant="primary" accent={accent} disabled={!destino[k]} onClick={() => asignar(item)}>Asignar</Button>
            </div>
          );
        })}
        {informe.clavesHuerfanas.map(c => (
          <div key={`${c.coleccion}:${c.empresaKey}`} className={`text-2xs rounded-lg border px-3 py-2 ${t.border} ${t.muted}`}>
            <Badge color="#D97706">{c.coleccion}</Badge> Documentos guardados bajo una empresa desconocida: <b>{c.empresaKey}</b> — requiere revisión manual (ver docs/multi-tenant.md).
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminEmpresasPage({ t, accent, onDataChanged }) {
  const [empresas, setEmpresas] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(null); // null | 'nueva' | empresa
  const [msg, setMsg] = useState(null);

  const cargar = () => adminApi('empresas')
    .then(d => setEmpresas(d.empresas))
    .catch(err => { setEmpresas([]); setMsg({ type: 'error', text: err.message }); });
  useEffect(() => { cargar(); }, []);

  // Tras cualquier cambio se recargan también las empresas que usa el resto de la app
  // (pestañas, selectores, formularios), así una empresa nueva aparece sin recargar la página.
  const refrescarGlobal = async () => {
    const d = await adminApi('empresas');
    setEmpresas(d.empresas);
    setCompanies(d.empresas);
    onDataChanged();
  };

  const toggleEstado = async (e) => {
    const nuevo = e.estado === 'activo' ? 'inactivo' : 'activo';
    if (nuevo === 'inactivo' && !window.confirm(`¿Desactivar ${e.nombre}? Sus usuarios no podrán iniciar sesión mientras esté inactiva.`)) return;
    try {
      await adminApi('empresas', { method: 'PATCH', id: e.id, body: { estado: nuevo } });
      setMsg({ type: 'success', text: `${e.nombre} quedó ${nuevo}.` });
      await refrescarGlobal();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const q = busqueda.trim().toLowerCase();
  const lista = (empresas || []).filter(e => !q || [e.nombre, e.nit, e.email, e.id].filter(Boolean).join(' ').toLowerCase().includes(q));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="text-3xs uppercase tracking-widest" style={{ color: accent }}>Administración</div>
          <h1 className="text-lg font-bold">Empresas</h1>
          <p className={`text-2xs ${t.muted}`}>Cada empresa ve y gestiona únicamente su propia información.</p>
        </div>
        <Button variant="primary" accent={accent} icon={Plus} onClick={() => setModal('nueva')}>Nueva empresa</Button>
      </div>
      <AdminMensaje msg={msg} />
      <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 mb-4 max-w-sm ${t.input}`}>
        <Search size={13} className={t.muted} />
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, NIT o email…"
          aria-label="Buscar empresas" className={`flex-1 min-w-0 bg-transparent text-xs outline-none ${t.text}`} />
      </div>

      {empresas === null ? (
        <div className={`text-xs ${t.muted}`}>Cargando empresas…</div>
      ) : lista.length === 0 ? (
        <div className={`text-xs ${t.muted}`}>No hay empresas que coincidan.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {lista.map(e => (
            <div key={e.id} className={`rounded-xl border overflow-hidden shadow-sm ${t.panel} ${t.border} ${e.estado !== 'activo' ? 'opacity-70' : ''}`}>
              <div className="h-1" style={{ background: e.color }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{e.nombre}</div>
                    <div className={`text-3xs font-mono ${t.muted}`}>ID: {e.id}{e.nit ? ` · NIT ${e.nit}` : ''}</div>
                  </div>
                  <Badge color={ESTADO_HEX[e.estado] || '#94A3B8'}>{e.estado}</Badge>
                </div>
                <div className={`text-2xs space-y-0.5 mb-3 ${t.muted}`}>
                  {e.direccion && <div className="flex items-center gap-1"><MapPin size={11} /> {e.direccion}</div>}
                  {(e.telefono || e.email) && <div>{[e.telefono, e.email].filter(Boolean).join(' · ')}</div>}
                  <div>{e.sedes.length} sede{e.sedes.length !== 1 ? 's' : ''} · <b>{e.usuarios}</b> usuario{e.usuarios !== 1 ? 's' : ''}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" t={t} icon={Pencil} onClick={() => setModal(e)}>Editar</Button>
                  <Button size="sm" t={t} icon={Power} onClick={() => toggleEstado(e)}>{e.estado === 'activo' ? 'Desactivar' : 'Activar'}</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {empresas && <RegistrosSinEmpresa t={t} accent={accent} empresas={empresas} onDataChanged={onDataChanged} />}

      {modal && (
        <EmpresaFormModal t={t} accent={accent} empresa={modal === 'nueva' ? null : modal} onClose={() => setModal(null)}
          onSaved={async (emp, editado) => {
            setModal(null);
            setMsg({ type: 'success', text: `Empresa ${emp.nombre} ${editado ? 'actualizada' : 'creada'} correctamente.` });
            await refrescarGlobal();
          }} />
      )}
    </div>
  );
}

/* ---------- Usuarios ---------- */

const ROLES_USUARIO = ['EMPRESA', 'LECTURA', 'SUPER_ADMIN'];

function UsuarioFormModal({ t, accent, usuario, empresas, onClose, onSaved }) {
  const editando = !!usuario;
  const activas = empresas.filter(e => e.estado === 'activo' || e.id === usuario?.empresa_id);
  const [form, setForm] = useState(() => ({
    nombre: usuario?.nombre || '', email: usuario?.email || '', password: '',
    role: usuario?.role || 'EMPRESA', empresa_id: usuario?.empresa_id || '', estado: usuario?.estado || 'activo',
  }));
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const patch = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrores(e => ({ ...e, [k]: undefined })); };
  const requiereEmpresa = form.role !== 'SUPER_ADMIN';

  const guardar = async () => {
    const locales = {};
    if (!form.nombre.trim()) locales.nombre = 'Campo obligatorio.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) locales.email = 'Email no válido.';
    if (!editando && form.password.length < 8) locales.password = 'Mínimo 8 caracteres.';
    if (editando && form.password && form.password.length < 8) locales.password = 'Mínimo 8 caracteres.';
    if (requiereEmpresa && !form.empresa_id) locales.empresa_id = 'La empresa es obligatoria para este rol.';
    if (Object.keys(locales).length) { setErrores(locales); return; }
    setGuardando(true);
    setError('');
    const body = { ...form, empresa_id: requiereEmpresa ? form.empresa_id : null };
    if (editando && !body.password) delete body.password;
    try {
      const data = editando
        ? await adminApi('usuarios', { method: 'PATCH', id: usuario.id, body })
        : await adminApi('usuarios', { method: 'POST', body });
      onSaved(data.usuario, editando);
    } catch (err) {
      setError(err.message);
      if (err.details) setErrores(err.details);
      setGuardando(false);
    }
  };

  return (
    <AdminModal t={t} accent={accent} subtitulo={editando ? 'Editar usuario' : 'Nuevo usuario'} titulo={editando ? usuario.nombre : 'Datos de acceso'} onClose={onClose}
      footer={<>
        <Button variant="outline" t={t} onClick={onClose}>Cancelar</Button>
        <Button variant="primary" accent={accent} icon={Save} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
      </>}>
      <AdminMensaje msg={error ? { type: 'error', text: error } : null} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nombre *"><TextInput t={t} value={form.nombre} onChange={v => patch('nombre', v)} /><FieldError error={errores.nombre} /></Field>
        <Field label="Email *"><TextInput t={t} type="email" value={form.email} onChange={v => patch('email', v)} /><FieldError error={errores.email} /></Field>
        <Field label={editando ? 'Nueva contraseña (opcional)' : 'Contraseña *'}>
          <TextInput t={t} type="password" value={form.password} placeholder={editando ? 'Dejar vacío para no cambiarla' : 'Mínimo 8 caracteres'} onChange={v => patch('password', v)} />
          <FieldError error={errores.password} />
        </Field>
        <Field label="Rol">
          <select value={form.role} onChange={e => patch('role', e.target.value)} className={`rounded-md border px-2.5 py-1.5 text-xs ${t.input}`}>
            {ROLES_USUARIO.map(r => <option key={r} value={r}>{ROLE_LABELS[r]} ({r})</option>)}
          </select>
          <FieldError error={errores.role} />
        </Field>
        <Field label={requiereEmpresa ? 'Empresa *' : 'Empresa'}>
          <select value={requiereEmpresa ? form.empresa_id : ''} disabled={!requiereEmpresa} onChange={e => patch('empresa_id', e.target.value)}
            className={`rounded-md border px-2.5 py-1.5 text-xs ${t.input} ${!requiereEmpresa ? 'opacity-60 cursor-not-allowed' : ''}`}>
            <option value="">{requiereEmpresa ? 'Selecciona una empresa…' : 'Todas (acceso global)'}</option>
            {activas.map(e => <option key={e.id} value={e.id}>{e.nombre}{e.estado !== 'activo' ? ' (inactiva)' : ''}</option>)}
          </select>
          <FieldError error={errores.empresa_id} />
        </Field>
        <Field label="Estado"><SelectInput t={t} value={form.estado} options={['activo', 'inactivo']} onChange={v => patch('estado', v)} /><FieldError error={errores.estado} /></Field>
      </div>
      <p className={`text-3xs mt-3 ${t.muted}`}>
        {form.role === 'SUPER_ADMIN'
          ? 'El super administrador tiene acceso global a todas las empresas y al módulo de administración.'
          : form.role === 'LECTURA'
            ? 'Solo puede consultar la información de su empresa; no puede crear ni modificar registros.'
            : 'Puede consultar y gestionar únicamente la información de su empresa.'}
        {editando && ' Si cambias la empresa, el rol, el estado o la contraseña, sus sesiones abiertas se cierran.'}
      </p>
    </AdminModal>
  );
}

function AdminUsuariosPage({ t, accent, currentUserId }) {
  const [usuarios, setUsuarios] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(null); // null | 'nuevo' | usuario
  const [msg, setMsg] = useState(null);

  const cargar = () => Promise.all([adminApi('usuarios'), adminApi('empresas')])
    .then(([u, e]) => { setUsuarios(u.usuarios); setEmpresas(e.empresas); })
    .catch(err => { setUsuarios([]); setMsg({ type: 'error', text: err.message }); });
  useEffect(() => { cargar(); }, []);

  const nombreEmpresa = (id) => empresas.find(e => e.id === id)?.nombre || id || '—';

  const cambiarEstado = async (u) => {
    const nuevo = u.estado === 'activo' ? 'inactivo' : 'activo';
    try {
      await adminApi('usuarios', { method: 'PATCH', id: u.id, body: { estado: nuevo } });
      setMsg({ type: 'success', text: `${u.nombre} quedó ${nuevo}.` });
      cargar();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  };
  const eliminar = async (u) => {
    if (!window.confirm(`¿Eliminar definitivamente al usuario ${u.nombre} (${u.email})? Si solo quieres bloquear su acceso, usa "Desactivar".`)) return;
    try {
      await adminApi('usuarios', { method: 'DELETE', id: u.id });
      setMsg({ type: 'success', text: `Usuario ${u.nombre} eliminado.` });
      cargar();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const q = busqueda.trim().toLowerCase();
  const lista = (usuarios || [])
    .filter(u => !filtroEmpresa || (filtroEmpresa === '__global' ? !u.empresa_id : u.empresa_id === filtroEmpresa))
    .filter(u => !q || [u.nombre, u.email, u.username].filter(Boolean).join(' ').toLowerCase().includes(q))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="text-3xs uppercase tracking-widest" style={{ color: accent }}>Administración</div>
          <h1 className="text-lg font-bold">Usuarios</h1>
          <p className={`text-2xs ${t.muted}`}>Cada usuario de empresa solo accede a la información de la empresa asignada.</p>
        </div>
        <Button variant="primary" accent={accent} icon={UserPlus} onClick={() => setModal('nuevo')}>Nuevo usuario</Button>
      </div>
      <AdminMensaje msg={msg} />
      <div className="flex flex-wrap gap-2 mb-4">
        <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 flex-1 min-w-48 max-w-sm ${t.input}`}>
          <Search size={13} className={t.muted} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre o email…"
            aria-label="Buscar usuarios" className={`flex-1 min-w-0 bg-transparent text-xs outline-none ${t.text}`} />
        </div>
        <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)} aria-label="Filtrar por empresa"
          className={`rounded-md border px-2.5 py-1.5 text-xs ${t.input}`}>
          <option value="">Empresa: Todas</option>
          <option value="__global">Acceso global (SUPER_ADMIN)</option>
          {empresas.map(e => <option key={e.id} value={e.id}>Empresa: {e.nombre}</option>)}
        </select>
      </div>

      {usuarios === null ? (
        <div className={`text-xs ${t.muted}`}>Cargando usuarios…</div>
      ) : (
        <div className={`rounded-xl border overflow-x-auto ${t.panel} ${t.border}`}>
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className={`text-left text-3xs uppercase tracking-wide ${t.muted} border-b ${t.border}`}>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Creado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={7} className={`px-3 py-6 text-center ${t.muted}`}>No hay usuarios que coincidan.</td></tr>
              )}
              {lista.map(u => {
                const esYo = u.id === currentUserId;
                return (
                  <tr key={u.id} className={`border-b last:border-0 ${t.border}`}>
                    <td className="px-3 py-2 font-semibold">{u.nombre}{esYo && <span className={`ml-1 text-3xs ${t.muted}`}>(tú)</span>}</td>
                    <td className="px-3 py-2">{u.email || u.username}</td>
                    <td className="px-3 py-2">{u.empresa_id ? nombreEmpresa(u.empresa_id) : <span className={t.muted}>Todas</span>}</td>
                    <td className="px-3 py-2"><Badge color={u.role === 'SUPER_ADMIN' ? '#7C3AED' : u.role === 'LECTURA' ? '#64748B' : '#0EA5E9'}>{u.role}</Badge></td>
                    <td className="px-3 py-2"><Badge color={ESTADO_HEX[u.estado] || '#94A3B8'}>{u.estado}</Badge></td>
                    <td className="px-3 py-2 whitespace-nowrap">{u.created_at ? formatFechaCorta(u.created_at) : '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" t={t} icon={Pencil} onClick={() => setModal(u)} title="Editar, cambiar empresa o rol">Editar</Button>
                        {!esYo && <Button size="sm" t={t} icon={Power} onClick={() => cambiarEstado(u)}>{u.estado === 'activo' ? 'Desactivar' : 'Activar'}</Button>}
                        {!esYo && <Button size="sm" variant="ghost" t={t} icon={Trash2} onClick={() => eliminar(u)} aria-label={`Eliminar ${u.nombre}`} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <UsuarioFormModal t={t} accent={accent} usuario={modal === 'nuevo' ? null : modal} empresas={empresas} onClose={() => setModal(null)}
          onSaved={(u, editado) => {
            setModal(null);
            setMsg({ type: 'success', text: `Usuario ${u.nombre} ${editado ? 'actualizado' : 'creado'} correctamente.` });
            cargar();
          }} />
      )}
    </div>
  );
}

function ConfigPage({ t, onLogout }) {
  return (
    <div>
      <h1 className="text-lg font-bold mb-1">Configuración</h1>
      <p className={`text-2xs mb-4 font-mono ${t.muted}`}>Versión del panel: {APP_BUILD}</p>

      <div className={`rounded-lg border p-4 max-w-md ${t.panel} ${t.border}`}>
        <div className="text-xs font-semibold mb-1">Sesión</div>
        <p className={`text-2xs mb-3 ${t.muted}`}>Cierra tu sesión en este navegador. Te pedirá usuario y contraseña de nuevo.</p>
        <Button variant="outline" t={t} onClick={onLogout}>Cerrar sesión</Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* WRAPPER DE ACCESO                                                  */
/* ---------------------------------------------------------------- */
export default function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}

function AppInner() {
  // session empieza en null ("verificando") — a propósito NO se lee de localStorage, que
  // cualquiera puede falsificar desde DevTools. La única fuente de verdad es la cookie de
  // sesión HttpOnly; le preguntamos al servidor quién es el usuario (rol y empresa_id los
  // decide el servidor) y qué empresas puede ver.
  //   null                       → verificando
  //   { authenticated: false }   → sin sesión
  //   { authenticated: true, user, empresas }
  const [session, setSession] = useState(null);
  const authed = session === null ? null : !!session.authenticated;
  const user = session?.user || null;
  const [publicView, setPublicView] = useState(null); // null | 'reporte'
  // Puerta de entrada pública: se muestra la landing antes del formulario de login.
  const [showLogin, setShowLogin] = useState(false);
  // Módulo elegido en la landing (p. ej. 'dashboard' = Biomédica, 'modulo_rrhh' = Gestión
  // Humana): tras iniciar sesión se entra directo a él en vez de al portal.
  const [destinoLogin, setDestinoLogin] = useState(null);
  // Aviso de cierre por inactividad y mensaje que se muestra luego en LoginScreen.
  const [sessionWarning, setSessionWarning] = useState(false);
  const [warningSegundos, setWarningSegundos] = useState(IDLE_WARNING_MS / 1000);
  const [sessionNotice, setSessionNotice] = useState('');

  // Mismo camino al cargar la página y justo después de un login exitoso: siempre se le
  // repregunta al servidor en vez de suponer el resultado.
  const checkSession = () => {
    fetch('/api/login')
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((data) => {
        if (data.authenticated && data.user) {
          claimDataCaches(data.user);
          setCompanies(data.empresas);
          setSession({ authenticated: true, user: data.user, empresas: data.empresas || [], entorno: data.entorno || 'production' });
        } else {
          setSession({ authenticated: false });
        }
      })
      .catch(() => setSession({ authenticated: false }));
  };

  useEffect(() => { checkSession(); }, []);

  // Cierre de sesión REAL: POST /api/logout destruye el token en Vercel KV y borra la cookie.
  // `motivo` (opcional) se muestra luego en la pantalla de login.
  const cerrarSesion = async (motivo = '') => {
    setSessionWarning(false);
    if (authed) {
      try { await fetch('/api/logout', { method: 'POST' }); } catch { /* igual limpiamos el estado local */ }
    }
    setCompanies(DEFAULT_COMPANIES.map(c => ({ id: c.key, nombre: c.key, color: c.color, sedes: c.sedes, logo: c.logo })));
    setSession({ authenticated: false });
    setSessionNotice(motivo);
  };

  // Cualquier 401 de la API (sesión expirada, usuario desactivado/eliminado o cambiado de
  // empresa por el administrador) devuelve al login — ver apiFetch.
  useEffect(() => {
    if (!authed) return undefined;
    const onUnauthorized = () => cerrarSesion('Tu sesión expiró o tus permisos cambiaron. Inicia sesión de nuevo.');
    window.addEventListener('cmms:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cmms:unauthorized', onUnauthorized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  useInactivityLogout({
    active: authed === true,
    onActivity: () => setSessionWarning(false),
    onWarn: () => { setWarningSegundos(IDLE_WARNING_MS / 1000); setSessionWarning(true); },
    onTimeout: () => cerrarSesion('Tu sesión se cerró automáticamente por inactividad.'),
  });

  // Cuenta regresiva SOLO visual del aviso (el cierre real lo dispara useInactivityLogout).
  useEffect(() => {
    if (!sessionWarning) return undefined;
    const id = setInterval(() => setWarningSegundos(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [sessionWarning]);

  if (publicView === 'reporte' && !authed) {
    return <ReporteFallaForm onBack={() => setPublicView(null)} />;
  }

  if (authed === null) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-sm text-slate-400">
        Verificando sesión…
      </div>
    );
  }

  if (!authed) {
    if (!showLogin && !sessionNotice) {
      return (
        <LandingPage onIniciarSesion={() => { setDestinoLogin(null); setShowLogin(true); }} onReportarFalla={() => setPublicView('reporte')}
          onIngresarModulo={(menu) => { setDestinoLogin(menu); setShowLogin(true); }} />
      );
    }
    return (
      <LoginScreen
        notice={sessionNotice}
        onLogin={() => { setSessionNotice(''); checkSession(); }}
        onReportarFalla={() => setPublicView('reporte')}
        onBack={sessionNotice ? undefined : () => { setShowLogin(false); setDestinoLogin(null); }}
        destinoLabel={nombreModuloDeMenu(destinoLogin)}
      />
    );
  }

  const readOnly = user.role === 'LECTURA';
  return (
    <AuthUserContext.Provider value={user}>
      <ReadOnlyContext.Provider value={readOnly}>
        {/* key: si cambia el usuario, MainApp se monta de cero (sin estado de otra sesión). */}
        <MainApp key={user.id} user={user} entorno={session.entorno} onLogout={() => { setDestinoLogin(null); cerrarSesion(); }} readOnly={readOnly} menuInicial={destinoLogin} />
        {sessionWarning && (
          <SessionWarningModal segundos={warningSegundos} onContinuar={() => setSessionWarning(false)} onCerrarAhora={() => cerrarSesion()} />
        )}
      </ReadOnlyContext.Provider>
    </AuthUserContext.Provider>
  );
}
