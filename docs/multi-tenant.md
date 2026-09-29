# Arquitectura multiempresa: documentación técnica

Este documento describe cómo el CMMS Biomédico aísla la información entre empresas (tenants).
Si buscas cómo usarlo, empieza por el [README](../README.md).

## 1. Punto de partida (antes del cambio)

| Aspecto | Estado previo |
|---|---|
| Backend | Funciones serverless de Vercel (`api/*.js`) |
| Base de datos | Vercel KV (Upstash Redis). Documentos JSON bajo claves `cmms:*` |
| Usuarios | Un único usuario en variables de entorno (`AUTH_USER` y `AUTH_PASSWORD_HASH`) |
| Sesión | Cookie HttpOnly con token opaco; en KV `session:<token>` guardaba `{ role: 'admin' }` |
| Empresas | 5 empresas fijas en el frontend (`COMPANIES` en `src/App.jsx`) |
| Aislamiento | Ninguno. `GET` sin sesión (modo invitado) devolvía los datos de las 5 empresas. `?empresa=` era un filtro opcional |

Todos los registros de negocio ya guardaban la empresa en el campo `empresa`, con valores
`MACROMED`, `MEIDE`, `NP MEDICAL`, `DIAGNOSTIK` o `AUNAR SALUD`.

## 2. Modelo de datos

No hay SQL: el almacenamiento sigue siendo Vercel KV. Se agregaron estas colecciones:

### `cmms:empresas` (arreglo)

| Campo | Descripción |
|---|---|
| `id` | **empresa_id**. Para las 5 empresas existentes es su clave histórica (`MACROMED`…). Para las nuevas se deriva del nombre (mayúsculas, sin tildes). Es inmutable |
| `nombre` | Nombre visible (editable) |
| `nit`, `direccion`, `telefono`, `email` | Datos de la empresa (opcionales) |
| `estado` | `activo` / `inactivo` |
| `color`, `logo`, `sedes[]` | Identidad visual y sedes, antes fijas en el frontend |
| `created_at`, `updated_at` | ISO 8601 |

### `cmms:usuarios` (arreglo)

| Campo | Descripción |
|---|---|
| `id` | `usr_<hex>` |
| `nombre`, `email` | El email es único (sin distinguir mayúsculas) |
| `username` | Solo para el administrador migrado desde `AUTH_USER`, si no era un email |
| `password_hash` | `salt:hash` con scrypt. **Nunca** sale del servidor |
| `role` | `SUPER_ADMIN`, `EMPRESA` o `LECTURA` |
| `empresa_id` | `null` para SUPER_ADMIN; **obligatorio** para los demás roles (FK → `cmms:empresas.id`) |
| `estado` | `activo` / `inactivo` |
| `created_at`, `updated_at` | ISO 8601 |

### Entidades de negocio y su empresa

En cada entidad, el campo **`empresa` es la clave foránea `empresa_id`**. No se renombró, para no
reescribir ningún registro existente.

| Clave KV | Entidad | Forma | ¿Pertenece a una empresa? |
|---|---|---|---|
| `cmms:equipos` | Equipos, con preventivos, correctivos, calibraciones, bajas y documentos anidados | arreglo | Sí, `empresa` por registro |
| `cmms:personal` | Hojas de vida del personal | arreglo | Sí, `empresa` por registro |
| `cmms:reportesFalla` | Reportes de falla (órdenes de trabajo correctivas) | arreglo | Sí, `empresa` por registro |
| `cmms:planesProgramas` | Planes y programas | `{ [empresa_id]: … }` | Sí, por clave |
| `cmms:tecnoReportes` | Reportes trimestrales de tecnovigilancia | `{ [empresa_id]: … }` | Sí, por clave |
| `cmms:limpiezaDesinfeccion` | Enlaces mensuales de limpieza | `{ [empresa_id]: … }` | Sí, por clave |
| `cmms:limpiezaPlantillas` | Plantilla del formato de limpieza | `{ [empresa_id]: … }` | Sí, por clave |
| `cmms:tecnoTransversal` | Documentación de tecnovigilancia | `{ [docKey]: { [empresa_id]: url } \| url }` | Mixto: por empresa, o **global** (valor plano, p. ej. INVIMA) |
| `cmms:capacitaciones` | Snapshot de Google Sheets | `{ records[] }` | Sí, `empresa` por registro. `OTRAS` = ninguna empresa, solo lo ve SUPER_ADMIN |
| `cmms:alertEmails` | Correos de alerta | arreglo | **Global** (configuración del sistema) |
| `session:*`, `user_sessions:*`, `login_fail:*` | Sesiones y anti fuerza bruta | — | Infraestructura |

