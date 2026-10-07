// src/platform/PortalInicio.jsx
// Capa de "plataforma" de la aplicación: encabezado corporativo, portal de inicio con los
// módulos de la organización y la pantalla informativa de los módulos que todavía no tienen
// pantallas propias. No carga datos por su cuenta: MainApp le pasa lo que ya tiene en
// memoria (equipos, reportes, empresas...), así que no agrega llamadas a la API salvo el
// conteo de usuarios del SUPER_ADMIN (ver MainApp).
//
// Regla de honestidad: todo indicador sin fuente real se muestra como "--" con la leyenda
// "Próximamente"; toda función sin pantalla real se muestra como proyectada, nunca como
// enlace (no hay rutas rotas).

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Bell, Building2, ChevronDown, ChevronRight, CircleCheck, Clock,
  Info, Layers, Lock, LogOut, Menu, ShieldCheck,
} from 'lucide-react';
import { ESTADOS_MODULO, MODULOS, PLATAFORMA_NOMBRE, menuDeModulo } from './modulos';

const PLATAFORMA_DESCRIPCION = 'Un solo lugar para gestionar los procesos críticos de la organización.';

const HERO_BG = 'linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #134E4A 100%)';

function iniciales(texto) {
  const partes = String(texto || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
}

function EstadoBadge({ estado, compacto }) {
  const e = ESTADOS_MODULO[estado] || ESTADOS_MODULO.PROXIMAMENTE;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide whitespace-nowrap ${compacto ? 'px-2 py-0.5 text-3xs' : 'px-2.5 py-1 text-3xs'}`}
      style={{ background: e.color + '1A', color: e.color, border: `1px solid ${e.color}40` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.color }} />
      {e.label}
    </span>
  );
}

// Destino del botón principal de un módulo: la entrada real si el módulo está activo y
// tiene pantallas; si no, su pantalla informativa (siempre existe, nunca un 404).
function accionModulo(modulo, { permitido, canOpen }) {
  if (!permitido) return { tipo: 'sin_acceso', label: 'Sin acceso' };
  if (modulo.demo && modulo.entrada && canOpen(modulo.entrada)) {
    return { tipo: 'ingresar', label: 'Ingresar al módulo (demo)', destino: modulo.entrada };
  }
  if (modulo.estado === 'ACTIVO' && modulo.entrada && canOpen(modulo.entrada)) {
    return { tipo: 'ingresar', label: 'Ingresar al módulo', destino: modulo.entrada };
  }
  return {
    tipo: 'info',
    label: modulo.estado === 'PROXIMAMENTE' ? 'Próximamente' : 'Ver módulo',
    destino: menuDeModulo(modulo.key),
  };
}

/* ---------------------------------------------------------------- */
/* ENCABEZADO CORPORATIVO                                             */
/* ---------------------------------------------------------------- */
// Ícono del módulo en un recuadro de su color — reemplaza al logo de Ingeniería Clínica (que es
// solo del área biomédica) dentro de módulos con identidad propia, como Gestión Humana.
export function MarcaModulo({ modulo, size = 36 }) {
  const Icono = modulo.icon;
  return (
    <span className="shrink-0 inline-flex items-center justify-center rounded-xl text-white"
      style={{ width: size, height: size, background: modulo.color }} title={modulo.nombre}>
      <Icono size={Math.round(size * 0.5)} />
    </span>
  );
}

// `marcaModulo`: módulo cuyo ícono se muestra en lugar del logo (ver MarcaModulo).
export function PlatformHeader({
  t, dark, user, rolLabel, empresaLabel, seccion, logo, marcaModulo, acento, notificaciones, onNotificaciones,
  modulosHabilitados, onLogout, onOpenMenu, onInicio,
}) {
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const perfilRef = useRef(null);

  useEffect(() => {
    if (!perfilAbierto) return undefined;
    const cerrar = (e) => { if (perfilRef.current && !perfilRef.current.contains(e.target)) setPerfilAbierto(false); };
    const conTecla = (e) => { if (e.key === 'Escape') setPerfilAbierto(false); };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', conTecla);
    return () => { document.removeEventListener('mousedown', cerrar); document.removeEventListener('keydown', conTecla); };
  }, [perfilAbierto]);

  const nombre = user?.nombre || user?.email || 'Usuario';
  // `acento`: color propio del módulo (Gestión Humana); por defecto, el verde azulado de la plataforma.
  const colorMarca = acento || '#0F766E';
  const hayNotificaciones = typeof notificaciones === 'number' && notificaciones > 0;

  return (
    <header className={`shrink-0 flex items-center gap-2 px-2 sm:px-4 border-b ${t.panel} ${t.border}`} style={{ minHeight: 56 }}>
      <button onClick={onOpenMenu} aria-label="Abrir menú"
        className={`lg:hidden flex items-center justify-center w-11 h-11 rounded-md ${t.muted}`}>
        <Menu size={20} />
      </button>

      <button onClick={onInicio} className="flex items-center gap-2.5 min-w-0 text-left" title="Ir al inicio del módulo">
        {marcaModulo
          ? <span className="lg:hidden"><MarcaModulo modulo={marcaModulo} size={30} /></span>
          : <img src={logo} alt="" width={30} height={30} className="shrink-0 lg:hidden" style={{ objectFit: 'contain' }} />}
        <div className="min-w-0">
          <div className="text-3xs uppercase tracking-widest font-semibold truncate" style={{ color: dark ? (acento ? '#FDBA9C' : '#5EEAD4') : colorMarca }}>
            {PLATAFORMA_NOMBRE}
          </div>
          <div className="hidden sm:flex items-center gap-1 text-xs font-semibold truncate">
            {seccion.map((s, i) => (
              <React.Fragment key={s + i}>
                {i > 0 && <ChevronRight size={12} className={t.muted} />}
                <span className={i < seccion.length - 1 ? t.muted : ''}>{s}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="sm:hidden text-xs font-semibold truncate">{seccion[seccion.length - 1]}</div>
        </div>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {empresaLabel && (
          <span className={`hidden md:inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-2xs font-semibold border ${t.border}`}
            title="Empresa actual">
            <Building2 size={12} className={t.muted} /> {empresaLabel}
          </span>
        )}

        <button onClick={onNotificaciones} disabled={!onNotificaciones}
          aria-label={hayNotificaciones ? `${notificaciones} reportes de falla nuevos` : 'Notificaciones'}
          title={hayNotificaciones ? `${notificaciones} reporte${notificaciones !== 1 ? 's' : ''} de falla sin revisar` : 'Sin notificaciones nuevas'}
          className={`relative flex items-center justify-center w-11 h-11 rounded-md transition ${t.muted} ${onNotificaciones ? 'hover:bg-slate-500/10' : 'cursor-default'}`}>
          <Bell size={18} />
          {hayNotificaciones && (
            <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full text-3xs font-mono font-bold flex items-center justify-center text-white" style={{ background: '#EF4444' }}>
              {notificaciones > 99 ? '99+' : notificaciones}
            </span>
          )}
        </button>

        <div className="relative" ref={perfilRef}>
          <button onClick={() => setPerfilAbierto(v => !v)} aria-haspopup="menu" aria-expanded={perfilAbierto}
            className="flex items-center gap-2 h-11 pl-1 pr-2 rounded-md hover:bg-slate-500/10 transition">
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-2xs font-bold text-white shrink-0" style={{ background: colorMarca }}>
              {iniciales(nombre)}
            </span>
            <span className="hidden md:block text-left min-w-0 max-w-40">
              <span className="block text-xs font-semibold truncate">{nombre}</span>
              <span className={`block text-3xs truncate ${t.muted}`}>{rolLabel}</span>
            </span>
            <ChevronDown size={14} className={t.muted} />
          </button>
          {perfilAbierto && (
            <div role="menu" className={`absolute right-0 top-12 z-50 w-72 rounded-xl border shadow-xl p-4 ${t.panel} ${t.border}`}>
              <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: 'inherit' }}>
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: colorMarca }}>
                  {iniciales(nombre)}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{nombre}</div>
                  {user?.email && <div className={`text-2xs truncate ${t.muted}`}>{user.email}</div>}
                </div>
              </div>
              <dl className="py-3 space-y-1.5 text-2xs">
                <div className="flex justify-between gap-3"><dt className={t.muted}>Rol</dt><dd className="font-semibold text-right">{rolLabel}</dd></div>
                <div className="flex justify-between gap-3"><dt className={t.muted}>Empresa</dt><dd className="font-semibold text-right truncate">{empresaLabel || '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className={t.muted}>Módulos habilitados</dt><dd className="font-semibold text-right">{modulosHabilitados}</dd></div>
              </dl>
              <button onClick={() => { setPerfilAbierto(false); onLogout(); }} role="menuitem"
                className={`w-full flex items-center justify-center gap-2 rounded-md min-h-10 text-xs font-semibold border ${t.border} hover:bg-slate-500/10 transition`}>
                <LogOut size={14} /> Cerrar sesión
              </button>
            </div>
          )}
        </div>

        <button onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión"
          className={`hidden sm:flex items-center justify-center w-11 h-11 rounded-md hover:bg-slate-500/10 transition ${t.muted}`}>
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- */
/* PIEZAS DEL PORTAL                                                  */
/* ---------------------------------------------------------------- */
function KpiCard({ t, label, value, sub, color, onClick, proximamente }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick}
      className={`text-left rounded-xl border p-4 relative overflow-hidden ${t.panel} ${t.border} ${onClick ? 'transition hover:shadow-md hover:-translate-y-0.5' : ''}`}>
      <div className="absolute top-0 left-0 w-full h-[3px]" style={{ background: proximamente ? '#CBD5E1' : color }} />
      <div className={`text-3xs uppercase tracking-wide font-semibold mb-1.5 ${t.muted}`}>{label}</div>
      <div className="text-2xl font-bold font-mono" style={{ color: proximamente ? undefined : color }}>
        <span className={proximamente ? t.muted : ''}>{value}</span>
      </div>
      <div className={`text-2xs mt-1 ${t.muted}`}>{proximamente ? 'Próximamente' : sub}</div>
    </Tag>
  );
}

function FuncionChip({ f, t, habilitada, onNavigate }) {
  if (f.menu && habilitada) {
    return (
      <button onClick={() => onNavigate(f.menu)}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-2xs border transition hover:bg-slate-500/10 ${t.border}`}>
        <CircleCheck size={11} style={{ color: '#16A34A' }} /> {f.label}
      </button>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-2xs border border-dashed ${t.border} ${t.muted}`}
      title={f.menu ? 'Sin acceso con tu usuario' : 'Funcionalidad proyectada — próximamente'}>
      {f.menu ? <Lock size={10} /> : <Clock size={10} />} {f.label}
    </span>
  );
}

function BotonModulo({ accion, color, onNavigate, compacto }) {
  const base = `inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition ${compacto ? 'min-h-9 px-3 text-2xs' : 'min-h-10 px-4 text-xs'}`;
  if (accion.tipo === 'sin_acceso') {
    return <span className={`${base} border border-slate-300/60 text-slate-400 cursor-not-allowed`}><Lock size={12} /> {accion.label}</span>;
  }
  if (accion.tipo === 'ingresar') {
    return (
      <button onClick={() => onNavigate(accion.destino)} className={`${base} text-white hover:brightness-110 shadow-sm`} style={{ background: color }}>
        {accion.label} <ArrowRight size={14} />
      </button>
    );
  }
  return (
    <button onClick={() => onNavigate(accion.destino)} className={`${base} border hover:bg-slate-500/10`} style={{ borderColor: color + '66', color }}>
      {accion.label} <ArrowRight size={13} />
    </button>
  );
}

function ModuloPrincipalCard({ modulo, t, permitido, canOpen, onNavigate, stats }) {
  const Icon = modulo.icon;
  const accion = accionModulo(modulo, { permitido, canOpen });
  return (
    <article className={`group flex flex-col rounded-2xl border overflow-hidden transition duration-200 hover:shadow-xl hover:-translate-y-0.5 ${t.panel} ${t.border}`}>
      <div className="h-1" style={{ background: modulo.color }} />
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: modulo.color + '1A', color: modulo.color }}>
            <Icon size={24} />
          </div>
          <EstadoBadge estado={modulo.estado} />
        </div>
        <h3 className="mt-4 text-base font-bold leading-tight">{modulo.nombre}</h3>
        {modulo.subtitulo && <div className="text-3xs uppercase tracking-widest font-semibold mt-1" style={{ color: modulo.color }}>{modulo.subtitulo}</div>}
        <p className={`mt-2 text-xs leading-relaxed ${t.muted}`}>{modulo.descripcion}</p>

        {stats && stats.length > 0 && (
          <div className={`mt-4 grid grid-cols-3 gap-2 rounded-lg p-2.5 ${t.panel3}`}>
            {stats.map(s => (
              <div key={s.label} className="text-center min-w-0">
                <div className="text-sm font-bold font-mono" style={{ color: s.color || modulo.color }}>{s.value}</div>
                <div className={`text-3xs leading-tight ${t.muted}`}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {modulo.funciones.map(f => (
            <FuncionChip key={f.label} f={f} t={t} habilitada={permitido && f.menu && canOpen(f.menu)} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="mt-auto pt-5">
          <BotonModulo accion={accion} color={modulo.color} onNavigate={onNavigate} />
        </div>
      </div>
    </article>
  );
}

function ModuloSecundarioCard({ modulo, t, permitido, canOpen, onNavigate }) {
  const Icon = modulo.icon;
  const accion = accionModulo(modulo, { permitido, canOpen });
  return (
    <article className={`flex flex-col rounded-xl border p-4 transition duration-200 hover:shadow-lg hover:-translate-y-0.5 ${t.panel} ${t.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: modulo.color + '1A', color: modulo.color }}>
          <Icon size={19} />
        </div>
        <EstadoBadge estado={modulo.estado} compacto />
      </div>
      <h3 className="mt-3 text-sm font-bold">{modulo.nombre}</h3>
      <p className={`mt-1 text-2xs leading-relaxed ${t.muted}`}>{modulo.descripcion}</p>
      <div className="mt-auto pt-3">
        <BotonModulo accion={accion} color={modulo.color} onNavigate={onNavigate} compacto />
      </div>
    </article>
  );
}

