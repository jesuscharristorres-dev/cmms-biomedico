// src/data/tecnovigilancia.js
import { FileText, BookOpen, ShieldAlert } from 'lucide-react';

// `porEmpresa: false` = un único documento/URL compartido por las 5 empresas (p. ej. un
// formato regulatorio de INVIMA, igual para todas); `porEmpresa: true` = cada empresa
// guarda su propia URL (p. ej. el manual interno, que puede variar por empresa).
export const TECNO_DOCS = [
  { key: 'invima', label: 'ABC-Tecnovigilancia-INVIMA', icon: FileText, porEmpresa: false },
  { key: 'manual', label: 'DLC-GEB-MN-01 — Manual de Tecnovigilancia', icon: BookOpen, porEmpresa: true },
];
// Acta de conformación de comités — un documento distinto por empresa, pero vive en la
// subsección "Comités de tecnovigilancia" (no en "Documentación" junto a TECNO_DOCS) por
// pedido explícito: temáticamente es del comité, no de la documentación general. Reutiliza
// el mismo mecanismo de URL-por-empresa (api/tecno-transversal.js) — ni el backend ni
// urlDeDoc() necesitan saber que este documento es "distinto" de los de TECNO_DOCS.
export const TECNO_ACTA_COMITE_DOC = { key: 'actaConformacionComites', label: 'Acta de conformación de comités', icon: FileText, porEmpresa: true };
// Seguimiento de alertas sanitarias — mismo caso que el acta de arriba: un documento por
// empresa que vive en "Comités de tecnovigilancia" en vez de "Documentación".
export const TECNO_SEGUIMIENTO_ALERTAS_DOC = { key: 'seguimientoAlertasSanitarias', label: 'Seguimiento de alertas sanitarias', icon: ShieldAlert, porEmpresa: true };

export const TECNO_TRIMESTRES = [
  { key: 't1', label: '1.er trimestre' },
  { key: 't2', label: '2.º trimestre' },
  { key: 't3', label: '3.er trimestre' },
  { key: 't4', label: '4.º trimestre' },
];

export const TECNO_COMITE_ESTADOS = ['Pendiente', 'Programado', 'Realizado'];

// Ciudades/departamentos habilitados para reportes de Tecnovigilancia, por empresa.
// Es una lista propia del módulo (no las sedes operativas de COMPANIES): un reporte
// regional cubre todas las sedes de esa zona, así que aquí solo van ciudades, sin
// duplicar ni mezclar entre empresas.
export const TECNO_CIUDADES = {
  MACROMED: ['Bogotá'],
  MEIDE: ['Armenia', 'Manizales', 'La Dorada', 'Bogotá'],
  'NP MEDICAL': ['Bogotá', 'Girardot'],
  DIAGNOSTIK: ['Bogotá', 'Villavicencio'],
  'AUNAR SALUD': ['Bogotá', 'Villavicencio', 'Neiva'],
};
