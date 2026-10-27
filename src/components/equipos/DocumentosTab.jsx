// src/components/equipos/DocumentosTab.jsx
// Pestaña "Documentos" del equipo — mismo `onUpdate` de siempre (optimista, vía
// EquipoDrawer → MainApp → PATCH /api/equipos), presentado como cuadrícula de tarjetas en
// vez de la lista genérica RecordList (que otras pestañas del drawer siguen usando sin
// cambios: Preventivos, Correctivos, Calibraciones, Instalaciones, Baja de Equipo).
//
// Sigue guardando exactamente lo mismo que antes (un arreglo `equipo.documentos` dentro del
// equipo). Cada documento nuevo solo guarda su URL externa (Drive/OneDrive/Dropbox/etc.),
// nunca el archivo, así se evita consumir almacenamiento de la base de datos. Los documentos
// guardados antes de este cambio (con archivo en base64 en `archivoDatos`) se siguen mostrando
// y descargando sin problema — ver abrirDocumento() más abajo — así que no hay migración ni
// pérdida de datos.

import { useState, useMemo } from 'react';
import {
  FileText, BookOpen, ClipboardList, ShieldCheck, Zap, Paperclip, Plus, MoreVertical, Pencil,
  Download, Trash2, Eye, X, AlertTriangle, Search, Filter, ArrowUpDown,
} from 'lucide-react';
import { Button, Badge, Field, TextInput, SelectInput } from '../ui.jsx';
import { uid } from '../../utils/id.js';
import { esUrlDocumentoValida } from './helpers.js';

