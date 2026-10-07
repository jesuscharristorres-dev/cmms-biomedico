import { getCollection, type CollectionEntry } from 'astro:content';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIAS } from '../content.config';

export type Curso = CollectionEntry<'cursos'>['data'];
export { CATEGORIAS };

export async function cursosOrdenados(): Promise<Curso[]> {
  const todos = await getCollection('cursos');
  return todos.map((c) => c.data).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export const urlCurso = (c: Curso) => `/cursos/${c.categoria}/${c.equipo}/`;

// Láminas migradas en public/cursos/<categoria>/<equipo>/laminas/NN.webp
export function laminasMigradas(c: Curso): string[] {
  const dir = join(process.cwd(), 'public', 'cursos', c.categoria, c.equipo, 'laminas');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.webp'))
    .sort()
    .map((f) => `/cursos/${c.categoria}/${c.equipo}/laminas/${f}`);
}

export function pdfDisponible(c: Curso): boolean {
  return !!c.pdf && existsSync(join(process.cwd(), 'public', c.pdf));
}

export const fechaCorta = (d: Date) =>
  d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