### Integridad referencial

KV no tiene foreign keys, así que las reglas se aplican en la capa de acceso a datos:

- `usuarios.empresa_id → empresas.id`: se valida en `lib/usuarios.js`. La empresa debe existir y
  estar activa al asignarla.
- `equipos`, `personal` y `reportesFalla`: en `empresa → empresas.id`, cualquier alta o cambio de
  empresa pasa por `resolveEmpresaForWrite` (`lib/tenancy.js`). La empresa debe existir y estar
  activa. Un reporte público valida además que el equipo pertenezca a esa empresa y sede.
- Documentos indexados por empresa: `assertKeyedWrite` exige una empresa existente.
- Las empresas no se eliminan, solo se desactivan. Así nunca quedan registros huérfanos.

## 3. Migraciones

Están en `lib/migrations.js`, son versionadas e idempotentes, y cada una tiene `up` y `down`. Las
aplicadas se registran en `cmms:schema_migrations`.

| Id | Qué hace | Reversión (`down`) |
|---|---|---|
| `001_empresas` | Crea `cmms:empresas` con las 5 empresas reales. No sobrescribe empresas ya editadas | Borra `cmms:empresas`, solo si ningún usuario está asignado a una empresa |
| `002_super_admin` | Si no hay SUPER_ADMIN, lo crea desde `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD_HASH` o desde `AUTH_USER`/`AUTH_PASSWORD_HASH`. Sin credenciales no se marca como aplicada y se reintenta | Elimina los usuarios creados por la migración |
| `003_auditoria_sin_empresa` | Genera `cmms:migracion:sin_empresa` con los registros cuya `empresa` no coincide con ninguna empresa. **No modifica datos** | Borra el informe |

**Ejecución:**

- **Automática:** `ensureSchema()` corre en la primera petición autenticada (o de login) de cada
  instancia serverless. Un despliegue nuevo funciona sin pasos manuales.
- **Manual:**
  ```bash
  # credenciales de KV en .env.kv.local (ver docs/preview-production.md → "Credenciales para scripts")
  node --env-file=.env.kv.local scripts/migrate.mjs status --env=production
  node --env-file=.env.kv.local scripts/migrate.mjs up --env=preview
  node --env-file=.env.kv.local scripts/migrate.mjs audit --env=production --confirm-production
  node --env-file=.env.kv.local scripts/migrate.mjs down 003_auditoria_sin_empresa --env=preview
  ```

**Registros sin empresa.** Si un registro heredado tiene una `empresa` desconocida, no se inventa
una. El registro se conserva, solo lo ve el SUPER_ADMIN y aparece en
**Administración → Empresas → Registros existentes sin empresa asignada**. Ahí se asigna
manualmente, con `PATCH /api/admin?resource=sin-empresa`. La asignación guarda el valor original
en `empresa_anterior`, para que sea auditable y reversible.

Las claves huérfanas en documentos indexados (`clavesHuerfanas`) se listan, pero se resuelven a
mano en KV. Los datos existentes usan claves que ya coinciden con las empresas sembradas, así que
en la práctica no debería haber ninguna.

## 4. Autenticación

- `POST /api/login` busca al usuario por email (o por `username`, en el caso del administrador
  migrado) y verifica el hash con scrypt en tiempo constante. Si el usuario no existe, se usa un
  hash señuelo para que el tiempo de respuesta no revele qué emails existen.
- Un usuario inactivo, o de una empresa inactiva, no obtiene sesión (403).
- La sesión en KV guarda **solo** `{ userId }`. En **cada** petición, `getAuthContext` vuelve a
  leer el usuario y su empresa. Por eso desactivar, eliminar o mover de empresa a un usuario aplica
  de inmediato. Además se cierran todas sus sesiones (`user_sessions:<id>`).
