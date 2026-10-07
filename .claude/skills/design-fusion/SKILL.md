---
name: design-fusion
description: Skill de diseño unificada que fusiona tres escuelas en un solo flujo de decisión. Emil Kowalski (design engineering, motion, pulido invisible), Impeccable (modos de superficie, comandos de crítica/auditoría/pulido, craft floor) y taste-skill de leonxlnx (lectura del brief, tres diales, anti-slop, pre-flight). Úsala para diseñar, rediseñar, criticar, auditar, pulir o animar cualquier interfaz frontend (dashboards, landing pages, componentes, formularios, estados vacíos) cuando quieras un único criterio en vez de reglas contradictorias. Resuelve los conflictos entre las fuentes y deriva a la skill original cuando hace falta profundidad.
---

# Design Fusion

Tres escuelas, un solo criterio:

| Fuente | Qué aporta | Skills originales (profundidad) |
|---|---|---|
| **Emil Kowalski** | Por qué y cómo se mueve algo; pulido invisible; componentes que se sienten bien | `emil-design-eng`, `animate`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `apple-design`, `mobile-native`, `break-ui`, `animation-vocabulary`, `ask-sonner` |
| **Impeccable** | Modo de la superficie, contexto de producto (PRODUCT.md / DESIGN.md), comandos de evaluación y refinamiento, craft floor | `impeccable` (+ `reference/*.md`) |
| **leonxlnx / taste-skill** | Lectura del brief, diales, sistema de diseño honesto, catálogo de AI tells, pre-flight | `design-taste-frontend`, `redesign-existing-projects`, `high-end-visual-design`, `minimalist-ui`, `industrial-brutalist-ui`, `stitch-design-taste`, `gpt-taste`, `full-output-enforcement`, `imagegen-frontend-*`, `image-to-code`, `brandkit` |

Esta skill es el **orquestador y árbitro**. Cuando una tarea necesita detalle que aquí solo se resume, carga la skill original indicada en la tabla de derivación (sección 9). Si una regla de la skill original contradice una regla de **Resolución de conflictos** (sección 2), gana esta skill.

---

## 0. Orden de precedencia

1. **El brief del usuario.** Estética, fuentes, paleta o era fijadas explícitamente ganan siempre, aunque choquen con un ban de abajo. Redirigir un brief claro hacia tu gusto es fallar.
2. **La verdad del proyecto.** PRODUCT.md, DESIGN.md, tokens existentes, sistema de diseño ya instalado, dependencias de `package.json`.
3. **Accesibilidad y rendimiento.** Contraste AA, foco visible, `prefers-reduced-motion`, solo `transform`/`opacity` en animaciones frecuentes.
4. **Esta skill** (resolución de conflictos + reglas fusionadas).
5. **Las skills originales**, para el detalle.
6. Tu costumbre. Nunca es un argumento.

---

## 1. Flujo de trabajo (siempre en este orden)

### Paso 1. Lectura del brief (taste-skill)
Antes de tocar código, declara en una línea:

> **Lectura:** \<tipo de superficie\> para \<audiencia\>, en modo \<Persuade/Operate/Read/Experience\>, con lenguaje \<vibe\>, diales \<V/M/D\>, sobre \<sistema de diseño o estética\>.

Si el brief diverge de verdad, haz **una sola** pregunta. Si se puede inferir, no preguntes.

### Paso 2. Modo de superficie (Impeccable)
El modo lo decide la superficie, no el producto:

- **Persuade**: el visitante decide y actúa (landing, pricing, marketing).
- **Operate**: el usuario completa una tarea (app, dashboard, admin, formularios, tablas). Escaneabilidad, consistencia y expectativas nativas por encima de expresión. La marca vive en los detalles precisos.
- **Read**: el usuario entiende algo (docs, ayuda, changelog).
- **Experience**: el visitante está dentro de la obra (portfolio, galería).

### Paso 3. Diales (taste-skill, recalibrados por modo)
`DESIGN_VARIANCE` (1 simetría · 10 caos), `MOTION_INTENSITY` (1 estático · 10 cinemático), `VISUAL_DENSITY` (1 galería · 10 cockpit).

