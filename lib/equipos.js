// lib/equipos.js
// Almacenamiento del inventario de equipos: UN equipo por clave, en vez de un solo arreglo
// con todos los equipos bajo una sola clave (`cmms:equipos`, formato anterior a la migración
// 004_equipos_por_clave en lib/migrations.js). Ver lib/coleccion-por-clave.js para el porqué
// y para el detalle de cómo se lee en lotes (incidente 2026-11-09).
//
// La migración 004 copia (no mueve) los datos del formato anterior a este — `cmms:equipos`
// se deja intacto como respaldo histórico, igual que el resto de migraciones de este proyecto
// (ver lib/migrations.js): nunca se borra ni modifica un dato existente, solo se agregan claves.
// Todo el código nuevo lee y escribe exclusivamente por aquí, nunca contra `cmms:equipos`.

import { crearColeccionPorClave } from './coleccion-por-clave.js';

const coleccion = crearColeccionPorClave('equipos');

export const EQUIPOS_IDS_KEY = coleccion.idsKey;
export const equipoItemKey = coleccion.itemKey;

/** Todos los equipos (de todas las empresas) — el llamador aplica su propio recorte/filtro. */
export const listEquipos = coleccion.list;
export const getEquipo = coleccion.get;
export const setEquipo = coleccion.set;
export const deleteEquipo = coleccion.del;
