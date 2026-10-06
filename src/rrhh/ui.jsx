// src/rrhh/ui.jsx
// Piezas visuales del módulo Gestión Humana. Usan el mismo tema (`t` = uiTheme de la
// plataforma), tipografía y lenguaje de tarjetas/badges que el portal y Biomédica.

import { useEffect, useRef, useState } from 'react';
import { X, Loader2, Link2, ExternalLink } from 'lucide-react';
import { colorPorTexto, iniciales, esUrlValida, abrirEnlace } from './formato';


export function Pill({ color, children, fuerte }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-3xs font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ color, background: color + (fuerte ? '26' : '14'), border: `1px solid ${color}40` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export function EstadoPill({ mapa, valor }) {
  const e = mapa[valor] || { label: valor, color: '#64748B' };
  return <Pill color={e.color}>{e.label}</Pill>;
}

export function Avatar({ nombre, size = 36 }) {
  const color = colorPorTexto(nombre);
  return (
    <span className="inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: `linear-gradient(135deg, ${color} 0%, ${color}B3 100%)` }}
      aria-hidden="true">
      {iniciales(nombre)}
    </span>
  );
}

export function Card({ t, children, className = '', titulo, icono: Icono, accion, color }) {
  return (
    <section className={`rounded-2xl border ${t.panel} ${t.border} ${className}`}>
      {titulo && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            {Icono && <Icono size={16} style={{ color }} />} {titulo}
          </h3>
          {accion}
        </div>
      )}
      <div className={titulo ? 'p-5 pt-3' : 'p-5'}>{children}</div>
    </section>
  );
}

