# Plataforma de Capacitación Biomédica

Sitio estático (Astro + CSS propio) que reemplaza a formacionbiomedica.wordpress.com. 19 cursos con ruta fija: pre test → material → video → pos test → certificado.

- Contexto de producto: [PRODUCT.md](PRODUCT.md)
- Sistema de diseño: [DESIGN.md](DESIGN.md)
- Revisión y criterios de aceptación: [migracion/REVISION.md](migracion/REVISION.md)

## Uso

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # genera dist/
npm run check     # pruebas de fichas y migración
```

## Agregar o editar un curso

Cada curso es un archivo en `src/content/cursos/` (por ejemplo `cb-cp-04-desfibrilador.yaml`). Llenar la ficha basta: la página, la placa del catálogo y la URL `/cursos/<categoria>/<equipo>/` se generan solas. El esquema está en `src/content.config.ts`.

Las láminas van en `public/cursos/<categoria>/<equipo>/laminas/01.webp, 02.webp…` y el PDF en `public/cursos/<categoria>/<equipo>/<equipo>.pdf`.

## Migrar el contenido de WordPress

Correr desde un equipo con acceso a internet y `pdftoppm` (poppler-utils):

```sh
npm run migrar                       # lee WordPress, descarga PDF, genera láminas y actualiza fichas
npm run migrar -- --pdfs ~/Descargas # alternativa: PDF descargados a mano (nombre = equipo)
npm run migrar -- --simular          # solo muestra lo que haría
```

El script escribe `migracion/reporte.md` con lo que encontró por curso y lo que falta. Después:

1. Copiar la URL del calendario que aparece en el reporte en `src/lib/sitio.ts` (`calendarioUrl`), y el correo del área en `correoArea`.
2. Crear los 19 formularios de pre test y pegar cada enlace en `pre_test` de su ficha.
3. Revisar los objetivos marcados como borrador en `pendientes`.

## Publicar en Vercel

Importar el repositorio en Vercel con **Root Directory = `capacitacion`**. El framework (Astro) y el comando de build se detectan desde `vercel.json`. Definir `SITE_URL` con el dominio final (por ejemplo `https://capacitacion.grupomacromedips.com.co`).

## Fase 2

`src/lib/progreso.ts` concentra el guardado del avance (hoy en `localStorage`). Para la fase 2 se reemplaza su implementación por Supabase sin tocar las páginas.