| Modo / señal | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| Operate (dashboard, CMMS, admin) | 2-4 | 2-3 | 6-8 |
| Operate regulado / clínico / sector público | 2-3 | 2 | 5-7 |
| Read | 3-5 | 2-4 | 3-4 |
| Persuade SaaS | 6-8 | 5-7 | 3-5 |
| Persuade premium consumer | 7-8 | 5-7 | 3-4 |
| Experience / agencia | 8-10 | 7-9 | 2-4 |
| Rediseño, preservar | igual al existente | +1 | igual |
| Rediseño, renovar | +2 | +2 | igual |

Los diales gobiernan todo lo demás: cuánto rompe la retícula, cuánto se anima, cuánta información por pantalla.

### Paso 4. Fundación
- Si el brief es un sistema real (Fluent, Carbon, Material, Polaris, Primer, GOV.UK, Radix, shadcn), instala el paquete **oficial**; no recrees su CSS. Un sistema por proyecto.
- Si el proyecto ya tiene stack, **respétalo**: verifica `package.json` antes de importar nada y muestra el comando de instalación si falta.
- **Una familia de iconos por proyecto.** Si el proyecto ya usa una (p. ej. `lucide-react`), se queda; no mezcles. En proyectos nuevos prefiere Phosphor / Tabler / Radix. Nunca dibujes paths de iconos a mano; nunca emoji o glifos Unicode como sistema de iconos.

### Paso 5. Contexto e incumbente (Impeccable)
Lee PRODUCT.md / DESIGN.md si existen e inspecciona la interfaz actual antes de editar.
- **Refinar preserva**: identidad, comportamiento, copy, IA y todo lo fuera del alcance.
- **Rediseñar reemplaza** el look, pero conserva verdad de producto, contenido, función, rutas, nombres de campos, eventos de analítica, textos legales. Nunca a medias: no pulas un look que ibas a descartar.
- Nunca cambies en silencio: URLs, etiquetas de navegación principal, nombres/orden de campos de formulario, logo, copy legal.

### Paso 6. Construir con el Craft Floor (sección 3) y Motion (sección 4)

### Paso 7. Verificación acotada (Impeccable)
Construye completo, inspecciona **una** ronda en lote (desktop + móvil, claro + oscuro), corrige todo en un lote, confirma con **una** ronda más como máximo y para. Luego ejecuta el Pre-flight (sección 7).

---

## 2. Resolución de conflictos entre fuentes

