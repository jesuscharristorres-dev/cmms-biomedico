// src/data/empresas.js
// Catálogo de empresas — usado por casi toda la app (equipos, alertas, dashboards, planes y
// programas, tecnovigilancia, personal, limpieza, administración...), así que vive en su
// propio módulo en vez de en App.jsx, para que cualquier página extraída pueda importarlo sin
// crear un import circular con App.jsx.
//
// MULTIEMPRESA: las empresas ya NO están fijas en el código — viven en el servidor
// (Administración → Empresas, api/admin.js) y se cargan al iniciar sesión (GET /api/login).
// DEFAULT_COMPANIES solo es el respaldo visual (colores/logos originales) de las 5 empresas
// sembradas y el valor inicial antes de cargar. `COMPANIES` es la lista VIGENTE: se reemplaza
// en sitio con setCompanies() — para un usuario de empresa contiene SOLO su empresa (el
// servidor no le envía las demás), así que selectores, pestañas y dashboards de toda la app
// se recortan solos. Esto es solo presentación: el aislamiento real lo aplica la API.
//
// `COMPANIES` es un arreglo MUTABLE (setCompanies/registrarSedesEnUso lo modifican en sitio con
// .splice()), no una constante — todo el que lo importe ve siempre el contenido vigente,
// porque los módulos de ES son singletons: hay una sola instancia de este arreglo en toda la app.

import { shade } from '../utils/color.js';

export const NEUTRAL_ACCENT = '#4FD1C5';

export const DEFAULT_COMPANIES = [
  { key: 'MACROMED', color: '#002485', gradient: 'linear-gradient(135deg, #002485 0%, #1F4FB8 100%)', sedes: ['Bogotá'], logo: '/logos/MACROMED.png' },
  { key: 'MEIDE', color: '#24546A', gradient: 'linear-gradient(135deg, #24546A 0%, #3B7088 100%)', sedes: ['Armenia Berlín','Armenia Fundadores','Manizales Belén','Manizales Arboleda','La Dorada','Unidad Móvil'], logo: '/logos/MEIDE.png' },
  { key: 'NP MEDICAL', color: '#3F8E6F', gradient: 'linear-gradient(135deg, #3F8E6F 0%, #63B48F 100%)', sedes: ['Bogotá Samper','Bogotá Sur','Fontibón','Girardot','Tunja'], logo: '/logos/NP_MEDICAL.png' },
  { key: 'DIAGNOSTIK', color: '#C62828', gradient: 'linear-gradient(135deg, #C62828 0%, #E53935 100%)', sedes: ['Armenia Berlín','Armenia Fundadores','Manizales Belén','Bogotá','Chapinero','Villavicencio','La Dorada'], logo: '/logos/DIAGNOSTIK.png' },
  { key: 'AUNAR SALUD', color: '#009EB7', gradient: 'linear-gradient(135deg, #009EB7 0%, #33C4D8 100%)', sedes: ['Bogotá - Segundo Piso','Bogotá - Quinto Piso','Bogotá - Sexto Piso','Villavicencio','Neiva'], logo: '/logos/AUNAR.png' },
];
export const COMPANIES = [...DEFAULT_COMPANIES];

// Convierte una empresa del servidor ({ id, nombre, color, sedes, logo, ... }) al formato que
// usa toda la UI ({ key, color, gradient, sedes, logo }). `key` es el empresa_id.
export function empresaToCompany(e) {
  const base = DEFAULT_COMPANIES.find(c => c.key === e.id);
  const color = e.color || base?.color || NEUTRAL_ACCENT;
  return {
    key: e.id,
    nombre: e.nombre || e.id,
    estado: e.estado || 'activo',
    color,
    gradient: base && base.color === color ? base.gradient : `linear-gradient(135deg, ${color} 0%, ${shade(color, 0.25)} 100%)`,
    sedes: Array.isArray(e.sedes) && e.sedes.length ? e.sedes : ['Principal'],
    logo: e.logo || base?.logo || '',
  };
}
export function setCompanies(empresas) {
  if (!Array.isArray(empresas) || empresas.length === 0) return;
  COMPANIES.splice(0, COMPANIES.length, ...empresas.map(empresaToCompany));
}

// Clave de comparación de sedes: sin tildes, sin mayúsculas y sin espacios repetidos, para
// que "BOGOTA SUR", "Bogotá  Sur" y "Bogotá Sur" se reconozcan como la misma sede.
export function normSede(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

// Sedes EFECTIVAS de cada empresa = sedes configuradas (Administración → Empresas) + sedes
// que realmente tienen sus equipos (p. ej. las cargadas con el cronograma en Excel). Así una
// sede en uso nunca desaparece de la hoja de vida, los filtros ni los dashboards aunque la
// configuración de la empresa esté incompleta. `sedesConfig` conserva la lista configurada.
export function registrarSedesEnUso(equipos) {
  COMPANIES.forEach(c => {
    const config = c.sedesConfig || c.sedes;
    c.sedesConfig = config;
    const vistas = new Set(config.map(normSede));
    const extra = [];
    (equipos || []).forEach(e => {
      if (e.empresa !== c.key || !e.sede) return;
      const k = normSede(e.sede);
      if (vistas.has(k)) return;
      vistas.add(k);
      extra.push(e.sede);
    });
    c.sedes = [...config, ...extra.sort((a, b) => a.localeCompare(b))];
  });
}

// Para una clave que no coincide con ninguna empresa (registros heredados sin empresa válida,
// que solo ve el SUPER_ADMIN hasta asignarlos en Administración → Empresas) se devuelve una
// empresa "placeholder" neutra en vez de undefined, para que ninguna vista se caiga.
const UNKNOWN_COMPANY_COLOR = '#94A3B8';
export const companyOf = (key) => COMPANIES.find(c => c.key === key) || (key && key !== 'TODAS' ? {
  key, nombre: `${key} (sin empresa válida)`, estado: 'inactivo', color: UNKNOWN_COMPANY_COLOR,
  gradient: `linear-gradient(135deg, ${UNKNOWN_COMPANY_COLOR} 0%, #CBD5E1 100%)`, sedes: [], logo: '', desconocida: true,
} : undefined);

// Tema único por empresa: todos los componentes reutilizan estos mismos valores.
// Para cambiar la identidad visual de una empresa, basta con editar COMPANIES arriba.
export function themeOf(companyKey) {
  if (!companyKey || companyKey === 'TODAS') {
    return { key: 'TODAS', solid: NEUTRAL_ACCENT, bg: NEUTRAL_ACCENT, light: shade(NEUTRAL_ACCENT, 0.4), dark: shade(NEUTRAL_ACCENT, -0.25), shades: [0.45, 0.25, 0.05, -0.15, -0.32, -0.48].map(p => shade(NEUTRAL_ACCENT, p)) };
  }
  const c = companyOf(companyKey) || COMPANIES[0];
  return { key: c.key, solid: c.color, bg: c.gradient, light: shade(c.color, 0.4), dark: shade(c.color, -0.25), shades: [0.5, 0.3, 0.12, -0.1, -0.28, -0.45, -0.58].map(p => shade(c.color, p)) };
}
