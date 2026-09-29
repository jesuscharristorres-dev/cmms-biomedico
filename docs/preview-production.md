# Preview y Production: separación de datos

## Situación comprobada (2026-09-29, proyecto Vercel `cmms-biomedico`)

| Variable | Store | Entornos |
|---|---|---|
| `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `REDIS_URL` | `store_iZXs0uzTeHHLwy7Q` (uno solo) | Production **y** Preview |
| `AUTH_USER`, `AUTH_PASSWORD_HASH` | — | Production y Preview |
| `RESEND_API_KEY` | — | Production y Preview |
| `CAPACITACIONES_SHEETS` | — | **Solo Production** |

**Conclusión:** Preview y Production comparten la misma base de datos. Hasta este cambio no
había ningún prefijo. Cualquier login, alta o edición hecha en una URL de Preview modificaba los
datos reales.

⚠️ **Ya ocurrió al menos una vez.** El 2026-09-29 se desplegó en Preview el commit `ae58656`, la
primera versión multiempresa, sin namespaces. Si alguien inició sesión en esa URL, las
migraciones y los cambios quedaron en los datos de Production:

- se crearon `cmms:empresas`, `cmms:usuarios` y `cmms:schema_migrations`;
- se creó el SUPER_ADMIN desde `AUTH_USER`;
- quedaron guardados los usuarios o empresas de prueba que se hayan creado.

Ninguna migración borra ni modifica equipos, personal ni reportes. Aun así, después del deploy a
Production conviene revisar **Administración → Usuarios** y **Empresas**, y eliminar o desactivar
lo que haya sido de prueba.

## Protección ya implementada en código (no requiere configurar nada)

`lib/db.js` prefija todas las claves según `VERCEL_ENV`, que Vercel define siempre:

- **Production:** sin prefijo. Son las claves de siempre, así que los datos existentes siguen
  intactos y visibles.
- **Preview:** `preview:cmms:*`. Tiene sus propios usuarios, empresas, sesiones y migraciones, y
  arranca vacío.
- **Aviso visible:** la app muestra un aviso morado, "Entorno de pruebas (preview)".

Es decir: **Preview ya no puede contaminar Production**, aunque compartan el store.

### Probar Preview con datos reales (opcional)

Este script **solo lee** Production y copia a `preview:` los datos de negocio: empresas,
equipos, personal, reportes y documentos. No copia usuarios, sesiones ni correos de alerta.

```bash
vercel link                     # una vez
vercel env pull .env.local      # trae KV_REST_API_URL / KV_REST_API_TOKEN
node --env-file=.env.local scripts/copy-production-to-preview.mjs --to=preview
# si Preview ya tenía datos y quieres reemplazarlos:
node --env-file=.env.local scripts/copy-production-to-preview.mjs --to=preview --overwrite
```

En Preview entras con el mismo `AUTH_USER` y la misma contraseña: la migración 002 crea allí un
SUPER_ADMIN propio.

## Aislamiento físico total (recomendado, manual en Vercel)

Los prefijos separan los datos lógicamente, pero el store y el token siguen siendo compartidos.
Un bug o un script mal usado aún podría leer claves de Production desde Preview. Para separarlos
físicamente:

1. **Crea el store de Preview.** En Vercel → **Storage** → **Create Database**, elige el mismo
   proveedor que el actual (Upstash for Redis / KV). Ponle un nombre como `cmms-preview`.
2. **Quita Preview del store actual.** Abre el store actual → **Projects** → conexión con
   `cmms-biomedico` → editar entornos → deja **solo Production**. Así desaparecen de Preview las
   variables `KV_*`/`REDIS_URL` del store real.
3. **Conecta el store nuevo solo a Preview.** Abre `cmms-preview` → **Connect Project** →
   `cmms-biomedico` → marca **solo Preview** (y Development si usas `vercel dev`). Usa el prefijo
   de variables por defecto (**KV**) para que se generen `KV_REST_API_URL` y `KV_REST_API_TOKEN`,
   los nombres que lee `@vercel/kv`. No hay que cambiar código.
4. **Redespliega** el deployment de Preview: las variables nuevas solo se aplican a deployments
   nuevos.
5. **Verifica.** En **Settings → Environment Variables**, `KV_REST_API_URL` debe aparecer dos
   veces: una con destino Production (store actual) y otra con destino Preview (`cmms-preview`).

Con stores separados, el prefijo `preview:` se sigue aplicando dentro del store de Preview. Es
inofensivo y deja una segunda barrera.

## Variables de entorno

| Variable | ¿Obligatoria? | Production | Preview | Nota |
|---|---|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Sí | Ya existe | Ya existe (compartida; ver "Aislamiento físico") | Las crea Vercel al conectar el store |
| `AUTH_USER`, `AUTH_PASSWORD_HASH` | Sí (o la pareja `SUPERADMIN_*`) | Ya existe | Ya existe | Crean el SUPER_ADMIN inicial de **cada** entorno |
| `SUPERADMIN_EMAIL` | Recomendada | Agregar | Opcional | Tu email real; así el SUPER_ADMIN tiene email desde el inicio |
| `SUPERADMIN_NOMBRE` | Opcional | Agregar | Opcional | Nombre visible |
| `KV_NAMESPACE` | **No agregar** | — | — | Solo para casos especiales: el namespace se deduce de `VERCEL_ENV`. En Production **no** debe tener otro valor que `production`, o la app dejaría de ver los datos reales |
| `CAPACITACIONES_SHEETS` | Para capacitaciones | Ya existe | No existe | Si quieres sincronizar capacitaciones en Preview, agrégala también ahí |
| `RESEND_API_KEY` | Para correos | Ya existe | Ya existe | — |

## Pasos después del deploy a Production

1. **Primer login.** Entra con tu `AUTH_USER` y tu contraseña de siempre. Las migraciones se
   aplican solas y quedas como SUPER_ADMIN. Las sesiones anteriores ya no son válidas, así que
   todos deben volver a entrar.
2. **Revisa los usuarios.** En **Administración → Usuarios**, confirma que solo existan usuarios
   legítimos (ver el aviso sobre el Preview `ae58656`). Edita tu usuario para ponerle nombre y
   email si no configuraste `SUPERADMIN_EMAIL`/`SUPERADMIN_NOMBRE`.
3. **Completa las empresas.** En **Administración → Empresas**, completa NIT y datos de contacto
   de las 5 empresas. Revisa también la sección **Registros existentes sin empresa asignada**.
4. **Crea usuarios.** Crea al menos un usuario por empresa, con rol `EMPRESA` o `LECTURA`.
5. **Prueba el aislamiento.** Inicia sesión con un usuario de empresa y confirma que solo ve su
   empresa.