export function Progreso({ valor, color, alto = 8 }) {
  const c = color || (valor >= 90 ? '#16A34A' : valor >= 75 ? '#D97706' : '#DC2626');
  return (
    <div className="w-full rounded-full bg-slate-500/15 overflow-hidden" style={{ height: alto }}
      role="progressbar" aria-valuenow={valor} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${valor}%`, background: c }} />
    </div>
  );
}

export function Boton({ children, onClick, icono: Icono, variante = 'secundario', disabled, color = '#6366F1', title, type = 'button', pequeno }) {
  const base = `inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${pequeno ? 'min-h-8 px-2.5 text-2xs' : 'min-h-10 px-3.5 text-xs'}`;
  const estilos = variante === 'primario'
    ? { className: `${base} text-white hover:brightness-110 shadow-sm`, style: { background: color } }
    : variante === 'fantasma'
      ? { className: `${base} hover:bg-slate-500/10`, style: { color } }
      : { className: `${base} border hover:bg-slate-500/10`, style: { borderColor: color + '55', color } };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={estilos.className} style={estilos.style}>
      {Icono && <Icono size={pequeno ? 12 : 14} />} {children}
    </button>
  );
}

export function Tabla({ t, columnas, filas, vacio = 'Sin registros.', onFila }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs min-w-[640px]">
        <thead>
          <tr className={`text-left text-3xs uppercase tracking-wide ${t.muted}`}>
            {columnas.map(c => <th key={c.key} className={`px-3 py-2 font-semibold ${c.className || ''}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr><td colSpan={columnas.length} className={`px-3 py-8 text-center ${t.muted}`}>{vacio}</td></tr>
          )}
          {filas.map((f, i) => (
            <tr key={f.id || i} onClick={onFila ? () => onFila(f) : undefined}
              className={`border-t ${t.border} ${onFila ? 'cursor-pointer hover:bg-slate-500/5' : ''}`}>
              {columnas.map(c => <td key={c.key} className={`px-3 py-2.5 align-middle ${c.className || ''}`}>{c.render ? c.render(f) : f[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ t, titulo, subtitulo, onClose, children, pie, ancho = 'max-w-lg' }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative w-full ${ancho} max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border shadow-2xl ${t.panel} ${t.border} ${t.text}`}>
        <div className={`flex items-start justify-between gap-3 px-5 py-4 border-b ${t.border}`}>
          <div>
            <h2 className="text-base font-bold">{titulo}</h2>
            {subtitulo && <p className={`text-2xs mt-0.5 ${t.muted}`}>{subtitulo}</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className={`w-9 h-9 -mr-2 flex items-center justify-center rounded-md hover:bg-slate-500/10 ${t.muted}`}><X size={17} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {pie && <div className={`px-5 py-3 border-t flex flex-wrap justify-end gap-2 ${t.border}`}>{pie}</div>}
      </div>
    </div>
  );
}

// Formulario genérico en modal (cargar documento, agregar título, registrar vacuna…).
// `campos`: [{ name, label, type: text|date|number|select|textarea|url, options, required, full, placeholder, visible }]
// `visible(valores)`: opcional; si devuelve false el campo se oculta y no se valida.
// `url`: enlace al documento (Drive, OneDrive, SharePoint…), igual que en el CMMS biomédico.
export function FormularioModal({ t, titulo, subtitulo, campos, inicial = {}, textoGuardar = 'Guardar', nota, onGuardar, onClose, color }) {
  const [valores, setValores] = useState(inicial);
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const formRef = useRef(null);
  const set = (k, v) => { setValores(prev => ({ ...prev, [k]: v })); setErrores(prev => (prev[k] ? { ...prev, [k]: undefined } : prev)); };
  const camposVisibles = campos.filter(c => !c.visible || c.visible(valores));

  const guardar = async (e) => {
    e.preventDefault();
    const err = {};
    camposVisibles.forEach(c => {
      const v = typeof valores[c.name] === 'string' ? valores[c.name].trim() : valores[c.name];
      if (c.required && !v) err[c.name] = 'Campo obligatorio.';
      else if (c.type === 'url' && v && !esUrlValida(v)) err[c.name] = 'Ingresa un enlace válido que empiece por https://';
    });
    setErrores(err);
    if (Object.keys(err).length) return;
    setGuardando(true);
    try { await onGuardar(valores); onClose(); } finally { setGuardando(false); }
  };

  const claseInput = `w-full rounded-lg border px-3 min-h-10 text-xs ${t.input}`;
  return (
    <Modal t={t} titulo={titulo} subtitulo={subtitulo} onClose={onClose} pie={
      <>
        <Boton onClick={onClose} color="#64748B">Cancelar</Boton>
        <Boton variante="primario" color={color} disabled={guardando} icono={guardando ? Loader2 : undefined}
          onClick={() => formRef.current?.requestSubmit()}>
          {guardando ? 'Guardando…' : textoGuardar}
        </Boton>
      </>
    }>
      <form ref={formRef} onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 gap-3" noValidate>
        {camposVisibles.map(c => (
          <label key={c.name} className={`block ${c.full || c.type === 'textarea' || c.type === 'url' ? 'sm:col-span-2' : ''}`}>
            <span className={`block text-3xs uppercase tracking-wide font-semibold mb-1 ${t.muted}`}>{c.label}{c.required ? ' *' : ''}</span>
            {c.type === 'select' ? (
              <select value={valores[c.name] || ''} onChange={e => set(c.name, e.target.value)} className={claseInput}>
                <option value="">Seleccionar…</option>
                {c.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : c.type === 'textarea' ? (
              <textarea rows={3} value={valores[c.name] || ''} onChange={e => set(c.name, e.target.value)} className={`${claseInput} py-2`} placeholder={c.placeholder} />
            ) : c.type === 'url' ? (
              <>
                <span className="flex gap-2">
                  <span className={`flex-1 min-w-0 flex items-center gap-2 rounded-lg border px-3 min-h-10 ${t.input}`}>
                    <Link2 size={15} className={`shrink-0 ${t.muted}`} />
                    <input type="url" inputMode="url" value={valores[c.name] || ''} onChange={e => set(c.name, e.target.value)}
                      className="flex-1 min-w-0 bg-transparent outline-none text-xs" placeholder={c.placeholder || 'https://drive.google.com/...'} />
                  </span>
                  <button type="button" disabled={!esUrlValida(valores[c.name])} title="Abrir el enlace en una pestaña nueva"
                    onClick={() => abrirEnlace(valores[c.name])}
                    className={`shrink-0 inline-flex items-center gap-1 rounded-lg border px-3 min-h-10 text-2xs font-semibold disabled:opacity-40 ${t.border}`}>
                    <ExternalLink size={13} /> Probar
                  </button>
                </span>
                <span className={`block text-3xs mt-1 ${t.muted}`}>Sube el PDF a Drive/OneDrive/SharePoint y pega aquí el enlace.</span>
              </>
            ) : (
              <input type={c.type || 'text'} value={valores[c.name] || ''} onChange={e => set(c.name, e.target.value)} className={claseInput} placeholder={c.placeholder} />
            )}
            {errores[c.name] && <span className="block text-3xs mt-1 text-red-500">{errores[c.name]}</span>}
          </label>
        ))}
        {nota && <p className={`sm:col-span-2 text-3xs leading-relaxed ${t.muted}`}>{nota}</p>}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

export function Aviso({ mensaje, onCerrar }) {
  useEffect(() => {
    if (!mensaje) return undefined;
    const id = setTimeout(onCerrar, 3800);
    return () => clearTimeout(id);
  }, [mensaje, onCerrar]);
  if (!mensaje) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] rounded-xl px-4 py-3 text-xs font-medium text-white shadow-xl" style={{ background: '#0F172A' }} role="status">
      {mensaje}
    </div>
  );
}
