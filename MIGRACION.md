# Migración de datos: Upstash Redis → Supabase

**Estado: PREPARADA, NO EJECUTADA.** Nada se ha creado en Supabase ni se ha migrado ningún
dato. Todo lo de este documento se ejecuta solo con aprobación explícita, en el horario de
bajo uso que se acuerde.

---

## 1. Qué queda listo en el código

| Pieza | Dónde | Qué hace |
|---|---|---|
| Capa de acceso a datos | `lib/datos/` | Las rutas de `api/` ya no hablan con Redis: usan repositorios (`datos.equipos.listar()`, `actualizar()`…). `DATA_BACKEND=redis` (por defecto) o `supabase` cambia la base de datos **sin tocar las rutas**. |
| Implementación Redis | `lib/datos/redis.js` | La actual: mismas claves y formato, caché por versión y escrituras condicionales. |
| Implementación Supabase | `lib/datos/supabase.js` | PostgREST + Storage. Cada edición escribe **solo el equipo modificado** (función SQL transaccional, `return=minimal`). Copia en memoria con refresco **incremental**. Listado resumido paginado y hoja de vida por demanda. |
| Esquema SQL | `supabase/migrations/20261002000000_esquema_inicial.sql` | Tablas, relaciones, índices, RLS, funciones de escritura, bucket privado `archivos`. Idempotente. |
| Archivos | `lib/datos/archivos.js`, `api/archivos.js` | Los base64 (documentos antiguos, firmas, plantillas) van a Storage; la app los descarga **solo al abrirlos**, con sesión y control por empresa. |
| Scripts | `scripts/migracion/` | `respaldo-redis.mjs`, `importar-supabase.mjs`, `verificar-migracion.mjs`, `exportar-desde-supabase.mjs`, `restaurar-redis.mjs`, `entorno-prueba-local.sh`. |
| Modo mantenimiento | `lib/mantenimiento.js` | `MODO_MANTENIMIENTO=1` → aviso en la app, todo en solo lectura y el servidor rechaza escrituras (503). |
| Latido diario | `api/salud.js` + `vercel.json` (cron) | Evita la pausa por inactividad del plan gratuito de Supabase. |

### Cómo se probó (sin tocar Producción)
- **Tests normales** (`npm test`, 92): toda la API funciona igual a través de la nueva capa (Redis).
- **Tests de Supabase** (`npm run test:supabase`, 7) contra Postgres 16 + PostgREST **locales**
  (`scripts/migracion/entorno-prueba-local.sh`) y un Storage simulado:
  - importar → verificar: todo idéntico, incluidos archivos; repetir la importación no duplica;
  - **prueba diferencial**: el mismo guion de 54 llamadas a la API (lecturas, ediciones,
    altas, bajas, permisos entre empresas, catálogo público, plantillas, administración) da
    **las mismas respuestas** con `DATA_BACKEND=redis` y con `DATA_BACKEND=supabase`;
  - reversión: exportar de Supabase devuelve **exactamente** los datos de Redis (archivos byte a byte);
  - concurrencia: dos ediciones simultáneas del mismo equipo se conservan;
  - caché incremental: tras ediciones/altas/bajas descarga solo lo cambiado y queda igual a una lectura completa;
  - `/api/archivos`: exige sesión y no entrega archivos de otra empresa.
- **Ensayo con datos del tamaño real** (1 821 equipos, 2,4 MB, 5 431 preventivos): respaldo →
  importación (≈3 s) → verificación ✔ → re-importación idempotente ✔ → exportación →
  restauración en Redis (namespace de prueba): **idéntico al original**.

> Durante las pruebas apareció y quedó corregido un problema que habría colgado la API en
> Supabase: el código de error SQL `40001` hace que PostgREST reintente la transacción sin
> fin. El conflicto de versión usa ahora `PT409` (responde HTTP 409 de inmediato).

---

## 2. Arquitectura después de migrar

