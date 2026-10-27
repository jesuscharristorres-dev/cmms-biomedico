// src/components/public/LoginScreen.jsx
import { useState } from 'react';
import {
  Activity, Cpu, HeartPulse, Share2, Database, User, Eye, EyeOff, Lock, ArrowRight, Wrench,
  ShieldCheck, AlertTriangle,
} from 'lucide-react';
import logoIngenieriaClinica from '../../assets/logo-ingenieria-clinica.png';
import logoMacromed from '../../assets/logo-macromed.jpg';

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
export default function LoginScreen({ notice, onLogin, onReportarFalla, onBack }) {
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
