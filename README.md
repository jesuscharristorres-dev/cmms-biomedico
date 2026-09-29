# CMMS Biomédico multiempresa

Sistema de gestión de mantenimiento (CMMS) para equipos biomédicos: inventario y hojas de vida,
mantenimientos preventivos y correctivos, calibraciones, reportes de falla, tecnovigilancia,
personal, capacitaciones y formatos de limpieza. Una sola aplicación atiende a **varias empresas
aisladas entre sí**.

- **Frontend:** React 19 + Vite + Tailwind (`src/`)
- **Backend:** funciones serverless de Vercel (`api/`) y helpers compartidos (`lib/`)
- **Base de datos:** Vercel KV (Upstash Redis)

La documentación técnica detallada está en [`docs/multi-tenant.md`](docs/multi-tenant.md).

## 1. Arquitectura multiempresa

```
                 SUPER_ADMIN (acceso global)
                           │
   ┌──────────┬────────────┼────────────┬──────────────┐
MACROMED    MEIDE     NP MEDICAL    DIAGNOSTIK    AUNAR SALUD   (+ las que se creen)
   │          │            │            │              │
usuarios   usuarios    usuarios     usuarios       usuarios
```

- Una sola app, una sola base de datos y los mismos componentes para todas las empresas.
- Cada registro de negocio (equipo, hoja de vida, reporte de falla, documento…) pertenece a una
  empresa por su campo `empresa`, que es el `empresa_id`.
- **El servidor decide qué empresa ve cada usuario**, a partir de su sesión. Nunca se usa un
  `empresa_id` enviado por el navegador.

## 2. Roles

| Rol | Empresa | Puede |
|---|---|---|
| `SUPER_ADMIN` | ninguna (`empresa_id = null`) | Ver y gestionar todas las empresas, filtrar por empresa, administrar empresas y usuarios, asignar registros heredados, sincronizar capacitaciones y editar documentos globales |
| `EMPRESA` | obligatoria | Ver y gestionar **solo** la información de su empresa |
| `LECTURA` | obligatoria | Consultar **solo** la información de su empresa, sin modificar nada. Reemplaza al antiguo "Modo invitado" |

## 3. Cómo crear empresas

1. Inicia sesión como SUPER_ADMIN.
2. Ve a **Administración → Empresas → Nueva empresa**.
3. Completa los campos:
   - Obligatorios: nombre y al menos una sede.
   - Opcionales: NIT, dirección, teléfono, email, color y estado.

El identificador interno se genera a partir del nombre y no cambia aunque luego se renombre la
empresa. Las empresas no se borran: se **desactivan**, y mientras estén inactivas sus usuarios no
pueden entrar.

Las 5 empresas iniciales (MACROMED, MEIDE, NP MEDICAL, DIAGNOSTIK y AUNAR SALUD) son las que el
sistema ya tenía. Se crean automáticamente con su misma clave, así que **todos los datos
existentes quedan asociados sin modificarse**. Sus datos fiscales y de contacto se completan desde
esa misma pantalla. Los valores iniciales están en `lib/empresas.js → EMPRESAS_SEED`.

## 4. Cómo crear usuarios

1. Ve a **Administración → Usuarios → Nuevo usuario**.
2. Completa nombre, email, contraseña (mínimo 8 caracteres), rol, empresa y estado.
3. La empresa es obligatoria para los roles `EMPRESA` y `LECTURA`.

Desde la tabla de usuarios puedes **editar**, **activar o desactivar**, **cambiar la empresa**,
**cambiar el rol**, **restablecer la contraseña** o **eliminar**. Cualquier cambio de empresa,
rol, estado o contraseña cierra de inmediato las sesiones abiertas de ese usuario. Un usuario
movido de empresa deja de ver la anterior en su siguiente petición.

## 5. Cómo funciona el aislamiento

```
AUTENTICACIÓN → USUARIO (activo) → ROL → EMPRESA ASIGNADA (activa) → AUTORIZACIÓN → CONSULTA FILTRADA
```

- Todas las APIs de datos exigen sesión. Las lecturas se recortan en el servidor a la empresa del
  usuario.
- Pedir otra empresa por `?empresa=`, por el body o por el id de un recurso ajeno responde
  **403**. Esto protege contra IDOR y mass assignment.
- Un usuario de empresa no puede mover registros a otra empresa ni cambiar ids.
- Ocultar menús en React es solo presentación. La seguridad está en `lib/auth.js` y
  `lib/tenancy.js`.
- Único acceso público: el formulario **Reportar falla**. Lee un catálogo mínimo y crea reportes
  validados en el servidor.

## 6. Migraciones

La base de datos es Vercel KV, así que las migraciones son funciones versionadas en
`lib/migrations.js`:

