// src/rrhh/empresas.js
// Empresas del módulo Gestión Humana (demo). Son propias del módulo: en Biomédica las
// empresas vienen del servidor (Administración → Empresas) y sus equipos están asociados a
// ellas, así que esta lista no las modifica.
const empresa = (key, color, color2) => ({ key, nombre: key, color, gradient: `linear-gradient(135deg, ${color} 0%, ${color2} 100%)` });

export const EMPRESAS_RRHH = [
  empresa('MACROMED SAS', '#002485', '#1F4FB8'),
  empresa('MACROMED COOP', '#1D4ED8', '#3B82F6'),
  empresa('MEIDE', '#24546A', '#3B7088'),
  empresa('NP MEDICAL', '#3F8E6F', '#63B48F'),
  empresa('DIAGNOSTIK', '#C62828', '#E53935'),
  empresa('AUNAR SALUD', '#009EB7', '#33C4D8'),
  empresa('DISPOMED', '#7C3AED', '#A78BFA'),
];

// Empresa de la plataforma → empresa de Gestión Humana, para usuarios fijos en una empresa.
const EQUIVALENCIAS = { MACROMED: 'MACROMED SAS' };
export function empresaRRHHDeUsuario(empresaPlataforma) {
  if (!empresaPlataforma) return 'TODAS';
  const k = EQUIVALENCIAS[empresaPlataforma] || empresaPlataforma;
  return EMPRESAS_RRHH.some(e => e.key === k) ? k : 'TODAS';
}
export function nombreEmpresaRRHH(key) {
  return key === 'TODAS' ? 'Todas las empresas' : (EMPRESAS_RRHH.find(e => e.key === key)?.nombre || key);
}