| Tema | Emil | Impeccable | leonxlnx | **Regla fusionada** |
|---|---|---|---|---|
| Eyebrows (etiqueta mayúscula sobre el título) | — | Prohibido siempre | Máx. 1 cada 3 secciones (`high-end` los exige) | **Prohibidos por defecto.** Solo si el brief los pide literalmente. El título se sostiene solo. |
| Duración de animación | UI < 300 ms; nada en acciones de teclado | Un único momento autoral | `high-end`: entradas 800 ms+, todo anima al entrar | **Operate/Read: regla de Emil.** Persuade/Experience: un solo momento de entrada largo (≤ 900 ms) por página; el resto de la UI sigue < 300 ms. Nunca la misma entrada en todas las secciones. |
| Tarjetas | Escalar desde el trigger | Las tarjetas son el contenedor perezoso; anidadas, siempre mal | `high-end`: "Double-Bezel" anidado en todo | **Tarjeta solo si la elevación comunica jerarquía real.** Double-Bezel solo como pieza protagonista en Persuade/Experience, nunca en Operate. Agrupa con espacio, `divide-y` o `border-t`. |
| Elevación | — | Declararla una vez: borde **o** sombra | Sombras teñidas del fondo | Borde **o** sombra, no ambos. Sombra con offset + blur suave, teñida del hue del fondo, nunca negro puro. |
| Radios | Pulsadores `scale(0.97)` | Tarjetas 12-16 px; pills para controles pequeños | Un sistema de radios por página | **Una escala documentada** (p. ej. inputs 8, tarjetas 12-16, botones pill o 8) y se cumple en todas partes. |
| Fuente Inter | — | Fuente propia autoalojada, nunca la del sistema como display | Desaconsejada por defecto; OK en neutral/accesible | **Persuade/Experience:** evita Inter (Geist, Satoshi, Outfit…). **Operate/Read:** Inter / fuente del sistema de diseño es aceptable si se justifica por legibilidad de datos. Nunca Fraunces/Instrument Serif por reflejo; serif solo con razón editorial articulada. |
| Easing | Curvas propias; nunca `ease-in` en UI | Ease-out exponencial | `high-end` prohíbe `ease-in-out` | **Entrar/salir: ease-out fuerte. Moverse en pantalla: ease-in-out fuerte. Hover/color: ease. Constante: linear.** `ease-in` prohibido en UI. |
| Glass / blur | Blur < 20 px para disimular crossfades | Glass como decoración, no | Solo en elementos fixed/sticky | Blur como efecto con propósito, solo en capas fijas, con fallback para `prefers-reduced-transparency`. |
| Animar todo al hacer scroll | — | No una entrada idéntica por sección | `high-end`: ningún elemento estático | **No.** Reveal solo donde la secuencia aporta significado. En Operate, el contenido aparece ya visible. |
| Claro / oscuro | — | Elegir por la escena de uso (quién, dónde, qué luz) | Diseñar ambos; un tema por página | Elegir el tema por defecto por escena de uso; tokens para ambos; nunca invertir secciones a mitad de página. |
| Formato de revisión | Tabla Before / After / Why | Puntuación heurística (`critique`) | Checklist pre-flight | Hallazgos en **tabla Before / After / Why**; críticas completas añaden la puntuación de `impeccable critique`; cierre con pre-flight. |

---

## 3. Craft Floor fusionado (construir sin anunciarlo)

### Tipografía
- Medida de cuerpo 65-75ch. Display máx. 6rem. Tracking nunca por debajo de -0.04em (mejor -0.02 a -0.03em).
- Jerarquía con peso y color, no con tamaño que grita. Más espacio encima de un título que debajo.
- Números en tablas y métricas: `font-variant-numeric: tabular-nums`.
- Cursiva con descendentes (`y g j p q`) en display: `leading` ≥ 1.1 y reserva inferior.
- Énfasis dentro de un titular: cursiva o negrita de la **misma** familia.

### Color
- Neutros de una sola temperatura + **un** acento, saturación < 80 %, bloqueado en toda la superficie.
- Nada de morado/azul con glow de IA por defecto, gradiente en texto, `#000` puro ni neón.
- Colores semánticos (ok / aviso / error / crítico) separados del acento de marca y siempre acompañados de texto o icono (nunca solo color).
- Contraste: cuerpo y placeholder ≥ 4.5:1, texto grande ≥ 3:1. Sobre superficies de color, el texto secundario se tiñe de ese hue, no gris.

### Layout
- CSS Grid antes que matemáticas de flex. `min-h-[100dvh]`, nunca `h-screen`.
- Cada layout multi-columna declara su colapso `< 768px` en el mismo componente.
- Navegación en una línea en desktop, altura ≤ 80 px.
- Prohibido como estructura por defecto: tres tarjetas iguales icono+título+texto, plantilla hero-métrica (número grande + label + stats), split-header (título grande izquierda + párrafo flotante derecha), zigzag de 3+ secciones seguidas, numeración de secciones `01 / 02`.
- Persuade: hero cabe en el viewport (titular ≤ 2 líneas, subtítulo ≤ 20 palabras, CTA visible), `pt` ≤ 6rem, máx. 4 elementos de texto, ningún layout repetido entre secciones, logo-wall debajo del hero.
- Operate: densidad alta pero respirable; tablas con cabecera fija, alineación numérica a la derecha, filtros visibles, acciones primarias predecibles en la misma posición en todas las vistas.

### Estados (siempre el ciclo completo)
Hover, `:active`, foco de teclado visible, disabled, loading (skeleton con la forma final, no spinner genérico), vacío (explica cómo poblarlo), error (inline en formularios, nombra el problema y la recuperación), éxito. Usa `break-ui` para estresar con datos extremos.

