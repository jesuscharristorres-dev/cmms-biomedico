# Preview y Production: separación de datos

## 1. Situación comprobada (2026-09-29, proyecto Vercel `cmms-biomedico`)

| Variable | Origen | Entornos |
|---|---|---|
| `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `REDIS_URL` | Un único store: `store_iZXs0uzTeHHLwy7Q` | Production **y** Preview (no Development) |
| `AUTH_USER`, `AUTH_PASSWORD_HASH` | Manual | Production y Preview |
| `RESEND_API_KEY` | Manual | Production y Preview |
| `CAPACITACIONES_SHEETS` | Manual | Solo Production |
| `KV_NAMESPACE`, `SUPERADMIN_*` | — | No existen |

**Preview y Production comparten físicamente la misma base de datos.** El código separa los datos
lógicamente (sección 2).

Protección de deployments en Vercel: **Vercel Authentication (SSO) activa para todos los
deployments salvo los dominios personalizados.** Solo los miembros del equipo con sesión en
Vercel pueden abrir una URL de Preview.

### El Preview sin protección (`ae58656`)

- **Qué es:** el deployment `dpl_BQF6fMXc6CnNKGjGNyuDBLh5VNsQ`
  (`cmms-biomedico-z6mtltgqx-cmms2.vercel.app`) es la primera versión multiempresa, **sin
  namespaces**. Si se usa, escribe en las claves de Production.
- **Qué pasó:** según los logs de ejecución de Vercel, revisados el 2026-09-29, **ese deployment no
  recibió ninguna petición** a sus funciones. Tampoco el de `1eee7c3`. Los logs cubren todo el
  periodo, porque el deployment de Production `43b2136`, creado antes que ambos Previews, sí
  registra peticiones.
- **Consecuencia:** no se ejecutaron migraciones ni se escribió nada en Production desde Preview.
- **Riesgo que queda:** el deployment **sigue vivo**. Si alguien abre esa URL exacta e inicia
  sesión, escribiría en Production. **Elimínalo** (sección 4).

## 2. Protección implementada en código

`lib/db.js` prefija cada clave de KV según el entorno:

| Entorno (`VERCEL_ENV`) | Prefijo | Qué ve |
|---|---|---|
| production | ninguno | Las mismas claves `cmms:*` de siempre, con los datos reales intactos |
| preview | `preview:` | Solo sus propios datos, usuarios, sesiones y migraciones. Arranca vacío |
| development (`vercel dev`) | `development:` | Ídem |

- **Falla cerrado.** Si en un deployment no se puede determinar el entorno (sin `VERCEL_ENV` ni
  `KV_NAMESPACE`), toda operación de KV lanza un error: la API responde 500 y **no se escribe
  nada**. Nunca se cae en silencio a un namespace equivocado.
- **No hay cruce en ningún sentido.**
  - Una clave de Preview siempre empieza por `preview:`.
  - Ninguna clave de Production empieza así: todas son `cmms:*`, `session:*`, `user_sessions:*`,
    `login_fail:*` o `rate:*`.
  - Production no puede leer ni escribir datos de Preview, y Preview no puede leer ni escribir
    datos de Production.
- **Sesiones separadas.** Una cookie de Preview no es válida en Production. Además, las cookies son
  por dominio.
- **Comprobable antes del login.** `GET /api/login` devuelve `"entorno"` incluso sin sesión, y la
  app muestra un aviso morado "Entorno de pruebas" fuera de Production.
- **Migraciones con candado.** Dos instancias arrancando a la vez no pueden crear dos SUPER_ADMIN.
- **Scripts explícitos.** Exigen `--env=...`, y además `--confirm-production` para escribir en
  Production.

## 3. Credenciales para scripts

Las variables de KV son de tipo **sensitive** y solo tienen destino Production y Preview. Por eso
`vercel env pull` **no** las descarga. Para usar los scripts desde tu computador:

1. En Vercel → **Storage** → tu base de datos, busca la pestaña **.env.local** / **Quickstart**
   (pulsa "Show secret").
2. Copia `KV_REST_API_URL` y `KV_REST_API_TOKEN` a un archivo `.env.kv.local` en la raíz del
   proyecto. `.gitignore` ya ignora `.env*`, así que nunca se sube a git.
3. Ejecuta, por ejemplo: `node --env-file=.env.kv.local scripts/migrate.mjs status --env=preview`.

Los scripts son opcionales: la app aplica las migraciones sola.

## 4. Cambios manuales en Vercel

| # | Acción | ¿Obligatoria? | Motivo |
|---|---|---|---|
| 1 | **Eliminar el deployment `dpl_BQF6fMXc6CnNKGjGNyuDBLh5VNsQ`** (Deployments → `cmms-biomedico-z6mtltgqx…` → ⋯ → Delete) | **Sí, antes de probar** | Es la única vía que queda para escribir en Production desde Preview |
| 2 | **No crear `KV_NAMESPACE`** en ningún entorno | Sí | El namespace se deduce de `VERCEL_ENV`. En Production, cualquier valor distinto de `production` ocultaría los datos reales |
| 3 | No desactivar Settings → Environment Variables → "Automatically expose System Environment Variables" | Sí | Aporta `VERCEL_ENV`. Si se desactiva, la app falla cerrada (500) en vez de mezclar datos |
| 4 | `SUPERADMIN_EMAIL` (tu correo) y `SUPERADMIN_NOMBRE` en **Production** | Recomendada | Solo se leen al crear el SUPER_ADMIN, en el primer login |
| 5 | Store separado para Preview (sección 5) | Opcional | Aislamiento **físico** además del lógico |

## 5. Aislamiento físico total (opcional)

1. **Crea el store de Preview.** Vercel → **Storage** → **Create Database**, con el mismo
   proveedor que el actual (Upstash for Redis / KV). Llámalo, por ejemplo, `cmms-preview`.
2. **Deja el store actual solo en Production.** En el store actual → **Projects** → conexión con
   `cmms-biomedico` → entornos: **solo Production**.
3. **Conecta el store nuevo solo a Preview.** En `cmms-preview` → **Connect Project** →
   `cmms-biomedico` → **solo Preview**, con el prefijo de variables por defecto (**KV**). Así se
   generan `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
