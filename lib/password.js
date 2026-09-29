// lib/password.js
// Hash de contraseñas — scrypt con salt aleatorio, sin dependencias nuevas. Separado de
// lib/auth.js para que lib/usuarios.js pueda usarlo sin dependencias circulares.

import crypto from 'node:crypto';

/** Genera "salt:hash" en hex. Es el formato de `password_hash` y de AUTH_PASSWORD_HASH. */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Compara en tiempo constante — evita filtrar por timing cuánto del hash coincide. */
export function verifyPassword(password, stored) {
  if (typeof password !== 'string') return false;
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  let hashBuffer;
  let candidateBuffer;
  try {
    hashBuffer = Buffer.from(hash, 'hex');
    candidateBuffer = crypto.scryptSync(password, salt, 64);
  } catch {
    return false;
  }
  if (hashBuffer.length !== candidateBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, candidateBuffer);
}

// Hash "señuelo" para igualar el tiempo de respuesta cuando el usuario no existe — así un
// atacante no puede enumerar emails válidos midiendo cuánto tarda el login.
export const DUMMY_HASH = hashPassword('usuario-inexistente-no-usar', '00000000000000000000000000000000');
