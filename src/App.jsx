import React, { useState, useEffect, useMemo, useRef, useContext } from 'react';
import {
  Search, Plus, Trash2, Copy, Download, Upload, Sun, Moon, X, Menu,
  MessageCircle, FileText, LayoutDashboard, Building2, ListTree, CalendarClock,
  ShieldCheck, Wrench, FileBarChart, Settings, ArrowUpDown, BellRing, AlertTriangle, Lock,
  User, Eye, EyeOff, FolderOpen, ShieldAlert, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle, BookOpen, MapPin, Cpu, Activity, Share2, HeartPulse, Database, ArrowRight,
  IdCard, Save, SprayCan, ClipboardList, Pencil, Filter, Zap, ExternalLink,
  GraduationCap, RefreshCw, Users, UserPlus, Power, UserCog, Link2
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
import { PREVENTIVO_ALERTA_DIAS, calibStatus, buildAlerts, aplicaCalibracionEfectiva } from './services/alertLogic';
import { preventivoDelMes } from './services/preventivoSchedule';
import { formatFechaCorta, formatFechaHora, todayISO } from './utils/fechas.js';
import { uid } from './utils/id.js';
import { DEFAULT_COMPANIES, COMPANIES, NEUTRAL_ACCENT, empresaToCompany, setCompanies, normSede, registrarSedesEnUso, companyOf, themeOf } from './data/empresas.js';
import { MONTHS, CLASIFICACIONES, ESTADOS_EQUIPO, ESTADOS_MANTENIMIENTOS, STATUS_HEX, STATUS_LABEL, CAL_HEX } from './data/equipos.js';
import { PRIORIDADES, PRIORIDAD_HEX, REPORTE_ESTADOS, REPORTE_ESTADO_HEX, equipoLabelCompleto } from './data/fallas.js';
// Plan de división de App.jsx (ver docs/ del proyecto): primitivas de interfaz sin lógica de
// negocio, y páginas pequeñas ya extraídas a sus propios archivos. El resto de la app sigue
// igual, solo cambió dónde vive el código.
import { Button, Badge, Field, TextInput, SelectInput, PdfLink, HeroStat, ClusterCard, MiniRow, DocumentoEstadoAcciones } from './components/ui.jsx';
import EmpresasPage from './components/empresas/EmpresasPage.jsx';
import AlertasPage from './components/dashboard/AlertasPage.jsx';
import PlanesProgramasPage from './components/planes-programas/PlanesProgramasPage.jsx';
import EquipoDrawer from './components/equipos/EquipoDrawer.jsx';
import ObsModal from './components/equipos/ObsModal.jsx';
import ReportesFallaPage from './components/reportes-falla/ReportesFallaPage.jsx';
import PersonalPage from './components/personal/PersonalPage.jsx';
import LimpiezaDesinfeccionPage from './components/limpieza/LimpiezaDesinfeccionPage.jsx';
// Logo institucional real (ring + wordmark ya integrados en el PNG) — reemplaza al
// LogoMark generado por código únicamente en la pantalla de inicio de sesión.
import logoIngenieriaClinica from './assets/logo-ingenieria-clinica.png';
import logoMacromed from './assets/logo-macromed.jpg';
// Fotos reales de equipos por especialidad — landing pública únicamente (sección
// "Especialidades"), tomadas del mismo banco de imágenes del proyecto v1.
import fotoHospitalizacion from './assets/equipos/hospitalizacion.webp';
import fotoUci from './assets/equipos/uci.webp';
import fotoLaboratorio from './assets/equipos/laboratorio.webp';
import fotoImagenologia from './assets/equipos/imagenologia.webp';
import fotoOdontologia from './assets/equipos/odontologia.webp';
import fotoQuirofano from './assets/equipos/quirofano.webp';
import fotoEquiposGenerales from './assets/equipos/equipos-generales.webp';

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

// Color fijo (independiente del tema de cada empresa) para resaltar el ícono de
// observaciones en el inventario cuando el equipo tiene una observación guardada.
const OBS_HIGHLIGHT_COLOR = '#F59E0B';

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

// El login ya NO se verifica aquí — antes AUTH_USER/AUTH_PASS vivían en este archivo,
// lo que significa que cualquiera podía leerlos abriendo "ver código fuente" en el
// navegador. Ahora la verificación real ocurre en el servidor (api/login.js), usando las
// variables de entorno AUTH_USER / AUTH_PASSWORD_HASH configuradas en Vercel.

// `guestHidden`: oculto para usuarios de SOLO LECTURA (rol LECTURA) — solo consulta, sin las
// secciones operativas/administrativas.
// `superOnly`: solo para SUPER_ADMIN (vista global de empresas, configuración y el grupo
// Administración). Ocultarlo del menú NO es la medida de seguridad: la API responde 403 igual.
// `group`: encabezado de sección en el sidebar.
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
  { key: 'admin_empresas', label: 'Empresas', icon: Building2, superOnly: true, group: 'Administración' },
  { key: 'admin_usuarios', label: 'Usuarios', icon: Users, superOnly: true, group: 'Administración' },
];

function newEquipo(empresaKey) {
  const c = companyOf(empresaKey) || COMPANIES[0];
  return {
    id: uid('eq'),
    empresa: c.key, sede: c.sedes[0],
    equipo: '', marca: '', modelo: '', numeroSerie: '', registroInvima: '',
    clasificacionRiesgo: 'IIB', inventario: '',
    propiedad: 'Propio',
    fechaInstalacion: '',
    fotografiaUrl: '', ubicacion: '', estado: 'Operativo', actaEntregaUrl: '', hojaVidaUrl: '',
    periodicidadMantenimiento: 'Anual', periodicidadCalibracion: 'ANUAL',
    aplicaCalibracion: true, aplicaPreventivo: true,
    fechaUltimaCalibracion: '', certificadoUrl: '', observaciones: '',
    preventivos: [], correctivos: [], calibraciones: [], instalaciones: [], documentos: [], bajas: [],
  };
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
// Acta de conformación de comités — un documento distinto por empresa, pero vive en la
// subsección "Comités de tecnovigilancia" (no en "Documentación" junto a TECNO_DOCS) por
// pedido explícito: temáticamente es del comité, no de la documentación general. Reutiliza
// el mismo mecanismo de URL-por-empresa (api/tecno-transversal.js) — ni el backend ni
// urlDeDoc() necesitan saber que este documento es "distinto" de los de TECNO_DOCS.
const TECNO_ACTA_COMITE_DOC = { key: 'actaConformacionComites', label: 'Acta de conformación de comités', icon: FileText, porEmpresa: true };
// Seguimiento de alertas sanitarias — mismo caso que el acta de arriba: un documento por
// empresa que vive en "Comités de tecnovigilancia" en vez de "Documentación".
const TECNO_SEGUIMIENTO_ALERTAS_DOC = { key: 'seguimientoAlertasSanitarias', label: 'Seguimiento de alertas sanitarias', icon: ShieldAlert, porEmpresa: true };

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

// Comités de tecnovigilancia — URL (+ nombre, fecha, estado, observaciones) de la reunión
// trimestral del comité de CADA EMPRESA (sin dimensión de sede, a diferencia de los reportes
// de arriba: un comité es uno solo por empresa·año·trimestre). Fuente de verdad COMPARTIDA:
// api/tecno-comites.js (Vercel KV).
const TECNO_COMITES_KEY = 'cmms-tecno-comites';
async function loadTecnoComites() {
  try {
    const res = await apiFetch('/api/tecno-comites');
    if (res.ok) {
      const { data } = await res.json();
      cacheSet(TECNO_COMITES_KEY, data);
      return data;
    }
    console.error('No se pudo consultar los comités de tecnovigilancia compartidos: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar los comités de tecnovigilancia compartidos', err);
  }
  return cacheGet(TECNO_COMITES_KEY, {});
}
// A diferencia de los demás actualizarX (edición optimista de un campo puntual), el guardado
// de un comité ocurre desde un formulario con botón «Guardar» explícito — así que aquí se
// espera la respuesta del servidor y se propaga el error tal cual para que el modal lo
// muestre (ver guardarComiteTecno / TecnoComiteModal), en vez de revertir en silencio.
async function actualizarTecnoComite(empresaKey, anio, trimestre, campos) {
  const res = await apiFetch('/api/tecno-comites', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresaKey, anio, trimestre, ...campos }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'No se pudo guardar el comité en la base de datos compartida.');
  }
  const { data } = await res.json();
  cacheSet(TECNO_COMITES_KEY, data);
  return data;
}
async function borrarTecnoComite(empresaKey, anio, trimestre) {
  const res = await apiFetch('/api/tecno-comites', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresaKey, anio, trimestre }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'No se pudo eliminar el comité.');
  }
  const { data } = await res.json();
  cacheSet(TECNO_COMITES_KEY, data);
  return data;
}
const TECNO_COMITE_ESTADOS = ['Pendiente', 'Programado', 'Realizado'];

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

// Plantilla del formato de limpieza y desinfección: UN enlace externo (Drive/OneDrive/
// SharePoint) por empresa — igual mecanismo que el resto de documentos de la app, nunca se
// sube el archivo en sí. Un registro de ANTES de este cambio (cuando sí se subía el archivo
// real, como Data URI base64) puede seguir viéndose con la forma vieja hasta que se guarde una
// URL nueva para esa empresa — ver DocumentoLimpiezaCard, que ofrece verlo/descargarlo una
// última vez antes de reemplazarlo. Fuente de verdad: api/limpieza-plantillas.js.
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
async function actualizarLimpiezaPlantilla(empresaKey, url) {
  const res = await apiFetch('/api/limpieza-plantillas', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresaKey, url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo guardar el enlace en la base de datos compartida.');
  }
  const { data } = await res.json();
  cacheSet(LIMPIEZA_PLANTILLAS_KEY, data);
  return data;
}

