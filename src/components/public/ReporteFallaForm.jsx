// src/components/public/ReporteFallaForm.jsx
import { useState, useEffect, useRef } from 'react';
import { Search, X, AlertTriangle, Sun, Moon } from 'lucide-react';
import { apiFetch } from '../../services/apiFetch.js';
import { uiTheme } from '../../utils/theme.js';
import { todayISO } from '../../utils/fechas.js';
import { uid } from '../../utils/id.js';
import { DEFAULT_COMPANIES, empresaToCompany } from '../../data/empresas.js';
import { PRIORIDADES, PRIORIDAD_HEX, equipoLabelCompleto } from '../../data/fallas.js';
import { Button, Field, TextInput, SelectInput } from '../ui.jsx';
import logoIngenieriaClinica from '../../assets/logo-ingenieria-clinica.png';

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

export default function ReporteFallaForm({ onBack }) {
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
