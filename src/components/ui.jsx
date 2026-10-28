// src/components/ui.jsx
// Primitivas de interfaz compartidas por toda la app — sin lógica de negocio, sin
// conocimiento de equipos/empresas/usuarios. Paso 1 del plan de división de App.jsx: estas
// 10 funciones no dependían de nada más que props, React y lucide-react, así que se mueven
// tal cual, sin ningún cambio de comportamiento.

import { useState, useRef, useMemo } from 'react';
import { CalendarClock, FileText, Plus, Trash2, Save, X, Pencil, Upload } from 'lucide-react';
import { formatFechaCorta } from '../utils/fechas.js';

// Botón compartido — variantes primary/outline/danger/ghost. Reemplaza las
// reimplementaciones inline de className+style repetidas por toda la app.
// Incluye active:scale-[0.97] (feedback de presión) por defecto en todas las variantes.
const BUTTON_SIZE_CLS = {
  sm: 'px-2.5 py-1.5 text-2xs',
  md: 'px-3 py-1.5 text-xs',
  lg: 'px-4 py-2 text-xs',
};
export function Button({ variant = 'outline', size = 'md', accent, t, icon: Icon, iconSize = 13, className = '', style, children, ...props }) {
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
export function Badge({ color, mono = true, children }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-3xs ${mono ? 'font-mono uppercase' : ''}`} style={{ background: color + '22', color }}>
      {children}
    </span>
  );
}

export function Field({ label, children, dense }) {
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
export function DateInput({ value, onChange, t, disabled, dense }) {
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

export function TextInput({ value, onChange, t, type = 'text', placeholder, disabled, dense }) {
  if (type === 'date') return <DateInput value={value} onChange={onChange} t={t} disabled={disabled} dense={dense} />;
  return (
    <input
      type={type} value={value || ''} placeholder={placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={`w-full rounded-md border ${dense ? 'px-2 py-1 text-2xs' : 'px-2.5 py-1.5 text-xs'} ${t.input} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    />
  );
}

export function SelectInput({ value, onChange, options, t, disabled, dense, upper }) {
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
export function PdfLink({ url, label = 'Ver PDF', title, t, emptyLabel = 'Sin documento' }) {
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
export function FirmaInput({ value, onChange, readOnly, alt, t }) {
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
export function RecordUrlField({ t, value, onChange, label, readOnly }) {
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
export function RecordList({ t, records, fields, onAdd, onRemove, onUpdate, renderExtra, readOnly }) {
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

// Tarjeta de estadística compartida por casi todas las páginas (Dashboard, Alertas, Reportes
// de falla, Capacitaciones, Tecnovigilancia, Personal) — un número grande con etiqueta y
// subtítulo, opcionalmente clicable.
export function HeroStat({ t, label, value, sub, color, onClick, brandBg }) {
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

export function ClusterCard({ t, title, color, children, onClick, brandBg }) {
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

export function MiniRow({ label, value, t, color, noTranslate }) {
  return (
    <div className="flex items-center justify-between py-1 text-2xs">
      <span className={t.muted} {...(noTranslate ? { translate: 'no', lang: 'es' } : {})}>{label}</span>
      <span className="font-mono font-semibold" style={color ? { color } : {}}>{value}</span>
    </div>
  );
}

// Estado + acciones de un documento con URL externa (Planes y programas, Tecnovigilancia,
// Limpieza y desinfección...) — "Sin documento"/"Documento disponible", y editar/cargar la
// URL. Reutilizado por varias páginas de dominio distintas, por eso vive aquí y no en una
// de ellas.
export function DocumentoEstadoAcciones({ url, onChange, readOnly, t, accent }) {
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
