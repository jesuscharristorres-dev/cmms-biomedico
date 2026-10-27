// src/components/admin/AdminUsuariosPage.jsx
import { useState, useEffect } from 'react';
import { Search, Save, Pencil, Power, Trash2, UserPlus } from 'lucide-react';
import { adminApi } from '../../services/adminApi.js';
import { formatFechaCorta } from '../../utils/fechas.js';
import { ROLE_LABELS } from '../../data/roles.js';
import { Button, Badge, Field, TextInput, SelectInput } from '../ui.jsx';
import { ESTADO_HEX } from '../../data/estadoHex.js';
import { AdminMensaje, FieldError, AdminModal } from './AdminPrimitives.jsx';

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

export default function AdminUsuariosPage({ t, accent, currentUserId }) {
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
