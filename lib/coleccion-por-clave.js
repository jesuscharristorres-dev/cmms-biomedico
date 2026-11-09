// lib/coleccion-por-clave.js
// Patrón compartido por equipos/personal/reportesFalla: un registro por clave de KV (índice
// `cmms:<coleccion>:ids` + un valor por registro en `cmms:<coleccion>:item:<id>`) en vez de un
// arreglo con TODOS los registros bajo una sola clave — ver lib/equipos.js (o la migración
// 004_equipos_por_clave en lib/migrations.js) para el porqué: ese arreglo único topaba el
// límite de 10 MB por ESCRITURA de Upstash/Vercel KV tarde o temprano.
//
// INCIDENTE 2026-11-09: ese cambio resolvió las escrituras, pero `list()` seguía pidiendo
// TODOS los registros de golpe con un solo MGET — y Upstash limita también cada RESPUESTA a
// 10 MB, así que el inventario completo volvió a toparse con el mismo límite, esta vez al
// LEER (GET /api/equipos devolviendo 500, el inventario desapareciendo de la vista). `list()`
// pide los registros en lotes moderados en vez de todos de una vez, para no volver a repetir
// este incidente en esta colección ni en las otras dos que comparten el mismo patrón.
//
// Centralizado aquí (en vez de repetido en los 3 archivos) para que un fix futuro de este tipo
// aplique a los tres a la vez, no uno por uno como pasó esta vez.

import { kv } from './db.js';

const TAMANO_LOTE = 50;      // registros por MGET — muy lejos del límite de 10 MB por respuesta
const LOTES_EN_PARALELO = 4; // mismo criterio que CAPACITACIONES_CONCURRENCIA en lib/capacitaciones.js

export function crearColeccionPorClave(nombreColeccion) {
  const idsKey = `cmms:${nombreColeccion}:ids`;
  const itemKey = (id) => `cmms:${nombreColeccion}:item:${id}`;

  async function list() {
    const ids = await kv.smembers(idsKey);
    if (!ids.length) return [];
    const lotes = [];
    for (let i = 0; i < ids.length; i += TAMANO_LOTE) lotes.push(ids.slice(i, i + TAMANO_LOTE));
    const resultados = [];
    for (let i = 0; i < lotes.length; i += LOTES_EN_PARALELO) {
      const grupo = lotes.slice(i, i + LOTES_EN_PARALELO);
      const valoresPorLote = await Promise.all(grupo.map(lote => kv.mget(...lote.map(itemKey))));
      for (const valores of valoresPorLote) resultados.push(...valores.filter(Boolean));
    }
    return resultados;
  }

  async function get(id) {
    return (await kv.get(itemKey(id))) || null;
  }

  async function set(registro) {
    await kv.set(itemKey(registro.id), registro);
    await kv.sadd(idsKey, registro.id);
  }

  async function del(id) {
    await kv.del(itemKey(id));
    await kv.srem(idsKey, id);
  }

  /** Borra varios a la vez (vaciar histórico, total o filtrado). */
  async function delMany(ids) {
    if (!ids.length) return;
    await kv.del(...ids.map(itemKey));
    await kv.srem(idsKey, ...ids);
  }

  return { idsKey, itemKey, list, get, set, del, delMany };
}