```
Navegador ──► Vercel (api/*) ──► lib/datos ──► Supabase Postgres (datos de negocio)
                    │                      └──► Supabase Storage (archivos, bucket privado)
                    └──► Upstash Redis: sesiones, límites de frecuencia, intentos de login
```

**Recomendación: sesiones y límites de frecuencia se quedan en Redis.** Son claves pequeñas con
expiración automática (TTL), justo lo que Redis hace bien. Su consumo es mínimo: unos 1–3
comandos y menos de 1 KB por petición. Con el uso actual son menos de 100 000
comandos/mes (de 500 000) y unos pocos MB de ancho de banda en el plan gratuito de Upstash.
Más adelante, si se quiere dejar un solo proveedor, se pueden pasar a una tabla de Supabase
con limpieza periódica, pero no es necesario.

---

## 3. Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Valor | Cuándo |
|---|---|---|
| `DATA_BACKEND` | `redis` (hoy) → `supabase` | Se cambia en el paso 7 del día de migración |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | Antes del día de migración (no tiene efecto con `redis`) |
| `SUPABASE_SERVICE_ROLE_KEY` | clave **service_role** (Settings → API) | Igual. **Secreta**: solo en Vercel, nunca en el código ni en el navegador |
| `MODO_MANTENIMIENTO` | `1` mientras dura la migración; luego borrar | Paso 1 y paso 8 |
| `MENSAJE_MANTENIMIENTO` | (opcional) p. ej. `Migración en curso, vuelve a las 8 p. m.` | Paso 1 |
| `CRON_SECRET` | (recomendado) cadena aleatoria larga | Protege `api/salud`; Vercel Cron la envía sola |
| `KV_*` / `REDIS_URL` | **sin cambios** | Siguen en uso (sesiones) |

En Vercel, un cambio de variable se aplica con un **redeploy** del deployment de Production.

---

## 4. Preparación (días antes, sin afectar a nadie)

1. **Desplegar este código con `DATA_BACKEND=redis`** (después de aprobarlo). La app sigue
   igual sobre Redis; así el código nuevo se prueba en Producción antes del cambio de base de datos.
2. **Crear el proyecto de Supabase** (acción manual, ver §9). Región: la más cercana a la
   región de las funciones de Vercel (por defecto Washington D. C., `iad1` → Supabase
   *East US (North Virginia)*), para menor latencia.
3. **Aplicar el esquema**: Supabase → SQL Editor → pegar y ejecutar
   `supabase/migrations/20261002000000_esquema_inicial.sql` (o `supabase db push` con la CLI).
   Es idempotente. Comprobar en Storage que existe el bucket **`archivos`** y que es **privado**.
4. **Ensayo general** (recomendado):
   - `vercel env pull .env.respaldo --environment=production`
   - `node --env-file=.env.respaldo scripts/migracion/respaldo-redis.mjs` → copia de Producción, solo lectura.
   - En una terminal con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (archivo `.env.supabase`, ya está en `.gitignore`):
     - `node --env-file=.env.supabase scripts/migracion/importar-supabase.mjs --respaldo=<archivo>` (simulación);
     - si la simulación muestra **problemas** (p. ej. equipos con empresa inexistente), corregirlos en la app
       con *Administración → Registros sin empresa* y repetir. El importador **no importa nada** mientras haya problemas;
     - `... importar-supabase.mjs --respaldo=<archivo> --confirmar=<ref>` y luego
       `... verificar-migracion.mjs --respaldo=<archivo> --muestra=20` → debe terminar en ✔.
   - Opcional: un deployment de **Preview** con `DATA_BACKEND=supabase` (variables solo en Preview)
     para revisar la app sobre Supabase sin tocar Producción.
   - Después del ensayo, **vaciar las tablas** (ver §5, paso 4) para que el día de la migración
     se importe desde cero.

---

## 5. Día de la migración (en el horario de bajo uso acordado; ~45–60 min)

