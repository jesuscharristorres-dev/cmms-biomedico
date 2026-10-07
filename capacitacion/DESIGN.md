# Design System: Capacitación Biomédica

Lectura (design-fusion): plataforma de capacitación para personal asistencial con poco tiempo, modo **Operate** (catálogo y curso) con la ayuda en modo **Read**; lenguaje institucional y técnico; diales **VARIANCE 4 · MOTION 3 · DENSITY 5**; CSS propio con tokens sobre Astro.

## 1. Concepto: la placa del equipo

Cada curso se presenta como la placa de identificación o la etiqueta de mantenimiento pegada en los equipos: datos estructurados en filas etiquetadas, borde fino de acero, código visible. Es el **movimiento firma** del sistema y solo vive en la placa de curso, en la cabecera del curso y en el certificado. Navegación, botones, filtros y formularios son controles web estándar.

## 2. Color

Tokens en OKLCH. Un acento (verde quirófano). El ámbar solo señala "pendiente / requiere atención" y nunca se usa como color de texto sobre fondo claro (para texto se usa `--senal-texto`).

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--tinta` (grafito) | `oklch(26% 0.025 251)` `#1B2530` | `oklch(92.9% 0.007 174)` | Texto principal y títulos |
| `--fondo` (blanco clínico) | `oklch(97.7% 0.002 165)` `#F6F8F7` | `oklch(21.3% 0.018 245)` | Fondo de página (frío, no crema) |
| `--superficie` | `oklch(100% 0 0)` | `oklch(25.1% 0.022 246)` | Placas y paneles |
| `--acento` (verde quirófano) | `oklch(48.1% 0.066 180)` `#2D6A5F` | `oklch(76.3% 0.075 178)` | Botones, enlaces, progreso |
| `--sobre-acento` | `#FFFFFF` | `oklch(21.3% 0.018 245)` | Texto sobre acento |
| `--acento-suave` (verde suave) | `oklch(92.5% 0.016 173)` `#DCEAE5` | `oklch(32.4% 0.036 179)` | Seleccionado, paso actual |
| `--senal` (ámbar señal) | `oklch(72.9% 0.145 78)` `#D99A1E` | `oklch(80% 0.135 83)` | Marca de pendiente (relleno, borde, icono) |
| `--senal-texto` | `oklch(50.8% 0.106 72)` | `oklch(80% 0.135 83)` | Texto de estado pendiente |
| `--acero` | `oklch(56% 0.022 246)` `#6A7681` | `oklch(45% 0.02 246)` | Bordes de placa |
| `--tinta-2` | `oklch(51.5% 0.023 246)` | `oklch(72.2% 0.022 244)` | Texto secundario (acero oscurecido para AA: 5.3:1) |
| `--error` | `oklch(51.8% 0.156 29)` | `oklch(74% 0.126 28)` | Pos test no aprobado, errores |

Contrastes verificados: tinta/fondo 14.5:1, acento/fondo 5.9:1, blanco/acento 6.3:1, tinta-2/fondo 5.3:1, tinta-2/acento-suave 4.5:1. El acero original (4.35:1) queda solo para bordes.

Tema: claro por defecto (escena: estaciones de enfermería iluminadas, celulares en turno); oscuro derivado por `prefers-color-scheme`. Nunca se invierten secciones.

## 3. Tipografía

- **Títulos:** Archivo variable, `font-stretch: 112%` (semiexpandida), peso 600. Recuerda el rotulado de placas técnicas.
- **Cuerpo, formularios, UI:** Atkinson Hyperlegible Next, 400/600.
- Escala 1.25 desde 1rem: 0.8 · 1 · 1.25 · 1.563 · 1.953 · 2.441rem. Display máximo 2.441rem.
- Medida de lectura ≤ 70ch. Tracking de títulos -0.01em.
- `tabular-nums` en códigos, versiones, láminas, puntajes y fechas.
- Fuentes autoalojadas (Fontsource), `font-display: swap`.

## 4. Forma y layout

- Alineación a la izquierda, retícula de 12 columnas, ancho máximo 1200 px, gutter 16 px en móvil.
- **Placas:** borde 1 px `--acero`, radio 4 px, **sin sombras**. Filas de datos separadas por hairline de 1 px.
- **Botones:** radio 6 px, altura mínima 44 px. Controles pequeños (chips de filtro) radio 6 px también: una sola escala (4 placas · 6 controles).
- Elevación: solo borde. Ninguna sombra en todo el sitio, salvo el modal (sombra suave teñida) por razones de separación de capa.
- Numeración solo en los 5 pasos del curso.

## 5. Componentes

| Componente | Estados |
|---|---|
| Placa de curso | pendiente, en progreso, completado, nuevo, actualizado |
| Buscador + filtros | sin resultados (con sugerencia), filtro activo, limpiar |
| Visor de láminas | cargando, sin láminas migradas, teclado (←/→, Inicio/Fin), gesto, pantalla completa |
| Video | fachada liviana que carga YouTube al hacer clic; "video en producción" |
| Riel de pasos | bloqueado, actual, completado; aviso de pos test no aprobado |
| Certificado | vista previa, imprimir/guardar PDF, código de verificación |

## 6. Movimiento

Curvas: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`. Todo < 300 ms; solo `transform` y `opacity`.

| Elemento | Qué hace | ms |
|---|---|---|
| Botones y placas | `scale(0.97)` al presionar | 140 |
| Filtros | Placas que salen se desvanecen | 200 |
| Visor | Fundido de lámina; con teclado sin animación | 160 |
| Paso completado | Indicador pasa a verde con marca | 220 |
| Modal de certificado | Desde `scale(0.96)` + opacidad, centrado | 240 |
| Carga del catálogo | Entrada escalonada, 40 ms entre placas | 280 |

Hover solo con `(hover: hover) and (pointer: fine)`. Con `prefers-reduced-motion` se eliminan escalas y desplazamientos; quedan fundidos breves.

## 7. Lista negra

Degradados morados, Inter, tarjetas idénticas con sombra gris, etiquetas en mayúsculas sobre cada título (eyebrows), palabra resaltada en el titular, imágenes generadas por IA o stock, flecha "→" en cada botón, em-dash en el texto visible, glow, emoji como iconos, `transition: all`, animaciones al hacer scroll, parallax, cursores personalizados.