// Checklist de inventario de la dotación por consultorio — mismo mecanismo que la plantilla
// de arriba (un enlace por empresa), pero NO aplica a MACROMED (pedido explícito). Endpoint
// propio (api/checklist-dotacion.js) para mantener cada documento en su propia colección.
const CHECKLIST_DOTACION_KEY = 'cmms-checklist-dotacion';
async function loadChecklistDotacion() {
  try {
    const res = await apiFetch('/api/checklist-dotacion');
    if (res.ok) {
      const { data } = await res.json();
      cacheSet(CHECKLIST_DOTACION_KEY, data);
      return data;
    }
    console.error('No se pudo consultar los checklists de dotación: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar los checklists de dotación', err);
  }
  return cacheGet(CHECKLIST_DOTACION_KEY, {});
}
async function actualizarChecklistDotacion(empresaKey, url) {
  const res = await apiFetch('/api/checklist-dotacion', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresaKey, url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo guardar el enlace en la base de datos compartida.');
  }
  const { data } = await res.json();
  cacheSet(CHECKLIST_DOTACION_KEY, data);
  return data;
}

// Formato de temperatura y humedad — mismo mecanismo que los dos de arriba (un enlace por
// empresa), sin exclusiones (las 5 empresas). Endpoint propio (api/formato-temperatura-
// humedad.js) para mantener cada documento en su propia colección.
const FORMATO_TEMP_HUMEDAD_KEY = 'cmms-formato-temp-humedad';
async function loadFormatoTemperaturaHumedad() {
  try {
    const res = await apiFetch('/api/formato-temperatura-humedad');
    if (res.ok) {
      const { data } = await res.json();
      cacheSet(FORMATO_TEMP_HUMEDAD_KEY, data);
      return data;
    }
    console.error('No se pudo consultar los formatos de temperatura y humedad: respuesta', res.status);
  } catch (err) {
    console.error('No se pudo consultar los formatos de temperatura y humedad', err);
  }
  return cacheGet(FORMATO_TEMP_HUMEDAD_KEY, {});
}
async function actualizarFormatoTemperaturaHumedad(empresaKey, url) {
  const res = await apiFetch('/api/formato-temperatura-humedad', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresaKey, url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo guardar el enlace en la base de datos compartida.');
  }
  const { data } = await res.json();
  cacheSet(FORMATO_TEMP_HUMEDAD_KEY, data);
  return data;
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
  @media (prefers-reduced-motion: reduce) {
    .landing-reveal, .landing-glow, .landing-ring, .landing-float { animation: none; }
    .landing-btn, .landing-link::after, .landing-glass-light { transition: none; }
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

const LANDING_BENEFICIOS = [
  { icon: ListTree, titulo: 'Inventario siempre actualizado', texto: 'Conoce el estado, la ubicación y el responsable de cada equipo biomédico.' },
  { icon: ClipboardList, titulo: 'Hoja de vida completa', texto: 'Historial, documentos y trazabilidad de cada equipo en un solo lugar.' },
  { icon: CalendarClock, titulo: 'Mantenimiento preventivo', texto: 'Programa mantenimientos y evita fallas inesperadas con alertas automáticas.' },
  { icon: Wrench, titulo: 'Mantenimiento correctivo', texto: 'Registro de fallas, diagnóstico, repuestos y tiempos de respuesta.' },
  { icon: ShieldCheck, titulo: 'Calibraciones al día', texto: 'Control de vigencia y certificados de calibración de todo el inventario.' },
  { icon: ShieldAlert, titulo: 'Tecnovigilancia y reportes', texto: 'Reportes técnicos, indicadores y exportables en PDF y Excel.' },
];

const LANDING_FLUJO = [
  { icon: ListTree, label: 'Inventario' },
  { icon: ClipboardList, label: 'Hoja de Vida' },
  { icon: Wrench, label: 'Mantenimiento' },
  { icon: ShieldCheck, label: 'Calibración' },
  { icon: FileText, label: 'Documentación' },
  { icon: BellRing, label: 'Alertas' },
  { icon: FileBarChart, label: 'Reportes' },
];

const LANDING_MODULOS = [
  { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: ListTree, label: 'Inventario de equipos' },
  { icon: CalendarClock, label: 'Planes y programas' },
  { icon: Wrench, label: 'Mantenimiento correctivo' },
  { icon: ShieldCheck, label: 'Calibraciones' },
  { icon: IdCard, label: 'Personal técnico' },
  { icon: SprayCan, label: 'Limpieza y desinfección' },
  { icon: ShieldAlert, label: 'Tecnovigilancia' },
  { icon: FileBarChart, label: 'Reportes' },
];

// Fotos reales — mismo banco de imágenes del proyecto v1, ninguna especialidad
// inventada: son las 7 áreas que ya cubre el inventario de equipos biomédicos.
const LANDING_ESPECIALIDADES = [
  { nombre: 'Hospitalización', texto: 'Control de camas, monitores y equipos de piso.', imagen: fotoHospitalizacion },
  { nombre: 'UCI', texto: 'Gestión crítica de ventiladores, monitores y bombas de infusión.', imagen: fotoUci },
  { nombre: 'Laboratorio', texto: 'Control y trazabilidad de equipos de laboratorio.', imagen: fotoLaboratorio },
  { nombre: 'Imagenología', texto: 'Control de equipos críticos y documentación.', imagen: fotoImagenologia },
  { nombre: 'Odontología', texto: 'Gestión de equipos odontológicos y su mantenimiento.', imagen: fotoOdontologia },
  { nombre: 'Quirófano', texto: 'Trazabilidad de equipos e insumos críticos en cirugía.', imagen: fotoQuirofano },
  { nombre: 'Equipos generales', texto: 'Gestión integral de cualquier equipo biomédico de la organización.', imagen: fotoEquiposGenerales },
];

// Velo de color sobre cada foto — 4 combinaciones dentro de la misma paleta de
// marca (azul/verde), para que las 7 fotos (de iluminación distinta) se sientan
// de una sola familia visual en vez de 7 tonos de blanco distintos.
const LANDING_TEMAS_ESPECIALIDAD = [
  'linear-gradient(160deg, #0F172A 0%, #123a52 50%, #3B9FD6 100%)',
  'linear-gradient(160deg, #3B9FD6 0%, #1f6f5c 50%, #3F9142 100%)',
  'linear-gradient(160deg, #3F9142 0%, #0d3d3a 50%, #0F172A 100%)',
  'linear-gradient(160deg, #0F172A 0%, #3B9FD6 50%, #3F9142 100%)',
];

function LandingPage({ onIniciarSesion, onReportarFalla }) {
  return (
    <div className="min-h-dvh" style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: '#EAF4FB' }}>
      <style>{LANDING_STYLES}</style>

      <header className="sticky top-0 z-30 backdrop-blur border-b" style={{ background: 'rgba(234,244,251,0.85)', borderColor: 'rgba(59,159,214,0.15)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#inicio" className="flex items-center gap-2.5">
            <img src={logoIngenieriaClinica} alt="" width={28} height={28} style={{ objectFit: 'contain' }} />
            <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>Ingeniería Clínica</span>
          </a>
          <nav className="hidden md:flex items-center gap-8" aria-label="Secciones">
            <a href="#inicio" className="landing-link text-xs font-medium" style={{ color: '#334155' }}>Inicio</a>
            <a href="#beneficios" className="landing-link text-xs font-medium" style={{ color: '#334155' }}>Beneficios</a>
            <a href="#especialidades" className="landing-link text-xs font-medium" style={{ color: '#334155' }}>Especialidades</a>
            <a href="#modulos" className="landing-link text-xs font-medium" style={{ color: '#334155' }}>Módulos</a>
          </nav>
          <button type="button" onClick={onIniciarSesion} className="landing-btn landing-btn-primary rounded-lg px-4 py-2 text-xs font-semibold text-white">
            Ingresar
          </button>
        </div>
      </header>

      {/* HÉROE — banda oscura de marca con red neuronal animada + el equipo
          biomédico en 3D (graphic motion HyperFrames) como pieza central. */}
      <section id="inicio" className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #081a2e 0%, #0d3455 55%, #0f4a44 100%)' }}>
        <div className="absolute inset-0 landing-dotgrid-dark opacity-30 pointer-events-none" aria-hidden="true" />
        <div className="absolute -top-32 left-1/4 w-96 h-96 rounded-full pointer-events-none" style={{ background: '#3B9FD6', opacity: 0.25, filter: 'blur(110px)' }} aria-hidden="true" />
        <div className="absolute -bottom-40 right-0 w-[28rem] h-[28rem] rounded-full pointer-events-none" style={{ background: '#3F9142', opacity: 0.2, filter: 'blur(110px)' }} aria-hidden="true" />
        <RedNeuronalFondo tema="oscuro" densidad="alta" />

        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-20 lg:pt-20 lg:pb-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="landing-reveal">
            <div className="flex items-center gap-3 mb-5">
              <div className="landing-glass-dark rounded-xl p-2 flex items-center justify-center shrink-0">
                <img src={logoIngenieriaClinica} alt="" width={40} height={40} style={{ objectFit: 'contain' }} />
              </div>
              <span className="text-lg font-semibold tracking-tight text-white">Ingeniería Clínica</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full border" style={{ borderColor: 'rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#7dd3fc' }}>
              <Zap size={12} /> La tecnología que impulsa la salud
            </span>
            <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[2.85rem] font-bold leading-[1.12] tracking-tight text-white">
              Gestiona, protege y da vida a tus{' '}
              <span style={{ background: 'linear-gradient(90deg, #7dd3fc 0%, #6ee7b7 50%, #7dd3fc 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                equipos biomédicos
              </span>
            </h1>
            <p className="mt-4 max-w-lg text-sm sm:text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.72)' }}>
              La plataforma CMMS que te permite tener el control total de tu inventario, la documentación y el mantenimiento de tus equipos médicos.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={onIniciarSesion} className="landing-btn landing-btn-primary rounded-lg px-6 py-3 text-sm font-semibold text-white inline-flex items-center gap-2">
                Ingresar al sistema <ChevronRight size={16} />
              </button>
              <button type="button" onClick={onReportarFalla} className="landing-btn landing-btn-outline-dark rounded-lg px-6 py-3 text-sm font-semibold inline-flex items-center gap-2">
                <Wrench size={15} /> Reportar una falla
              </button>
            </div>
          </div>

          {/* Panel de vidrio con el graphic motion 3D del equipo biomédico —
              chips satélite anotados, calco del diagrama técnico de la
              referencia, con datos reales del sistema (nunca inventados). */}
          <div className="landing-reveal relative" style={{ animationDelay: '.12s' }}>
            <div className="landing-glow absolute rounded-full pointer-events-none" style={{ inset: -30, background: 'radial-gradient(circle, rgba(59,159,214,0.3) 0%, rgba(34,211,238,0.14) 55%, transparent 75%)', filter: 'blur(6px)' }} aria-hidden="true" />
            <div className="landing-glass-dark relative rounded-2xl p-3 overflow-hidden">
              <video
                className="w-full h-auto rounded-xl block"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                aria-hidden="true"
              >
                {/* mp4 (H.264) primero — es el códec más ampliamente soportado (Safari/iOS no
                    reproduce WebM en absoluto); webm queda como respaldo para navegadores que
                    no puedan decodificar H.264. */}
                <source src="/media/hero-equipo-biomedico.mp4" type="video/mp4" />
                <source src="/media/hero-equipo-biomedico.webm" type="video/webm" />
              </video>
            </div>
            <div className="landing-float landing-glass-dark hidden sm:flex absolute -left-6 top-6 items-center gap-2 rounded-xl px-3 py-2" style={{ animationDelay: '.3s' }}>
              <BellRing size={14} style={{ color: '#7dd3fc' }} />
              <span className="text-2xs font-medium text-white">Alertas en tiempo real</span>
            </div>
            <div className="landing-float landing-glass-dark hidden sm:flex absolute -right-6 bottom-8 items-center gap-2 rounded-xl px-3 py-2" style={{ animationDelay: '.9s' }}>
              <ShieldCheck size={14} style={{ color: '#6ee7b7' }} />
              <span className="text-2xs font-medium text-white">Calibración vigente</span>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFICIOS — núcleo digital + 6 tarjetas de vidrio sobre fondo claro con
          profundidad (degradado + manchas de color + red neuronal tenue), en vez
          de un color plano. */}
      <section id="beneficios" className="relative overflow-hidden py-20" style={{ background: 'linear-gradient(160deg, #EAF4FB 0%, #DCEEFA 45%, #E3F0FA 100%)' }}>
        <RedNeuronalFondo tema="claro" densidad="baja" />
        <div className="absolute inset-0 landing-dotgrid-light opacity-50 pointer-events-none" aria-hidden="true" />
        <div className="absolute -top-16 -right-16 w-80 h-80 rounded-full pointer-events-none" style={{ background: '#3B9FD6', opacity: 0.14, filter: 'blur(100px)' }} aria-hidden="true" />
        <div className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full pointer-events-none" style={{ background: '#3F9142', opacity: 0.12, filter: 'blur(100px)' }} aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full" style={{ background: '#DCEEFA', color: '#1D6FA5' }}>
              Beneficios
            </span>
            <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: '#0F172A' }}>Todo bajo control</h2>
            <p className="mt-2 text-sm max-w-xl mx-auto" style={{ color: '#5B6B7C' }}>
              Un ecosistema digital donde equipos, información y decisiones están conectados.
            </p>
          </div>

          <NucleoDigital />
          <div className="mx-auto mb-10" style={{ width: 1, height: 28, borderLeft: '1px dashed rgba(59,159,214,0.4)' }} aria-hidden="true" />

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {LANDING_BENEFICIOS.map(({ icon: Icon, titulo, texto }, i) => (
              <div key={titulo} className="landing-glass-light landing-reveal rounded-2xl p-5" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, #3F9142 0%, #3B9FD6 100%)', boxShadow: '0 10px 20px -8px rgba(59,159,214,0.4)' }}>
                  <Icon size={18} className="text-white" />
                </div>
                <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>{titulo}</h3>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: '#5B6B7C' }}>{texto}</p>
              </div>
            ))}
          </div>

          {/* Flujo — "Así fluye la información de cada equipo": cadena de 7 chips. */}
          <div className="landing-glass-light mt-10 rounded-2xl px-6 py-6">
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

      {/* ESPECIALIDADES — fotos reales de equipos, agrupadas por área clínica. */}
      <section id="especialidades" className="relative overflow-hidden py-20" style={{ background: 'linear-gradient(180deg, #E3F0FA 0%, #DCEEFA 50%, #EAF4FB 100%)' }}>
        <RedNeuronalFondo tema="claro" densidad="media" />
        <div className="absolute -left-24 top-1/3 w-80 h-80 rounded-full pointer-events-none" style={{ background: '#3B9FD6', opacity: 0.14, filter: 'blur(100px)' }} aria-hidden="true" />
        <div className="absolute -right-16 bottom-0 w-72 h-72 rounded-full pointer-events-none" style={{ background: '#3F9142', opacity: 0.12, filter: 'blur(100px)' }} aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full" style={{ background: '#DCEEFA', color: '#1D6FA5' }}>
              Especialidades
            </span>
            <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: '#0F172A' }}>Un solo sistema para múltiples especialidades</h2>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {LANDING_ESPECIALIDADES.map(({ nombre, texto, imagen }, i) => (
              <div key={nombre} className="landing-reveal group relative flex h-72 flex-col overflow-hidden rounded-2xl transition-transform duration-300 hover:-translate-y-1.5" style={{ boxShadow: '0 12px 28px -18px rgba(15,58,90,0.35)', animationDelay: `${i * 0.06}s` }}>
                <img
                  src={imagen}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  style={{ transform: 'scale(1)' }}
                />
                <div className="absolute inset-0 opacity-40" style={{ background: LANDING_TEMAS_ESPECIALIDAD[i % LANDING_TEMAS_ESPECIALIDAD.length], mixBlendMode: 'multiply' }} aria-hidden="true" />
                <div className="absolute inset-0 transition-opacity duration-200" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.08) 55%, transparent 100%)' }} aria-hidden="true" />
                <div className="relative mt-auto p-5">
                  <h3 className="text-base font-semibold text-white">{nombre}</h3>
                  <p className="mt-1 max-h-0 overflow-hidden text-xs leading-relaxed text-white/85 opacity-0 transition-all duration-300 group-hover:mt-1.5 group-hover:max-h-16 group-hover:opacity-100">
                    {texto}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MÓDULOS — chips de vidrio sobre fondo claro con la misma profundidad
          (degradado + manchas + red neuronal tenue) que el resto de secciones
          claras, en vez de blanco plano. */}
      <section id="modulos" className="relative overflow-hidden py-20" style={{ background: 'linear-gradient(160deg, #FFFFFF 0%, #F3F9FC 55%, #EAF4FB 100%)' }}>
        <RedNeuronalFondo tema="claro" densidad="baja" />
        <div className="absolute -top-20 right-1/4 w-72 h-72 rounded-full pointer-events-none" style={{ background: '#3B9FD6', opacity: 0.1, filter: 'blur(100px)' }} aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full" style={{ background: '#DCEEFA', color: '#1D6FA5' }}>
              Módulos
            </span>
            <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: '#0F172A' }}>Todo integrado, nada disperso</h2>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {LANDING_MODULOS.map(({ icon: Icon, label }) => (
              <span key={label} className="landing-chip inline-flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-full border" style={{ borderColor: '#DCE7F0', color: '#334155', background: '#F7FBFD' }}>
                <Icon size={14} style={{ color: '#3B9FD6' }} /> {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* SECCIÓN DE VALOR — banda oscura con red neuronal, mismo lenguaje del héroe. */}
      <section className="relative overflow-hidden text-center py-20" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #0d3455 55%, #0f4a44 100%)' }}>
        <div className="absolute inset-0 landing-dotgrid-dark opacity-30 pointer-events-none" aria-hidden="true" />
        <div className="absolute -left-20 top-0 w-72 h-72 rounded-full pointer-events-none" style={{ background: '#3B9FD6', opacity: 0.25, filter: 'blur(90px)' }} aria-hidden="true" />
        <div className="absolute -right-16 bottom-0 w-64 h-64 rounded-full pointer-events-none" style={{ background: '#3F9142', opacity: 0.25, filter: 'blur(90px)' }} aria-hidden="true" />
        <RedNeuronalFondo tema="oscuro" densidad="alta" />
        <div className="landing-reveal relative z-10 max-w-2xl mx-auto px-6">
          {/* Marca animada — el mismo graphic motion 3D del logo, enmarcado en vidrio
              con glow para que se integre con el fondo de la sección en vez de flotar
              como un recuadro suelto. */}
          <div className="relative mx-auto mb-8" style={{ width: 168, height: 168 }}>
            <div className="landing-glow absolute rounded-full pointer-events-none" style={{ inset: -20, background: 'radial-gradient(circle, rgba(59,159,214,0.35) 0%, rgba(167,139,250,0.18) 55%, transparent 75%)', filter: 'blur(6px)' }} aria-hidden="true" />
            <div className="landing-glass-dark relative w-full h-full rounded-full p-2 overflow-hidden">
              <video
                className="w-full h-full rounded-full block"
                style={{ objectFit: 'cover' }}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                aria-hidden="true"
              >
                <source src="/media/logo-reveal-loop.mp4" type="video/mp4" />
                <source src="/media/logo-reveal-loop.webm" type="video/webm" />
              </video>
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Más control. Menos riesgos. Mejores decisiones.</h2>
          <p className="mt-4 text-sm sm:text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.72)' }}>
            Centraliza la información de tus equipos biomédicos, automatiza el seguimiento del mantenimiento y mantén toda la documentación disponible cuando la necesites.
          </p>
        </div>
      </section>

      {/* CTA FINAL — banda oscura de vidrio con glow, igual lenguaje del héroe. */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0d3455 0%, #1f6f5c 55%, #3F9142 100%)' }}>
        <div className="absolute inset-0 landing-dotgrid-dark opacity-30 pointer-events-none" aria-hidden="true" />
        <div className="absolute -top-20 -left-12 w-72 h-72 rounded-full pointer-events-none" style={{ background: '#7DD3FC', opacity: 0.22, filter: 'blur(100px)' }} aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">¿Listo para ingresar a la plataforma?</h2>
          <p className="mt-3 text-sm max-w-lg mx-auto" style={{ color: 'rgba(255,255,255,0.78)' }}>
            Accede con tu usuario administrador o repórtanos una falla si eres coordinador de sede.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={onIniciarSesion} className="landing-btn rounded-lg px-6 py-3 text-sm font-semibold inline-flex items-center gap-2" style={{ background: '#FFFFFF', color: '#0F172A' }}>
              Ingresar al sistema <ChevronRight size={16} />
            </button>
            <button type="button" onClick={onReportarFalla} className="landing-btn landing-btn-outline-dark rounded-lg px-6 py-3 text-sm font-semibold inline-flex items-center gap-2">
              <Wrench size={15} /> Reportar una falla
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t" style={{ borderColor: '#DCE7F0', background: '#FFFFFF' }}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src={logoIngenieriaClinica} alt="" width={18} height={18} style={{ objectFit: 'contain' }} />
            <span className="text-2xs" style={{ color: '#8A97A6' }}>Ingeniería Clínica · Plataforma de gestión de equipos biomédicos</span>
          </div>
          <div className="flex items-center gap-5">
            <button type="button" onClick={onReportarFalla} className="landing-link text-2xs font-medium" style={{ color: '#5B6B7C' }}>Reportar una falla</button>
            <button type="button" onClick={onIniciarSesion} className="landing-link text-2xs font-medium" style={{ color: '#5B6B7C' }}>Iniciar sesión</button>
            <span className="text-2xs" style={{ color: '#B4BCC6' }}>Versión 2.0</span>
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
function LoginScreen({ notice, onLogin, onReportarFalla, onBack }) {
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
              <span className="font-bold" style={{ color: '#173B6C' }}>Sistema Integral para la Gestión</span><br />
              <span className="font-bold" style={{ color: '#3CAA55' }}>de Equipos Biomédicos</span>
            </p>
            <p className="text-sm text-slate-500 mt-3 max-w-sm">Controla, gestiona y optimiza el ciclo de vida de tus equipos biomédicos de forma inteligente y eficiente.</p>
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
            <div className="text-xl font-bold tracking-wide text-center" style={{ color: '#173B6C' }}>CMMS BIOMÉDICA</div>
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
function AmbientBackground({ theme, dark }) {
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
      <div className="absolute inset-0 flex items-center justify-center">
        <img src={logoIngenieriaClinica} alt=""
          style={{ width: 'min(112vw, 59rem)', height: 'min(112vw, 59rem)', objectFit: 'contain', opacity: logoOpacity, transition: 'opacity 500ms ease-out' }} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* NAVEGACIÓN LATERAL — compartida entre el sidebar de escritorio    */
/* (columna fija) y el drawer móvil (superpuesto con backdrop)       */
/* ---------------------------------------------------------------- */
function SidebarNav({ menu, onNavigate, nuevosReportes, accent, accentBg, t, dark, setDark, onLogout, readOnly, onCloseMobile }) {
  const user = useContext(AuthUserContext);
  const isSuper = user?.role === 'SUPER_ADMIN';
  const items = MENU.filter(m => !(readOnly && m.guestHidden) && !(m.superOnly && !isSuper));
  return (
    <>
      <div className="h-1" style={{ background: accentBg }} />
      <div className="px-4 py-5 border-b flex items-center justify-between" style={{ borderColor: 'inherit' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={logoIngenieriaClinica} alt="Ingeniería Clínica" width={36} height={36} className="shrink-0" style={{ objectFit: 'contain' }} />
          <div className="min-w-0">
            <div className="text-3xs uppercase tracking-widest truncate" style={{ color: accent }}>CMMS Biomédico</div>
            <div className="text-sm font-bold mt-0.5 truncate">Gestión de equipos</div>
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
          const active = menu === m.key;
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

function MainApp({ user, entorno, onLogout, onSwitchEmpresa, readOnly }) {
  const [equipos, setEquipos] = useState([]);
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState('dashboard');
  // MULTIEMPRESA: el SUPER_ADMIN empieza en "Todas" y puede filtrar por cualquier empresa.
  // Un usuario de empresa queda fijo en la empresa ACTIVA de su sesión (la que decide el
  // servidor) — nunca ve dos empresas mezcladas. Si tiene varias asignadas (empresa_ids),
  // puede cambiar cuál está activa (ver el selector más abajo); eso reinicia la sesión del
  // componente entero (App.jsx → <MainApp key=...>), así que aquí "lockedCompany" sigue
  // significando "la única que esta instancia conoce ahora mismo" — no cambia en caliente.
  const isSuper = user.role === 'SUPER_ADMIN';
  const lockedCompany = isSuper ? null : user.empresa_id;
  const misEmpresas = isSuper ? null : (user.empresa_ids?.length ? user.empresa_ids : (user.empresa_id ? [user.empresa_id] : []));
  const [activeCompany, setActiveCompanyRaw] = useState(lockedCompany || 'TODAS');
  const [cambiandoEmpresa, setCambiandoEmpresa] = useState(false);
  const setActiveCompany = (k) => {
    if (isSuper) { setActiveCompanyRaw(k); return; }
    if (k !== lockedCompany && misEmpresas.length > 1 && misEmpresas.includes(k)) {
      setCambiandoEmpresa(true);
      onSwitchEmpresa(k).catch(err => {
        console.error('No se pudo cambiar de empresa activa', err);
        setCambiandoEmpresa(false);
      });
      // No hace falta "deshacer" cambiandoEmpresa en el caso de éxito: App.jsx remonta este
      // componente entero con la empresa nueva en cuanto onSwitchEmpresa confirma el cambio.
      return;
    }
    setActiveCompanyRaw(lockedCompany || k);
  };
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
  const [tecnoComites, setTecnoComites] = useState({});
  const [personal, setPersonal] = useState([]);
  const [limpiezaDesinfeccion, setLimpiezaDesinfeccion] = useState({});
  const [limpiezaPlantillas, setLimpiezaPlantillas] = useState({});
  const [checklistDotacion, setChecklistDotacion] = useState({});
  const [formatoTempHumedad, setFormatoTempHumedad] = useState({});
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

  useEffect(() => { loadTecnoComites().then(setTecnoComites); }, []);
  // A diferencia de updateTecnoReporte (optimista, revierte en silencio si falla), un comité
  // se guarda desde un formulario con botón «Guardar» explícito: aquí se espera la respuesta
  // y se deja que el error se propague — el modal lo captura y lo muestra (ver TecnoComiteModal).
  const guardarComiteTecno = async (empresaKey, anio, trimestre, campos) => {
    const data = await actualizarTecnoComite(empresaKey, anio, trimestre, campos);
    setTecnoComites(data);
    return data;
  };
  const eliminarComiteTecno = async (empresaKey, anio, trimestre) => {
    const data = await borrarTecnoComite(empresaKey, anio, trimestre);
    setTecnoComites(data);
    return data;
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
  // Igual patrón que updateTecnoTransversal: edición optimista, con reversión silenciosa si
  // el servidor la rechaza (validación de URL o permisos).
  const updateLimpiezaPlantilla = (empresaKey, url) => {
    const previous = limpiezaPlantillas;
    setLimpiezaPlantillas(prev => ({ ...prev, [empresaKey]: url }));
    actualizarLimpiezaPlantilla(empresaKey, url).catch(err => {
      console.error('No se pudo sincronizar la plantilla de limpieza y desinfección con el servidor compartido', err);
      setLimpiezaPlantillas(previous);
    });
  };

  useEffect(() => { loadChecklistDotacion().then(setChecklistDotacion); }, []);
  const updateChecklistDotacion = (empresaKey, url) => {
    const previous = checklistDotacion;
    setChecklistDotacion(prev => ({ ...prev, [empresaKey]: url }));
    actualizarChecklistDotacion(empresaKey, url).catch(err => {
      console.error('No se pudo sincronizar el checklist de dotación con el servidor compartido', err);
      setChecklistDotacion(previous);
    });
  };

  useEffect(() => { loadFormatoTemperaturaHumedad().then(setFormatoTempHumedad); }, []);
  const updateFormatoTempHumedad = (empresaKey, url) => {
    const previous = formatoTempHumedad;
    setFormatoTempHumedad(prev => ({ ...prev, [empresaKey]: url }));
    actualizarFormatoTemperaturaHumedad(empresaKey, url).catch(err => {
      console.error('No se pudo sincronizar el formato de temperatura y humedad con el servidor compartido', err);
      setFormatoTempHumedad(previous);
    });
  };

  // Sedes efectivas por empresa (configuradas + en uso por los equipos): se recalculan en el
  // mismo render en que cambian los equipos, antes de que los hijos lean COMPANIES.
  useMemo(() => registrarSedesEnUso(equipos), [equipos]);

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
    <div className={`flex flex-col min-h-dvh font-sans ${t.bg} ${t.text}`} style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
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
      <div className={`hidden lg:flex lg:w-56 lg:shrink-0 border-r flex-col ${t.panel} ${t.border}`}
        style={!dark ? { background: SIDEBAR_GRADIENT_LIGHT } : undefined}>
        <SidebarNav menu={menu} onNavigate={setMenu} nuevosReportes={nuevosReportes} accent={accent} accentBg={accentBg}
          t={t} dark={dark} setDark={setDark} onLogout={onLogout} readOnly={readOnly} />
      </div>

      {/* SIDEBAR — móvil: drawer superpuesto, invisible por completo en lg+ */}
      <div className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 border-r flex flex-col ${t.panel} ${t.border}`}
        style={{
          transform: mobileNavOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 300ms cubic-bezier(0.23,1,0.32,1)',
          ...(!dark ? { background: SIDEBAR_GRADIENT_LIGHT } : {}),
        }}>
        <SidebarNav menu={menu} onNavigate={(k) => { setMenu(k); setMobileNavOpen(false); }} nuevosReportes={nuevosReportes} accent={accent} accentBg={accentBg}
          t={t} dark={dark} setDark={setDark} onLogout={onLogout} readOnly={readOnly} onCloseMobile={() => setMobileNavOpen(false)} />
      </div>

      {/* MAIN */}
      <div className="flex-1 relative overflow-hidden">
        <AmbientBackground theme={theme} dark={dark} />
        <div className="absolute inset-0 overflow-y-auto p-6">
        {/* Empresa pills — un usuario de empresa ve solo las SUYAS (una fija, o varias entre
            las que puede cambiar — nunca una vista "Todas las empresas" mezclada, eso sigue
            siendo exclusivo de SUPER_ADMIN). */}
        {!isSuper ? (
          <div className="flex gap-2 flex-wrap mb-5">
            {misEmpresas.length > 1 ? COMPANIES.map(c => (
              <button key={c.key} onClick={() => changeCompany(c.key)} disabled={cambiandoEmpresa}
                className={`px-3 min-h-11 flex items-center gap-1.5 rounded-full text-2xs font-mono border transition ${activeCompany === c.key ? 'text-white font-semibold' : t.border} ${cambiandoEmpresa ? 'opacity-60' : ''}`}
                style={activeCompany === c.key ? { background: c.gradient, borderColor: c.color } : {}}>
                <Building2 size={12} /> {c.nombre || c.key}
              </button>
            )) : (
              <span className="px-3 min-h-11 flex items-center gap-1.5 rounded-full text-2xs font-mono border text-white font-semibold"
                style={{ background: companyOf(activeCompany)?.gradient, borderColor: companyOf(activeCompany)?.color }}>
                <Building2 size={12} /> {companyOf(activeCompany)?.nombre || activeCompany}
              </span>
            )}
            {cambiandoEmpresa && <span className={`text-2xs self-center ${t.muted}`}>Cambiando de empresa…</span>}
          </div>
        ) : !menu.startsWith('admin_') && (
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
        {menu === 'tecnovigilancia' && <TecnovigilanciaPage transversal={tecnoTransversal} reportes={tecnoReportes} comites={tecnoComites} activeCompany={activeCompany} t={t} accent={accent} onUpdateTransversal={updateTecnoTransversal} onUpdateReporte={updateTecnoReporte} onGuardarComite={guardarComiteTecno} onEliminarComite={eliminarComiteTecno} readOnly={readOnly} />}
        {menu === 'personal' && <PersonalPage personal={personal} activeCompany={activeCompany} t={t} accent={accent} onAdd={addPersonal} onUpdate={updatePersonal} readOnly={readOnly} />}
        {menu === 'limpieza' && (
          <LimpiezaDesinfeccionPage data={limpiezaDesinfeccion} activeCompany={activeCompany} t={t} accent={accent} onUpdate={updateLimpiezaDesinfeccion}
            plantillas={limpiezaPlantillas} onUpdatePlantilla={updateLimpiezaPlantilla}
            checklistDotacion={checklistDotacion} onUpdateChecklist={updateChecklistDotacion}
            formatoTempHumedad={formatoTempHumedad} onUpdateTempHumedad={updateFormatoTempHumedad} readOnly={readOnly} />
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


// Etiqueta visible del bucket OTRAS_EMPRESA (empresas que no matchean ninguna de las 5 del
// CMMS). "UT" (contratos ERON) ya NO cae acá — lib/capacitaciones.js la excluye por completo
// antes de que sus registros lleguen al snapshot, así que este bucket solo agruparía alguna
// otra empresa desconocida que aparezca a futuro en los formularios. El valor interno se
// mantiene sin traducir para que coincida exactamente con lo que produce el servidor.
const EMPRESA_LABEL = { [OTRAS_EMPRESA]: 'Otras' };
const CAP_PAGE_SIZE = 20;
// Nota mínima (%) para considerar aprobada una capacitación — ver "Seguimiento de aprobación"
// más abajo. Se evalúa siempre sobre el ÚLTIMO intento de cada persona en esa capacitación,
// nunca sobre el promedio ni la peor nota histórica (a propósito: alguien que reprobó una vez
// pero ya aprobó no debe seguir apareciendo como pendiente).
const UMBRAL_APROBACION = 90;

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
  // '' = Todas, 'pendientes' = última nota < UMBRAL_APROBACION, 'aprobadas' = >= UMBRAL_APROBACION.
  // No participa de `filtros`/filtrarCapacitaciones (eso filtra RESPUESTAS individuales, usadas
  // por los KPI/gráficas de siempre) porque este filtro opera sobre PERSONAS — se aplica después,
  // sobre el resumen por persona+capacitación (ver resumenAprobacion más abajo).
  const [estadoAprobacion, setEstadoAprobacion] = useState('');
  // Persona+capacitación seleccionada para ver su historial de intentos (modal "Acceso al detalle").
  const [personaDetalle, setPersonaDetalle] = useState(null);
  const [aprobacionAbierta, setAprobacionAbierta] = useState(false);

  const filtros = { empresa: activeCompany, sede, capacitacion: capacitacionSel, anio, mes, desde, hasta };
  const hayFiltrosActivos = Boolean(activeCompany !== 'TODAS' || sede || capacitacionSel || anio || mes || desde || hasta || estadoAprobacion);

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

  // Seguimiento de aprobación: para cada persona + capacitación (misma identidad, mismo
  // `capacitacion`), se queda con su intento MÁS RECIENTE con nota (ignora filas sin
  // puntaje — no hay nada que evaluar ahí) y evalúa SOLO ese último intento contra
  // UMBRAL_APROBACION. Nunca el promedio ni la peor nota histórica: alguien que reprobó una
  // vez pero ya aprobó en un intento posterior debe dejar de aparecer como pendiente, y el
  // historial completo (`intentos`) se conserva para el detalle persona a persona.
  // Se calcula sobre `filtrados` (ya respeta empresa/sede/capacitación/año/mes/rango de
  // fechas) — el filtro de Estado de aprobación se aplica DESPUÉS, sobre este resumen.
  const resumenAprobacion = useMemo(() => {
    const grupos = new Map();
    filtrados.forEach(r => {
      if (r.porcentaje == null) return;
      const clave = `${identidadDe(r)}|${r.capacitacion}`;
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(r);
    });
    const resumen = [];
    grupos.forEach(intentos => {
      const ordenados = [...intentos].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
      const ultimo = ordenados[ordenados.length - 1];
      resumen.push({
        identidad: identidadDe(ultimo),
        nombre: ultimo.nombre, empresa: ultimo.empresa, sede: ultimo.sede, cargo: ultimo.cargo,
        capacitacion: ultimo.capacitacion,
        ultimaNota: ultimo.porcentaje, ultimaFecha: ultimo.fecha,
        aprobado: ultimo.porcentaje >= UMBRAL_APROBACION,
        intentos: ordenados,
      });
    });
    // Pendientes primero, y entre ellos la nota más baja primero — así lo más urgente queda arriba.
    resumen.sort((a, b) => (a.aprobado === b.aprobado ? a.ultimaNota - b.ultimaNota : a.aprobado ? 1 : -1));
    return resumen;
  }, [filtrados]);

  const personasPendientes = useMemo(() => resumenAprobacion.filter(r => !r.aprobado), [resumenAprobacion]);
  // KPI en personas ÚNICAS (no en pares persona+capacitación): alguien pendiente en 2 temas
  // a la vez cuenta una sola vez acá, igual que "Personas capacitadas" más arriba.
  const personasPendientesUnicas = useMemo(() => new Set(personasPendientes.map(r => r.identidad)).size, [personasPendientes]);
  const resumenFiltradoPorEstado = useMemo(() => {
    if (estadoAprobacion === 'pendientes') return resumenAprobacion.filter(r => !r.aprobado);
    if (estadoAprobacion === 'aprobadas') return resumenAprobacion.filter(r => r.aprobado);
    return resumenAprobacion;
  }, [resumenAprobacion, estadoAprobacion]);

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
    onChangeEmpresa('TODAS'); setSede(''); setCapacitacionSel(''); setAnio(''); setMes(''); setDesde(''); setHasta(''); setEstadoAprobacion('');
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

      {/* Desaparece sola en cuanto personasPendientesUnicas llega a 0 (último intento de todos
          ≥ UMBRAL_APROBACION) — no es un estado que haya que cerrar ni ocultar a mano. */}
      {personasPendientesUnicas > 0 && (
        <div className="rounded-xl border p-3 mb-4 text-2xs flex items-center justify-between flex-wrap gap-2" style={{ borderColor: '#EF444455', background: '#EF444415', color: '#EF4444' }}>
          <div>
            <span className="font-semibold">⚠ Hay {personasPendientesUnicas} persona{personasPendientesUnicas !== 1 ? 's' : ''} que requiere{personasPendientesUnicas !== 1 ? 'n' : ''} seguimiento.</span>
            {' '}Obtuvieron menos del {UMBRAL_APROBACION}% en su última evaluación.
          </div>
          <button onClick={() => { setEstadoAprobacion('pendientes'); setAprobacionAbierta(true); }} className="font-semibold underline whitespace-nowrap">Ver personas pendientes →</button>
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
        <select value={estadoAprobacion} onChange={e => setEstadoAprobacion(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`} title="Estado de aprobación">
          <option value="">Estado: todas</option>
          <option value="aprobadas">Aprobadas ≥ {UMBRAL_APROBACION}%</option>
          <option value="pendientes">Pendientes &lt; {UMBRAL_APROBACION}%</option>
        </select>
        {hayFiltrosActivos && <Button variant="ghost" t={t} icon={X} iconSize={12} onClick={limpiarFiltros}>Limpiar filtros</Button>}
      </div>

      {filtrados.length === 0 ? (
        <div className={`rounded-xl border p-10 text-center ${t.panel} ${t.border}`}>
          <p className={`text-xs ${t.muted}`}>Sin registros de capacitaciones para los filtros actuales.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
            <HeroStat t={t} label="Capacitaciones realizadas" value={totalCapacitaciones} sub="temas distintos con respuestas" color={accent} />
            <HeroStat t={t} label="Registros / respuestas" value={totalRegistros} sub="asistencias registradas" color="#3B82F6" />
            <HeroStat t={t} label="Personas capacitadas" value={personasUnicas} sub="identidades únicas" color="#22C55E" />
            <HeroStat t={t} label="Promedio de puntaje" value={promedioPct != null ? `${promedioPct}%` : '—'}
              sub={`${conPuntaje.length} evaluaciones con puntaje`} color={promedioPct != null && promedioPct < 70 ? '#EF4444' : '#8B5CF6'} />
            <HeroStat t={t} label="Menor promedio" value={peorCapacitacion ? `${peorCapacitacion.avg}%` : '—'}
              sub={peorCapacitacion ? peorCapacitacion.name : 'Sin suficientes datos'} color="#F59E0B" />
            <HeroStat t={t} label={`Personas por debajo del ${UMBRAL_APROBACION}%`} value={personasPendientesUnicas}
              sub="Requieren refuerzo / nueva presentación" color="#EF4444" onClick={() => { setEstadoAprobacion('pendientes'); setAprobacionAbierta(true); }} />
          </div>

          {resumenAprobacion.length > 0 && (
            <div className={`rounded-xl border overflow-hidden mb-4 ${t.panel} ${t.border}`}>
              <button type="button" onClick={() => setAprobacionAbierta(v => !v)} className="w-full flex items-center justify-between gap-3 p-5 pb-3 text-left">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>Seguimiento de aprobación</div>
                  <p className={`text-2xs mt-1 ${t.muted}`}>Por persona + capacitación, según su último intento — no el promedio ni la peor nota histórica.</p>
                </div>
                {aprobacionAbierta ? <ChevronUp size={16} className={t.muted} /> : <ChevronDown size={16} className={t.muted} />}
              </button>
              {aprobacionAbierta && (
              <div className="overflow-x-auto">
                <table className="w-full text-2xs">
                  <thead>
                    <tr className={`text-left ${t.muted} border-t ${t.border}`}>
                      <th className="px-5 py-2 font-mono uppercase text-3xs">Persona</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Empresa</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Sede</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Cargo</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Capacitación</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs text-right">Última nota</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Fecha último intento</th>
                      <th className="px-3 py-2 font-mono uppercase text-3xs">Estado</th>
                      <th className="px-3 py-2 pr-5 font-mono uppercase text-3xs text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenFiltradoPorEstado.length === 0 ? (
                      <tr><td colSpan={9} className={`text-center py-6 ${t.muted}`}>Sin personas en este estado para los filtros actuales.</td></tr>
                    ) : resumenFiltradoPorEstado.map((f, i) => (
                      <tr key={i} className={`border-t ${t.border}`}>
                        <td className="px-5 py-2">{f.nombre || '—'}</td>
                        <td className="px-3 py-2">{EMPRESA_LABEL[f.empresa] || f.empresa}</td>
                        <td className="px-3 py-2">{f.sede || '—'}</td>
                        <td className="px-3 py-2">{f.cargo || '—'}</td>
                        <td className="px-3 py-2">{f.capacitacion}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: f.aprobado ? '#22C55E' : '#EF4444' }}>{f.ultimaNota}%</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{f.ultimaFecha ? formatFechaCorta(f.ultimaFecha) : '—'}</td>
                        <td className="px-3 py-2">
                          <Badge color={f.aprobado ? '#22C55E' : '#EF4444'}>{f.aprobado ? '✓ Aprobado' : '⚠ Pendiente'}</Badge>
                        </td>
                        <td className="px-3 py-2 pr-5 text-right">
                          <button onClick={() => setPersonaDetalle(f)} className="font-semibold underline" style={{ color: accent }}>Ver</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}

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

      {personaDetalle && <HistorialIntentosModal persona={personaDetalle} t={t} accent={accent} onClose={() => setPersonaDetalle(null)} />}
    </div>
  );
}

// Modal "Acceso al detalle" — historial completo de intentos de una persona en UNA
// capacitación puntual (section 7 del pedido), numerados cronológicamente, para verificar
// que efectivamente mejoró antes de confiar en su último resultado.
function HistorialIntentosModal({ persona, t, accent, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`animate-modal-in relative w-full max-w-lg rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-sm font-semibold">{persona.nombre || 'Sin nombre'} — {persona.capacitacion}</div>
            <div className={`text-2xs ${t.muted}`}>{EMPRESA_LABEL[persona.empresa] || persona.empresa}{persona.sede ? ` · ${persona.sede}` : ''}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex items-center justify-center w-11 h-11 -mr-2 -mt-2"><X size={16} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-2xs">
            <thead>
              <tr className={`text-left ${t.muted} border-t ${t.border}`}>
                <th className="py-2 font-mono uppercase text-3xs">Intento</th>
                <th className="py-2 font-mono uppercase text-3xs">Fecha</th>
                <th className="py-2 font-mono uppercase text-3xs text-right">Nota</th>
                <th className="py-2 font-mono uppercase text-3xs text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {persona.intentos.map((it, i) => {
                const aprobado = it.porcentaje >= UMBRAL_APROBACION;
                return (
                  <tr key={it.id} className={`border-t ${t.border}`}>
                    <td className="py-2 font-mono">{i + 1}</td>
                    <td className="py-2 font-mono whitespace-nowrap">{it.fecha ? formatFechaCorta(it.fecha) : '—'}</td>
                    <td className="py-2 text-right font-mono font-semibold" style={{ color: aprobado ? '#22C55E' : '#EF4444' }}>{it.porcentaje}%</td>
                    <td className="py-2 text-right" style={{ color: aprobado ? '#22C55E' : '#EF4444' }}>{aprobado ? '✓ Aprobado' : '✗ No aprobado'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button variant="outline" t={t} accent={accent} className="mt-4" onClick={onClose}>Cerrar</Button>
      </div>
    </div>
  );
}

// Tecnovigilancia: documentación transversal (compartida por todas las empresas) +
// reportes trimestrales que se consultan empresa → sede → año → trimestre.
function TecnovigilanciaPage({ transversal, reportes, comites, activeCompany, t, accent, onUpdateTransversal, onUpdateReporte, onGuardarComite, onEliminarComite, readOnly }) {
  // El documento único compartido por todas las empresas solo lo edita el SUPER_ADMIN (la
  // API lo exige igual: 403 para cualquier otro rol).
  const isSuper = useContext(AuthUserContext)?.role === 'SUPER_ADMIN';
  const [subTab, setSubTab] = useState('documentacion');
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
      <p className={`text-xs mb-4 ${t.muted}`}>Documentación, comités y reportes trimestrales de tecnovigilancia por empresa.</p>

      <div className={`flex gap-1 mb-5 border-b ${t.border}`}>
        {[{ key: 'documentacion', label: 'Documentación' }, { key: 'comites', label: 'Comités de tecnovigilancia' }].map(sub => (
          <button key={sub.key} onClick={() => setSubTab(sub.key)}
            className="px-3 py-2 text-xs font-semibold -mb-px border-b-2 transition"
            style={subTab === sub.key ? { borderColor: accent, color: accent } : { borderColor: 'transparent' }}>
            {sub.label}
          </button>
        ))}
      </div>

      {subTab === 'documentacion' && (
        <>
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
        </>
      )}

      {subTab === 'comites' && (
        <>
          {/* Un solo bloque para los dos documentos por empresa (acta + seguimiento de
              alertas) en vez de una sección completa por documento — con una sola empresa
              activa eso dejaba cada tarjeta sola en su propia fila, una debajo de la otra,
              ocupando mucho más alto de lo necesario para dos campos de URL. */}
          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-wide mb-3">Documentos del comité</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
              {[TECNO_ACTA_COMITE_DOC, TECNO_SEGUIMIENTO_ALERTAS_DOC].flatMap(doc =>
                empresasKpi.map(c => ({ doc, c })),
              ).map(({ doc, c }) => {
                const DocIcon = doc.icon;
                return (
                  <div key={`${doc.key}-${c.key}`} className={`rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition ${t.panel} ${t.border}`}>
                    <div className="h-1" style={{ background: c.color }} />
                    <div className="p-3.5 flex flex-col gap-2.5">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: c.color + '1A', color: c.color }}>
                          <DocIcon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold wrap-break-word">{doc.label}</div>
                          <div className="text-2xs mt-0.5 font-semibold" style={{ color: c.color }}>{c.key}</div>
                        </div>
                      </div>
                      <DocumentoEstadoAcciones url={urlDeDoc(doc, c.key)}
                        onChange={v => onUpdateTransversal(doc.key, c.key, v)} readOnly={readOnly} t={t} accent={c.color} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <TecnoComitesSeccion comites={comites} empresasKpi={empresasKpi} modoGlobal={modoGlobal}
            t={t} accent={accent} onGuardar={onGuardarComite} onEliminar={onEliminarComite} readOnly={readOnly} />
        </>
      )}
    </div>
  );
}

// Comités de tecnovigilancia — URL (+ nombre, fecha, estado, observaciones) de la reunión
// trimestral del comité de cada empresa, administrada desde una grilla Empresa × Trimestre
// (un comité es por empresa completa, sin sede). Disponible tanto con "Todas las empresas"
// seleccionadas (consolidado, con filtro de empresa) como dentro de una empresa puntual
// (empresasKpi ya viene recortado a esa única empresa — ver TecnovigilanciaPage).
function TecnoComitesSeccion({ comites, empresasKpi, modoGlobal, t, accent, onGuardar, onEliminar, readOnly }) {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [trimestreFiltro, setTrimestreFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(null); // { empresaKey, trimestre } mientras está abierto

  const registroDe = (empresaKey, trKey) => comites?.[empresaKey]?.[anio]?.[trKey] || null;

  let registrados = 0;
  empresasKpi.forEach(c => TECNO_TRIMESTRES.forEach(tr => { if (registroDe(c.key, tr.key)?.url) registrados++; }));
  const totalSlots = empresasKpi.length * TECNO_TRIMESTRES.length;
  const pendientes = totalSlots - registrados;

  const trimestresVisibles = trimestreFiltro ? TECNO_TRIMESTRES.filter(tr => tr.key === trimestreFiltro) : TECNO_TRIMESTRES;
  const busquedaNorm = busqueda.trim().toLowerCase();
  const empresasFiltradas = empresasKpi
    .filter(c => !empresaFiltro || c.key === empresaFiltro)
    .filter(c => !busquedaNorm || c.key.toLowerCase().includes(busquedaNorm)
      || TECNO_TRIMESTRES.some(tr => (registroDe(c.key, tr.key)?.nombreComite || '').toLowerCase().includes(busquedaNorm)))
    .filter(c => !estadoFiltro || trimestresVisibles.some(tr => (registroDe(c.key, tr.key)?.estado || 'Pendiente') === estadoFiltro));

  const hayFiltrosActivos = Boolean(empresaFiltro || trimestreFiltro || estadoFiltro || busqueda);
  const limpiarFiltros = () => { setEmpresaFiltro(''); setTrimestreFiltro(''); setEstadoFiltro(''); setBusqueda(''); };

  const primerPendiente = (empresaKey) => {
    const candidato = trimestresVisibles.find(tr => !registroDe(empresaKey, tr.key)?.url) || trimestresVisibles[0] || TECNO_TRIMESTRES[0];
    return candidato.key;
  };

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <HeroStat t={t} label="Total de empresas" color={accent} value={empresasKpi.length} sub={modoGlobal ? 'empresa activa' : 'con módulo de tecnovigilancia'} />
        <HeroStat t={t} label="Comités programados" color="#3B82F6" value={totalSlots} sub={`${anio} · empresas × trimestres`} />
        <HeroStat t={t} label="Enlaces registrados" color="#22C55E" value={registrados} sub={`${anio} · con URL cargada`} />
        <HeroStat t={t} label="Enlaces pendientes" color="#F59E0B" value={pendientes} sub={`${anio} · por registrar`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {modoGlobal && (
          <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
            <option value="">Toda empresa</option>
            {empresasKpi.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
          </select>
        )}
        <select value={trimestreFiltro} onChange={e => setTrimestreFiltro(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo trimestre</option>
          {TECNO_TRIMESTRES.map(tr => <option key={tr.key} value={tr.key}>{tr.label}</option>)}
        </select>
        <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo estado</option>
          {TECNO_COMITE_ESTADOS.map(es => <option key={es} value={es}>{es}</option>)}
        </select>
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar empresa o comité…"
          className={`rounded-md px-2.5 py-1.5 text-xs border ${t.input}`} />
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setAnio(a => a - 1)} className={`w-7 h-7 flex items-center justify-center rounded-md border ${t.border} ${t.muted} hover:opacity-70`}>
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-bold font-mono">{anio}</span>
          <button onClick={() => setAnio(a => a + 1)} className={`w-7 h-7 flex items-center justify-center rounded-md border ${t.border} ${t.muted} hover:opacity-70`}>
            <ChevronRight size={14} />
          </button>
        </div>
        {hayFiltrosActivos && <Button variant="ghost" t={t} icon={X} iconSize={12} onClick={limpiarFiltros}>Limpiar filtros</Button>}
      </div>

      <div className={`rounded-xl border overflow-hidden ${t.panel} ${t.border}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-2xs">
            <thead>
              <tr className={`text-left ${t.muted} border-b ${t.border}`}>
                <th className="px-5 py-2 font-mono uppercase text-3xs">Empresa</th>
                <th className="px-3 py-2 font-mono uppercase text-3xs">Año</th>
                {trimestresVisibles.map(tr => <th key={tr.key} className="px-3 py-2 font-mono uppercase text-3xs">{tr.key.toUpperCase()}</th>)}
                <th className="px-3 py-2 font-mono uppercase text-3xs">Estado</th>
                <th className="px-3 py-2 pr-5 font-mono uppercase text-3xs text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresasFiltradas.length === 0 ? (
                <tr><td colSpan={4 + trimestresVisibles.length} className={`text-center py-6 ${t.muted}`}>Sin empresas para los filtros actuales.</td></tr>
              ) : empresasFiltradas.map(c => {
                const registradosFila = trimestresVisibles.filter(tr => registroDe(c.key, tr.key)?.url).length;
                const estadoColor = registradosFila === 0 ? '#94A3B8' : registradosFila === trimestresVisibles.length ? '#22C55E' : '#F59E0B';
                const estadoLabel = registradosFila === 0 ? 'Pendiente' : registradosFila === trimestresVisibles.length ? 'Completo' : 'En progreso';
                return (
                  <tr key={c.key} className={`border-t ${t.border}`}>
                    <td className="px-5 py-2 font-semibold" style={{ color: c.color }}>{c.key}</td>
                    <td className="px-3 py-2 font-mono">{anio}</td>
                    {trimestresVisibles.map(tr => {
                      const reg = registroDe(c.key, tr.key);
                      const tieneUrl = !!reg?.url;
                      return (
                        <td key={tr.key} className="px-3 py-2">
                          <button onClick={() => setModal({ empresaKey: c.key, trimestre: tr.key })}
                            className={tieneUrl ? 'font-semibold underline' : `underline decoration-dashed ${t.muted}`}
                            style={tieneUrl ? { color: accent } : undefined}>
                            {tieneUrl ? 'Ver enlace' : 'Registrar'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2"><Badge color={estadoColor}>{estadoLabel} · {registradosFila}/{trimestresVisibles.length}</Badge></td>
                    <td className="px-3 py-2 pr-5 text-right">
                      <button onClick={() => setModal({ empresaKey: c.key, trimestre: trimestreFiltro || primerPendiente(c.key) })}
                        title="Editar" aria-label={`Editar comités de ${c.key}`} className={`inline-flex items-center justify-center w-7 h-7 rounded-md border ${t.border} hover:opacity-70`}>
                        <Pencil size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <TecnoComiteModal
          empresaKey={modal.empresaKey} anio={anio} trimestreInicial={modal.trimestre}
          comites={comites} t={t} accent={accent} readOnly={readOnly}
          onGuardar={onGuardar} onEliminar={onEliminar} onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// Modal de alta/edición de UN comité de tecnovigilancia (empresa · año · trimestre). Empresa
// y año también son seleccionables dentro del modal (pedido explícito del diseño) — al
// cambiarlos, el formulario se resincroniza con el registro existente de la nueva combinación
// (si lo hay), igual que DateInput resincroniza su texto cuando `value` cambia desde afuera.
function TecnoComiteModal({ empresaKey, anio, trimestreInicial, comites, t, accent, readOnly, onGuardar, onEliminar, onClose }) {
  const [empresa, setEmpresa] = useState(empresaKey);
  const [anioSel, setAnioSel] = useState(anio);
  const [trimestre, setTrimestre] = useState(trimestreInicial);
  const [url, setUrl] = useState('');
  const [nombreComite, setNombreComite] = useState('');
  const [fechaReunion, setFechaReunion] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [estado, setEstado] = useState('Pendiente');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  // Cada vez que empresa/año/trimestre cambian (incluida la primera vez), el formulario se
  // resincroniza con lo que ya exista guardado para esa combinación puntual — así elegir una
  // empresa u otra en el selector nunca mezcla los datos de una con los de otra.
  const comboKey = `${empresa}|${anioSel}|${trimestre}`;
  const [prevCombo, setPrevCombo] = useState(null);
  if (comboKey !== prevCombo) {
    setPrevCombo(comboKey);
    const r = comites?.[empresa]?.[anioSel]?.[trimestre] || null;
    setUrl(r?.url || '');
    setNombreComite(r?.nombreComite || '');
    setFechaReunion(r?.fechaReunion || '');
    setObservaciones(r?.observaciones || '');
    setEstado(r?.estado || 'Pendiente');
    setError('');
    setConfirmarEliminar(false);
  }
  const existe = !!comites?.[empresa]?.[anioSel]?.[trimestre];

  const anioActual = new Date().getFullYear();
  const aniosOpciones = [...new Set([anioActual - 2, anioActual - 1, anioActual, anioActual + 1, anioActual + 2, anio, anioSel])].sort((a, b) => a - b);
  const empresasOpciones = COMPANIES;

  const handleGuardar = async () => {
    const urlLimpia = url.trim();
    if (urlLimpia && !/^https?:\/\//i.test(urlLimpia)) {
      setError('El enlace debe comenzar con http:// o https://.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onGuardar(empresa, anioSel, trimestre, {
        url: urlLimpia, nombreComite: nombreComite.trim(), fechaReunion, observaciones: observaciones.trim(), estado,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el comité.');
      setSaving(false);
    }
  };

  const handleEliminar = async () => {
    setSaving(true);
    try {
      await onEliminar(empresa, anioSel, trimestre);
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el comité.');
      setSaving(false);
      setConfirmarEliminar(false);
    }
  };

  const trSel = TECNO_TRIMESTRES.find(tr => tr.key === trimestre);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={saving ? undefined : onClose} />
      <div className={`animate-modal-in relative w-full max-w-lg rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-semibold">Comité de tecnovigilancia</div>
          <button onClick={onClose} disabled={saving} aria-label="Cerrar" className="flex items-center justify-center w-11 h-11 -mr-2 -mt-2"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mb-2.5">
          <Field dense label="Empresa">
            <SelectInput dense t={t} disabled={readOnly || saving} value={empresa} options={empresasOpciones.map(c => c.key)} onChange={setEmpresa} />
          </Field>
          <Field dense label="Año">
            <SelectInput dense t={t} disabled={readOnly || saving} value={String(anioSel)} options={aniosOpciones.map(String)} onChange={v => setAnioSel(Number(v))} />
          </Field>
          <Field dense label="Trimestre">
            <select value={trimestre} onChange={e => setTrimestre(e.target.value)} disabled={readOnly || saving}
              className={`rounded-md border px-2 py-1 text-2xs ${t.input} ${(readOnly || saving) ? 'opacity-60 cursor-not-allowed' : ''}`}>
              {TECNO_TRIMESTRES.map(tr => <option key={tr.key} value={tr.key}>{tr.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="space-y-2.5">
          <Field dense label="URL del comité">
            <TextInput dense t={t} value={url} disabled={readOnly || saving} placeholder="https://…" onChange={setUrl} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <Field dense label="Nombre del comité (opcional)">
              <TextInput dense t={t} value={nombreComite} disabled={readOnly || saving} placeholder={`Comité ${trSel?.label || ''} ${empresa}`} onChange={setNombreComite} />
            </Field>
            <Field dense label="Fecha de reunión (opcional)">
              <TextInput dense t={t} type="date" value={fechaReunion} disabled={readOnly || saving} onChange={setFechaReunion} />
            </Field>
          </div>
          <Field dense label="Estado">
            <SelectInput dense t={t} disabled={readOnly || saving} value={estado} options={TECNO_COMITE_ESTADOS} onChange={setEstado} />
          </Field>
          <Field dense label="Observaciones (opcional)">
            <textarea rows={3} value={observaciones} disabled={readOnly || saving} onChange={e => setObservaciones(e.target.value)}
              className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input} ${(readOnly || saving) ? 'opacity-60' : ''}`} />
          </Field>
        </div>

        {error && <p className="text-2xs mt-3" style={{ color: '#EF4444' }}>{error}</p>}

        {confirmarEliminar ? (
          <div className="mt-4 rounded-md border p-3 text-2xs" style={{ borderColor: '#EF444455', background: '#EF444415' }}>
            <p className="mb-2" style={{ color: '#EF4444' }}>¿Eliminar este registro de comité? Esta acción no se puede deshacer.</p>
            <div className="flex gap-2">
              <Button variant="danger" t={t} size="sm" disabled={saving} onClick={handleEliminar}>Sí, eliminar</Button>
              <Button variant="ghost" t={t} size="sm" disabled={saving} onClick={() => setConfirmarEliminar(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {!readOnly && <Button variant="primary" accent={accent} t={t} disabled={saving} onClick={handleGuardar}>Guardar</Button>}
            <Button variant="ghost" t={t} disabled={saving} onClick={onClose}>Cancelar</Button>
            {url.trim() && <Button variant="outline" t={t} icon={ExternalLink} iconSize={12} onClick={() => window.open(url.trim(), '_blank', 'noopener,noreferrer')}>Abrir enlace</Button>}
            {!readOnly && existe && (
              <Button variant="ghost" t={t} icon={Trash2} iconSize={12} className="ml-auto" style={{ color: '#EF4444' }} disabled={saving} onClick={() => setConfirmarEliminar(true)}>
                Eliminar
              </Button>
            )}
          </div>
        )}
      </div>
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
  // Un usuario EMPRESA/LECTURA puede tener VARIAS empresas asignadas (empresa_ids) — además
  // de las activas, se muestran las que ya tenía (por si alguna quedó inactiva mientras tanto,
  // para no hacerla "desaparecer" del formulario sin explicación).
  const asignadasActuales = usuario?.empresa_ids?.length ? usuario.empresa_ids : (usuario?.empresa_id ? [usuario.empresa_id] : []);
  const activas = empresas.filter(e => e.estado === 'activo' || asignadasActuales.includes(e.id));
  const [form, setForm] = useState(() => ({
    nombre: usuario?.nombre || '', email: usuario?.email || '', password: '',
    role: usuario?.role || 'EMPRESA', empresa_ids: asignadasActuales, estado: usuario?.estado || 'activo',
  }));
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const patch = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrores(e => ({ ...e, [k]: undefined })); };
  const requiereEmpresa = form.role !== 'SUPER_ADMIN';
  const toggleEmpresa = (id) => {
    patch('empresa_ids', form.empresa_ids.includes(id) ? form.empresa_ids.filter(x => x !== id) : [...form.empresa_ids, id]);
  };

  const guardar = async () => {
    const locales = {};
    if (!form.nombre.trim()) locales.nombre = 'Campo obligatorio.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) locales.email = 'Email no válido.';
    if (!editando && form.password.length < 8) locales.password = 'Mínimo 8 caracteres.';
    if (editando && form.password && form.password.length < 8) locales.password = 'Mínimo 8 caracteres.';
    if (requiereEmpresa && form.empresa_ids.length === 0) locales.empresa_id = 'Selecciona al menos una empresa.';
    if (Object.keys(locales).length) { setErrores(locales); return; }
    setGuardando(true);
    setError('');
    const body = { ...form, empresa_ids: requiereEmpresa ? form.empresa_ids : [] };
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
        <Field label="Estado"><SelectInput t={t} value={form.estado} options={['activo', 'inactivo']} onChange={v => patch('estado', v)} /><FieldError error={errores.estado} /></Field>
      </div>
      {/* Empresa(s): un usuario puede tener acceso a VARIAS, no solo una — cada una la ve y
          trabaja por separado (nunca una vista mezclada), con un selector para cambiar entre
          ellas si tiene más de una (ver el selector de empresa de la app principal). */}
      <Field label={requiereEmpresa ? 'Empresas *' : 'Empresas'} dense>
        {requiereEmpresa ? (
          <div className={`rounded-md border p-2 grid sm:grid-cols-2 gap-1.5 ${t.input}`}>
            {activas.length === 0
              ? <span className={`text-2xs col-span-2 ${t.muted}`}>No hay empresas activas para asignar.</span>
              : activas.map(e => (
                <label key={e.id} className="flex items-center gap-2 text-xs cursor-pointer select-none py-0.5">
                  <input type="checkbox" checked={form.empresa_ids.includes(e.id)} onChange={() => toggleEmpresa(e.id)} />
                  {e.nombre}{e.estado !== 'activo' ? ' (inactiva)' : ''}
                </label>
              ))}
          </div>
        ) : (
          <div className={`rounded-md border px-2.5 py-1.5 text-xs opacity-60 ${t.input}`}>Todas (acceso global)</div>
        )}
        <FieldError error={errores.empresa_id} />
      </Field>
      <p className={`text-3xs mt-3 ${t.muted}`}>
        {form.role === 'SUPER_ADMIN'
          ? 'El super administrador tiene acceso global a todas las empresas y al módulo de administración.'
          : form.role === 'LECTURA'
            ? 'Solo puede consultar la información de sus empresas (cada una por separado); no puede crear ni modificar registros.'
            : 'Puede consultar y gestionar la información de sus empresas asignadas, cada una por separado.'}
        {editando && ' Si cambias las empresas asignadas, el rol, el estado o la contraseña, sus sesiones abiertas se cierran.'}
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
  const empresaIdsDeUi = (u) => (u.empresa_ids?.length ? u.empresa_ids : (u.empresa_id ? [u.empresa_id] : []));
  const lista = (usuarios || [])
    .filter(u => !filtroEmpresa || (filtroEmpresa === '__global' ? empresaIdsDeUi(u).length === 0 : empresaIdsDeUi(u).includes(filtroEmpresa)))
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
                    <td className="px-3 py-2">
                      {empresaIdsDeUi(u).length === 0
                        ? <span className={t.muted}>Todas</span>
                        : empresaIdsDeUi(u).map(id => nombreEmpresa(id)).join(', ')}
                    </td>
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

  // Cambia la empresa ACTIVA de la sesión (un usuario EMPRESA/LECTURA puede tener varias
  // asignadas — ver api/login.js ?action=switch-empresa). Reutiliza checkSession() para
  // releer user/empresas ya actualizados del servidor — MainApp se vuelve a montar entero
  // (ver su `key` más abajo) y así todos sus datos, cargados cada uno con su propio useEffect
  // de una sola vez, quedan recargados ya con el alcance de la empresa nueva.
  const cambiarEmpresaActiva = async (empresaId) => {
    const res = await fetch('/api/login?action=switch-empresa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa_id: empresaId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'No se pudo cambiar de empresa.');
    }
    // La caché local guarda la última respuesta de cada loadX() bajo una clave fija (p. ej.
    // "cmms-equipos"), sin importar de qué empresa era — correcto cuando un mismo usuario solo
    // tenía una, pero ahora que puede cambiar de empresa activa, esa caché quedaría con datos
    // de la empresa ANTERIOR. Se limpia aquí mismo (no solo en claimDataCaches, que solo actúa
    // si cambia el userId) para que, si justo después falla la recarga por red, el fallback de
    // loadX() no muestre por error datos de la otra empresa en vez de un estado vacío/erróneo.
    clearDataCaches();
    checkSession();
  };

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
      return <LandingPage onIniciarSesion={() => setShowLogin(true)} onReportarFalla={() => setPublicView('reporte')} />;
    }
    return (
      <LoginScreen
        notice={sessionNotice}
        onLogin={() => { setSessionNotice(''); checkSession(); }}
        onReportarFalla={() => setPublicView('reporte')}
        onBack={sessionNotice ? undefined : () => setShowLogin(false)}
      />
    );
  }

  const readOnly = user.role === 'LECTURA';
  return (
    <AuthUserContext.Provider value={user}>
      <ReadOnlyContext.Provider value={readOnly}>
        {/* key: si cambia el usuario, o la empresa activa de su sesión (ver
            cambiarEmpresaActiva), MainApp se monta de cero — sin estado de otra sesión ni de
            otra empresa a medio cargar. */}
        <MainApp key={`${user.id}:${user.empresa_id || ''}`} user={user} entorno={session.entorno}
          onLogout={() => cerrarSesion()} onSwitchEmpresa={cambiarEmpresaActiva} readOnly={readOnly} />
        {sessionWarning && (
          <SessionWarningModal segundos={warningSegundos} onContinuar={() => setSessionWarning(false)} onCerrarAhora={() => cerrarSesion()} />
        )}
      </ReadOnlyContext.Provider>
    </AuthUserContext.Provider>
  );
}
