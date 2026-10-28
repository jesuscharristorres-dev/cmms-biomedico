// src/components/personal/PersonalPage.jsx
// Hojas de vida del personal — control sencillo de quién trabaja en cada empresa, su
// cargo y si ya tiene su hoja de vida (PDF) cargada. No es un módulo de RRHH: un solo
// documento por persona, sin diplomas/certificados/otros anexos.

import { useState } from 'react';
import { IdCard, Plus, Search, User, X } from 'lucide-react';
import { Button, Badge, Field, TextInput, SelectInput, PdfLink, HeroStat } from '../ui.jsx';
import { COMPANIES, companyOf } from '../../data/empresas.js';
import { uid } from '../../utils/id.js';
import { todayISO } from '../../utils/fechas.js';

const TIPOS_DOCUMENTO_PERSONAL = ['CC', 'CE', 'TI', 'Pasaporte'];
const ESTADOS_PERSONAL = ['Activo', 'Inactivo'];
const ESTADO_PERSONAL_HEX = { Activo: '#22C55E', Inactivo: '#94A3B8' };

function newPersonal(empresa) {
  return {
    id: uid('per'),
    nombreCompleto: '', tipoDocumento: 'CC', numeroDocumento: '',
    cargo: '', profesion: '', registroInvima: '', registroInvimaUrl: '', empresa, fechaIngreso: todayISO(),
    estado: 'Activo', hojaVidaUrl: '',
  };
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

export default function PersonalPage({ personal, activeCompany, t, accent, onAdd, onUpdate, readOnly }) {
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
