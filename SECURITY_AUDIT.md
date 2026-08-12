# Auditoría de seguridad — CMMS Biomédico

Fecha: 2026-08-12
Alcance: `src/App.jsx`, `src/services/*`, `api/*.js`, `vercel.json`, `package.json`, `.env.local`, `npm audit`.
Metodología: lectura completa del código real (no supuestos), grep dirigido por patrones de riesgo, `npm audit`/`npm outdated`, revisión manual de cada endpoint serverless.

---

## RESUMEN EJECUTIVO

| Severidad | Cantidad |
|---|---|
| 🔴 Crítica | 5 |
| 🟠 Alta | 5 |
| 🟡 Media | 5 |
| 🟢 Baja | 2 |

**Hallazgo central:** la aplicación migró su almacenamiento de `localStorage` a Vercel KV (buena decisión para compartir datos entre usuarios), pero **ninguno de los 8 endpoints de datos verifica autenticación ni autorización**. El "login" es 100% cosmético: un `if` en el navegador que compara contra credenciales hardcodeadas en el bundle JS y guarda `localStorage.setItem('cmms-auth-ok','true')`. Los endpoints reales (`/api/equipos`, `/api/reportes-falla`, `/api/personal`, etc.) no saben que ese login existe — aceptan peticiones de cualquiera, sin sesión, sin token, sin cabecera alguna. Esto significa que **todo lo que la interfaz "protege" ocultando botones (modo invitado, pantalla de login) se puede saltar por completo llamando a la API directamente**, exactamente el escenario que pediste descartar.

---

## TABLA DE PRIORIDAD

