// lib/personal.js
// Almacenamiento de las hojas de vida del personal: UN registro por clave, igual que
// lib/equipos.js — ver ese archivo para el porqué (límite de 10 MB por escritura de
// Upstash/Vercel KV). La migración 005_personal_por_clave (lib/migrations.js) copia los
// datos del formato anterior (arreglo bajo `cmms:personal`) a este, sin tocar la clave vieja.

import { kv } from './db.js';

export const PERSONAL_IDS_KEY = 'cmms:personal:ids';
export const personalItemKey = (id) => `cmms:personal:item:${id}`;

export async function listPersonal() {
  const ids = await kv.smembers(PERSONAL_IDS_KEY);
  if (!ids.length) return [];
  const valores = await kv.mget(...ids.map(personalItemKey));
  return valores.filter(Boolean);
}

export async function getPersonal(id) {
  return (await kv.get(personalItemKey(id))) || null;
}

export async function setPersonal(record) {
  await kv.set(personalItemKey(record.id), record);
  await kv.sadd(PERSONAL_IDS_KEY, record.id);
}
