// src/services/adminApi.js
// Interfaz del módulo de administración multiempresa. Toda la autorización y validación
// real vive en api/admin.js (requireSuperAdmin + validaciones de lib/empresas.js y
// lib/usuarios.js); aquí solo se muestran los mensajes que devuelve el servidor.
import { apiFetch } from './apiFetch.js';

const MENSAJE_HTTP = {
  401: 'Tu sesión expiró. Inicia sesión de nuevo.',
  403: 'No tienes permiso para realizar esta operación.',
  404: 'El registro ya no existe.',
  409: 'El registro entra en conflicto con uno existente.',
  422: 'Revisa los datos del formulario.',
  500: 'Error inesperado del servidor. Intenta de nuevo.',
};

// Llamada a la API de administración. Devuelve el JSON o lanza un Error con el mensaje del
// servidor y, si viene, el detalle por campo (err.details) para mostrarlo en el formulario.
export async function adminApi(resource, { method = 'GET', id, body, query = {} } = {}) {
  const params = new URLSearchParams({ resource, ...(id ? { id } : {}), ...query });
  const res = await apiFetch(`/api/admin?${params.toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || MENSAJE_HTTP[res.status] || 'No se pudo completar la operación.');
    err.status = res.status;
    err.details = data.details || null;
    throw err;
  }
  return data;
}