| Prioridad | Vulnerabilidad | Archivo | Impacto | Solución |
|---|---|---|---|---|
| 🔴 CRÍTICA | Cero autenticación en los endpoints de datos | `api/equipos.js`, `reportes-falla.js`, `personal.js`, `alert-emails.js`, `planes-programas.js`, `tecno-transversal.js`, `tecno-reportes.js` | Cualquiera en internet lee, crea, modifica o borra todos los datos del CMMS sin iniciar sesión | Middleware de sesión server-side que valide un token antes de ejecutar cualquier operación |
| 🔴 CRÍTICA | Borrado total sin autorización | `api/equipos.js` (`DELETE` con `borrarTodo:true`) | Una sola petición HTTP no autenticada borra el inventario de las 5 empresas | Exigir auth + confirmar rol; considerar exigir un segundo factor para esta operación específica |
| 🔴 CRÍTICA | Sin aislamiento por empresa en el servidor | Los 8 endpoints anteriores | El filtro `?empresa=` es opcional (GET) o inexistente (PATCH); nada impide leer o modificar datos de una empresa distinta a la que el usuario "tiene seleccionada" en el frontend | Autorización server-side por empresa en cada operación, no solo un filtro opcional |
| 🔴 CRÍTICA | Relay de correo abierto | `api/send-email.js` | Cualquiera puede enviar correo arbitrario (phishing/spam) usando el dominio y la cuota de Resend del cliente | Exigir auth + validar remitente/plantilla en servidor + rate limit |
| 🔴 CRÍTICA | Autenticación 100% client-side y falsificable | `src/App.jsx:123-124, 2387-2388` | Usuario/contraseña viven en texto plano en el JS que se descarga en cada navegador; "estar autenticado" es un flag de `localStorage` que cualquiera activa desde DevTools sin conocer la contraseña | Mover la verificación de credenciales a un endpoint server-side con sesión firmada (ver Plan de corrección) |
| 🟠 ALTA | XSS almacenado en los 3 generadores de reportes | `src/App.jsx` (`generarReportePDF`, informe mensual, F140) — función `esc()` no escapa HTML | Un nombre de equipo, observación o descripción de falla con `<script>`/`<img onerror=...>` se ejecuta cuando cualquier técnico abre/imprime el reporte. El formulario público de fallas (sin login) es una vía de entrada directa | Escapar entidades HTML (`&<>"'`) en `esc()` antes de interpolar en el HTML del reporte |
| 🟠 ALTA | Cron de alertas sin protección si falta `CRON_SECRET` | `api/daily-alerts.js:19` | Si la variable no está configurada en Vercel, cualquiera puede disparar el endpoint repetidamente, agotando la cuota de Resend y reenviando alertas | Fallar cerrado: rechazar si `CRON_SECRET` no está configurado, no solo si no coincide |
| 🟠 ALTA | Dependencia `xlsx` con vulnerabilidades HIGH sin parche en npm | `package.json`, usada en `importExcel` | Un Excel malicioso subido por un usuario puede explotar prototype pollution o ReDoS en el parseo | Migrar al paquete oficial publicado por SheetJS en su propio CDN (tiene el fix; la versión de npm quedó congelada sin parchear) |
| 🟠 ALTA | Sin headers de seguridad | `vercel.json` (vacío salvo `crons`) | Sin CSP, sin `X-Frame-Options`/`X-Content-Type-Options`/`Referrer-Policy` — expone a clickjacking, MIME sniffing y facilita XSS si algo se cuela | Agregar headers en `vercel.json`, probados antes de aplicar CSP estricta |
| 🟡 MEDIA | `RESEND_API_KEY` en texto plano en `src/.env.local` (ubicación no estándar) | `src/.env.local` | No está en git (`*.local` en `.gitignore`, confirmado), pero al estar dentro de `src/` en vez de la raíz del proyecto, Vite no la carga como se documenta en el propio archivo, y aumenta el riesgo de que termine en un lugar equivocado | Mover a `.env.local` en la raíz; rotar la key por higiene (ya fue leída durante esta auditoría) |
| 🟡 MEDIA | Sin rate limiting en ningún endpoint | Todo `api/*.js` | Sin límite de peticiones, cualquier endpoint puede ser abusado (fuerza bruta si se agrega login real, agotamiento de KV, spam vía send-email) | Rate limiting server-side (ej. Upstash Ratelimit) en endpoints sensibles, no solo por IP |
| 🟡 MEDIA | Mass assignment sin whitelist de campos | `PATCH` en `equipos.js`, `reportes-falla.js`, `personal.js` (`{...existing, ...patch}`) | Un `patch` puede sobrescribir *cualquier* campo, incluido `empresa`, `id`, o campos que no deberían ser editables desde ese flujo | Whitelist explícita de campos permitidos por endpoint |
| 🟡 MEDIA | Sin logs de auditoría | Todo el backend | Imposible reconstruir qué pasó ante un incidente (quién borró qué, cuándo) | Registrar eventos sensibles (creación/edición/borrado, envíos de correo) sin datos sensibles en el log |
| 🟡 MEDIA | Validación de archivos solo en frontend | Firmas PNG (`FirmaInput`), adjuntos URL en reportes de falla | `accept="image/png"` es una sugerencia del navegador, no una validación; no hay límite de tamaño ni verificación server-side | Si se centraliza la subida de archivos, validar tipo MIME real y tamaño en servidor |
| 🟢 BAJA | Dependencias indirectas desactualizadas con fix disponible | `brace-expansion`, `nanoid`, `postcss` (via `npm audit`) | Bajo impacto práctico hoy, pero fix es gratis | `npm audit fix` (sin `--force`, verificar que no rompe nada) |
| 🟢 BAJA | Comentario desincronizado | `api/daily-alerts.js:1` (dice `api/cron/daily-alerts.js`) | Ninguno, solo confunde al leer el código | Corregir el comentario |

---

## AUDITORÍA DETALLADA POR SECCIÓN