| # | Paso | Cómo | Verificación |
|---|---|---|---|
| 0 | Aviso al equipo (24 h antes y al empezar) | Correo/WhatsApp con hora de inicio y fin | — |
| 1 | **Congelar escrituras** | Vercel: `MODO_MANTENIMIENTO=1` (+ mensaje) → Redeploy | La app muestra la franja amarilla; editar algo responde "mantenimiento" |
| 2 | Esperar 1 minuto | Las ediciones agrupadas pendientes se envían en ≤ 15 s | `cmms:equipos:version` deja de cambiar (consola de Upstash) |
| 3 | **Respaldo** | `node --env-file=.env.respaldo scripts/migracion/respaldo-redis.mjs` | Termina en "✔ Verificación correcta"; guardar el archivo y su SHA-256 en un lugar privado |
| 4 | Vaciar Supabase (si hubo ensayo) | SQL Editor: `truncate empresas, usuarios, equipos, personal, reportes_falla, capacitaciones_registros, capacitaciones_meta, planes_programas, tecno_reportes, tecno_transversal, limpieza_desinfeccion, limpieza_plantillas, alert_emails, archivos, sedes, cmms_eliminados cascade;` | Tablas en 0 |
| 5 | **Importar** | `importar-supabase.mjs --respaldo=<archivo>` (simulación) y luego `--confirmar=<ref>` | "✔ Importado" con los mismos conteos que el respaldo |
| 6 | **Verificar** | `verificar-migracion.mjs --respaldo=<archivo> --muestra=20` | **Todas** las filas "✔ igual". Si no, **no seguir** (ver §6) |
| 7 | **Cambiar de base de datos** | Vercel: `DATA_BACKEND=supabase` (+ `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), **mantener** `MODO_MANTENIMIENTO=1` → Redeploy | Probar en solo lectura: login, dashboard, inventario completo, hoja de vida, un documento antiguo, un reporte con firma, plantillas, capacitaciones, formulario público |
| 8 | **Reabrir escrituras** | Vercel: borrar `MODO_MANTENIMIENTO` → Redeploy | Editar un campo de un equipo y verlo guardado; crear y eliminar un equipo de prueba; enviar y eliminar un reporte público de prueba |
| 9 | Aviso de fin | — | — |
| 10 | Primer respaldo de Supabase | `node --env-file=.env.supabase scripts/migracion/exportar-desde-supabase.mjs` | Archivo generado |

**Decisión de continuar o volver atrás: antes del paso 8.** Hasta ese momento nadie ha escrito
en Supabase y volver a Redis es inmediato y sin pérdida.

---

## 6. Plan de reversión (volver a `DATA_BACKEND=redis`)

**A. Antes de reabrir escrituras (pasos 1–7).** Redis no se modificó (estaba congelado):
1. Vercel: `DATA_BACKEND=redis` → Redeploy.
2. Borrar `MODO_MANTENIMIENTO` → Redeploy. Listo: todo como antes.

**B. Después de reabrir escrituras (ya hubo cambios en Supabase).**
1. `MODO_MANTENIMIENTO=1` → Redeploy (congelar).
2. `exportar-desde-supabase.mjs` → JSON con **todo** lo de Supabase, en formato Redis, con los
   archivos reincorporados en base64 (probado: idéntico byte a byte).
3. `respaldo-redis.mjs` (respaldo de lo que hay en Redis, por seguridad).
4. `restaurar-redis.mjs --respaldo=<export de Supabase> --namespace=production` (simulación) y
   luego `--confirmar=SOBRESCRIBIR-production`. Escribe solo las claves de negocio y sube sus
   versiones (las cachés se invalidan).
5. `DATA_BACKEND=redis` → Redeploy; comprobar; borrar `MODO_MANTENIMIENTO` → Redeploy.

> Al volver a Redis vuelve también su límite de ancho de banda: cada edición vuelve a costar
> ~2,7 MB (ver §7).

---

## 7. Consumo estimado

### Medido en local con datos del tamaño real (1 821 equipos)

| Acción | Redis hoy (en Producción) | Redis + Parte 1 | Supabase (egress) |
|---|---|---|---|
| Abrir/recargar la app, sin cambios | ~3,3 MB | **~10 KB** (304) | **~0,3 KB** |
| Abrir la app tras ediciones de otros | ~3,3 MB | hasta 3,2 MB (una vez por instancia y versión) | **~3,6 KB** (incremental) |
| Editar un equipo (un guardado) | ~5,9 MB *(por tecla)* | **~2,7 MB** (por grupo de cambios) | **~1,6 KB** |
| Agregar un preventivo | ~5,9 MB | ~2,7 MB | ~3,5 KB |
| Abrir una hoja de vida (`?id`) | — | — | ~1,7 KB |
| Catálogo público (visita que llega a la función) | ~3,2 MB | ~2 KB (+ CDN 5 min) | ~0,4 MB solo en frío; luego ~1 KB |
| Instancia nueva del servidor (arranque en frío) | — | 3,2 MB | **3,1 MB sin comprimir** (~0,3–0,6 MB con gzip) |

### Mes con el uso actual: ~985 ediciones/día, ~100 aperturas/día, 30 días (peor caso)

**Supabase (egress, límite 5 GB):**

| Concepto | Cálculo | Sin compresión | Con gzip (≈20 %) |
|---|---|---|---|
| Ediciones | 985 × 30 × ~2,5 KB | 74 MB | 30 MB |
| Aperturas | 100 × 30 × ~4 KB | 12 MB | 5 MB |
| Arranques en frío (supuesto: 30/día) | 900 × 3,1 MB | 2,8 GB | ~0,6 GB |
| Catálogo público en frío (supuesto: 30/día) | 900 × 0,35 MB | 0,3 GB | ~0,05 GB |
| Archivos abiertos (documentos antiguos) | según uso real | ~0,1 GB | ~0,1 GB |
| **Total** | | **≈ 3,3 GB** | **≈ 0,8 GB** |

- Con compresión (la API lo pide con `Accept-Encoding: gzip`) queda **holgadamente bajo 5 GB**.
  Sin compresión, en el peor caso, quedaría en ~3,3 GB: por debajo, pero sin tanta holgura.
  El término dominante son los **arranques en frío** (descarga completa del inventario una vez por instancia).
- **Para eliminar ese término**: pasar el frontend a `GET /api/equipos?vista=resumen` (listado
  paginado, ~19 KB por 100 equipos) + `GET /api/equipos?id=` (hoja de vida al abrirla). Los dos
  modos ya existen en la API y están probados. Falta adaptar las pantallas que hoy calculan
  indicadores con el historial completo (dashboard, cronogramas). Es el siguiente paso recomendado
  tras migrar, y no requiere tocar datos.
- **Revisar en el panel de Supabase (Usage) la primera semana** y comparar con esta tabla.

**Upstash después de migrar (solo sesiones):** <100 000 comandos/mes y unos MB → dentro del plan gratuito.

**Upstash sin migrar (solo Parte 1):** cada guardado de un equipo cuesta ~2,7 MB. 10 GB/mes
alcanzan para unos **125 guardados/día** (30 días) o **~170** (22 días hábiles). Con 985
PATCH/día antes del agrupado (por tecla), el agrupado los reduce un 60–85 %, a ≈150–400
guardados/día. Eso es ≈12–32 GB/mes: **probablemente siga por encima de 10 GB** si el equipo
edita mucho, por ejemplo mientras carga documentación. La medición tras desplegar la Parte 1 lo confirmará.

### Límites del plan gratuito de Supabase (verificar en la página de precios vigente)
- Base de datos 500 MB: los datos actuales ocupan del orden de 10–20 MB en Postgres.
- Storage 1 GB: depende de cuántos documentos/firmas en base64 existan. Medirlo con
  `scripts/redis-tamanos.mjs --detalle-equipos` antes de migrar.
- Egress 5 GB/mes (ver arriba).
- Pausa tras 7 días sin actividad (ver §8).
- **Sin copias de seguridad automáticas** (ver §8).

---

## 8. Operación en el plan gratuito

### Respaldo periódico (el plan gratuito no tiene backups)
- **Semanal** (y antes de cualquier cambio importante):
  `node --env-file=.env.supabase scripts/migracion/exportar-desde-supabase.mjs`
  → un JSON con **todo**: datos y archivos (en base64). Sirve también para volver a Redis.
- Guardarlo **cifrado o en un lugar privado** (contiene hash de contraseñas y datos de
  personal, equipos y usuarios). **No** subirlo al repositorio (que es público) ni como artefacto de
  GitHub Actions sin cifrar. Conservar al menos las últimas 4 copias.
- Opcional: `pg_dump` con la cadena de conexión de Supabase (Settings → Database) para un
  respaldo SQL adicional. No incluye los archivos de Storage.

### Pausa por inactividad (7 días)
- `vercel.json` programa un **cron diario** a `GET /api/salud`, que con `DATA_BACKEND=supabase`
  hace una consulta mínima (~50 bytes). Eso mantiene el proyecto activo aunque nadie use la app
  (vacaciones o festivos). Los cron de Vercel funcionan en el plan Pro.
- Definir `CRON_SECRET` en Vercel para que solo el cron pueda llamarlo.
- Si aun así se pausa, se reactiva desde el panel de Supabase (*Restore project*), sin perder datos.

---

## 9. Acciones manuales (las haces tú en los paneles)

**Supabase**
1. Crear la cuenta/organización y un **proyecto** (plan Free; región *East US (North Virginia)* si las funciones de Vercel están en `iad1`). Guardar la contraseña de la base de datos en un gestor de contraseñas.
2. SQL Editor → ejecutar `supabase/migrations/20261002000000_esquema_inicial.sql`.
3. Storage → confirmar el bucket `archivos` **privado**.
4. Settings → API: copiar `Project URL` y la clave **service_role**. No usar ni publicar la clave `anon`: la app no la necesita.

**Vercel**
5. Añadir `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Production, y Preview si se ensaya allí), `DATA_BACKEND=redis`, `CRON_SECRET`.
6. El día de la migración: `MODO_MANTENIMIENTO` y `DATA_BACKEND` según §5, con redeploy en cada cambio.
7. Comprobar en *Settings → Functions* la región de las funciones (para elegir la región de Supabase).

