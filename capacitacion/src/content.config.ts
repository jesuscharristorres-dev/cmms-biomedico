import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const CATEGORIAS = {
  'tecnovigilancia': 'Tecnovigilancia',
  'temperatura-y-humedad': 'Temperatura y humedad',
  'carro-de-paro': 'Carro de paro',
  'limpieza-y-desinfeccion': 'Limpieza y desinfección',
  'laboratorio': 'Laboratorio',
} as const;

const cursos = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/cursos' }),
  schema: z.object({
    codigo: z.string().regex(/^CB-[A-Z]{2}-\d{2}$/),
    titulo: z.string(),
    equipo: z.string().regex(/^[a-z0-9-]+$/),
    categoria: z.enum(Object.keys(CATEGORIAS) as [keyof typeof CATEGORIAS, ...(keyof typeof CATEGORIAS)[]]),
    servicios: z.array(z.string()).default([]),
    version: z.number().int().positive(),
    actualizado: z.coerce.date(),
    responsable: z.string(),
    objetivo: z.string(),
    laminas: z.number().int().nonnegative(),
    pdf: z.string().nullable(),
    // ID de YouTube. null: sin video o pendiente de migrar (ver video_existente).
    video: z.string().regex(/^[\w-]{11}$/).nullable(),
    // true cuando el sitio anterior ya tiene video y falta migrar su ID.
    video_existente: z.boolean().default(false),
    pre_test: z.string().url().nullable(),
    pos_test: z.string().url().nullable(),
    slug_anterior: z.string().nullable(),
    // Tareas de contenido abiertas. No se muestran al público; alimentan el reporte de migración.
    pendientes: z.array(z.string()).default([]),
  }),
});

export const collections = { cursos };
