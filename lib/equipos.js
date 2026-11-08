// lib/equipos.js
// Almacenamiento del inventario de equipos: UN equipo por clave, en vez de un solo arreglo
// con todos los equipos bajo una sola clave (`cmms:equipos`, formato anterior a la migración
// 004_equipos_por_clave en lib/migrations.js).
//
// Por qué: Upstash/Vercel KV limita cada escritura a 10 MB. Guardar los ~cientos de equipos
// (con sus preventivos, correctivos, calibraciones y documentos anidados) como un solo arreglo
// significa que CUALQUIER alta o edición reescribe el arreglo COMPLETO — y ese arreglo termina
// topando el límite tarde o temprano (ya pasó en producción). Con una clave por equipo, cada
// escritura solo pesa lo que pesa ESE equipo, muy lejos del límite.
//
// La migración 004 copia (no mueve) los datos del formato anterior a este — `cmms:equipos`
// se deja intacto como respaldo histórico, igual que el resto de migraciones de este proyecto
// (ver lib/migrations.js): nunca se borra ni modifica un dato existente, solo se agregan claves.
// Todo el código nuevo lee y escribe exclusivamente por aquí, nunca contra `cmms:equipos`.

import { kv } from './db.js';

export const EQUIPOS_IDS_KEY = 'cmms:equipos:ids';
export const equipoItemKey = (id) => `cmms:equipos:item:${id}`;

/** Todos los equipos (de todas las empresas) — el llamador aplica su propio recorte/filtro. */
export async function listEquipos() {
  const ids = await kv.smembers(EQUIPOS_IDS_KEY);
  if (!ids.length) return [];
  const valores = await kv.mget(...ids.map(equipoItemKey));
  return valores.filter(Boolean);
}

export async function getEquipo(id) {
  return (await kv.get(equipoItemKey(id))) || null;
}

export async function setEquipo(equipo) {
  await kv.set(equipoItemKey(equipo.id), equipo);
  await kv.sadd(EQUIPOS_IDS_KEY, equipo.id);
}

export async function deleteEquipo(id) {
  await kv.del(equipoItemKey(id));
  await kv.srem(EQUIPOS_IDS_KEY, id);
}
