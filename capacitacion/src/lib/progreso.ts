// Fase 1: el progreso vive en el navegador (localStorage). En la fase 2 se reemplaza por Supabase
// manteniendo esta misma interfaz.

export interface Perfil {
  nombre: string;
  documento: string;
  cargo: string;
  sede: string;
  servicio: string;
  aceptaDatos: true;
  fecha: string;
}

export interface ProgresoCurso {
  pre: boolean;
  material: boolean;
  video: boolean;
  intentos: number[]; // puntajes del pos test, 0-10
  aprobadoEn: string | null;
  certificado: string | null;
}

export type Estado = 'pendiente' | 'en-progreso' | 'completado';

const CLAVE_PERFIL = 'cb:perfil';
const clave = (codigo: string) => `cb:progreso:${codigo}`;

function leer<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function escribir(k: string, v: unknown): boolean {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export const leerPerfil = () => leer<Perfil>(CLAVE_PERFIL);
export const guardarPerfil = (p: Perfil) => escribir(CLAVE_PERFIL, p);

export function leerProgreso(codigo: string): ProgresoCurso {
  return {
    pre: false,
    material: false,
    video: false,
    intentos: [],
    aprobadoEn: null,
    certificado: null,
    ...(leer<Partial<ProgresoCurso>>(clave(codigo)) ?? {}),
  };
}

export function actualizarProgreso(codigo: string, cambios: Partial<ProgresoCurso>): ProgresoCurso {
  const nuevo = { ...leerProgreso(codigo), ...cambios };
  escribir(clave(codigo), nuevo);
  return nuevo;
}

export function estadoCurso(codigo: string): Estado {
  const p = leerProgreso(codigo);
  if (p.aprobadoEn) return 'completado';
  if (p.pre || p.material || p.video || p.intentos.length) return 'en-progreso';
  return 'pendiente';
}

export function borrarTodo() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('cb:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* almacenamiento bloqueado: no hay nada que borrar */
  }
}

// Código de control del certificado: CB-xx-nn-AAAAMMDD-XXXXXX (SHA-256 de curso + documento + fecha).
// Fase 1: Calidad lo coteja contra el registro de Google Forms. Fase 2: verificación en línea.
export async function codigoCertificado(codigo: string, documento: string, fecha: string): Promise<string> {
  const datos = new TextEncoder().encode(`${codigo}|${documento.trim()}|${fecha}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', datos));
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const sufijo = Array.from(hash.slice(0, 6), (b) => alfabeto[b % alfabeto.length]).join('');
  return `${codigo}-${fecha.replaceAll('-', '')}-${sufijo}`;
}