- Las sesiones del esquema anterior (`{ role: 'admin' }`, sin `userId`) dejan de ser válidas: hay
  que iniciar sesión una vez más.
- Se conserva el bloqueo anti fuerza bruta: 5 intentos por cuenta y por IP cada 15 minutos.

## 5. Autorización

Flujo: `AUTENTICACIÓN → USUARIO (activo) → ROL → EMPRESA ASIGNADA (activa) → AUTORIZACIÓN → CONSULTA FILTRADA`.

Helpers centralizados:

| Helper | Archivo | Uso |
|---|---|---|
| `requireAuth(req, { write })` | `lib/auth.js` | 401 sin sesión válida. 403 si pide escritura y el rol es `LECTURA` |
| `requireSuperAdmin(req)` | `lib/auth.js` | 403 si no es SUPER_ADMIN |
| `empresaFilter(ctx, query)` | `lib/tenancy.js` | SUPER_ADMIN: `?empresa=` opcional. Usuario de empresa: siempre su empresa; pedir otra → 403 |
| `scopeArray` / `scopeKeyed` | `lib/tenancy.js` | Recortan cualquier respuesta a las empresas visibles |
| `findOwned(ctx, list, id)` | `lib/tenancy.js` | Anti-IDOR: busca el id **solo entre los registros visibles**. Un registro de otra empresa responde 404, igual que uno inexistente, para que no se pueda inferir su existencia |
| `idOcupadoPorOtraEmpresa` | `lib/tenancy.js` | Alta con un id ya usado por otra empresa: 409 genérico. Nunca sobrescribe ni mueve el registro ajeno |
| `resolveEmpresaForWrite` | `lib/tenancy.js` | Decide la empresa de un registro nuevo. Nunca confía en el body para usuarios de empresa |
| `applyScopedPatch` | `lib/tenancy.js` | Anti mass-assignment: `id` inmutable; `empresa` solo la cambia el SUPER_ADMIN |
| `assertKeyedWrite` | `lib/tenancy.js` | Escrituras en documentos `{ [empresa_id]: … }` |

**Nunca se usa un `empresa_id` del cliente para dar acceso.** Para un usuario de empresa, un
`?empresa=` o un `empresa` en el body solo se comparan contra su empresa y, si difieren, la
respuesta es 403.

### Matriz de permisos

| Operación | SUPER_ADMIN | EMPRESA | LECTURA | Sin sesión |
|---|---|---|---|---|
| Leer datos | Todas las empresas (filtro opcional) | Solo su empresa | Solo su empresa | 401 |
| Crear, editar o eliminar datos | Cualquier empresa | Solo su empresa | 403 | 401 |
| Documento global de tecnovigilancia | Editar | Leer | Leer | 401 |
| Sincronizar capacitaciones (Google) | Sí | 403 | 403 | 401 |
| Empresas: listar | Todas | Solo la suya | Solo la suya | 401 |
| Empresas: crear, editar, activar/desactivar | Sí | 403 | 403 | 401 |
| Usuarios: CRUD, rol, empresa, estado | Sí | 403 | 403 | 401 |
| Reportar falla (formulario público) | Sí | Sí | Sí | Sí, con validación estricta |
| Catálogo público mínimo | Sí | Sí | Sí | Sí, sin datos internos |

## 6. Endpoints

Ningún endpoint existente se duplicó. Todos ahora aplican aislamiento.