### Formularios
Label **encima** del input, helper debajo, error debajo. Nunca placeholder como label. Contraste AA en placeholders, bordes, foco y errores.

### Superficies del navegador (lo que los modelos olvidan)
Tematiza desde la paleta: `::selection`, `caret-color`, scrollbars, anillos de foco, `text-underline-offset`, numerales tabulares.

### Copy
- El lenguaje del producto. Los controles nombran su acción ("Guardar orden", no "Enviar"). Una etiqueta por intención en toda la página.
- CTA en una sola línea en desktop.
- Cero em-dash (`—`) y en-dash (`–`) en texto visible de la UI; usa punto, coma, dos puntos o guion `-`.
- Nada de verbos de relleno (elevar, potenciar, sin fisuras, revolucionar), nombres genéricos (John Doe, Acme), números falsamente precisos sin fuente (marca `ejemplo` si son mock), ni copy "poético" de IA. Copy aburrido > copy ingenioso roto.

### Rechazos de superficie
Kicker/eyebrow, gradient text, `border-left` de color > 1 px en tarjetas/alertas, sombras duras offset fuera de un mundo neobrutalista, puntos de color decorativos sin estado real, monospace como disfraz "técnico", fake screenshots hechos con `<div>`, píldoras sobre imágenes, ilustraciones SVG tipo boceto, fondos de rayas o retícula sin un mundo que los justifique, cursores personalizados, scroll cues, strips de ciudad/hora/clima.

---

## 4. Motion (Emil gobierna; diales de taste-skill limitan)

### Árbol de decisión (en orden)
1. **¿Debe animarse?** Frecuencia de uso:
   - 100+ veces/día o iniciado por teclado (atajos, command palette, navegación de lista): **nunca**.
   - Decenas/día (hover, filas): eliminar o reducir al mínimo.
   - Ocasional (modales, drawers, toasts, popovers): estándar.
   - Raro (onboarding, celebración, primer uso): se permite deleite.
2. **¿Para qué?** Consistencia espacial, indicar estado, explicar, feedback, evitar saltos bruscos. "Se ve bonito" + uso frecuente = no.
3. **Easing** (tokens recomendados):
   ```css
   --ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* entrar / salir */
   --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* mover en pantalla */
   --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* sheets, drawers */
   ```
4. **Duración:** press 100-160 ms · tooltip 125-200 ms · dropdown 150-250 ms · modal/drawer 200-500 ms. UI < 300 ms. Salida más rápida que entrada.

### Reglas de componente
- Pulsables: `:active { transform: scale(0.97) }` con `transition: transform 160ms var(--ease-out)`.
- Nunca entrar desde `scale(0)`: desde `scale(0.95)` + `opacity: 0`.
- Popovers con `transform-origin` en su trigger; los modales se quedan centrados.
- Tooltips: delay en el primero, instantáneos (sin animación) en los siguientes.
- Transiciones CSS (interrumpibles) para UI dinámica; keyframes solo para lo predeterminado. Springs para gestos y drag (bounce 0.1-0.3).
- `@starting-style` para entradas sin JS.
- Stagger 30-80 ms entre ítems, nunca bloquea interacción.
- Drag: velocidad > ~0.11 descarta aunque no pase el umbral; fricción en los bordes; pointer capture; ignorar multi-touch.
- Nunca `transition: all`; especifica propiedades.

### Rendimiento
- Animaciones frecuentes: solo `transform` y `opacity`. Blur, clip-path, mask y backdrop-filter se permiten en momentos puntuales si se mantienen a 60 fps.
- No actualices variables CSS heredables en contenedores con muchos hijos durante un gesto; escribe `transform` en el elemento.
- Motion: usa `transform: "translateX()"` en vez de `x`/`y` cuando hay carga en el hilo principal. CSS/WAAPI ganan bajo carga.
- Prohibido `window.addEventListener('scroll')` y `useState` para valores continuos; usa IntersectionObserver, scroll-driven animations, `useScroll`/`useMotionValue`.

