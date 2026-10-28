// src/components/public/LandingPage.jsx
import { useRef, useEffect } from 'react';
import {
  ChevronRight, Zap, BellRing, ShieldCheck, Wrench, ListTree, ClipboardList, CalendarClock,
  ShieldAlert, FileText, FileBarChart, LayoutDashboard, IdCard, SprayCan, Settings,
} from 'lucide-react';
import logoIngenieriaClinica from '../../assets/logo-ingenieria-clinica.png';
// Fotos reales de equipos por especialidad — landing pública únicamente (sección
// "Especialidades"), tomadas del mismo banco de imágenes del proyecto v1.
import fotoHospitalizacion from '../../assets/equipos/hospitalizacion.webp';
import fotoUci from '../../assets/equipos/uci.webp';
import fotoLaboratorio from '../../assets/equipos/laboratorio.webp';
import fotoImagenologia from '../../assets/equipos/imagenologia.webp';
import fotoOdontologia from '../../assets/equipos/odontologia.webp';
import fotoQuirofano from '../../assets/equipos/quirofano.webp';
import fotoEquiposGenerales from '../../assets/equipos/equipos-generales.webp';

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

export default function LandingPage({ onIniciarSesion, onReportarFalla }) {
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
