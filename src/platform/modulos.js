// src/platform/modulos.js
// Registro ÚNICO de los módulos de la Plataforma Integral de Gestión.
//
// La plataforma es UNA sola aplicación (una autenticación, una administración de empresas y
// usuarios, el mismo aislamiento multiempresa en la API) con varios módulos por área. Este
// archivo describe qué módulos existen y en qué estado están; el portal de inicio, el menú
// lateral y las pantallas informativas se construyen a partir de él. Para incorporar un área
// nueva basta con agregar una entrada aquí (y, cuando tenga pantallas reales, apuntar sus
// `funciones` a las claves de menú correspondientes).
//
// Estados — se muestran tal cual al usuario, para que la presentación sea honesta:
//   ACTIVO         → el módulo tiene funcionalidades reales en producción.
//   EN_DESARROLLO  → área priorizada; puede tener alguna función real ya disponible, el resto
//                    está proyectado.
//   PROXIMAMENTE   → visión de crecimiento; todavía no hay funcionalidad.
//
// Cada función de un módulo lleva `menu` solo si abre una pantalla que YA existe en la app.
// Sin `menu`, la función es proyectada y se muestra como "Próximamente" (nunca un enlace roto).

import {
  HeartPulse, Users, HardHat, BadgeCheck, Wrench, Boxes, FolderArchive, GraduationCap,
  ShoppingCart, ChartColumn, Settings, Landmark, Workflow, Headset,
} from 'lucide-react';

export const PLATAFORMA_NOMBRE = 'Plataforma Integral de Gestión';

export const ESTADOS_MODULO = {
  ACTIVO: { label: 'Activo', color: '#16A34A' },
  EN_DESARROLLO: { label: 'En desarrollo', color: '#D97706' },
  PROXIMAMENTE: { label: 'Próximamente', color: '#64748B' },
};