- `001_empresas`: crea las empresas.
- `002_super_admin`: crea el SUPER_ADMIN.
- `003_auditoria_sin_empresa`: lista los registros sin empresa válida, **sin modificar datos**.

**Se aplican solas** en la primera petición tras el despliegue. Para ejecutarlas o revertirlas a
mano:

```bash
# credenciales de KV en .env.kv.local (ver docs/preview-production.md → "Credenciales para scripts")
node --env-file=.env.kv.local scripts/migrate.mjs status --env=production
node --env-file=.env.kv.local scripts/migrate.mjs up --env=preview
node --env-file=.env.kv.local scripts/migrate.mjs audit --env=production --confirm-production   # registros sin empresa
node --env-file=.env.kv.local scripts/migrate.mjs down <id> --env=preview                      # revertir una migración
```

Los registros heredados cuya empresa no se puede determinar **no se borran ni se asignan al azar**.
Aparecen en **Administración → Empresas → Registros existentes sin empresa asignada**, donde el
SUPER_ADMIN los asigna.

## 7. Cómo crear el SUPER_ADMIN

Hay dos opciones:

**A. Automática por variables de entorno (recomendada)**

- Si ya tenías configuradas `AUTH_USER` y `AUTH_PASSWORD_HASH`, no hay que hacer nada. En el primer
  inicio de sesión tras desplegar, ese mismo usuario y contraseña quedan como SUPER_ADMIN.
- Para un SUPER_ADMIN nuevo, define `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_HASH` y (opcional)
  `SUPERADMIN_NOMBRE`. El hash se genera así:
  ```bash
  node scripts/hash-password.mjs "contraseña-segura"
  ```

**B. Por script**

```bash
node --env-file=.env.kv.local scripts/create-super-admin.mjs admin@tuempresa.com "Nombre Apellido" --env=production --confirm-production
```

El script pide la contraseña por consola, o la toma de `SUPERADMIN_PASSWORD`.

Ninguna contraseña se escribe en el código: solo se guardan hashes scrypt con salt.

## 8. Variables de entorno (Vercel → Project Settings → Environment Variables)

| Variable | Obligatoria | Uso |
|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Sí | Vercel KV (se crean al conectar KV al proyecto) |
| `KV_NAMESPACE` | **No** | Solo para casos especiales. El namespace de datos se deduce de `VERCEL_ENV` (ver sección 11) |
| `AUTH_USER` + `AUTH_PASSWORD_HASH` | Una de las dos parejas | Administrador histórico, migrado a SUPER_ADMIN |
| `SUPERADMIN_EMAIL` + `SUPERADMIN_PASSWORD_HASH` | Una de las dos parejas | SUPER_ADMIN inicial (alternativa) |
| `SUPERADMIN_NOMBRE` | No | Nombre visible del SUPER_ADMIN inicial |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Para correos | Envío de alertas por email |
| `CAPACITACIONES_SHEETS` | Para capacitaciones | JSON con las hojas de Google Sheets |

## 9. Tests

```bash
npm test
```

Ejecuta `tests/multitenant.test.js` y `tests/security.test.js` (`node:test`) contra los handlers
reales de `api/`, con un KV en memoria. `security.test.js` recorre los 15 escenarios de la lista
de verificación de seguridad y la separación entre Preview y Production. Entre ambos cubren:

- SUPER_ADMIN con visibilidad global y CRUD de empresas y usuarios.
- Usuarios de las 5 empresas aislados entre sí.
- IDOR, manipulación de `empresa_id`, mass assignment y escalamiento de privilegios.
- Usuarios desactivados o eliminados, cambio de empresa, rol de solo lectura.
- Fuerza bruta, logout y formulario público.

## 10. Ejecutar el proyecto

```bash
npm install
npm run dev        # solo frontend (Vite); las funciones de api/ no corren aquí
vercel dev         # frontend + api/ con las variables de entorno de Vercel
npm run lint
npm test
npm run build
```

Despliegue: push a la rama conectada en Vercel. El proyecto usa 12 funciones serverless, dentro
del límite del plan Hobby.

## 11. Preview vs Production

En este proyecto, Preview y Production **comparten el mismo store de Vercel KV** (comprobado en
la configuración de Vercel). Para que las pruebas en Preview no contaminen los datos reales:

- `lib/db.js` separa las claves por entorno. Production usa las claves de siempre, sin prefijo;
  Preview usa `preview:`.
- La app muestra un aviso "Entorno de pruebas" fuera de Production.
- Los scripts exigen `--env=...`.

Los detalles, cómo copiar datos reales a Preview y cómo separar físicamente los stores en Vercel
están en [`docs/preview-production.md`](docs/preview-production.md).