4. **Redespliega** la rama de Preview.
5. **Verifica** en Settings → Environment Variables que `KV_REST_API_URL` aparece dos veces:
   Production (store actual) y Preview (store nuevo).

## 6. Procedimiento para probar Preview

1. Elimina el deployment `dpl_BQF6fMXc6CnNKGjGNyuDBLh5VNsQ` (sección 4, acción 1).
2. Usa **solo** el deployment más reciente de la rama `claude/wonderful-wright-h0kmax`, desde
   Vercel → Deployments. Comprueba que su commit es el último de la rama.
3. **Antes de iniciar sesión**, abre `https://<url-del-preview>/api/login`. Debe responder
   exactamente `{"authenticated":false,"entorno":"preview"}`.
   - Si dice `"production"`, o responde 500 o cualquier otra cosa: **no inicies sesión** y avisa.
4. Abre la URL del Preview e inicia sesión con tu `AUTH_USER` y tu contraseña. Debe aparecer arriba
   la franja morada "Entorno de pruebas (preview)". El Preview arranca vacío: tendrá las 5
   empresas sin equipos.
5. Prueba libremente: crear empresas, usuarios, equipos, desactivar, cambiar de empresa, etc. Todo
   queda en `preview:*`.
6. **Opcional:** para probar con datos reales copiados (solo lectura sobre Production), ejecuta
   `node --env-file=.env.kv.local scripts/copy-production-to-preview.mjs --to=preview`.

## 7. Procedimiento para pasar a Production

1. **Opcional:** agrega `SUPERADMIN_EMAIL` y `SUPERADMIN_NOMBRE` con destino Production.
2. Fusiona la rama en `main`. Vercel despliega Production.
3. Abre `https://cmms-biomedico.vercel.app/api/login`. Debe responder
   `{"authenticated":false,"entorno":"production"}`.
4. Inicia sesión con tu `AUTH_USER` y tu contraseña de siempre. Las migraciones crean las 5
   empresas y tu SUPER_ADMIN. Los equipos y demás datos existentes deben verse igual que antes.
   Todos los usuarios deberán iniciar sesión de nuevo.
5. **Revisa lo creado:**
   - Administración → Empresas: completa NIT y contacto, y revisa "Registros sin empresa".
   - Administración → Usuarios: debe existir solo tu SUPER_ADMIN.
6. **Crea los usuarios de las empresas** y verifica, entrando con uno de ellos, que solo ve su
   empresa.