export const MODULOS = [
  {
    key: 'biomedica',
    nombre: 'Biomédica',
    subtitulo: 'Ingeniería clínica',
    descripcion: 'Gestión integral de equipos biomédicos, mantenimientos, calibraciones, hojas de vida y reportes.',
    icon: HeartPulse,
    color: '#0D9488',
    estado: 'ACTIVO',
    principal: true,
    area: 'Procesos',
    entrada: 'dashboard',
    funciones: [
      { label: 'Inventario', menu: 'inventario' },
      { label: 'Mantenimientos', menu: 'mantenimientos' },
      { label: 'Calibraciones', menu: 'calibraciones' },
      { label: 'Reportes', menu: 'fallas' },
      { label: 'Hojas de vida', menu: 'inventario' },
      { label: 'Tecnovigilancia', menu: 'tecnovigilancia' },
    ],
  },
  {
    key: 'rrhh',
    nombre: 'Gestión Humana',
    subtitulo: 'RRHH',
    descripcion: 'Gestión del talento humano, colaboradores, documentación, capacitaciones y seguimiento.',
    menuLabel: 'RRHH',
    icon: Users,
    color: '#6366F1',
    estado: 'EN_DESARROLLO',
    principal: true,
    area: 'Personas',
    // Módulo en DEMOSTRACIÓN (src/rrhh): expediente digital con datos ficticios, listo para
    // conectarse a la base de datos. Abre la demo en lugar de la pantalla informativa.
    demo: true,
    entrada: 'modulo_rrhh',
    funciones: [
      { label: 'Colaboradores', menu: 'modulo_rrhh' },
      { label: 'Hojas de vida', menu: 'modulo_rrhh' },
      { label: 'Contratos', menu: 'modulo_rrhh' },
      // Las capacitaciones que ya existen son las del área biomédica.
      { label: 'Capacitaciones', menu: 'capacitaciones' },
      { label: 'Inducciones' },
      { label: 'Documentos', menu: 'modulo_rrhh' },
      { label: 'Evaluaciones' },
      { label: 'Vencimientos', menu: 'modulo_rrhh' },
    ],
  },
  {
    key: 'sst',
    nombre: 'Seguridad y Salud en el Trabajo',
    subtitulo: 'SST',
    descripcion: 'Gestión de riesgos, inspecciones, incidentes, actividades y cumplimiento del sistema SST.',
    menuLabel: 'SST',
    icon: HardHat,
    color: '#EA580C',
    estado: 'EN_DESARROLLO',
    principal: true,
    area: 'Riesgos',
    funciones: [
      { label: 'Inspecciones' },
      { label: 'Reportes de incidentes' },
      { label: 'Matriz de riesgos' },
      { label: 'Planes de acción' },
      { label: 'Capacitaciones' },
      { label: 'Seguimiento' },
      { label: 'Indicadores' },
    ],
  },
  {
    key: 'calidad',
    nombre: 'Gestión de Calidad',
    subtitulo: 'Calidad',
    descripcion: 'Control documental, procesos, hallazgos, acciones de mejora e indicadores.',
    menuLabel: 'Calidad',
    icon: BadgeCheck,
    color: '#2563EB',
    estado: 'EN_DESARROLLO',
    principal: true,
    area: 'Calidad',
    funciones: [
      { label: 'Documentos' },
      { label: 'Procesos' },
      { label: 'Auditorías' },
      { label: 'Hallazgos' },
      { label: 'Acciones correctivas' },
      { label: 'Acciones preventivas' },
      { label: 'Indicadores' },
    ],
  },
  {
    key: 'mantenimiento',
    nombre: 'Mantenimiento',
    descripcion: 'Gestión de mantenimiento de infraestructura, vehículos, equipos y activos.',
    icon: Wrench,
    color: '#0891B2',
    estado: 'PROXIMAMENTE',
    funciones: [{ label: 'Infraestructura' }, { label: 'Vehículos' }, { label: 'Equipos industriales' }, { label: 'Órdenes de trabajo' }],
  },
  {
    key: 'activos',
    nombre: 'Activos',
    descripcion: 'Control y trazabilidad de activos empresariales.',
    icon: Boxes,
    color: '#7C3AED',
    estado: 'PROXIMAMENTE',
    funciones: [{ label: 'Registro de activos' }, { label: 'Asignaciones' }, { label: 'Traslados' }, { label: 'Trazabilidad' }],
  },
  {
    key: 'documental',
    nombre: 'Gestión Documental',
    descripcion: 'Control de documentos, versiones, vencimientos y responsables.',
    icon: FolderArchive,
    color: '#0F766E',
    estado: 'PROXIMAMENTE',
    menuLateral: true,
    funciones: [{ label: 'Documentos' }, { label: 'Versiones' }, { label: 'Vencimientos' }, { label: 'Responsables' }],
  },
  {
    key: 'capacitaciones',
    nombre: 'Capacitaciones',
    descripcion: 'Gestión transversal de capacitaciones y competencias.',
    icon: GraduationCap,
    color: '#DB2777',
    estado: 'PROXIMAMENTE',
    funciones: [
      // El registro de capacitaciones actual es el del área biomédica; el módulo transversal
      // (todas las áreas, competencias) todavía no existe.
      { label: 'Capacitaciones del área biomédica', menu: 'capacitaciones' },
      { label: 'Plan de formación corporativo' },
      { label: 'Competencias' },
    ],
  },
  {
    key: 'compras',
    nombre: 'Compras',
    descripcion: 'Solicitudes, proveedores y seguimiento de adquisiciones.',
    icon: ShoppingCart,
    color: '#CA8A04',
    estado: 'PROXIMAMENTE',
    funciones: [{ label: 'Solicitudes' }, { label: 'Proveedores' }, { label: 'Órdenes de compra' }, { label: 'Seguimiento' }],
  },
  {
    key: 'indicadores',
    nombre: 'Indicadores',
    descripcion: 'Dashboard corporativo con KPIs.',
    icon: ChartColumn,
    color: '#4F46E5',
    estado: 'PROXIMAMENTE',
    menuLateral: true,
    funciones: [
      // Los indicadores biomédicos sí existen (dashboard del módulo Biomédica).
      { label: 'Indicadores biomédicos', menu: 'dashboard' },
      { label: 'KPIs corporativos' },
      { label: 'Tableros por área' },
    ],
  },
  {
    key: 'administracion',
    nombre: 'Administración',
    descripcion: 'Configuraciones, usuarios, empresas, permisos y parámetros.',
    icon: Settings,
    color: '#475569',
    estado: 'ACTIVO',
    soloSuperAdmin: true,
    entrada: 'admin_empresas',
    funciones: [
      { label: 'Empresas', menu: 'admin_empresas' },
      { label: 'Usuarios', menu: 'admin_usuarios' },
      { label: 'Permisos por módulo' },
      { label: 'Parámetros' },
    ],
  },
  {
    key: 'finanzas',
    nombre: 'Finanzas',
    descripcion: 'Presupuestos, costos por área y control financiero de la operación.',
    icon: Landmark,
    color: '#15803D',
    estado: 'PROXIMAMENTE',
    funciones: [{ label: 'Presupuestos' }, { label: 'Centros de costo' }, { label: 'Costos de mantenimiento' }],
  },
  {
    key: 'operaciones',
    nombre: 'Operaciones',
    descripcion: 'Seguimiento de procesos operativos, turnos y actividades de las sedes.',
    icon: Workflow,
    color: '#0369A1',
    estado: 'PROXIMAMENTE',
    funciones: [{ label: 'Procesos' }, { label: 'Actividades' }, { label: 'Seguimiento por sede' }],
  },
  {
    key: 'servicio',
    nombre: 'Servicio al Cliente',
    descripcion: 'Solicitudes, peticiones, quejas y seguimiento de la atención.',
    icon: Headset,
    color: '#BE185D',
    estado: 'PROXIMAMENTE',
    funciones: [{ label: 'Solicitudes' }, { label: 'PQRS' }, { label: 'Seguimiento' }],
  },
];

export const moduloPorKey = (key) => MODULOS.find(m => m.key === key) || null;

// Clave de menú de la pantalla informativa de un módulo (los módulos sin pantallas propias
// abren esta vista en lugar de una ruta inexistente).
export const menuDeModulo = (key) => `modulo_${key}`;
export const moduloDeMenu = (menu) => (typeof menu === 'string' && menu.startsWith('modulo_') ? menu.slice(7) : null);

// PERMISOS POR MÓDULO — estructura preparada, todavía sin configuración en el servidor.
// Si en el futuro el usuario trae `modulos: ['biomedica', 'calidad', ...]` desde la API
// (asignados en Administración), ese listado manda. Mientras no exista, se aplican los
// accesos actuales por rol: SUPER_ADMIN ve todo y el resto todos los módulos salvo los
// marcados `soloSuperAdmin`.
// Esto solo decide qué muestra la interfaz: la autorización real sigue estando en cada
// endpoint de la API (requireAuth / requireSuperAdmin y el aislamiento por empresa).
export function modulosPermitidos(user) {
  if (Array.isArray(user?.modulos)) return new Set(user.modulos);
  if (user?.role === 'SUPER_ADMIN') return new Set(MODULOS.map(m => m.key));
  return new Set(MODULOS.filter(m => !m.soloSuperAdmin).map(m => m.key));
}
