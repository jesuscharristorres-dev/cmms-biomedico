import React, { useState, useEffect, useMemo, useRef, useContext } from 'react';
import {
  Search, Plus, Trash2, Sun, Moon, X, Menu,
  LayoutDashboard, Building2, ListTree,
  Settings, BellRing, AlertTriangle, Lock,
  FolderOpen, ShieldAlert,
  CheckCircle2, MapPin,
  IdCard, Save, SprayCan, Pencil,
  GraduationCap, Users, UserPlus, Power, UserCog, Link2
} from 'lucide-react';
// La v9 de `read-excel-file` movió la lectura de una sola hoja al export nombrado `readSheet`
// (el default export ahora devuelve TODAS las hojas del libro, envueltas en `{ sheet, data }`,
// no las filas directamente) — hay que usar `readSheet` para seguir recibiendo el arreglo de
// filas plano que el resto de esta función espera.
import { readSheet } from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import { formatFechaCorta } from './utils/fechas.js';
import { uid } from './utils/id.js';
import { uiTheme } from './utils/theme.js';
import { apiFetch } from './services/apiFetch.js';
import { DEFAULT_COMPANIES, COMPANIES, NEUTRAL_ACCENT, setCompanies, normSede, registrarSedesEnUso, companyOf, themeOf } from './data/empresas.js';
// Plan de división de App.jsx (ver docs/ del proyecto): primitivas de interfaz sin lógica de
// negocio, y páginas pequeñas ya extraídas a sus propios archivos. El resto de la app sigue
// igual, solo cambió dónde vive el código.
import { Button, Badge, Field, TextInput, SelectInput } from './components/ui.jsx';
import AuthUserContext from './context/AuthUserContext.js';
import EmpresasPage from './components/empresas/EmpresasPage.jsx';
import AlertasPage from './components/dashboard/AlertasPage.jsx';
import Dashboard from './components/dashboard/DashboardPage.jsx';
import PlanesProgramasPage from './components/planes-programas/PlanesProgramasPage.jsx';
import EquipoDrawer from './components/equipos/EquipoDrawer.jsx';
import ObsModal from './components/equipos/ObsModal.jsx';
import ReportesFallaPage from './components/reportes-falla/ReportesFallaPage.jsx';
import PersonalPage from './components/personal/PersonalPage.jsx';
import LimpiezaDesinfeccionPage from './components/limpieza/LimpiezaDesinfeccionPage.jsx';
import InventarioPage from './components/inventario/InventarioPage.jsx';
import CapacitacionesPage from './components/capacitaciones/CapacitacionesPage.jsx';
import TecnovigilanciaPage from './components/tecnovigilancia/TecnovigilanciaPage.jsx';
import LandingPage from './components/public/LandingPage.jsx';
import LoginScreen from './components/public/LoginScreen.jsx';
import ReporteFallaForm from './components/public/ReporteFallaForm.jsx';
// Logo institucional real (ring + wordmark ya integrados en el PNG) — usado en el sidebar
// y en las pantallas públicas (LandingPage/LoginScreen/ReporteFallaForm, que lo importan
// cada una por su cuenta).
import logoIngenieriaClinica from './assets/logo-ingenieria-clinica.png';

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