### Accesibilidad de motion
- `prefers-reduced-motion`: menos y más suave, no cero. Conserva fades de opacidad/color que ayudan a entender; elimina desplazamientos, parallax, loops.
- Hover animado solo bajo `@media (hover: hover) and (pointer: fine)`.

---

## 5. Comandos (vocabulario de Impeccable, ejecutados con este criterio)

| Comando | Qué hace | Carga además |
|---|---|---|
| `shape` | Planificar UX/UI antes de codificar | `impeccable/reference/shape.md` |
| `critique` | Revisión UX con puntuación heurística | `impeccable/reference/critique.md` |
| `audit` | Calidad técnica: a11y, perf, responsive | `impeccable/reference/audit.md` |
| `polish` | Pasada final antes de entregar | `impeccable/reference/polish.md` + `emil-design-eng` |
| `harden` | Errores, i18n, edge cases | `impeccable/reference/harden.md` + `break-ui` |
| `distill` / `quieter` / `bolder` | Quitar / calmar / amplificar | referencia homónima de impeccable |
| `typeset` / `layout` / `colorize` | Tipografía / ritmo / color | referencia homónima |
| `animate` | Motion con propósito | skill `animate` (Emil) + sección 4 |
| `clarify` | Copy, labels, errores | `impeccable/reference/clarify.md` |
| `adapt` | Breakpoints y dispositivos | `impeccable/reference/adapt.md` + `mobile-native` |
| `optimize` | Rendimiento de UI | `impeccable/reference/optimize.md` |
| `redesign` | Auditar y modernizar existente | `redesign-existing-projects` + `design-taste-frontend` §11 |
| `extract` / `document` | Tokens y DESIGN.md | `impeccable/reference/extract.md` / `document.md` (o `stitch-design-taste`) |

Sin argumento: pregunta qué superficie y qué objetivo; no ejecutes nada por defecto.

### Palancas de rediseño (taste-skill, en orden, para cuando basta)
1. Tipografía · 2. Espaciado y ritmo · 3. Recalibrar color · 4. Capa de motion · 5. Recomponer secciones clave · 6. Reemplazar bloques irrecuperables.

---

## 6. Formato de salida en revisiones

Siempre una tabla, una fila por hallazgo, ordenada por severidad:

| Antes | Después | Por qué |
| --- | --- | --- |
| `transition: all 300ms` | `transition: transform 200ms var(--ease-out)` | Propiedades explícitas; `all` anima cosas no deseadas |
| Eyebrow `UPPERCASE tracking-[0.2em]` sobre cada título | Eliminado | El título se sostiene solo; es un AI tell |
| Placeholder como label | `<label>` encima del input | Desaparece al escribir; falla accesibilidad |

Nunca uses listas "Antes: / Después:" en líneas separadas.

---

## 7. Pre-flight fusionado (todas las casillas o no está terminado)

**Decisión**
- [ ] Lectura del brief declarada (modo, audiencia, diales, fundación).
- [ ] Refinar vs. rediseñar decidido; nada fuera de alcance cambiado en silencio.
- [ ] Un sistema de diseño, una familia de iconos, dependencias verificadas.

**Visual**
- [ ] Un acento bloqueado; neutros de una temperatura; colores semánticos con texto/icono.
- [ ] Una escala de radios; elevación declarada una vez (borde o sombra).
- [ ] Un tema por superficie; tokens claro/oscuro probados en ambos.
- [ ] Sin eyebrows, gradient text, glow, tres tarjetas iguales, split-header, numeración decorativa, puntos decorativos, fake screenshots.
- [ ] Tipografía: medida 65-75ch, tracking ≥ -0.04em, tabular-nums en datos.

**Interacción**
- [ ] Estados completos: hover, active, focus-visible, disabled, loading (skeleton), vacío, error, éxito.
- [ ] Contraste AA en texto, botones, placeholders, foco y errores.
- [ ] CTAs en una línea; una etiqueta por intención.
- [ ] Superficies del navegador tematizadas (selection, caret, scrollbar, focus ring).

