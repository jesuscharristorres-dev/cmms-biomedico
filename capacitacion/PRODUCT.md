# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro (sitio estático) + CSS propio con tokens, JavaScript mínimo, publicado en Vercel. Evaluaciones en Google Forms en la fase 1; formularios propios con Supabase en la fase 2.

## Users

Personal asistencial de una IPS en Colombia: enfermería, médicos, auxiliares y laboratorio. Leen en turnos, con poco tiempo y muchas veces desde el celular. Su tarea más frecuente es encontrar un curso puntual de un equipo y completarlo.

Audiencia secundaria: Ingeniería biomédica y Calidad, que mantienen los cursos y necesitan medir cobertura y vigencia.

## Product Purpose

Plataforma de capacitación en el uso seguro de la tecnología biomédica. Reemplaza el sitio de WordPress (formacionbiomedica.wordpress.com) y agrega lo que faltaba: pre test, progreso por curso, certificado verificable y, en la fase 2, tablero de cobertura. Éxito: pasar de "vi el material" a "aprendí y quedó registrado".

## Positioning

Cada curso es la ficha de un equipo real de la institución, con control documental (código, versión, vigencia, responsable) igual al que Ingeniería biomédica aplica a los equipos. Una plantilla genérica de e-learning no tiene ese vínculo con el inventario.

## Operating Context

- Ruta fija por curso: identificación → pre test → material (láminas + PDF) → video → pos test (≥ 80 %, hasta 3 intentos) → certificado.
- Equipos agrupados en 5 categorías: Tecnovigilancia, Temperatura y humedad, Carro de paro, Limpieza y desinfección, Laboratorio.
- Red de las sedes y equipos modestos: la página de curso debe pesar menos de 1 MB en la primera carga.
- Calendario de próximas capacitaciones embebido.

## Capabilities and Constraints

- 19 cursos, 19 PDF, 296 láminas, 13 videos de YouTube, 19 formularios de pos test, manual de usuario y calendario.
- 6 cursos sin video (bomba de infusión, monitor, laringoscopio, desfibrilador, concentrador, básculas): la plantilla muestra el paso como "Video en producción", no lo oculta.
- Fase 1: progreso guardado en el navegador; certificado generado en el navegador con código de verificación.
- Códigos CB-xx-nn propuestos; pendientes de validación con Calidad.
- Terminología: "Pos test" (no "POST TEST"), "lámina", "placa".
- Abierto: dominio institucional, enlaces de pre test (por crear), objetivos específicos de varios cursos.

## Brand Commitments

Paleta, tipografía y concepto "la placa del equipo" fijados en el plan de creación (ver DESIGN.md). Nada de imágenes generadas por IA ni stock genérico: fotos reales de los equipos de la IPS o nada.

## Evidence on Hand

- Contenido del sitio actual (no accesible desde el entorno de construcción; se migra con `scripts/migrar.mjs`).
- Un enlace de pos test conocido: desfibrilador, `https://forms.gle/H3yJGNohnRppsUCZ7`.
- No existen aún: fotos de equipos, pre tests, logo en vector. No se deben inventar.

## Product Principles

1. Encontrar el curso en dos clics: el buscador es lo primero.
2. La ruta de aprendizaje es siempre la misma; la plantilla no cambia entre cursos.
3. Todo dato visible es verdadero y trazable (código, versión, fecha, responsable).
4. Agregar un curso es llenar una ficha, no diseñar una página.
5. Rápido y legible en el celular de un turno de noche.

## Accessibility & Inclusion

WCAG 2.2 AA: contraste AA en todo el texto, foco visible, sitio completo usable con teclado (incluido el visor de láminas), desde 360 px sin scroll horizontal, `prefers-reduced-motion` respetado. Aviso de tratamiento de datos personales (Ley 1581 de 2012) antes de pedir datos.
