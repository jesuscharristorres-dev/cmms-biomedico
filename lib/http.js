// lib/http.js
// Respuestas de error homogéneas para todos los endpoints. Los mensajes son genéricos a
// propósito: nunca revelan si un recurso de OTRA empresa existe, ni detalles internos
// (stack, claves de KV, etc.). El detalle real se registra solo en el log del servidor.

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const MENSAJES = {
  400: 'Solicitud inválida.',
  401: 'Se requiere haber iniciado sesión para esta operación.',
  403: 'No tienes permiso para acceder a este recurso.',
  404: 'El recurso solicitado no existe.',
  405: 'Método no permitido.',
  409: 'El recurso entra en conflicto con uno existente.',
  422: 'Los datos enviados no son válidos.',
  429: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.',
  500: 'Error inesperado del servidor.',
  503: 'El servicio de base de datos no está disponible en este momento.',
};

// Mensaje para el usuario cuando la base de datos (Vercel KV / Upstash Redis) rechaza los
// comandos porque la cuenta llegó al límite de su plan. No es un error del código ni de las
// credenciales: lo resuelve el administrador en la consola de Upstash (ampliar el plan o
// activar el auto-upgrade). No incluye datos sensibles.
export const MENSAJE_LIMITE_BASE_DATOS =
  'La base de datos de la plataforma alcanzó el límite de su plan y está rechazando operaciones. ' +
  'El administrador debe revisar la cuenta de Upstash (Vercel KV). Intenta de nuevo más tarde.';

/** true si el error viene de Upstash por haber superado los límites del plan de la base de datos. */
export function esLimiteBaseDatos(err) {
  const texto = String(err?.message || err || '');
  return /reached current Fixed plan limits|max requests limit exceeded|max daily request limit exceeded|max (?:monthly )?bandwidth limit exceeded|max data size exceeded/i.test(texto);
}

export function sendError(res, status, message, details) {
  const body = { error: message || MENSAJES[status] || MENSAJES[500] };
  if (details) body.details = details;
  // Un error nunca se guarda en caché (ni en el CDN de Vercel ni con el ETag de un GET previo).
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('ETag', '');
  return res.status(status).json(body);
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed);
  return sendError(res, 405);
}

/**
 * Envuelve un handler: cualquier HttpError lanzado dentro se convierte en su respuesta;
 * cualquier otro error se registra y responde 500 con `fallback` como mensaje.
 */
export function withErrors(nombre, fallback, handler) {
  return async function wrapped(req, res) {
    try {
      return await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
      console.error(`[${nombre}] Error:`, err);
      if (esLimiteBaseDatos(err)) return sendError(res, 503, MENSAJE_LIMITE_BASE_DATOS);
      return sendError(res, 500, fallback);
    }
  };
}