function SeccionTitulo({ t, titulo, descripcion, extra }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
      <div>
        <h2 className="text-base font-bold">{titulo}</h2>
        {descripcion && <p className={`text-xs mt-0.5 ${t.muted}`}>{descripcion}</p>}
      </div>
      {extra}
    </div>
  );
}

function LeyendaEstados({ t }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 text-2xs ${t.muted}`}>
      {Object.keys(ESTADOS_MODULO).map(k => <EstadoBadge key={k} estado={k} compacto />)}
    </div>
  );
}

// Diagrama "Una plataforma. Todas las áreas." — núcleo común arriba y módulos debajo.
function DiagramaPlataforma({ t, dark }) {
  const ramas = [
    ...MODULOS.filter(m => m.principal).map(m => ({ key: m.key, nombre: m.subtitulo && m.key !== 'biomedica' ? m.subtitulo : m.nombre, area: m.area, color: m.color, icon: m.icon })),
    { key: 'otros', nombre: 'Otros', area: 'Nuevas áreas', color: '#94A3B8', icon: Layers },
  ];
  const linea = dark ? '#334155' : '#CBD5E1';
  return (
    <div className="mt-5">
      <div className="flex justify-center">
        <div className="rounded-xl px-5 py-3 text-center text-white shadow-lg max-w-md" style={{ background: HERO_BG }}>
          <div className="text-xs font-bold tracking-wide uppercase">Plataforma integral</div>
          <div className="text-3xs mt-1 text-slate-300">Núcleo común: autenticación · usuarios · empresas · permisos · seguridad</div>
        </div>
      </div>
      <div className="hidden sm:block mx-auto" style={{ width: 2, height: 20, background: linea }} />
      <div className="hidden sm:block mx-[10%]" style={{ height: 2, background: linea }} />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3 sm:mt-0">
        {ramas.map(r => {
          const Icon = r.icon;
          return (
            <div key={r.key} className="flex flex-col items-center">
              <div className="hidden sm:block" style={{ width: 2, height: 16, background: linea }} />
              <div className={`w-full rounded-lg border p-3 text-center ${t.panel} ${t.border}`}>
                <Icon size={18} className="mx-auto" style={{ color: r.color }} />
                <div className="text-2xs font-bold mt-1.5 uppercase tracking-wide">{r.nombre}</div>
                <div className={`text-3xs mt-0.5 ${t.muted}`}>{r.area}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LineaEvolucion({ t }) {
  const pasos = [
    { titulo: 'Biomédica', detalle: 'Gestión de equipos biomédicos en operación', estado: 'Completado', color: '#16A34A' },
    { titulo: 'Multiárea', detalle: 'RRHH, SST y Calidad sobre el mismo núcleo', estado: 'En curso', color: '#D97706' },
    { titulo: 'Plataforma corporativa', detalle: 'Todas las áreas, indicadores centralizados', estado: 'Visión', color: '#64748B' },
  ];
  return (
    <ol className="mt-4 flex flex-col md:flex-row md:items-stretch gap-3">
      {pasos.map((p, i) => (
        <React.Fragment key={p.titulo}>
          {i > 0 && <li aria-hidden="true" className={`hidden md:flex items-center ${t.muted}`}><ArrowRight size={18} /></li>}
          <li className={`flex-1 rounded-lg border p-3 ${t.border}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">{i + 1}. {p.titulo}</span>
              <span className="text-3xs font-semibold uppercase tracking-wide" style={{ color: p.color }}>{p.estado}</span>
            </div>
            <div className={`text-2xs mt-1 ${t.muted}`}>{p.detalle}</div>
          </li>
        </React.Fragment>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- */
/* PORTAL DE INICIO / CATÁLOGO DE MÓDULOS                            */
/* ---------------------------------------------------------------- */
// Tarjetas de módulos (principales + "Más módulos"). Las comparten el portal interno (tras el
// login) y la landing pública (antes del login), para que ambas muestren exactamente lo mismo.
function TarjetasModulos({ t, permitidos, canOpen, onNavigate, biomedicaStats, publico = false }) {
  // En la landing pública no se muestran los módulos exclusivos del SUPER_ADMIN (Administración).
  const visibles = publico ? MODULOS.filter(m => !m.soloSuperAdmin) : MODULOS;
  const principales = visibles.filter(m => m.principal);
  const secundarios = visibles.filter(m => !m.principal);
  return (
    <>
      <section className="mt-8">
        <SeccionTitulo t={t} titulo="Módulos de la organización"
          descripcion="Áreas principales de la plataforma. Cada módulo comparte usuarios, empresas y permisos."
          extra={<LeyendaEstados t={t} />} />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {principales.map(m => (
            <ModuloPrincipalCard key={m.key} modulo={m} t={t} permitido={permitidos.has(m.key)} canOpen={canOpen} onNavigate={onNavigate}
              stats={m.key === 'biomedica' ? biomedicaStats : null} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <SeccionTitulo t={t} titulo="Más módulos" descripcion="Áreas proyectadas para el crecimiento de la plataforma." />
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {secundarios.map(m => (
            <ModuloSecundarioCard key={m.key} modulo={m} t={t} permitido={permitidos.has(m.key)} canOpen={canOpen} onNavigate={onNavigate} />
          ))}
        </div>
      </section>
    </>
  );
}

// Versión PÚBLICA del portal para la landing (antes del login): la misma bienvenida y las
// mismas tarjetas. Cualquier botón lleva a iniciar sesión y, al entrar, directo a ese módulo;
// los permisos reales se aplican después del login, como siempre.
const TODOS_LOS_MODULOS = new Set(MODULOS.filter(m => !m.soloSuperAdmin).map(m => m.key));
export function PortalPublico({ t, onIngresar }) {
  const hoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="max-w-7xl mx-auto">
      <section className="rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-lg" style={{ background: HERO_BG }}>
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full opacity-10" style={{ background: '#2DD4BF' }} aria-hidden="true" />
        <div className="relative">
          <div className="text-3xs uppercase tracking-[0.2em] font-semibold text-teal-300">{PLATAFORMA_NOMBRE}</div>
          <h2 className="mt-2 text-xl sm:text-2xl font-bold leading-tight">Bienvenido a la {PLATAFORMA_NOMBRE}</h2>
          <p className="mt-2 text-sm text-slate-300">Selecciona el área o módulo que deseas gestionar: inicias sesión y entras directo a él.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-2xs">
            <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 capitalize">{hoy}</span>
          </div>
          <p className="mt-5 text-xs text-slate-400 max-w-2xl">{PLATAFORMA_DESCRIPCION}</p>
        </div>
      </section>
      <TarjetasModulos t={t} permitidos={TODOS_LOS_MODULOS} canOpen={() => true} onNavigate={onIngresar} publico />
    </div>
  );
}

export function PortalInicio({ vista = 'inicio', t, dark, user, empresaLabel, permitidos, canOpen, onNavigate, resumen, biomedicaStats }) {
  const nombre = user?.nombre || user?.email || '';
  const hoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const tarjetasModulos = (
    <TarjetasModulos t={t} permitidos={permitidos} canOpen={canOpen} onNavigate={onNavigate} biomedicaStats={biomedicaStats} />
  );

  if (vista === 'catalogo') {
    return (
      <div className="max-w-7xl mx-auto pb-10">
        <h1 className="text-xl font-bold">Módulos</h1>
        <p className={`text-xs mt-1 ${t.muted}`}>Catálogo completo de áreas de la {PLATAFORMA_NOMBRE}.</p>
        {tarjetasModulos}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-10">
      {/* BIENVENIDA */}
      <section className="rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-lg" style={{ background: HERO_BG }}>
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full opacity-10" style={{ background: '#2DD4BF' }} aria-hidden="true" />
        <div className="relative">
          <div className="text-3xs uppercase tracking-[0.2em] font-semibold text-teal-300">{PLATAFORMA_NOMBRE}</div>
          <h1 className="mt-2 text-xl sm:text-2xl font-bold leading-tight">Bienvenido a la {PLATAFORMA_NOMBRE}</h1>
          <p className="mt-2 text-sm text-slate-300">Selecciona el área o módulo que deseas gestionar.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-2xs">
            {nombre && <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15">{nombre}</span>}
            {empresaLabel && <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 inline-flex items-center gap-1.5"><Building2 size={12} /> {empresaLabel}</span>}
            <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 capitalize">{hoy}</span>
          </div>
          <p className="mt-5 text-xs text-slate-400 max-w-2xl">{PLATAFORMA_DESCRIPCION}</p>
        </div>
      </section>

      {tarjetasModulos}

      {/* RESUMEN CORPORATIVO */}
      <section className="mt-10">
        <SeccionTitulo t={t} titulo="Resumen corporativo"
          descripcion="Solo se muestran datos reales disponibles hoy; lo que aún no tiene fuente aparece como “--”." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {resumen.map(k => <KpiCard key={k.label} t={t} {...k} />)}
        </div>
      </section>

      {/* VISIÓN */}
      <section className={`mt-10 rounded-2xl border p-5 sm:p-6 ${t.panel} ${t.border}`}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#0F766E1A', color: '#0F766E' }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold">Una plataforma. Todas las áreas.</h2>
            <p className={`text-xs mt-1 leading-relaxed max-w-3xl ${t.muted}`}>
              La organización puede centralizar diferentes procesos operativos en una misma plataforma, manteniendo los permisos,
              usuarios, empresas y responsabilidades de cada área.
            </p>
          </div>
        </div>
        <DiagramaPlataforma t={t} dark={dark} />
      </section>

      {/* EVOLUCIÓN */}
      <section className={`mt-6 rounded-2xl border p-5 sm:p-6 ${t.panel} ${t.border}`}>
        <h2 className="text-base font-bold">Evolución de la plataforma</h2>
        <p className={`text-xs mt-1 leading-relaxed max-w-3xl ${t.muted}`}>
          Esta plataforma inició como una solución para la gestión biomédica y está diseñada para evolucionar hacia una herramienta
          transversal que permita centralizar procesos de diferentes áreas de la organización.
        </p>
        <LineaEvolucion t={t} />
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* PANTALLA INFORMATIVA DE UN MÓDULO                                  */
/* ---------------------------------------------------------------- */
export function ModuloInfoPage({ modulo, t, permitido, canOpen, onNavigate }) {
  const Icon = modulo.icon;
  const disponibles = modulo.funciones.filter(f => f.menu && permitido && canOpen(f.menu));
  const proyectadas = modulo.funciones.filter(f => !disponibles.includes(f));
  const mensaje = {
    ACTIVO: 'Este módulo está en operación. Usa las funciones disponibles para ingresar.',
    EN_DESARROLLO: 'Este módulo está priorizado y en desarrollo. Las funciones marcadas como disponibles ya existen en la plataforma; el resto está proyectado.',
    PROXIMAMENTE: 'Este módulo forma parte de la visión de crecimiento de la plataforma. Todavía no tiene funcionalidades operativas; se muestra para presentar su alcance.',
  }[modulo.estado];

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <button onClick={() => onNavigate('inicio')} className={`inline-flex items-center gap-1.5 text-xs mb-4 hover:underline ${t.muted}`}>
        <ArrowLeft size={14} /> Volver al inicio
      </button>

      <section className={`rounded-2xl border overflow-hidden ${t.panel} ${t.border}`}>
        <div className="h-1.5" style={{ background: modulo.color }} />
        <div className="p-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: modulo.color + '1A', color: modulo.color }}>
              <Icon size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold">{modulo.nombre}</h1>
                <EstadoBadge estado={modulo.estado} />
              </div>
              {modulo.subtitulo && <div className="text-3xs uppercase tracking-widest font-semibold mt-1" style={{ color: modulo.color }}>{modulo.subtitulo}</div>}
              <p className={`text-sm mt-2 ${t.muted}`}>{modulo.descripcion}</p>
            </div>
          </div>

          <div className={`mt-5 flex items-start gap-2 rounded-lg p-3 text-xs ${t.panel3}`}>
            <Info size={15} className="shrink-0 mt-0.5" style={{ color: modulo.color }} />
            <span>{permitido ? mensaje : 'Tu usuario no tiene acceso a este módulo. Solicítalo al administrador de la plataforma.'}</span>
          </div>
        </div>
      </section>

      {disponibles.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold mb-3">Funciones disponibles</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {disponibles.map(f => (
              <button key={f.label} onClick={() => onNavigate(f.menu)}
                className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition hover:shadow-md hover:-translate-y-0.5 ${t.panel} ${t.border}`}>
                <span className="flex items-center gap-2 text-sm font-semibold"><CircleCheck size={16} style={{ color: '#16A34A' }} /> {f.label}</span>
                <ArrowRight size={16} style={{ color: modulo.color }} />
              </button>
            ))}
          </div>
        </section>
      )}

      {proyectadas.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold mb-3">Funcionalidades proyectadas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {proyectadas.map(f => (
              <div key={f.label} className={`flex items-center justify-between gap-3 rounded-xl border border-dashed p-4 ${t.border}`}>
                <span className={`flex items-center gap-2 text-sm ${t.muted}`}><Clock size={15} /> {f.label}</span>
                <EstadoBadge estado="PROXIMAMENTE" compacto />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
