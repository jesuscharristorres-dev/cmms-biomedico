---
name: monitor-cmms
description: Chequeo de salud y seguridad del CMMS Biomédico — errores en producción (Vercel), colecciones de KV cerca del límite de 10 MB de Upstash, endpoints sin autenticación, vulnerabilidades nuevas en dependencias, estado de las pruebas automatizadas. Úsalo cuando el usuario pida monitorear, revisar la salud, auditar o chequear que todo esté bien en el CMMS Biomédico. SOLO reporta hallazgos — nunca corrige, hace commit ni despliega nada por su cuenta; eso requiere que el usuario lo pida explícitamente en esa misma conversación.
---

# Monitoreo del CMMS Biomédico

Checklist para correr bajo pedido (nunca de forma automática/programada — el usuario pidió
explícitamente que esto sea bajo demanda, nunca un cron). Este chequeo **solo informa**: aunque
encuentres algo arreglable en una línea, repórtalo y espera a que el usuario pida el arreglo en
ese mismo turno — no asumas que "monitorear" incluye "corregir", aunque el pedido original que
motivó este skill sí mencionaba corregir constantemente (ver `SECURITY_AUDIT.md`, sección
2026-11-08, para el contexto de por qué se decidió así).

## 1. Errores reales en producción (Vercel)
- `mcp__Vercel__get_runtime_errors` (proyecto `cmms-biomedico`, `since: "7d"` o más si hace
  tiempo que no se corre este chequeo). Ignora el ruido conocido (`DeprecationWarning` de
  `url.parse()` — no es un error real). Cualquier otro error agrupado es una pista real; si
  menciona `UpstashError` o `max request size exceeded`, es el mismo techo de 10 MB que ya tocó
  a `equipos`/`personal`/`reportesFalla` (ver más abajo) — probablemente en una de las
  colecciones que siguen sin repartirse por clave individual.
- `mcp__Vercel__get_runtime_logs` con `level: ["error","fatal"]` para una ventana más reciente
  (`since: "24h"`) si `get_runtime_errors` no alcanza a cubrir algo puntual que el usuario
  reportó.

## 2. Colecciones de KV cerca del límite de 10 MB
Ya migradas a una clave por registro (sin techo práctico): `equipos`, `personal`,
`reportesFalla` (ver `lib/equipos.js`, `lib/personal.js`, `lib/reportes-falla.js` y las
migraciones 004/005/006 en `lib/migrations.js`).

Siguen en un solo bloque por `empresa_id` (mismo techo de 10 MB, menos probable pero no
imposible): `planesProgramas`, `tecnoReportes`, `tecnoComites`, `limpiezaDesinfeccion`,
`limpiezaPlantillas`, `checklistDotacion`, `formatoTemperaturaHumedad` (ver
`lib/migrations.js` → `COLECCIONES_OBJETO`).

No hay forma barata de medir el tamaño exacto sin leer la clave completa (y son "sensitive"/
internas, no conviene volcarlas). La señal confiable es la del paso 1: un `UpstashError` con
"max request size exceeded" mencionando alguna de estas claves. Si aparece, el arreglo es el
mismo patrón que ya se aplicó a equipos/personal/reportesFalla — repartir esa colección por
clave individual (una migración nueva, numerada después de la última en `lib/migrations.js`).

## 3. Endpoints sin autenticación (regresión)
`grep -L "requireAuth\|requireSuperAdmin" api/*.js` — cualquier archivo que aparezca ahí (salvo
`api/login.js`, que es el propio login) es una regresión grave: un endpoint de datos sin exigir
sesión. Repórtalo como crítico de inmediato.

## 4. Dependencias
`npm audit` (en la raíz del repo). Compara contra lo último documentado en `SECURITY_AUDIT.md`
(sección más reciente) — reporta solo lo que sea NUEVO desde esa fecha, no repitas hallazgos ya
conocidos y aceptados (p. ej. `minimatch`/`eslint`, documentado como pendiente a propósito).

## 5. Pruebas automatizadas
`npm test` — deben seguir en 0 fallas. Si algo falla, es la señal más fuerte de que algo se
rompió desde la última vez que se corrió este chequeo.

## 6. Build
`npm run build` — debe compilar limpio (los warnings de "chunk > 500kB" son conocidos y
aceptados, no los reportes como hallazgo nuevo).

## Cómo reportar
Un resumen priorizado (🔴/🟠/🟡/🟢), igual que el formato ya usado en `SECURITY_AUDIT.md` — y,
si el hallazgo es nuevo o cambió algo desde la última entrada de ese archivo, ofrece agregar una
sección fechada ahí (pero solo escríbela si el usuario lo confirma, no por iniciativa propia:
escribir en el repo ya es una acción, no solo "reportar").
