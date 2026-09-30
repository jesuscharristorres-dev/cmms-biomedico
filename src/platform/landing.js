// src/platform/landing.js
// Textos de presentación del LANDING PÚBLICO (antes del login). El estado, el icono y el
// color de cada módulo NO se repiten aquí: se toman del registro único de módulos
// (./modulos.js), el mismo que usa el portal interno, para que la página pública y la
// aplicación nunca muestren un estado distinto para la misma área.

import { Layers } from 'lucide-react';
import { moduloPorKey } from './modulos';

const conRegistro = (item) => {
  const m = moduloPorKey(item.key);
  return { ...item, estado: m.estado, icon: m.icon, color: m.color };
};

// Áreas principales — tarjetas grandes de "Módulos de la organización".
export const LANDING_AREAS = [
  {
    key: 'biomedica',
    titulo: 'Biomédica',
    etiqueta: 'Ingeniería clínica',
    descripcion: 'Gestión integral de equipos biomédicos, mantenimiento, calibraciones, hojas de vida, inventario y seguimiento.',
    caracteristicas: ['Equipos', 'Mantenimientos', 'Calibraciones', 'Inventario', 'Hojas de vida', 'Reportes'],
  },
  {
    key: 'rrhh',
    titulo: 'Gestión Humana',
    etiqueta: 'RRHH',
    descripcion: 'Gestión integral del talento humano y sus procesos asociados.',
    caracteristicas: ['Colaboradores', 'Hojas de vida', 'Contratos', 'Capacitaciones', 'Inducciones', 'Documentación', 'Seguimiento'],
  },
  {
    key: 'sst',
    titulo: 'Seguridad y Salud en el Trabajo',
    etiqueta: 'SST',
    descripcion: 'Gestión y seguimiento de las actividades relacionadas con seguridad y salud en el trabajo.',
    caracteristicas: ['Inspecciones', 'Riesgos', 'Incidentes', 'Planes de acción', 'Capacitaciones', 'Seguimiento', 'Indicadores'],
  },
  {
    key: 'calidad',
    titulo: 'Gestión de Calidad',
    etiqueta: 'Calidad',
    descripcion: 'Gestión de procesos, documentación, auditorías y acciones de mejora.',
    caracteristicas: ['Gestión documental', 'Auditorías', 'Hallazgos', 'Acciones correctivas', 'Acciones de mejora', 'Indicadores'],
  },
].map(conRegistro);

// "Y mucho más..." — tarjetas pequeñas.
export const LANDING_OTRAS_AREAS = [
  { key: 'mantenimiento', titulo: 'Mantenimiento', descripcion: 'Gestión de mantenimiento de infraestructura y equipos.' },
  { key: 'activos', titulo: 'Gestión de Activos', descripcion: 'Control y trazabilidad de activos empresariales.' },
  { key: 'documental', titulo: 'Gestión Documental', descripcion: 'Documentos, versiones, vencimientos y responsables.' },
  { key: 'capacitaciones', titulo: 'Capacitaciones', descripcion: 'Gestión transversal de formación y competencias.' },
  { key: 'compras', titulo: 'Compras', descripcion: 'Solicitudes, proveedores y seguimiento.' },
  { key: 'indicadores', titulo: 'Indicadores', descripcion: 'Visualización de KPIs y resultados.' },
  { key: 'administracion', titulo: 'Administración', descripcion: 'Usuarios, empresas, roles y permisos.' },
  { key: 'operaciones', titulo: 'Operaciones', descripcion: 'Gestión de procesos operativos.' },
].map(conRegistro);

// Ecosistema "un núcleo + muchas áreas": ramas y ejemplos de procesos de cada una.
export const LANDING_ECOSISTEMA = [
  { key: 'biomedica', nombre: 'Biomédica', procesos: ['Equipos', 'Mantenimiento', 'Calibración'] },
  { key: 'rrhh', nombre: 'RRHH', procesos: ['Personas', 'Formación', 'Documentos'] },
  { key: 'sst', nombre: 'SST', procesos: ['Riesgos', 'Incidentes', 'Inspecciones'] },
  { key: 'calidad', nombre: 'Calidad', procesos: ['Procesos', 'Auditorías', 'Hallazgos'] },
  { key: 'mas', nombre: 'Más áreas', procesos: ['Activos', 'Compras', 'Indicadores'], mas: true },
].map(r => (r.mas ? { ...r, estado: 'PROXIMAMENTE', color: '#64748B', icon: Layers } : conRegistro(r)));
