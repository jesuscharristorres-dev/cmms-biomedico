// src/rrhh/formato.js
// Etiquetas, colores de estado y formato de fechas del módulo Gestión Humana.

import { ESTADOS_MODULO } from '../platform/modulos';

export const COLOR_RRHH = '#C2410C'; // terracota: texto y botones (contraste AA sobre blanco)
export const COLOR_RRHH_CLARO = '#E8603C'; // coral: degradados y acentos
const VERDE = ESTADOS_MODULO.ACTIVO.color;
const AMBAR = ESTADOS_MODULO.EN_DESARROLLO.color;
const ROJO = '#DC2626';
const GRIS = ESTADOS_MODULO.PROXIMAMENTE.color;

export const ESTADO_DOCUMENTO = {
  vigente: { label: 'Vigente', color: VERDE },
  por_vencer: { label: 'Por vencer', color: AMBAR },
  vencido: { label: 'Vencido', color: ROJO },
  pendiente: { label: 'Pendiente', color: ROJO },
};
export const ESTADO_VACUNA = {
  completa: { label: 'Completa', color: VERDE },
  pendiente: { label: 'Pendiente', color: AMBAR },
  vencida: { label: 'Requiere actualización', color: ROJO },
};
export const ESTADO_CONTRATO = {
  activo: { label: 'Activo', color: VERDE },
  por_vencer: { label: 'Por renovar', color: AMBAR },
  finalizado: { label: 'Finalizado', color: GRIS },
};
export const ESTADO_COLABORADOR = {
  Activo: { label: 'Activo', color: VERDE },
  Inactivo: { label: 'Inactivo', color: GRIS },
};
export const ESTADO_DOCUMENTACION = {
  Completa: { label: 'Completa', color: VERDE },
  'Por vencer': { label: 'Por vencer', color: AMBAR },
  'Con pendientes': { label: 'Con pendientes', color: ROJO },
};
export const NIVEL_ALERTA = {
  rojo: { color: ROJO, label: 'Crítica' },
  amarillo: { color: AMBAR, label: 'Atención' },
  verde: { color: VERDE, label: 'Al día' },
};

export const AREAS_RRHH = ['Administración', 'Biomédica', 'Calidad', 'SST', 'Operaciones', 'Gestión Humana'];
export const TIPOS_CONTRATO = ['Indefinido', 'Término fijo', 'Obra o labor', 'Prestación de servicios', 'Aprendizaje'];
export const TIPOS_DOCUMENTO = ['Cédula', 'Hoja de vida', 'Títulos', 'Actas de grado', 'Certificados', 'Estudios complementarios', 'Contrato', 'Otros documentos'];

export function fmtFecha(iso) {
  if (!iso) return '—';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso)) return iso;
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : String(iso);
}

export function colorPorTexto(texto) {
  const paleta = ['#6366F1', '#0D9488', '#EA580C', '#2563EB', '#DB2777', '#7C3AED', '#0891B2', '#CA8A04'];
  let h = 0;
  for (const ch of String(texto)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return paleta[h % paleta.length];
}

export function iniciales(nombre) {
  const p = String(nombre || '').split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p[p.length > 2 ? 2 : 1]?.[0] || '')).toUpperCase();
}

export function tiempoTranscurrido(inicio, fin) {
  const a = Number(String(inicio).slice(0, 4));
  const b = fin ? Number(String(fin).slice(0, 4)) : new Date().getFullYear();
  if (!a || !b) return '—';
  const anios = Math.max(0, b - a);
  return anios === 0 ? 'Menos de 1 año' : `${anios} año${anios !== 1 ? 's' : ''}`;
}

// Documentos por enlace, como en el CMMS biomédico: el PDF vive en Drive/OneDrive/SharePoint
// y la plataforma solo guarda la URL; "Ver" lo abre en una pestaña nueva.
export function esUrlValida(valor) {
  try {
    const u = new URL((valor || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
// También acepta rutas de la propia app ("/…"), que usan los documentos de ejemplo de la demo.
export function abrirEnlace(url) {
  const limpia = (url || '').trim();
  if (esUrlValida(limpia) || limpia.startsWith('/')) window.open(limpia, '_blank', 'noopener,noreferrer');
}