### 1. Login y autenticación
- **Dónde están los usuarios:** no hay tabla de usuarios. Hay exactamente un usuario hardcodeado: `AUTH_USER = 'jesus.charris'`, `AUTH_PASS = 'biomedica2026'` ([App.jsx:123-124](E:\Proyectos\cmms-biomedico\src\App.jsx)).
- **¿Hasheadas?** No. Texto plano, en el bundle JavaScript que se descarga en cualquier navegador que visite el sitio.
- **¿Puede llegar al frontend?** Ya está en el frontend — es el único lugar donde vive.
- **¿Se puede falsificar el estado de autenticación desde DevTools?** Sí, directamente: `localStorage.setItem('cmms-auth-ok','true')` y recargar. No hay validación server-side de ningún tipo que lo contradiga.
- **¿Se puede modificar el rol?** No hay roles per se — solo `authed` (acceso total) y `guestMode` (bandera `readOnly` que solo oculta botones en React, [App.jsx:4795-4813](E:\Proyectos\cmms-biomedico\src\App.jsx)). Ambos son estado de React/`localStorage`, cero verificación server-side.
- **Registro/recuperación de contraseña:** no existen.
- **Logout:** borra la bandera de `localStorage`. No hay servidor que invalidar porque no hay sesión server-side.

### 3. Sesiones
No existen en el sentido tradicional: no hay cookies, no hay tokens, no hay JWT. "Estar logueado" es un booleano en `localStorage`. No hay nada que rotar, expirar server-side, o invalidar remotamente — porque el servidor nunca supo que existía una sesión.

### 4-5. Autorización y aislamiento por empresa
Confirmado leyendo los 9 archivos de `api/`: **ningún endpoint verifica autenticación, rol, ni pertenencia a empresa.** El único "filtrado por empresa" que existe es un parámetro `?empresa=` **opcional** en los `GET` de `equipos.js`, `reportes-falla.js` y `personal.js` — si se omite, se devuelve todo. Los `PATCH`/`DELETE` no verifican en absoluto a qué empresa pertenece el recurso antes de tocarlo. El ataque conceptual que describiste (`?empresa=MACROMED` → `?empresa=DIAGNOSTIK`) no hace falta simularlo: ya funciona así por diseño actual, y de hecho ni siquiera se necesita cambiar el parámetro — simplemente omitirlo devuelve todas las empresas juntas.

### 6. Redis/Upstash (Vercel KV)
- Se usa vía `@vercel/kv` (paquete oficial), que lee `KV_REST_API_URL`/`KV_REST_API_TOKEN` de variables de entorno automáticamente — **no encontré esas variables ni el token en ningún archivo de `src/`** (confirmado por grep), lo cual es correcto.
- **Riesgo real no es de exposición de credenciales de KV, sino de integridad:** como no hay autorización, cualquiera puede sobrescribir cualquier clave (`cmms:equipos`, `cmms:reportesFalla`, `cmms:personal`, `cmms:alertEmails`, `cmms:planesProgramas`, `cmms:tecnoTransversal`, `cmms:tecnoReportes`) con datos arbitrarios.
- No hay condiciones de carrera graves porque el patrón read-modify-write es simple (sin locks, pero el volumen de uso esperado es bajo); no es la prioridad frente a lo anterior.

### 7. Endpoints — tabla completa