**Upstash**
8. Tras migrar y verificar 1–2 semanas: volver al **plan Free** y quitar el pago por uso. Si existe una región de lectura adicional (p. ej. Norte de California), eliminarla: con Supabase ya no hace falta y cada escritura se replica allí.
9. Configurar alertas o límite de presupuesto en Upstash mientras siga en pago por uso.

**Supabase (después de migrar)**
10. Revisar Usage (egress, base de datos, Storage) la primera semana.
11. Programar en tu calendario el respaldo semanal (§8).

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Registros con empresa inexistente o ids duplicados | `validar()` los detecta y el importador **no importa nada** hasta corregirlos |
| Diferencias entre lo importado y Redis | `verificar-migracion.mjs` compara **todo** (no solo muestras) con lo que verá la app; si algo difiere, no se cambia `DATA_BACKEND` |
| Escrituras durante la migración | Modo mantenimiento: servidor en 503 y la app en solo lectura |
| Fallo después de reabrir escrituras | Exportación completa desde Supabase y restauración en Redis (§6-B), probada ida y vuelta |
| Ediciones simultáneas | Control de versión por registro (409 + relectura automática) |
| Clave service_role expuesta | Solo en variables de entorno de Vercel; RLS activado y sin políticas para `anon` |
| Egress mayor al estimado | Revisar Usage la primera semana; pasar el frontend al listado resumido (§7) |
| Pausa del proyecto | Cron diario (§8) |
| Pérdida de datos en Supabase (sin backups) | Exportación semanal (§8) |
