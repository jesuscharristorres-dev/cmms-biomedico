// src/components/admin/AdminEmpresasPage.jsx
import { useState, useEffect } from 'react';
import { Search, Plus, Save, Pencil, Power, MapPin, Link2 } from 'lucide-react';
import { adminApi } from '../../services/adminApi.js';
import { setCompanies } from '../../data/empresas.js';
import { Button, Badge, Field, TextInput, SelectInput } from '../ui.jsx';
import { ESTADO_HEX } from '../../data/estadoHex.js';
import { AdminMensaje, FieldError, AdminModal } from './AdminPrimitives.jsx';

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

export default function AdminEmpresasPage({ t, accent, onDataChanged }) {
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