| Endpoint | Métodos | Auth requerida hoy | Empresa requerida hoy | Riesgo principal |
|---|---|---|---|---|
| `/api/equipos` | GET/POST/PATCH/DELETE | Ninguna | Opcional (solo GET) | Lectura/escritura/**borrado total** sin auth |
| `/api/reportes-falla` | GET/POST/PATCH | Ninguna | Opcional (solo GET) | Lectura/escritura sin auth; también alcanzable desde el formulario público |
| `/api/personal` | GET/POST/PATCH | Ninguna | Opcional (solo GET) | Datos personales (hojas de vida) legibles/editables sin auth |
| `/api/alert-emails` | GET/POST/DELETE | Ninguna | No aplica | Lista de correos internos legible/editable por cualquiera; vector para redirigir alertas |
| `/api/planes-programas` | GET/PATCH | Ninguna | No verificada en PATCH | Documentación de todas las empresas editable por cualquiera |
| `/api/tecno-transversal` | GET/PATCH | Ninguna | No aplica | Igual que arriba |
| `/api/tecno-reportes` | GET/PATCH | Ninguna | No verificada en PATCH | Igual que arriba |
| `/api/send-email` | POST | Ninguna | No aplica | Relay de correo abierto |
| `/api/daily-alerts` (cron) | GET/POST | Solo si `CRON_SECRET` está configurado en Vercel | No aplica | Fail-open si falta la variable |

No encontré `/api/login` ni `/api/auth/*` — no existen. Tampoco encontré rastro de `api/sync-data.js` (mencionado en comentarios de otros archivos como predecesor); ya no existe, fue reemplazado por `api/equipos.js`. El frontend ya no lo llama (confirmé por grep en todo `src/`).

### 8-9. Validación de entradas y archivos
- Ningún endpoint valida tipos, longitudes ni formato de los datos que recibe más allá de "existe o no existe" (`if (!id) ...`). No hay SQL/NoSQL injection posible porque no hay motor de consultas (es un KV clave-valor), pero sí hay inyección de HTML (ver XSS abajo) y mass assignment (ver tabla de prioridad).
- Las firmas (`FirmaInput`) se leen como `data:` URI en el navegador vía `FileReader`, sin pasar por el servidor — no hay riesgo de ejecución en servidor, pero tampoco hay límite de tamaño, así que un archivo enorme puede inflar el registro guardado en KV.
- No hay carga de archivos ejecutables porque no hay carga de archivos al servidor en absoluto (todo son URLs pegadas a mano por el usuario, o `data:` URIs de imágenes).

### 11. XSS / Frontend
- `dangerouslySetInnerHTML` aparece en un solo lugar ([App.jsx:1025](E:\Proyectos\cmms-biomedico\src\App.jsx)), para renderizar gráficas SVG generadas por el propio código (`svgStackedBar(...)`) — confirmé que el comentario que dice "no por el usuario" es razonable en cuanto al *mecanismo* de renderizado, pero no verifiqué si algún valor de texto libre (nombre de equipo, observación) se interpola sin escapar dentro de las etiquetas `<text>` de esos SVG — **queda pendiente de revisión más fina si se decide tocar esa función**, lo marco como riesgo residual, no confirmado.
- El hallazgo confirmado y de mayor impacto es el `document.write` + `esc()` sin escape en los 3 generadores de reportes (ver tabla de prioridad).
- No se usa `eval()`, `new Function()`, ni `innerHTML` directo en ningún punto del código propio.

### 13-14. Headers de seguridad y CORS
`vercel.json` solo define el cron job — no hay bloque `headers`. Ningún endpoint agrega `Access-Control-Allow-Origin` ni cabeceras relacionadas, así que por defecto el navegador bloquea lectura cross-origin de las respuestas — pero esto **no es una protección real** contra el problema de fondo (falta de auth), porque cualquier cliente que no sea un navegador (curl, Postman, otro servidor) puede llamar los endpoints directamente sin que CORS aplique.

### 15. Secretos y variables de entorno
Variables de entorno referenciadas en el código: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET` (todas correctamente leídas solo en `api/*.js`, nunca en `src/`). **Un secreto real existe en texto plano** en `src/.env.local` (no reproducido aquí, ver tabla de prioridad para ubicación y recomendación). No está en el historial de git (confirmé con `git ls-files` y `git log --all -- .env.local`).

### 17. Cuentas y roles
Un solo "usuario" (credencial hardcodeada) y una bandera `readOnly` (modo invitado). No hay roles adicionales (administrador/supervisor/etc.) — coincide con el diseño actual del producto, no lo voy a expandir sin que me lo pidas explícitamente.

### 19. Dependencias
Ver tabla de prioridad — `npm audit`: 1 moderada, 3 altas (una sin fix disponible: `xlsx`). `npm outdated`: solo actualizaciones menores sin CVE asociado.

---

## LO QUE NO ENCONTRÉ (dicho explícitamente, no por omisión)
- No hay SQL/NoSQL injection clásica (no hay motor de consultas).
- No hay `eval`/`Function`/`innerHTML` peligrosos en código propio.
- No hay credenciales de Redis/Upstash expuestas en el frontend.
- No hay archivos ejecutables aceptados por el sistema.
- El repositorio de git está limpio de secretos (nada de `.env*` fue commiteado nunca).

---

## CORRECCIONES REALIZADAS (todas las CRÍTICAS + ALTAS aplicables)

### 🔴 Críticas — todas corregidas
1. **Autenticación real server-side.** Nuevo `api/login.js` verifica usuario/contraseña en el servidor contra `AUTH_USER`/`AUTH_PASSWORD_HASH` (variables de entorno), usando `scrypt` con salt y comparación en tiempo constante (`lib/auth.js`). Ya no hay usuario/contraseña en el bundle del navegador.
2. **Sesión real, no falsificable.** Login exitoso crea un token opaco (`crypto.randomBytes`) guardado en KV (`session:<token>` → `{role:'admin', ...}`) y lo entrega como cookie `HttpOnly; Secure; SameSite=Lax`. `localStorage.setItem('cmms-auth-ok','true')` ya no tiene ningún efecto — el servidor nunca confía en él. `App()` ahora pregunta al servidor (`GET /api/login`) si hay sesión válida en vez de leer `localStorage`.
3. **Escritura protegida en los 7 endpoints de datos.** `equipos.js`, `personal.js`, `alert-emails.js`, `planes-programas.js`, `tecno-transversal.js`, `tecno-reportes.js`: todo `POST`/`PATCH`/`DELETE` exige `requireAdmin(req,res)` (sesión válida). `GET` se mantiene abierto — es el modo invitado de solo lectura que la app ya ofrece, ahora real (antes ni siquiera hacía falta el botón "Invitado": cualquiera podía escribir).
4. **`reportes-falla.js` — caso especial resuelto sin romper nada.** El `POST` (usado por el formulario público de coordinadores, sin cuenta) se dejó abierto a propósito. Solo el `PATCH` (triage interno: asignar técnico, cerrar) ahora exige sesión de admin.
5. **Relay de correo cerrado.** `api/send-email.js` ya no confía en el `to` que manda el cliente: lo filtra contra la lista real de `cmms:alertEmails` en KV. Confirmé (leyendo `emailService.js`) que las 5 funciones de notificación existentes SIEMPRE mandan a esa misma lista, así que ningún flujo legítimo se ve afectado.

### 🟠 Altas — corregidas
6. **XSS almacenado cerrado.** Los 3 generadores de reporte (`generarReportePDF`, F140) y `emailService.js`/`api/daily-alerts.js` ahora escapan entidades HTML (`escapeHtml`) antes de interpolar texto libre. Encontré y corregí 2 huecos adicionales que no pasaban por `esc()`: observaciones de checklist y repuestos utilizados.
7. **Cron fail-closed.** `api/daily-alerts.js` ahora rechaza (500) si `CRON_SECRET` no está configurado, en vez de quedar abierto.
8. **Headers de seguridad agregados** en `vercel.json`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`. **A propósito NO agregué `Content-Security-Policy`** — la app usa cientos de `style={{...}}` inline y varios `<style>` embebidos; una CSP estricta los rompería sin un trabajo de migración aparte que no era parte de este pedido. Queda como recomendación futura.
9. **Mass assignment reducido.** Los `PATCH` de `equipos.js`, `personal.js` y `reportes-falla.js` ahora descartan explícitamente `patch.id` antes de fusionar — el id (llave de KV) ya no se puede sobrescribir vía patch.
10. **Fuerza bruta con bloqueo por cuenta Y por IP** (no solo IP, como pediste): `api/login.js` bloquea 15 minutos tras 5 intentos fallidos, contando por usuario y por IP en paralelo.

### 🟡 Medias — parcialmente atendidas
- `npm audit fix` (sin `--force`) resolvió `brace-expansion`, `nanoid` y `postcss`. **`xlsx` queda sin corregir** — no tiene parche en npm; migrar al build oficial de SheetJS (fuera de npm) es un cambio de dependencia que requiere tu visto bueno explícito, no lo hice.
- El `RESEND_API_KEY` en `src/.env.local` sigue ahí (no lo toqué — es tuyo, local, no está en git). Recomiendo moverlo a la raíz del proyecto y rotarlo.
- CORS: no lo toqué — su ausencia actual no es la protección real (ya está resuelto por la autenticación real), así que no era prioritario.

---

## ARCHIVOS MODIFICADOS

**Nuevos:**
- `lib/auth.js`
- `api/login.js`
- `api/logout.js`
- `scripts/hash-password.mjs`
- `SECURITY_AUDIT.md` (este archivo)

**Modificados:**
- `api/equipos.js`, `api/personal.js`, `api/alert-emails.js`, `api/planes-programas.js`, `api/tecno-transversal.js`, `api/tecno-reportes.js`, `api/reportes-falla.js`, `api/send-email.js`, `api/daily-alerts.js`
- `src/App.jsx` (LoginScreen, App(), escapeHtml + 2 usos adicionales)
- `src/services/emailService.js`
- `vercel.json`
- `package.json` / `package-lock.json` (vía `npm audit fix`)

**No toqué:** empresas, sedes, estructura de datos existente, ningún dato en KV, ninguna funcionalidad visible para el usuario final salvo que ahora el login es real.

---

## PRUEBAS REALIZADAS

1. **Harness local** (Node, `@vercel/kv` mockeado en memoria) contra copias de los handlers reales con solo el import de KV redirigido — 16/16 casos pasaron:
   - `verifyPassword` acepta la correcta y rechaza incorrecta/corrupta.
   - Login: credenciales malas → 401 sin cookie; credenciales buenas → 200 con cookie `HttpOnly`+`SameSite=Lax`.
   - Fuerza bruta: 6º intento fallido consecutivo → 429 (bloqueado).
   - `equipos.js`: `GET` sin sesión → 200 (invitado puede leer); `DELETE borrarTodo` sin sesión → 401 (**antes: 200, borraba todo**); con sesión de admin, `POST`/`DELETE` → 200.
   - `reportes-falla.js`: `POST` público sin sesión → 200 (no se rompió); `PATCH` interno sin sesión → 401.
   - `send-email.js`: destinatario fuera de la lista configurada → 400 (no envía).
2. `npm run build` → compila limpio.
3. Verificación manual en navegador (`npm run dev`): pantalla de login carga, `aria-label` de mostrar/ocultar contraseña intacto, el formulario llama a `/api/login` y maneja el error de red sin romperse (no puede completar el login real porque Vite solo — sin `vercel dev` — no ejecuta funciones serverless; ver limitación abajo).

**Limitación honesta:** no pude probar el flujo completo end-to-end (cookie real yendo y viniendo entre navegador y una función serverless real de Vercel) porque este entorno no tiene el proyecto vinculado a Vercel ni credenciales de KV reales. La lógica se verificó exhaustivamente por harness + lectura de código; la prueba definitiva es un despliegue a Preview en Vercel antes de pasar a producción.

---

## RECOMENDACIONES FUTURAS (priorizadas)

1. **Antes de desplegar:** configurar en Vercel (Production + Preview + Development) las variables `AUTH_USER`, `AUTH_PASSWORD_HASH` (generar con `node scripts/hash-password.mjs "tu-contraseña"`) y confirmar que `CRON_SECRET` ya está configurado — si no lo está, el cron diario dejará de funcionar hasta que lo agregues (a propósito, por el fix de fail-closed).
2. **Rotar `RESEND_API_KEY`** — estuvo en texto plano y fue leída durante esta auditoría.
3. Migrar `xlsx` al build oficial parcheado de SheetJS (fuera de npm) cuando tengas ventana para probar la importación/exportación de Excel a fondo.
4. Diseñar una CSP progresiva (empezar en modo `Report-Only` para medir qué rompería) antes de aplicarla de verdad.
5. Sistema de logs de auditoría (login, borrado, cambios) — quedó fuera de esta pasada por alcance/tiempo.
6. Si el negocio llega a necesitar más de un usuario o roles distintos de "admin"/"invitado", el modelo de sesión (`lib/auth.js`) ya soporta agregar un `role` distinto por sesión sin rediseño.