| Endpoint | Cambios |
|---|---|
| `GET/POST /api/login` | GET devuelve `{ authenticated, user, empresas }`. POST acepta email o usuario |
| `POST /api/logout` | Reescrito a `/api/login?action=logout` en `vercel.json` |
| `/api/equipos`, `/api/personal` | Lecturas recortadas; escrituras con `resolveEmpresaForWrite`/`findOwned`/`applyScopedPatch` |
| `/api/reportes-falla` | `GET ?catalogo=1` es público y mínimo; POST público reconstruye el registro con whitelist; GET/PATCH/DELETE autenticados y aislados |
| `/api/planes-programas`, `/api/tecno-reportes`, `/api/limpieza-desinfeccion`, `/api/limpieza-plantillas` | GET recortado; escrituras con `assertKeyedWrite`. **`limpieza-desinfeccion` PATCH ya no es público** |
| `/api/tecno-transversal` | Documentos globales: solo SUPER_ADMIN escribe |
| `/api/capacitaciones` | GET recortado por empresa; POST (sincronizar) solo SUPER_ADMIN |
| **Nuevo** `/api/admin?resource=empresas\|usuarios\|sin-empresa` | Administración. También se expone como `/api/empresas`, `/api/empresas/:id`, `/api/usuarios`, `/api/usuarios/:id` y `/api/admin/sin-empresa` vía rewrites |

La administración vive en **un solo archivo**, con `?resource=`, y `logout` se fusionó en `login`.
Así el proyecto sigue en 12 funciones serverless, el límite del plan Hobby de Vercel.

### Códigos de error

| Código | Cuándo |
|---|---|
| 400 | Falta un parámetro obligatorio o el formato es inválido |
| 401 | Sin sesión, sesión expirada o del esquema anterior, o usuario desactivado/eliminado |
| 403 | Empresa ajena pedida por `?empresa=` o por el body, rol sin permiso, usuario o empresa inactivos al iniciar sesión |
| 404 | El recurso no existe **o pertenece a otra empresa** (respuesta idéntica) |
| 409 | Email, nombre o NIT duplicado; auto-desactivación; quedarse sin SUPER_ADMIN activo |
| 422 | Validación de campos: `details` trae el error por campo |
| 429 | Demasiados intentos de login |
| 500 | Error inesperado. El detalle solo va al log del servidor |

Los mensajes son genéricos: no revelan datos de otra empresa ni detalles internos.

### Endpoints públicos (sin sesión): qué exponen

| Endpoint | Expone | Protección |
|---|---|---|
| `GET /api/login` | Solo `{ authenticated: false }` | — |
| `POST /api/login` | Mensaje genérico de credenciales | Bloqueo tras 5 intentos por cuenta y por IP; hash señuelo contra la enumeración de emails |
| `GET /api/reportes-falla?catalogo=1` | Empresas activas (id, nombre, color, logo, sedes). Equipos de empresas activas: id, empresa, sede, nombre, marca, modelo, serie, n.º de inventario | Nunca incluye mantenimientos, calibraciones, observaciones, documentos, datos de contacto ni usuarios |
| `POST /api/reportes-falla` | Solo el reporte creado | Whitelist de campos; empresa activa; sede y equipo de esa empresa; 30 reportes por hora por IP |
| `POST /api/send-email` | — | **Ya no es público**: solo SUPER_ADMIN. Antes permitía enviar HTML arbitrario a la lista interna de alertas |

## 7. Frontend

- `GET /api/login` entrega el usuario y **solo** las empresas que puede ver. `setCompanies()`
  reemplaza la lista `COMPANIES` que usa toda la UI, así que pestañas, selectores y dashboards se
  recortan solos.
- El SUPER_ADMIN ve "Todas las empresas" más un filtro por empresa. El usuario de empresa ve su
  empresa fija y no puede cambiarla (`setActiveCompany` está bloqueado).
- El menú se adapta al rol (`superOnly`, `guestHidden` en `MENU`). Hay un grupo
  **Administración → Empresas / Usuarios** solo para SUPER_ADMIN.
- Un 401 de la API (vía `apiFetch`) devuelve al login.
- Las cachés de `localStorage` se borran cuando entra un usuario distinto en el mismo navegador
  (`claimDataCaches`).
- Se eliminó el "Modo invitado" anónimo, porque leía datos de todas las empresas sin
  autenticación. Su reemplazo seguro es el rol **LECTURA**.

**Ocultar opciones en la UI no es una medida de seguridad.** Todo lo anterior es presentación; la
seguridad está en la API.

## 8. Preview y Production

Esta sección se basa en lo auditado en Vercel el 2026-09-29.

