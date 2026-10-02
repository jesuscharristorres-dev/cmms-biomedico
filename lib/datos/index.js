// lib/datos/index.js
// CAPA DE ACCESO A DATOS. Las rutas de api/ y los helpers de lib/ obtienen los datos de
// negocio SOLO a través de estos repositorios, nunca hablando directamente con Redis o con
// Supabase. Así se puede cambiar de base de datos con una variable de entorno:
//
//   DATA_BACKEND=redis     (por defecto) Vercel KV / Upstash Redis — lib/datos/redis.js
//   DATA_BACKEND=supabase  Supabase Postgres + Storage             — lib/datos/supabase.js
//
// Sesiones, límites de frecuencia e intentos de login siguen SIEMPRE en Redis (lib/auth.js):
// son datos pequeños y temporales con TTL, para lo que Redis es ideal.
//
// Repositorios (misma interfaz en ambos backends):
//   equipos, personal, reportesFalla  → marca, listar, listarResumen, obtener, crear,
//                                       actualizar, eliminar, eliminarPorEmpresa
//   planesProgramas, tecnoReportes, tecnoTransversal, limpiezaDesinfeccion,
//   limpiezaPlantillas, capacitaciones → marca, leer + su operación de escritura
//   empresas, usuarios                → marca, listar, guardarLista
//   alertEmails                       → leer

import { repos as redis } from './redis.js';
import { repos as supabase } from './supabase.js';

export function backend(env = process.env) {
  const b = (env.DATA_BACKEND || 'redis').trim().toLowerCase();
  if (b !== 'redis' && b !== 'supabase') throw new Error(`DATA_BACKEND no válido: "${b}" (usa redis o supabase).`);
  return b;
}

/** Repositorios del backend activo (se resuelve en cada acceso: los tests pueden cambiarlo). */
export const datos = new Proxy({}, {
  get(_, nombre) {
    const r = (backend() === 'supabase' ? supabase : redis)[nombre];
    if (!r) throw new Error(`[lib/datos] Repositorio desconocido: ${String(nombre)}`);
    return r;
  },
});
