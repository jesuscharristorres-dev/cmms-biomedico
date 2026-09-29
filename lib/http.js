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
};

export function sendError(res, status, message, details) {
  const body = { error: message || MENSAJES[status] || MENSAJES[500] };
  if (details) body.details = details;
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
      return sendError(res, 500, fallback);
    }
  };
}