- `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN` y `REDIS_URL`
  vienen del **mismo store** y tienen como destino **Production y
  Preview**. Por lo tanto, **ambos entornos comparten la misma base de datos**.
- El cliente `@vercel/kv` usa `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
- Antes de este cambio no había ni prefijos ni namespaces. Un login o una edición en una URL de
  Preview escribía sobre los datos reales.

**Protección implementada (en código, sin configurar nada en Vercel).** `lib/db.js` prefija cada
clave según `VERCEL_ENV`, variable que Vercel define siempre:

| Entorno | Prefijo | Efecto |
|---|---|---|
| production | ninguno | Las mismas claves `cmms:*` de siempre: no hay migración de datos |
| preview | `preview:` | Datos, usuarios, sesiones y migraciones propios. Arranca vacío |
| development (`vercel dev`) | `development:` | Ídem |
| scripts o tests locales sin `VERCEL_ENV` | `local:` | Ídem |

`KV_NAMESPACE` es opcional y fuerza el namespace. El valor `production` significa sin prefijo.

**Falla cerrado.** Con el cliente real de KV, si no hay ni `VERCEL_ENV` ni `KV_NAMESPACE`, toda
operación lanza un error: la API responde 500 y no se escribe nada. `GET /api/login` devuelve el
`entorno` incluso sin sesión, así que puede comprobarse antes del primer login. Las migraciones
se ejecutan bajo un candado (`SET NX`).

Con esto:

- Un login en Preview crea **su propio** SUPER_ADMIN (desde `AUTH_USER`/`AUTH_PASSWORD_HASH`,
  que también están en Preview) y no toca Production.
- Una cookie de sesión de Preview no es válida en Production.
- La UI muestra un aviso morado, "Entorno de pruebas", fuera de Production.
- Los scripts de mantenimiento exigen `--env=...`, y además `--confirm-production` para escribir
  en Production.
- Para probar Preview con datos realistas, `scripts/copy-production-to-preview.mjs --to=preview`
  **lee** Production y copia solo los datos de negocio a `preview:`. Nunca copia usuarios,
  sesiones ni correos de alerta.

**Recomendación de aislamiento total (manual, en Vercel).** Los prefijos separan los datos, pero
el store sigue siendo el mismo. Para un aislamiento físico se puede crear un segundo store y
conectarlo solo a Preview. Los pasos están en [`preview-production.md`](preview-production.md).

## 9. Pruebas

`npm test` ejecuta `tests/multitenant.test.js` (con `node:test`, sin dependencias nuevas) contra
los **handlers reales** de `api/*.js`, con un KV en memoria (`lib/db.js → setKvForTests`).

Cubre:

- Migración y seed.
- SUPER_ADMIN: CRUD de empresas y usuarios, visibilidad global y filtros.
- Aislamiento de lectura y escritura por empresa.
- IDOR por id; manipulación de `?empresa=` y del body; mass assignment de `empresa` e `id`.
- Escalamiento de privilegios contra `/api/admin`.
- Usuarios desactivados y eliminados; cambio de empresa con invalidación de sesiones; empresa
  desactivada; rol LECTURA.
- Cookie falsificada y sesión del esquema anterior; fuerza bruta; logout.
- Formulario público.

`tests/security.test.js` recorre los 15 escenarios de la lista de verificación de seguridad (A = MACROMED,
B = MEIDE) y la separación de entornos:

- Preview no ve ni modifica Production.
- Una sesión de Preview no sirve en Production.

## 10. Agregar una empresa nueva

Solo desde **Administración → Empresas → Nueva empresa**. No hay que tocar el código.

## 11. Riesgos residuales

Ver la tabla completa en [`SECURITY_AUDIT.md`](../SECURITY_AUDIT.md), sección "Segunda auditoría".
En resumen:

- **Store de KV compartido:** Preview y Production siguen usando físicamente el mismo store, con
  los datos separados por prefijo, hasta que se separen en Vercel.
- **Catálogo público:** el formulario de fallas expone un catálogo mínimo de equipos.
- **Sin transacciones:** KV no tiene transacciones.
- **Rate limit por IP:** el límite del formulario público es por IP.
