// lib/mantenimiento.js
// MODO SOLO LECTURA / MANTENIMIENTO, activable sin desplegar código: variable de entorno
// MODO_MANTENIMIENTO=1 en Vercel (y redeploy, que en Vercel aplica las variables nuevas).
// Mientras está activo:
//   - toda escritura (POST/PATCH/PUT/DELETE de datos, también el formulario público de
//     reporte de falla) responde 503 con un mensaje claro y no toca la base de datos;
//   - las lecturas y el inicio/cierre de sesión siguen funcionando;
//   - GET /api/login informa `mantenimiento` y la app muestra un aviso y se pone en solo lectura.
// Se usa durante la migración a Supabase (congelar escrituras mientras se respalda e importa).

import { HttpError } from './http.js';

const MENSAJE_POR_DEFECTO = 'La aplicación está en mantenimiento: por ahora solo se pueden consultar datos. '
  + 'Los cambios se habilitarán de nuevo en breve.';

export function modoMantenimiento(env = process.env) {
  return /^(1|true|si|sí|on)$/i.test(String(env.MODO_MANTENIMIENTO || '').trim());
}

export function mensajeMantenimiento(env = process.env) {
  return String(env.MENSAJE_MANTENIMIENTO || '').trim().slice(0, 300) || MENSAJE_POR_DEFECTO;
}

export function estadoMantenimiento() {
  return modoMantenimiento() ? { activo: true, mensaje: mensajeMantenimiento() } : { activo: false };
}

/** Lanza 503 si el modo mantenimiento está activo y la petición no es de solo lectura. */
export function bloquearEscrituraSiMantenimiento(req) {
  if (!modoMantenimiento()) return;
  if (req?.method === 'GET' || req?.method === 'HEAD') return;
  throw new HttpError(503, mensajeMantenimiento());
}
