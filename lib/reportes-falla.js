// lib/reportes-falla.js
// Almacenamiento de los reportes de falla: UN reporte por clave, igual que lib/equipos.js —
// ver lib/coleccion-por-clave.js para el porqué y el detalle de cómo se lee en lotes
// (incidente 2026-11-09). Este histórico crece sin límite (cada falla reportada queda ahí
// para siempre), así que es de los más propensos a toparse con ese límite si se siguiera
// guardando como un solo arreglo. La migración 006_reportes_falla_por_clave
// (lib/migrations.js) copia los datos del formato anterior (arreglo bajo `cmms:reportesFalla`)
// a este, sin tocar la clave vieja.

import { crearColeccionPorClave } from './coleccion-por-clave.js';

const coleccion = crearColeccionPorClave('reportesFalla');

export const REPORTES_FALLA_IDS_KEY = coleccion.idsKey;
export const reporteFallaItemKey = coleccion.itemKey;

export const listReportesFalla = coleccion.list;
export const getReporteFalla = coleccion.get;
export const setReporteFalla = coleccion.set;

/** Borra varios reportes a la vez (vaciar histórico, total o por empresa). */
export const deleteReportesFalla = coleccion.delMany;