**Motion**
- [ ] Cada animación justificada en una frase; nada en acciones de teclado o de 100+ usos/día.
- [ ] Easing propio, ease-out para entrar/salir, nunca `ease-in`; UI < 300 ms; salida más rápida.
- [ ] Nada desde `scale(0)`; popovers con origin en el trigger; `:active` en pulsables.
- [ ] Solo transform/opacity en lo frecuente; sin scroll listeners; `prefers-reduced-motion` respetado; hover gated por `(hover: hover)`.

**Contenido y robustez**
- [ ] Copy releído entero: sin em-dash, sin verbos de relleno, sin números inventados, sin nombres genéricos.
- [ ] Probado con datos extremos (`break-ui`): textos largos, vacíos, conteos enormes, i18n.
- [ ] Responsive: colapso explícito < 768 px, `100dvh`, sin scroll horizontal.
- [ ] Core Web Vitals plausibles (LCP < 2.5 s, INP < 200 ms, CLS < 0.1).

---

## 8. Preset para este repositorio (CMMS biomédico)

Aplica salvo que el brief diga otra cosa:

- **Modo:** Operate (gestión de mantenimiento de equipos médicos). Pantallas de login/landing pública, si existen, son Persuade con diales contenidos.
- **Audiencia y escena:** ingenieros y técnicos biomédicos, jefes de servicio, en hospital; uso prolongado, a menudo en tablets o PCs compartidos. Confianza, legibilidad y velocidad por encima de expresión.
- **Diales:** VARIANCE 3 · MOTION 2 · DENSITY 7.
- **Stack existente:** React 19 + Vite, Tailwind v4 (`@tailwindcss/vite`), `lucide-react` (se mantiene como única familia de iconos), `recharts` (para gráficos, carga además `dataviz`).
- **Prioridades:** estados de equipo y órdenes de trabajo inequívocos (color semántico + texto + icono), tablas densas con `tabular-nums`, filtros y búsqueda siempre visibles, formularios con validación inline, fechas y vencimientos de mantenimiento preventivo legibles de un vistazo.
- **Motion:** feedback de pulsación, aparición de toasts/drawers/modales y transiciones de estado. Nada de reveals al hacer scroll ni animaciones en navegación por teclado.

---

## 9. Tabla de derivación (cuándo cargar la skill original)

| Necesitas… | Carga |
|---|---|
| Implementar una animación concreta | `animate` |
| Revisar motion existente con lupa | `review-animations` / `improve-animations` |
| Encontrar dónde falta motion | `find-animation-opportunities` |
| Gestos, springs, sheets, materiales tipo Apple | `apple-design` |
| Que la web se sienta nativa en móvil | `mobile-native` |
| Romper la UI con datos extremos | `break-ui` |
| Toasts con Sonner | `ask-sonner` |
| Nombrar un efecto de motion | `animation-vocabulary` |
| Crítica/auditoría/pulido con método completo | `impeccable` + su `reference/` |
| Landing/portfolio desde cero con máxima exigencia anti-slop | `design-taste-frontend` |
| Modernizar un proyecto existente | `redesign-existing-projects` |
| Estética concreta: lujo de agencia / minimal editorial / brutalismo industrial | `high-end-visual-design` / `minimalist-ui` / `industrial-brutalist-ui` (sujetas a la sección 2) |
| Generar DESIGN.md | `stitch-design-taste` o `impeccable document` |
| Referencias visuales generadas por imagen | `imagegen-frontend-web` / `imagegen-frontend-mobile` / `image-to-code` |
| Gráficos y dashboards de datos | `dataviz` |
| Código completo sin truncar | `full-output-enforcement` |

---

## 10. Filosofía compartida (lo que las tres escuelas dicen igual)

- **El gusto se entrena.** Estudia por qué algo se siente bien; no decores por reflejo.
- **Los detalles invisibles se acumulan.** Nadie nota un `transform-origin` correcto; todos notan la suma.
- **Defaults excelentes > opciones.** Lo que se entrega sin configurar debe ser bueno.
- **Cada decisión se justifica en una frase.** Si no puedes, es un default de modelo: reescríbelo.
- **Cuando dudes entre refinado y comprometido, comprométete**, dentro del modo y los diales.
- **Revisa al día siguiente / en cámara lenta.** Las imperfecciones aparecen con ojos frescos.
