// lib/personal.js
// Almacenamiento de las hojas de vida del personal: UN registro por clave, igual que
// lib/equipos.js — ver lib/coleccion-por-clave.js para el porqué y el detalle de cómo se lee
// en lotes (incidente 2026-11-09). La migración 005_personal_por_clave (lib/migrations.js)
// copia los datos del formato anterior (arreglo bajo `cmms:personal`) a este, sin tocar la
// clave vieja.

import { crearColeccionPorClave } from './coleccion-por-clave.js';

const coleccion = crearColeccionPorClave('personal');

export const PERSONAL_IDS_KEY = coleccion.idsKey;
export const personalItemKey = coleccion.itemKey;

export const listPersonal = coleccion.list;
export const getPersonal = coleccion.get;
export const setPersonal = coleccion.set;
