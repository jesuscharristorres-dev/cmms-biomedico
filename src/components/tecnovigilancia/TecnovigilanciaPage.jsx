// src/components/tecnovigilancia/TecnovigilanciaPage.jsx
import { useState, useContext } from 'react';
import {
  ShieldAlert, MapPin, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, X, Pencil,
  ExternalLink, Trash2,
} from 'lucide-react';
import AuthUserContext from '../../context/AuthUserContext.js';
import { COMPANIES, companyOf } from '../../data/empresas.js';
import {
  TECNO_DOCS, TECNO_ACTA_COMITE_DOC, TECNO_SEGUIMIENTO_ALERTAS_DOC, TECNO_TRIMESTRES,
  TECNO_COMITE_ESTADOS, TECNO_CIUDADES,
} from '../../data/tecnovigilancia.js';
import { Button, Badge, Field, TextInput, SelectInput, PdfLink, HeroStat, DocumentoEstadoAcciones } from '../ui.jsx';

// Tecnovigilancia: documentación transversal (compartida por todas las empresas) +
// reportes trimestrales que se consultan empresa → sede → año → trimestre.
export default function TecnovigilanciaPage({ transversal, reportes, comites, activeCompany, t, accent, onUpdateTransversal, onUpdateReporte, onGuardarComite, onEliminarComite, readOnly }) {
  // El documento único compartido por todas las empresas solo lo edita el SUPER_ADMIN (la
  // API lo exige igual: 403 para cualquier otro rol).
  const isSuper = useContext(AuthUserContext)?.role === 'SUPER_ADMIN';
  const [subTab, setSubTab] = useState('documentacion');
  const [empresaSelLocal, setEmpresaSelLocal] = useState(null);
  const [sedeSel, setSedeSel] = useState(null);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [openTrimestre, setOpenTrimestre] = useState(null);
  // Igual que en Planes y programas: con una empresa activa en el selector superior, los
  // reportes de tecnovigilancia quedan fijos en ella (sin selector propio desincronizado).
  // La documentación de arriba ahora también respeta esa misma empresa activa: cada
  // documento tiene su propia URL por empresa (ver api/tecno-transversal.js).
  const modoGlobal = activeCompany !== 'TODAS';
  const empresaSel = modoGlobal ? activeCompany : empresaSelLocal;

  // Lee la URL de un documento. Si `doc.porEmpresa` es false (p. ej. el formato de
  // INVIMA, único para las 5 empresas), ignora `empresaKey` y siempre devuelve el mismo
  // valor plano. Si es true, busca la URL de esa empresa puntual — `transversal[doc.key]`
  // también puede ser un string suelto (formato heredado, o resultado de la migración
  // desde localStorage): en ese caso se muestra como "por defecto" para cualquier empresa
  // que todavía no tenga su propia URL guardada.
  const urlDeDoc = (doc, empresaKey) => {
    const v = transversal[doc.key];
    // `_default`: valor compartido heredado que el servidor conserva cuando un documento
    // plano pasa al formato por empresa (ver api/tecno-transversal.js).
    if (!doc.porEmpresa) return (v && typeof v === 'object') ? (v._default || '') : (v || '');
    if (v && typeof v === 'object') return v[empresaKey] || v._default || '';
    return v || '';
  };
  // Si cambia la empresa activa del selector superior, se limpia la sede/trimestre ya
  // elegidos (ajuste de estado durante el render, como recomienda React, en vez de un efecto).
  const [prevActiveCompany, setPrevActiveCompany] = useState(activeCompany);
  if (activeCompany !== prevActiveCompany) {
    setPrevActiveCompany(activeCompany);
    setSedeSel(null);
    setOpenTrimestre(null);
  }

  // Los documentos únicos (porEmpresa: false) cuentan como 1 solo slot, sin importar
  // cuántas empresas haya; los documentos por empresa cuentan uno por cada empresa visible
  // (con una empresa activa, solo esa; en "todas las empresas", las 5).
  const empresasKpi = modoGlobal ? COMPANIES.filter(c => c.key === activeCompany) : COMPANIES;
  const cargadosTransversal = TECNO_DOCS.reduce((acc, d) => {
    if (!d.porEmpresa) return acc + (urlDeDoc(d) ? 1 : 0);
    return acc + (modoGlobal ? (urlDeDoc(d, activeCompany) ? 1 : 0) : COMPANIES.filter(c => urlDeDoc(d, c.key)).length);
  }, 0);
  const totalSlotsTransversal = TECNO_DOCS.reduce((acc, d) => acc + (d.porEmpresa ? empresasKpi.length : 1), 0);
  const totalCiudades = empresasKpi.reduce((acc, c) => acc + (TECNO_CIUDADES[c.key] || []).length, 0);
  const anioActual = new Date().getFullYear();
  let cargadosAnioActual = 0;
  empresasKpi.forEach(c => {
    (TECNO_CIUDADES[c.key] || []).forEach(ciudad => {
      const anioData = reportes?.[c.key]?.[ciudad]?.[anioActual];
      if (anioData) TECNO_TRIMESTRES.forEach(tr => { if (anioData[tr.key]) cargadosAnioActual++; });
    });
  });
  const totalSlotsAnioActual = totalCiudades * TECNO_TRIMESTRES.length;
  const pendientesAnioActual = totalSlotsAnioActual - cargadosAnioActual;

  const empresa = empresaSel ? companyOf(empresaSel) : null;
  const anioData = (empresaSel && sedeSel) ? (reportes?.[empresaSel]?.[sedeSel]?.[anio] || {}) : {};

  const resetSede = () => { setSedeSel(null); setOpenTrimestre(null); };
  const resetEmpresa = () => { setEmpresaSelLocal(null); setSedeSel(null); setOpenTrimestre(null); };

  return (
    <div>
      <h1 className="text-lg font-bold mb-1 flex items-center gap-2">
        <ShieldAlert size={19} style={{ color: accent }} /> Tecnovigilancia
      </h1>
      <p className={`text-xs mb-4 ${t.muted}`}>Documentación, comités y reportes trimestrales de tecnovigilancia por empresa.</p>

      <div className={`flex gap-1 mb-5 border-b ${t.border}`}>
        {[{ key: 'documentacion', label: 'Documentación' }, { key: 'comites', label: 'Comités de tecnovigilancia' }].map(sub => (
          <button key={sub.key} onClick={() => setSubTab(sub.key)}
            className="px-3 py-2 text-xs font-semibold -mb-px border-b-2 transition"
            style={subTab === sub.key ? { borderColor: accent, color: accent } : { borderColor: 'transparent' }}>
            {sub.label}
          </button>
        ))}
      </div>

      {subTab === 'documentacion' && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <HeroStat t={t} label="Documentos" color={accent}
              value={`${cargadosTransversal}/${totalSlotsTransversal}`} sub={modoGlobal ? `cargados · ${activeCompany}` : 'cargados (todas las empresas)'} />
            <HeroStat t={t} label="Empresas" color={accent}
              value={empresasKpi.length} sub="con módulo de tecnovigilancia" />
            <HeroStat t={t} label="Reportes del año" color="#22C55E"
              value={cargadosAnioActual} sub={`${anioActual} · de ${totalSlotsAnioActual} esperados`} />
            <HeroStat t={t} label="Reportes pendientes" color="#F59E0B"
              value={pendientesAnioActual} sub={`${anioActual} · trimestres sin cargar`} />
          </div>

          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-wide mb-3">Documentación</div>
            {/* Cada tarjeta representa un único documento+empresa: el documento único (INVIMA)
                y, para el documento por empresa, una tarjeta por cada empresa — todas del mismo
                tamaño, como hermanas en la misma cuadrícula. Así ninguna tarjeta queda obligada a
                estirarse a la altura de una vecina más alta (antes las 5 empresas vivían apiladas
                dentro de una sola tarjeta "Manual", mucho más alta que la de INVIMA al lado). */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
              {TECNO_DOCS.flatMap(doc => {
                if (!doc.porEmpresa) {
                  return [{
                    cardKey: doc.key, icon: doc.icon, titulo: doc.label, subtitulo: 'Documento único (todas las empresas)',
                    url: urlDeDoc(doc), onChange: v => onUpdateTransversal(doc.key, null, v), color: accent, soloSuperAdmin: true,
                  }];
                }
                if (modoGlobal) {
                  return [{
                    cardKey: `${doc.key}-${activeCompany}`, icon: doc.icon, titulo: doc.label, subtitulo: activeCompany,
                    url: urlDeDoc(doc, activeCompany), onChange: v => onUpdateTransversal(doc.key, activeCompany, v), color: accent,
                  }];
                }
                return COMPANIES.map(c => ({
                  cardKey: `${doc.key}-${c.key}`, icon: doc.icon, titulo: doc.label, subtitulo: c.key,
                  url: urlDeDoc(doc, c.key), onChange: v => onUpdateTransversal(doc.key, c.key, v), color: c.color,
                }));
              }).map(card => {
                const Icon = card.icon;
                return (
                  <div key={card.cardKey} className={`rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition ${t.panel} ${t.border}`}>
                    <div className="h-1" style={{ background: card.color }} />
                    <div className="p-3.5 flex flex-col gap-2.5">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: card.color + '1A', color: card.color }}>
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold wrap-break-word">{card.titulo}</div>
                          <div className="text-2xs mt-0.5 font-semibold" style={{ color: card.color }}>{card.subtitulo}</div>
                        </div>
                      </div>
                      <DocumentoEstadoAcciones url={card.url} onChange={card.onChange} readOnly={readOnly || (card.soloSuperAdmin && !isSuper)} t={t} accent={card.color} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-3">Reportes de tecnovigilancia</div>

            {!empresaSel && (
              <div>
                <p className={`text-2xs mb-3 ${t.muted}`}>Selecciona una empresa para consultar sus reportes.</p>
                <div className="grid md:grid-cols-3 gap-4">
                  {COMPANIES.map(c => {
                    const ciudades = TECNO_CIUDADES[c.key] || [];
                    return (
                      <button key={c.key} onClick={() => setEmpresaSelLocal(c.key)}
                        className={`text-left rounded-xl border overflow-hidden hover:-translate-y-0.5 transition ${t.panel} ${t.border}`}>
                        <div className="h-2" style={{ background: c.gradient }} />
                        <div className="p-5">
                          <div className="text-sm font-bold" style={{ color: c.color }}>{c.key}</div>
                          <div className={`text-2xs mt-1 ${t.muted}`}>{ciudades.length} ciudad{ciudades.length !== 1 ? 'es' : ''}/departamento{ciudades.length !== 1 ? 's' : ''}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {empresaSel && !sedeSel && (
              <div>
                {!modoGlobal && <button onClick={resetEmpresa} className={`text-2xs font-mono uppercase mb-3 hover:underline ${t.muted}`}>← Cambiar empresa</button>}
                <div className="text-sm font-bold mb-3" style={{ color: empresa.color }}>{empresa.key}</div>
                <p className={`text-2xs mb-3 ${t.muted}`}>Selecciona una ciudad/departamento.</p>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(TECNO_CIUDADES[empresaSel] || []).map(ciudad => (
                    <button key={ciudad} onClick={() => setSedeSel(ciudad)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left hover:-translate-y-0.5 transition ${t.panel} ${t.border}`}>
                      <MapPin size={15} style={{ color: empresa.color }} />
                      <span className="text-xs font-semibold">{ciudad}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {empresaSel && sedeSel && (
              <div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 text-2xs font-mono uppercase">
                  {!modoGlobal && (<><button onClick={resetEmpresa} className={`hover:underline ${t.muted}`}>Empresa</button><span className={t.muted}>/</span></>)}
                  <button onClick={resetSede} className={`hover:underline ${t.muted}`}>{empresa.key}</button>
                  <span className={t.muted}>/</span>
                  <span style={{ color: empresa.color }}>{sedeSel}</span>
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <button onClick={() => setAnio(a => a - 1)} className={`w-7 h-7 flex items-center justify-center rounded-md border ${t.border} ${t.muted} hover:opacity-70`}>
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-sm font-bold font-mono">{anio}</span>
                  <button onClick={() => setAnio(a => a + 1)} className={`w-7 h-7 flex items-center justify-center rounded-md border ${t.border} ${t.muted} hover:opacity-70`}>
                    <ChevronRight size={14} />
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {TECNO_TRIMESTRES.map(tr => {
                    const url = anioData[tr.key];
                    const cargado = !!url;
                    const open = openTrimestre === tr.key;
                    return (
                      <div key={tr.key} className={`rounded-xl border overflow-hidden shadow-sm ${t.panel} ${t.border}`}>
                        <button onClick={() => setOpenTrimestre(open ? null : tr.key)} className="w-full text-left p-4">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-xs font-semibold">{tr.label}</span>
                            {cargado
                              ? <CheckCircle2 size={16} style={{ color: '#22C55E' }} />
                              : <AlertCircle size={16} style={{ color: '#F59E0B' }} />}
                          </div>
                          <span className="text-2xs font-medium" style={{ color: cargado ? '#22C55E' : '#F59E0B' }}>
                            {cargado ? 'Cargado' : 'Pendiente'}
                          </span>
                        </button>
                        {open && (
                          <div className={`p-3 border-t space-y-2 ${t.border} ${t.panel3}`}>
                            <TextInput t={t} value={url} disabled={readOnly} placeholder="URL del reporte"
                              onChange={v => onUpdateReporte(empresaSel, sedeSel, anio, tr.key, v)} />
                            <PdfLink url={url} t={t} title={`${tr.label} · ${sedeSel}`} emptyLabel="Documento no cargado" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {subTab === 'comites' && (
        <>
          {/* Un solo bloque para los dos documentos por empresa (acta + seguimiento de
              alertas) en vez de una sección completa por documento — con una sola empresa
              activa eso dejaba cada tarjeta sola en su propia fila, una debajo de la otra,
              ocupando mucho más alto de lo necesario para dos campos de URL. */}
          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-wide mb-3">Documentos del comité</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
              {[TECNO_ACTA_COMITE_DOC, TECNO_SEGUIMIENTO_ALERTAS_DOC].flatMap(doc =>
                empresasKpi.map(c => ({ doc, c })),
              ).map(({ doc, c }) => {
                const DocIcon = doc.icon;
                return (
                  <div key={`${doc.key}-${c.key}`} className={`rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition ${t.panel} ${t.border}`}>
                    <div className="h-1" style={{ background: c.color }} />
                    <div className="p-3.5 flex flex-col gap-2.5">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: c.color + '1A', color: c.color }}>
                          <DocIcon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold wrap-break-word">{doc.label}</div>
                          <div className="text-2xs mt-0.5 font-semibold" style={{ color: c.color }}>{c.key}</div>
                        </div>
                      </div>
                      <DocumentoEstadoAcciones url={urlDeDoc(doc, c.key)}
                        onChange={v => onUpdateTransversal(doc.key, c.key, v)} readOnly={readOnly} t={t} accent={c.color} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <TecnoComitesSeccion comites={comites} empresasKpi={empresasKpi} modoGlobal={modoGlobal}
            t={t} accent={accent} onGuardar={onGuardarComite} onEliminar={onEliminarComite} readOnly={readOnly} />
        </>
      )}
    </div>
  );
}

// Comités de tecnovigilancia — URL (+ nombre, fecha, estado, observaciones) de la reunión
// trimestral del comité de cada empresa, administrada desde una grilla Empresa × Trimestre
// (un comité es por empresa completa, sin sede). Disponible tanto con "Todas las empresas"
// seleccionadas (consolidado, con filtro de empresa) como dentro de una empresa puntual
// (empresasKpi ya viene recortado a esa única empresa — ver TecnovigilanciaPage).
function TecnoComitesSeccion({ comites, empresasKpi, modoGlobal, t, accent, onGuardar, onEliminar, readOnly }) {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [trimestreFiltro, setTrimestreFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(null); // { empresaKey, trimestre } mientras está abierto

  const registroDe = (empresaKey, trKey) => comites?.[empresaKey]?.[anio]?.[trKey] || null;

  let registrados = 0;
  empresasKpi.forEach(c => TECNO_TRIMESTRES.forEach(tr => { if (registroDe(c.key, tr.key)?.url) registrados++; }));
  const totalSlots = empresasKpi.length * TECNO_TRIMESTRES.length;
  const pendientes = totalSlots - registrados;

  const trimestresVisibles = trimestreFiltro ? TECNO_TRIMESTRES.filter(tr => tr.key === trimestreFiltro) : TECNO_TRIMESTRES;
  const busquedaNorm = busqueda.trim().toLowerCase();
  const empresasFiltradas = empresasKpi
    .filter(c => !empresaFiltro || c.key === empresaFiltro)
    .filter(c => !busquedaNorm || c.key.toLowerCase().includes(busquedaNorm)
      || TECNO_TRIMESTRES.some(tr => (registroDe(c.key, tr.key)?.nombreComite || '').toLowerCase().includes(busquedaNorm)))
    .filter(c => !estadoFiltro || trimestresVisibles.some(tr => (registroDe(c.key, tr.key)?.estado || 'Pendiente') === estadoFiltro));

  const hayFiltrosActivos = Boolean(empresaFiltro || trimestreFiltro || estadoFiltro || busqueda);
  const limpiarFiltros = () => { setEmpresaFiltro(''); setTrimestreFiltro(''); setEstadoFiltro(''); setBusqueda(''); };

  const primerPendiente = (empresaKey) => {
    const candidato = trimestresVisibles.find(tr => !registroDe(empresaKey, tr.key)?.url) || trimestresVisibles[0] || TECNO_TRIMESTRES[0];
    return candidato.key;
  };

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <HeroStat t={t} label="Total de empresas" color={accent} value={empresasKpi.length} sub={modoGlobal ? 'empresa activa' : 'con módulo de tecnovigilancia'} />
        <HeroStat t={t} label="Comités programados" color="#3B82F6" value={totalSlots} sub={`${anio} · empresas × trimestres`} />
        <HeroStat t={t} label="Enlaces registrados" color="#22C55E" value={registrados} sub={`${anio} · con URL cargada`} />
        <HeroStat t={t} label="Enlaces pendientes" color="#F59E0B" value={pendientes} sub={`${anio} · por registrar`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {modoGlobal && (
          <select value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
            <option value="">Toda empresa</option>
            {empresasKpi.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
          </select>
        )}
        <select value={trimestreFiltro} onChange={e => setTrimestreFiltro(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo trimestre</option>
          {TECNO_TRIMESTRES.map(tr => <option key={tr.key} value={tr.key}>{tr.label}</option>)}
        </select>
        <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} className={`rounded-md px-2 py-1.5 text-xs border ${t.input}`}>
          <option value="">Todo estado</option>
          {TECNO_COMITE_ESTADOS.map(es => <option key={es} value={es}>{es}</option>)}
        </select>
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar empresa o comité…"
          className={`rounded-md px-2.5 py-1.5 text-xs border ${t.input}`} />
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setAnio(a => a - 1)} className={`w-7 h-7 flex items-center justify-center rounded-md border ${t.border} ${t.muted} hover:opacity-70`}>
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-bold font-mono">{anio}</span>
          <button onClick={() => setAnio(a => a + 1)} className={`w-7 h-7 flex items-center justify-center rounded-md border ${t.border} ${t.muted} hover:opacity-70`}>
            <ChevronRight size={14} />
          </button>
        </div>
        {hayFiltrosActivos && <Button variant="ghost" t={t} icon={X} iconSize={12} onClick={limpiarFiltros}>Limpiar filtros</Button>}
      </div>

      <div className={`rounded-xl border overflow-hidden ${t.panel} ${t.border}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-2xs">
            <thead>
              <tr className={`text-left ${t.muted} border-b ${t.border}`}>
                <th className="px-5 py-2 font-mono uppercase text-3xs">Empresa</th>
                <th className="px-3 py-2 font-mono uppercase text-3xs">Año</th>
                {trimestresVisibles.map(tr => <th key={tr.key} className="px-3 py-2 font-mono uppercase text-3xs">{tr.key.toUpperCase()}</th>)}
                <th className="px-3 py-2 font-mono uppercase text-3xs">Estado</th>
                <th className="px-3 py-2 pr-5 font-mono uppercase text-3xs text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresasFiltradas.length === 0 ? (
                <tr><td colSpan={4 + trimestresVisibles.length} className={`text-center py-6 ${t.muted}`}>Sin empresas para los filtros actuales.</td></tr>
              ) : empresasFiltradas.map(c => {
                const registradosFila = trimestresVisibles.filter(tr => registroDe(c.key, tr.key)?.url).length;
                const estadoColor = registradosFila === 0 ? '#94A3B8' : registradosFila === trimestresVisibles.length ? '#22C55E' : '#F59E0B';
                const estadoLabel = registradosFila === 0 ? 'Pendiente' : registradosFila === trimestresVisibles.length ? 'Completo' : 'En progreso';
                return (
                  <tr key={c.key} className={`border-t ${t.border}`}>
                    <td className="px-5 py-2 font-semibold" style={{ color: c.color }}>{c.key}</td>
                    <td className="px-3 py-2 font-mono">{anio}</td>
                    {trimestresVisibles.map(tr => {
                      const reg = registroDe(c.key, tr.key);
                      const tieneUrl = !!reg?.url;
                      return (
                        <td key={tr.key} className="px-3 py-2">
                          <button onClick={() => setModal({ empresaKey: c.key, trimestre: tr.key })}
                            className={tieneUrl ? 'font-semibold underline' : `underline decoration-dashed ${t.muted}`}
                            style={tieneUrl ? { color: accent } : undefined}>
                            {tieneUrl ? 'Ver enlace' : 'Registrar'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2"><Badge color={estadoColor}>{estadoLabel} · {registradosFila}/{trimestresVisibles.length}</Badge></td>
                    <td className="px-3 py-2 pr-5 text-right">
                      <button onClick={() => setModal({ empresaKey: c.key, trimestre: trimestreFiltro || primerPendiente(c.key) })}
                        title="Editar" aria-label={`Editar comités de ${c.key}`} className={`inline-flex items-center justify-center w-7 h-7 rounded-md border ${t.border} hover:opacity-70`}>
                        <Pencil size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <TecnoComiteModal
          empresaKey={modal.empresaKey} anio={anio} trimestreInicial={modal.trimestre}
          comites={comites} t={t} accent={accent} readOnly={readOnly}
          onGuardar={onGuardar} onEliminar={onEliminar} onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// Modal de alta/edición de UN comité de tecnovigilancia (empresa · año · trimestre). Empresa
// y año también son seleccionables dentro del modal (pedido explícito del diseño) — al
// cambiarlos, el formulario se resincroniza con el registro existente de la nueva combinación
// (si lo hay), igual que DateInput resincroniza su texto cuando `value` cambia desde afuera.
function TecnoComiteModal({ empresaKey, anio, trimestreInicial, comites, t, accent, readOnly, onGuardar, onEliminar, onClose }) {
  const [empresa, setEmpresa] = useState(empresaKey);
  const [anioSel, setAnioSel] = useState(anio);
  const [trimestre, setTrimestre] = useState(trimestreInicial);
  const [url, setUrl] = useState('');
  const [nombreComite, setNombreComite] = useState('');
  const [fechaReunion, setFechaReunion] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [estado, setEstado] = useState('Pendiente');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  // Cada vez que empresa/año/trimestre cambian (incluida la primera vez), el formulario se
  // resincroniza con lo que ya exista guardado para esa combinación puntual — así elegir una
  // empresa u otra en el selector nunca mezcla los datos de una con los de otra.
  const comboKey = `${empresa}|${anioSel}|${trimestre}`;
  const [prevCombo, setPrevCombo] = useState(null);
  if (comboKey !== prevCombo) {
    setPrevCombo(comboKey);
    const r = comites?.[empresa]?.[anioSel]?.[trimestre] || null;
    setUrl(r?.url || '');
    setNombreComite(r?.nombreComite || '');
    setFechaReunion(r?.fechaReunion || '');
    setObservaciones(r?.observaciones || '');
    setEstado(r?.estado || 'Pendiente');
    setError('');
    setConfirmarEliminar(false);
  }
  const existe = !!comites?.[empresa]?.[anioSel]?.[trimestre];

  const anioActual = new Date().getFullYear();
  const aniosOpciones = [...new Set([anioActual - 2, anioActual - 1, anioActual, anioActual + 1, anioActual + 2, anio, anioSel])].sort((a, b) => a - b);
  const empresasOpciones = COMPANIES;

  const handleGuardar = async () => {
    const urlLimpia = url.trim();
    if (urlLimpia && !/^https?:\/\//i.test(urlLimpia)) {
      setError('El enlace debe comenzar con http:// o https://.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onGuardar(empresa, anioSel, trimestre, {
        url: urlLimpia, nombreComite: nombreComite.trim(), fechaReunion, observaciones: observaciones.trim(), estado,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el comité.');
      setSaving(false);
    }
  };

  const handleEliminar = async () => {
    setSaving(true);
    try {
      await onEliminar(empresa, anioSel, trimestre);
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el comité.');
      setSaving(false);
      setConfirmarEliminar(false);
    }
  };

  const trSel = TECNO_TRIMESTRES.find(tr => tr.key === trimestre);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={saving ? undefined : onClose} />
      <div className={`animate-modal-in relative w-full max-w-lg rounded-xl border p-4 ${t.panel} ${t.border}`}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-semibold">Comité de tecnovigilancia</div>
          <button onClick={onClose} disabled={saving} aria-label="Cerrar" className="flex items-center justify-center w-11 h-11 -mr-2 -mt-2"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mb-2.5">
          <Field dense label="Empresa">
            <SelectInput dense t={t} disabled={readOnly || saving} value={empresa} options={empresasOpciones.map(c => c.key)} onChange={setEmpresa} />
          </Field>
          <Field dense label="Año">
            <SelectInput dense t={t} disabled={readOnly || saving} value={String(anioSel)} options={aniosOpciones.map(String)} onChange={v => setAnioSel(Number(v))} />
          </Field>
          <Field dense label="Trimestre">
            <select value={trimestre} onChange={e => setTrimestre(e.target.value)} disabled={readOnly || saving}
              className={`rounded-md border px-2 py-1 text-2xs ${t.input} ${(readOnly || saving) ? 'opacity-60 cursor-not-allowed' : ''}`}>
              {TECNO_TRIMESTRES.map(tr => <option key={tr.key} value={tr.key}>{tr.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="space-y-2.5">
          <Field dense label="URL del comité">
            <TextInput dense t={t} value={url} disabled={readOnly || saving} placeholder="https://…" onChange={setUrl} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <Field dense label="Nombre del comité (opcional)">
              <TextInput dense t={t} value={nombreComite} disabled={readOnly || saving} placeholder={`Comité ${trSel?.label || ''} ${empresa}`} onChange={setNombreComite} />
            </Field>
            <Field dense label="Fecha de reunión (opcional)">
              <TextInput dense t={t} type="date" value={fechaReunion} disabled={readOnly || saving} onChange={setFechaReunion} />
            </Field>
          </div>
          <Field dense label="Estado">
            <SelectInput dense t={t} disabled={readOnly || saving} value={estado} options={TECNO_COMITE_ESTADOS} onChange={setEstado} />
          </Field>
          <Field dense label="Observaciones (opcional)">
            <textarea rows={3} value={observaciones} disabled={readOnly || saving} onChange={e => setObservaciones(e.target.value)}
              className={`w-full rounded-md px-2.5 py-2 text-xs border ${t.input} ${(readOnly || saving) ? 'opacity-60' : ''}`} />
          </Field>
        </div>

        {error && <p className="text-2xs mt-3" style={{ color: '#EF4444' }}>{error}</p>}

        {confirmarEliminar ? (
          <div className="mt-4 rounded-md border p-3 text-2xs" style={{ borderColor: '#EF444455', background: '#EF444415' }}>
            <p className="mb-2" style={{ color: '#EF4444' }}>¿Eliminar este registro de comité? Esta acción no se puede deshacer.</p>
            <div className="flex gap-2">
              <Button variant="danger" t={t} size="sm" disabled={saving} onClick={handleEliminar}>Sí, eliminar</Button>
              <Button variant="ghost" t={t} size="sm" disabled={saving} onClick={() => setConfirmarEliminar(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {!readOnly && <Button variant="primary" accent={accent} t={t} disabled={saving} onClick={handleGuardar}>Guardar</Button>}
            <Button variant="ghost" t={t} disabled={saving} onClick={onClose}>Cancelar</Button>
            {url.trim() && <Button variant="outline" t={t} icon={ExternalLink} iconSize={12} onClick={() => window.open(url.trim(), '_blank', 'noopener,noreferrer')}>Abrir enlace</Button>}
            {!readOnly && existe && (
              <Button variant="ghost" t={t} icon={Trash2} iconSize={12} className="ml-auto" style={{ color: '#EF4444' }} disabled={saving} onClick={() => setConfirmarEliminar(true)}>
                Eliminar
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