const DOCUMENTO_TIPOS = [
  { key: 'Manual', icon: BookOpen, color: '#2F8FD1' },
  { key: 'Reporte de instalación', icon: ClipboardList, color: '#F59E0B' },
  { key: 'INVIMA', icon: ShieldCheck, color: '#8B5CF6' },
  { key: 'Guía de uso rápido', icon: Zap, color: '#22C55E' },
  { key: 'Ficha técnica', icon: FileText, color: '#0EA5E9' },
  { key: 'Otros', icon: Paperclip, color: '#64748B' },
];
const DOCUMENTO_TIPO_POR_DEFECTO = { icon: Paperclip, color: '#64748B' };
function documentoTipoInfo(tipo) {
  return DOCUMENTO_TIPOS.find(d => d.key === tipo) || DOCUMENTO_TIPO_POR_DEFECTO;
}
const DOCUMENTOS_ORDEN = [
  { key: 'recientes', label: 'Más recientes' },
  { key: 'antiguos', label: 'Más antiguos' },
  { key: 'az', label: 'Nombre A-Z' },
  { key: 'za', label: 'Nombre Z-A' },
];
// Abre un documento: los nuevos solo tienen `url` (enlace externo) y se abren en una pestaña
// nueva, sin descargar ni copiar nada localmente; los guardados antes de este cambio (con
// archivo en `archivoDatos`, un Data URI) se siguen descargando igual que siempre, para no
// perder acceso a lo que ya estaba guardado.
function abrirDocumento(doc) {
  if (doc.url) {
    window.open(doc.url, '_blank', 'noopener,noreferrer');
  } else if (doc.archivoDatos) {
    const a = document.createElement('a');
    a.href = doc.archivoDatos;
    a.download = doc.archivoNombre || doc.nombre || 'documento';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function EmptyDocumentsState({ t, accent, readOnly, onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
      <FileText size={28} className={t.muted} />
      <div className="text-xs font-semibold mt-1">No hay documentos</div>
      <p className={`text-2xs max-w-56 ${t.muted}`}>Aún no se han agregado documentos para este equipo.</p>
      {!readOnly && (
        <Button variant="primary" accent={accent} icon={Plus} iconSize={13} className="mt-2" onClick={onAdd}>
          Agregar documento
        </Button>
      )}
    </div>
  );
}

function DocumentCard({ doc, t, readOnly, menuOpen, onToggleMenu, onView, onEdit, onDelete }) {
  const info = documentoTipoInfo(doc.tipo);
  const Icon = info.icon;
  const tieneArchivo = !!(doc.archivoDatos || doc.url);
  const fechaTexto = doc.actualizadoEn
    ? new Date(doc.actualizadoEn).toLocaleDateString('es-CO')
    : (doc.fecha ? new Date(doc.fecha + 'T00:00:00').toLocaleDateString('es-CO') : '');
  const metaTexto = [doc.extension, doc.tamano].filter(Boolean).join(' · ');

  return (
    <div className={`relative rounded-xl border p-3.5 flex flex-col gap-2 shadow-sm ${t.panel} ${t.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: info.color + '1A', color: info.color }}>
          <Icon size={17} />
        </div>
        {!readOnly && (
          <button onClick={onToggleMenu} aria-label="Más acciones" aria-haspopup="true" aria-expanded={menuOpen}
            className={`w-8 h-8 -mr-1 -mt-1 rounded-md flex items-center justify-center hover:opacity-70 shrink-0 ${t.muted}`}>
            <MoreVertical size={15} />
          </button>
        )}
        {menuOpen && (
          <div className={`absolute right-2 top-11 z-[56] w-36 rounded-lg border shadow-lg py-1 ${t.panel} ${t.border}`}>
            <button onClick={onEdit} className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs hover:opacity-80 ${t.text}`}>
              <Pencil size={13} /> Editar
            </button>
            <button onClick={() => abrirDocumento(doc)} disabled={!tieneArchivo}
              className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed ${t.text}`}>
              <Download size={13} /> Descargar
            </button>
            <button onClick={onDelete} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs text-red-500 hover:opacity-80">
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        )}
      </div>

      <div><Badge color={info.color}>{doc.tipo || 'Otro'}</Badge></div>

      <div className="min-w-0">
        <div className={`text-xs font-semibold leading-snug ${t.text}`} title={doc.nombre}>{doc.nombre || 'Documento sin nombre'}</div>
        {doc.descripcion && <p className={`text-2xs mt-0.5 leading-snug line-clamp-2 ${t.muted}`}>{doc.descripcion}</p>}
      </div>

      <div className={`text-3xs font-mono mt-auto pt-1 ${t.muted}`}>
        {metaTexto && <div>{metaTexto}</div>}
        {fechaTexto && <div className="mt-0.5">Actualizado: {fechaTexto}</div>}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" t={t} icon={Eye} iconSize={12} disabled={!tieneArchivo} onClick={onView} className="flex-1">Ver</Button>
        <Button variant="outline" size="sm" t={t} icon={Download} iconSize={12} disabled={!tieneArchivo}
          onClick={() => abrirDocumento(doc)} className="flex-1">Descargar</Button>
      </div>
    </div>
  );
}

// "Ver" — vista previa. Un PDF (guardado como Data URI, o una URL externa antigua) se puede
// incrustar en un <iframe> — el navegador lo detecta por su MIME/extensión igual que abre
// cualquier PDF. Otros formatos (DOCX, XLSX) no tienen forma confiable de previsualizarse sin
// un visor externo, así que van directo al estado "no se puede previsualizar" de la especificación.
function DocumentPreviewModal({ doc, onClose, t, accent }) {
  const info = documentoTipoInfo(doc.tipo);
  const Icon = info.icon;
  const fuente = doc.archivoDatos || doc.url || '';
  const tieneArchivo = !!fuente;
  const esPdf = doc.archivoDatos
    ? doc.archivoDatos.startsWith('data:application/pdf')
    : (doc.extension || '').toUpperCase() === 'PDF' || /\.pdf(\?|#|$)/i.test(doc.url || '');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`animate-modal-in relative w-full max-w-2xl h-[85vh] flex flex-col rounded-xl border overflow-hidden ${t.panel} ${t.border}`}>
        <div className="flex items-start justify-between gap-3 p-4 border-b shrink-0" style={{ borderColor: 'inherit' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: info.color + '1A', color: info.color }}>
              <Icon size={17} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">{doc.nombre}</div>
              <div className={`text-2xs ${t.muted}`}>{[doc.tipo, doc.extension, doc.tamano].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className={`w-9 h-9 flex items-center justify-center shrink-0 -mr-1 -mt-1 rounded-md ${t.muted} hover:opacity-70`}><X size={18} /></button>
        </div>

        <div className={`flex-1 min-h-0 ${t.panel3}`}>
          {tieneArchivo && esPdf ? (
            <iframe src={fuente} title={doc.nombre} className="w-full h-full border-0" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <FileText size={32} className={t.muted} />
              <p className={`text-xs ${t.muted}`}>Este archivo no puede previsualizarse.</p>
              {tieneArchivo && (
                <Button variant="primary" accent={accent} icon={Download} iconSize={13} onClick={() => abrirDocumento(doc)}>
                  Descargar documento
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t shrink-0" style={{ borderColor: 'inherit' }}>
          <Button variant="outline" t={t} onClick={onClose}>Cerrar</Button>
          <Button variant="primary" accent={accent} icon={Download} iconSize={13} disabled={!tieneArchivo} onClick={() => abrirDocumento(doc)}>
            Descargar
          </Button>
        </div>
      </div>
    </div>
  );
}

// Un mismo formulario para crear y editar (`mode`), tal como pide la especificación — evita
// duplicar el modal.
function DocumentFormModal({ mode, initial, onClose, onSave, t, accent }) {
  const [tipo, setTipo] = useState(initial?.tipo || DOCUMENTO_TIPOS[0].key);
  const [nombre, setNombre] = useState(initial?.nombre || '');
  const [descripcion, setDescripcion] = useState(initial?.descripcion || '');
  // Solo se guarda la URL externa del documento (Drive/OneDrive/Dropbox/etc.) — nunca el
  // archivo. Al editar un documento antiguo que sí tenía archivo (`archivoDatos`), ese campo
  // no se toca aquí: `guardarDocumento` solo sobreescribe lo que este formulario envía, así
  // que el archivo ya guardado no se pierde por editar el nombre o la URL.
  const [url, setUrl] = useState(initial?.url || '');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!tipo) { setError('Selecciona el tipo de documento.'); return; }
    if (!nombre.trim()) { setError('Escribe un nombre para el documento.'); return; }
    if (!url.trim()) { setError('Ingresa el enlace externo del documento.'); return; }
    if (!esUrlDocumentoValida(url)) { setError('El enlace no es una URL válida. Debe comenzar con https:// o http://.'); return; }
    setError('');
    onSave({ tipo, nombre: nombre.trim(), descripcion: descripcion.trim(), url: url.trim() });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <form onSubmit={submit} className={`animate-modal-in relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-xl border p-5 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-start mb-1">
          <div>
            <div className="text-sm font-bold">{mode === 'edit' ? 'Editar documento' : 'Agregar documento'}</div>
            <p className={`text-2xs mt-0.5 ${t.muted}`}>Agrega un documento asociado a este equipo.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className={`w-9 h-9 -mr-1 -mt-1 flex items-center justify-center shrink-0 rounded-md ${t.muted} hover:opacity-70`}><X size={18} /></button>
        </div>

        <div className="space-y-3 mt-4">
          <Field label="Tipo de documento">
            <SelectInput t={t} value={tipo} options={DOCUMENTO_TIPOS.map(d => d.key)} onChange={setTipo} />
          </Field>
          <Field label="Nombre del documento">
            <TextInput t={t} value={nombre} placeholder="Ej. Manual de operación del equipo" onChange={setNombre} />
          </Field>
          <Field label="Descripción (opcional)">
            <textarea rows={2} value={descripcion} onChange={e => setDescripcion(e.target.value)}
              placeholder="Descripción breve del documento" className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input}`} />
          </Field>

          <Field label="Enlace del documento (URL externa)">
            <TextInput t={t} value={url} placeholder="https://drive.google.com/..." onChange={setUrl} />
            <p className={`text-3xs mt-1 ${t.muted}`}>Pega el enlace externo (Drive, OneDrive, Dropbox, etc.). El archivo no se sube a la aplicación.</p>
          </Field>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="outline" t={t} onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" accent={accent}>Guardar documento</Button>
        </div>
      </form>
    </div>
  );
}

function DeleteDocumentDialog({ nombre, onCancel, onConfirm, t }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className={`animate-modal-in relative w-full max-w-xs rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="text-sm font-bold mb-1">¿Eliminar documento?</div>
        <p className={`text-2xs mb-4 ${t.muted}`}>
          {nombre ? `"${nombre}" se ` : 'Se '}eliminará del equipo. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" t={t} onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm}>Eliminar</Button>
        </div>
      </div>
    </div>
  );
}

// La cuadrícula usa `auto-fill`/`minmax` en vez de columnas fijas por breakpoint (lg:grid-cols-4,
// etc.): esta pestaña vive dentro del drawer, que mide como máximo 640px de ancho (no el ancho
// de la pantalla) — forzar 3-4 columnas ahí produciría tarjetas ilegibles de ~140px. auto-fill
// ya da 1 columna en el drawer angosto de un celular y 2 en su ancho fijo de escritorio, que es
// el máximo que ese contenedor puede ofrecer con tarjetas legibles.
//
// Sin skeleton/estado de error de carga: los documentos llegan como parte del `equipo` que ya
// está en memoria antes de que el drawer exista (todo el inventario se carga una sola vez al
// abrir la app) — no hay una petición de red propia de esta pestaña que loguee/falle, así que
// un loader o un botón "Reintentar" aquí no tendría nada real que mostrar u reintentar.
export default function DocumentosTab({ equipo, onUpdate, readOnly, t, accent }) {
  const documentos = equipo.documentos || [];
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [orden, setOrden] = useState('recientes');
  const [openPanel, setOpenPanel] = useState(null); // null | 'filtro' | 'orden' | <docId>
  const [formAbierto, setFormAbierto] = useState(null); // null | { mode: 'create' } | { mode: 'edit', doc }
  const [preview, setPreview] = useState(null);
  const [porEliminar, setPorEliminar] = useState(null);

  const guardarDocumento = (datos, id) => {
    const list = id
      ? documentos.map(d => d.id === id ? { ...d, ...datos, actualizadoEn: new Date().toISOString() } : d)
      : [...documentos, { id: uid('doc'), ...datos, actualizadoEn: new Date().toISOString() }];
    onUpdate({ ...equipo, documentos: list });
  };
  const eliminarDocumento = (id) => onUpdate({ ...equipo, documentos: documentos.filter(d => d.id !== id) });

  const filtrados = useMemo(() => {
    let list = equipo.documentos || [];
    if (filtroTipo !== 'Todos') list = list.filter(d => d.tipo === filtroTipo);
    const q = busqueda.trim().toLowerCase();
    if (q) list = list.filter(d => [d.nombre, d.descripcion, d.tipo].filter(Boolean).join(' ').toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (orden === 'az') return (a.nombre || '').localeCompare(b.nombre || '');
      if (orden === 'za') return (b.nombre || '').localeCompare(a.nombre || '');
      const fa = a.actualizadoEn || a.fecha || '';
      const fb = b.actualizadoEn || b.fecha || '';
      return orden === 'antiguos' ? fa.localeCompare(fb) : fb.localeCompare(fa);
    });
  }, [equipo.documentos, filtroTipo, busqueda, orden]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div>
          <h2 className="text-sm font-bold">Documentos</h2>
          <p className={`text-2xs mt-0.5 ${t.muted}`}>Gestiona la documentación técnica asociada a este equipo.</p>
        </div>
        {!readOnly && (
          <Button variant="primary" accent={accent} icon={Plus} iconSize={13} onClick={() => setFormAbierto({ mode: 'create' })}>
            Agregar documento
          </Button>
        )}
      </div>

      {documentos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-4 mb-3">
          <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border flex-1 min-w-40 ${t.border} ${t.panel3}`}>
            <Search size={13} className={t.muted} />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar documentos…"
              aria-label="Buscar documentos" className={`bg-transparent text-xs w-full outline-none ${t.text}`} />
          </div>

          <div className="relative">
            <button onClick={() => setOpenPanel(p => p === 'filtro' ? null : 'filtro')} aria-haspopup="true" aria-expanded={openPanel === 'filtro'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs border shrink-0 ${t.border} ${filtroTipo === 'Todos' ? t.muted : 'font-semibold'}`}
              style={filtroTipo !== 'Todos' ? { color: accent, borderColor: accent } : {}}>
              <Filter size={13} /> Filtrar
            </button>
            {openPanel === 'filtro' && (
              <div className={`absolute right-0 top-full mt-1 z-[56] w-48 max-h-64 overflow-y-auto rounded-lg border shadow-lg py-1 ${t.panel} ${t.border}`}>
                {['Todos', ...DOCUMENTO_TIPOS.map(d => d.key)].map(op => (
                  <button key={op} onClick={() => { setFiltroTipo(op); setOpenPanel(null); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:opacity-80 ${op === filtroTipo ? 'font-semibold' : t.text}`}
                    style={op === filtroTipo ? { color: accent } : {}}>
                    {op}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => setOpenPanel(p => p === 'orden' ? null : 'orden')} aria-haspopup="true" aria-expanded={openPanel === 'orden'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs border shrink-0 ${t.border} ${t.muted}`}>
              <ArrowUpDown size={13} /> {DOCUMENTOS_ORDEN.find(o => o.key === orden)?.label}
            </button>
            {openPanel === 'orden' && (
              <div className={`absolute right-0 top-full mt-1 z-[56] w-40 rounded-lg border shadow-lg py-1 ${t.panel} ${t.border}`}>
                {DOCUMENTOS_ORDEN.map(op => (
                  <button key={op.key} onClick={() => { setOrden(op.key); setOpenPanel(null); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:opacity-80 ${op.key === orden ? 'font-semibold' : t.text}`}
                    style={op.key === orden ? { color: accent } : {}}>
                    {op.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {documentos.length === 0 ? (
        <EmptyDocumentsState t={t} accent={accent} readOnly={readOnly} onAdd={() => setFormAbierto({ mode: 'create' })} />
      ) : filtrados.length === 0 ? (
        <div className={`text-center py-8 ${t.muted}`}>
          <div className="text-xs font-semibold mb-1">No encontramos documentos</div>
          <p className="text-2xs">Prueba con otro nombre o cambia los filtros.</p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
          {filtrados.map(doc => (
            <DocumentCard key={doc.id} doc={doc} t={t} readOnly={readOnly}
              menuOpen={openPanel === doc.id} onToggleMenu={() => setOpenPanel(p => p === doc.id ? null : doc.id)}
              onView={() => { setOpenPanel(null); setPreview(doc); }}
              onEdit={() => { setOpenPanel(null); setFormAbierto({ mode: 'edit', doc }); }}
              onDelete={() => { setOpenPanel(null); setPorEliminar(doc); }} />
          ))}
        </div>
      )}

      {openPanel && <div className="fixed inset-0 z-[55]" onClick={() => setOpenPanel(null)} />}

      {formAbierto && (
        <DocumentFormModal mode={formAbierto.mode} initial={formAbierto.doc} t={t} accent={accent}
          onClose={() => setFormAbierto(null)}
          onSave={(datos) => { guardarDocumento(datos, formAbierto.doc?.id); setFormAbierto(null); }} />
      )}
      {preview && <DocumentPreviewModal doc={preview} t={t} accent={accent} onClose={() => setPreview(null)} />}
      {porEliminar && (
        <DeleteDocumentDialog t={t} nombre={porEliminar.nombre}
          onCancel={() => setPorEliminar(null)}
          onConfirm={() => { eliminarDocumento(porEliminar.id); setPorEliminar(null); }} />
      )}
    </div>
  );
}
