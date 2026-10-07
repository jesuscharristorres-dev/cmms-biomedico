# Revisión de diseño, movimiento y criterios de aceptación

Fecha: 7 oct 2026. Método: skill `design-fusion` (Emil Kowalski + Impeccable + taste-skill), en el orden del plan.

## Paso 4. Revisión de movimiento (formato emil-design-eng)

| Antes | Después | Por qué |
| --- | --- | --- |
| Visor: fundido de salida 160 ms + entrada 160 ms (320 ms en total) | Salida 60 ms + entrada 100 ms (160 ms en total) | El plan fija 160 ms para el cambio de lámina; 320 ms se siente lento en una acción repetida |
| Barra de carga del visor visible al instante | Aparece solo si la lámina tarda más de 150 ms (`transition-delay`) | Evita un parpadeo en cada cambio cuando la imagen ya está en caché |
| Marca de paso completado desde `scale(0.6)` | Desde `scale(0.85)` + opacidad | Nada aparece de la nada; el cambio de estado se lee igual y se siente más sobrio |
| Modal de certificado: entrada y salida a 240 ms | Entrada 240 ms, salida 160 ms | La salida debe ser más rápida que la entrada: el usuario ya decidió cerrar |
| Cambio de paso con teclado animado igual que con clic | Con teclado (`event.detail === 0`) el panel cambia sin animación | Las acciones de teclado nunca se animan |
| Paneles de paso: se mostraban todos y luego JS ocultaba (CLS 0.30) | Script en línea elige el panel antes de pintar; animación solo al navegar | Elimina el salto de layout (CLS 0.026) y la animación en la carga |
| `[hidden]` anulado por `display` de `.boton` y `.limpiar` | Regla global `[hidden] { display: none !important }` | Botón "x" vacío y "Continuar" sobrante aparecían sin motivo |

Verificado sin cambios: ninguna `transition: all`, ningún `ease-in`, ningún `scale(0)`; solo `transform` y `opacity` en movimiento; hover bajo `(hover: hover) and (pointer: fine)`; `:active` con `scale(0.97)` en botones, chips y placas; gesto del visor por velocidad (> 0.11 px/ms); `prefers-reduced-motion` elimina escalas y desplazamientos y conserva fundidos.

## Paso 5. Auditoría

**Detector de Impeccable** (`impeccable detect --json dist src`): 0 hallazgos críticos. Se corrigieron 3 tipos reales:

- Texto secundario del tema oscuro sobre papel blanco al imprimir el certificado (2.5:1). Ahora el tema oscuro solo aplica a `screen`.
- Salto de nivel de encabezado en el catálogo (h1 → h3). Se agregó un h2 "Cursos" para lectores de pantalla.
- Lista del índice de ayuda pegada al borde superior.

Quedan 2 avisos que no se corrigen, con motivo:

- `tight-leading` (1.24) en el inicio: corresponde a títulos de placa en Archivo, donde 1.15 es intencional para rótulos de una o dos líneas.
- `cramped-padding` en la tabla de Mi progreso: las celdas tienen 0.6 × 0.8 rem de relleno; el detector mide el contenedor, no las celdas.

**Lighthouse móvil** (Chromium, `astro preview`):

| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO | Peso | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| Inicio | 98 | 100 | 100 | 100 | 126 KB | 0.001 |
| Curso (desfibrilador) | 100 | 100 | 100 | 100 | 131 KB | 0.026 |
| Curso (centrífuga) | 100 | 100 | 100 | 100 | 131 KB | 0.005 |
| Mi progreso | 98 | 100 | 100 | 100 | 125 KB | 0.033 |

**Recorrido completo probado** (Playwright, 1366 px claro y 375 px oscuro): identificación con errores de validación → identificación válida → pre test → material (teclado Inicio/Fin) → video → pos test 6/10 (no aprobado, quedan 2 intentos) → pos test 9/10 → certificado → búsqueda sin resultados → Mi progreso. Sin errores de consola y sin scroll horizontal en ninguna página.

## Criterios de aceptación del plan

| Criterio | Estado |
| --- | --- |
| 19 cursos con láminas, PDF, video y evaluación | **Parcial**: las 19 fichas y páginas existen; láminas, PDF, IDs de video y 18 enlaces de pos test esperan `npm run migrar` (WordPress no es accesible desde el entorno de construcción) |
| Código, versión, fecha y objetivo propio por curso | Hecho; 14 objetivos son borradores para validar (marcados en `pendientes` de cada ficha) |
| Ortografía revisada y "Pos test" unificado | Hecho en el sitio nuevo; prueba automática contra "POST TEST" y guiones largos |
| Manual reescrito como ayuda; pie con enlaces reales | Hecho (ayuda, contacto, tratamiento de datos) |
| `impeccable detect` sin hallazgos críticos | Hecho |
| Contraste AA, foco visible | Hecho (Lighthouse accesibilidad 100) |
| Todo usable con teclado, incluido el visor | Hecho (flechas, Inicio, Fin; "/" enfoca el buscador) |
| Celular desde 360 px sin scroll horizontal | Hecho (probado a 375 px; el riel colapsa a barra superior) |
| `prefers-reduced-motion` | Hecho |
| Revisión de movimiento aprobada | Tabla de arriba, aplicada |
| Lighthouse ≥ 90 móvil | Hecho (98-100) |
| Página de curso < 1 MB | Hecho (131 KB sin láminas; el visor carga solo la lámina actual y la siguiente, así que el peso por lámina se suma de a una) |
| Pre y pos test en los 19 cursos | **Pendiente**: crear los 19 pre test; migrar 18 enlaces de pos test |
| Prueba completa de un usuario | Hecho con el desfibrilador (único pos test conocido) |
| Aviso Ley 1581 antes de pedir datos | Hecho; texto base pendiente de revisión jurídica |
