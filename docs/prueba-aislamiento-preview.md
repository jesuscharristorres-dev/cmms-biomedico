# Prueba de aislamiento multiempresa en Preview

Prueba automatizada de extremo a extremo contra un deployment **real** de Preview. Todo se hace por
HTTP, usando solo la API, igual que lo haría un atacante con DevTools, curl o Postman.

- **Código:** `scripts/isolation-suite.js`.
- **Runners:** `scripts/preview-isolation-test.mjs` (Node) y la consola del navegador.
- **Cobertura en `npm test`:** la misma suite corre en `tests/isolation-suite.test.js`.

**Solo Preview.** Lo primero que hace la suite es `GET /api/login`. Si el deployment responde
`"entorno":"production"`, **aborta sin iniciar sesión ni tocar nada**.

## Qué reutiliza y qué crea

| Elemento | Detalle |
|---|---|
| Empresas | Reutiliza las existentes. **Empresa 1 = MACROMED**, **Empresa 2 = MEIDE** (o las dos primeras activas si faltara alguna). No crea, edita ni elimina empresas |
| SUPER_ADMIN | Usa la cuenta existente **sin modificarla**. Su contraseña se pide al ejecutar y no se guarda |
| Usuario de prueba 1 | `PRUEBA Usuario Empresa 1` · **`prueba.empresa1@cmms-prueba.local`** · rol `EMPRESA` · empresa MACROMED |
| Usuario de prueba 2 | `PRUEBA Usuario Empresa 2` · **`prueba.empresa2@cmms-prueba.local`** · rol `EMPRESA` · empresa MEIDE |
| Contraseña de ambos usuarios de prueba | **No está en el repositorio**, que es público. Cada ejecución genera una aleatoria (`Prueba-<24 hex>`) y la muestra al final, o se fija con `TEST_USER_PASSWORD`. Cada ejecución la restablece |
| Equipos | `prueba-aislamiento-equipo-emp1` (MACROMED) y `prueba-aislamiento-equipo-emp2` (MEIDE). Los crea cada usuario con su propia sesión. Marca `PRUEBA`, observación `DATO PRIVADO DE <empresa>` |
| Hojas de vida | `prueba-aislamiento-personal-emp1` y `prueba-aislamiento-personal-emp2` |
| Reporte de falla | `prueba-aislamiento-reporte-emp2`, sobre el equipo de MEIDE, creado desde el formulario público |

**Es idempotente.** Si los usuarios ya existen, los reactiva, les restablece la contraseña de
prueba y confirma rol y empresa. Si los datos ya existen, los reutiliza. Nunca toca un usuario
que sea SUPER_ADMIN.

## Qué verifica (108 comprobaciones, con código HTTP y contenido)

- **Lectura propia.** Cada usuario lee sus equipos, personal, reportes, documentos y
  capacitaciones.
- **Sin fugas.** Ninguna respuesta contiene registros de la otra empresa, ni siquiera el texto
  `DATO PRIVADO DE <otra>`.
- **Manipulación de `empresa_id`/`empresa`:**
  - `?empresa=<otra>` en 4 endpoints → 403, sin datos.
  - Crear un equipo con `empresa=<otra>` → 403.
  - `empresaKey=<otra>` → 403.
  - Mover su propio equipo a otra empresa → 403.
  - Enviar `role` o `empresa_id` en el login no cambia nada.
- **Manipulación de IDs:**
  - `PATCH`/`DELETE` de equipos, hojas de vida y reportes ajenos → **404**, con un cuerpo
    **idéntico** al de un id inexistente, así que no se puede deducir que existen.
  - Crear un equipo con el id de uno ajeno → 409, sin sobrescribirlo.
- **Escalada de privilegios.** Hacerse SUPER_ADMIN, cambiarse de empresa, crear un SUPER_ADMIN,
  listar usuarios, desactivar la otra empresa, ver registros sin empresa, sincronizar
  capacitaciones o usar `send-email` → 403. Al final, el usuario sigue siendo `EMPRESA` de su
  empresa.
- **Endpoints directos sin sesión:** 401 en los 10 endpoints de datos o administración. El
  catálogo público no incluye datos sensibles.
- **SUPER_ADMIN:**
  - Lista las empresas y los usuarios.
  - Ve los equipos de las dos empresas.
  - Desactiva un usuario: su sesión abierta deja de funcionar (401) y no puede volver a entrar
    (403).
  - Lo reactiva y el usuario vuelve a entrar.
- **Integridad final.** Nada fue modificado por la otra empresa, no quedó guardado ningún registro
  "intruso" y no se creó ningún SUPER_ADMIN.

## Cómo ejecutarla contra el Preview

El Preview está protegido con **Vercel Authentication**. Hay dos formas de ejecutarla.

### Opción A: consola del navegador (no requiere configurar nada)

1. Abre el deployment de Preview más reciente de la rama `claude/wonderful-wright-h0kmax` con tu
   sesión de Vercel.
2. **Opcional:** abre `/api/login` y confirma que responde `"entorno":"preview"`. La suite lo
   comprueba igualmente.
3. Abre DevTools → Console. Pega el contenido completo de `scripts/isolation-suite.js` y pulsa
   Enter.
4. Ejecuta `await cmmsIsolationSuite.runInBrowser()`. Te pedirá el usuario y la contraseña del
   SUPER_ADMIN.
5. Al terminar verás una tabla con las 108 comprobaciones, y la última línea mostrará el
   resultado. Tu sesión en esa pestaña queda cerrada.

### Opción B: Node, desde tu computador

1. Crea un secreto en Vercel → Settings → Deployment Protection → **Protection Bypass for
   Automation**. No es una variable de entorno.
2. Ejecuta:

```bash
CMMS_BASE_URL=https://<deployment-de-preview>.vercel.app \
CMMS_ADMIN_USER=<tu AUTH_USER> \
VERCEL_PROTECTION_BYPASS=<secreto> \
node scripts/preview-isolation-test.mjs --report=informe-aislamiento.json
```

La contraseña del SUPER_ADMIN se pide por consola. El código de salida es 0 si todo pasa, 2 si
alguna comprobación falla y 1 si se aborta.

### Limpieza

Para borrar los usuarios, equipos y el reporte de prueba al terminar, usa `--cleanup` (Node) o
`runInBrowser({ cleanup: true })`. La API no permite borrar hojas de vida, así que esas dos quedan
en Preview. Todo vive solo en el namespace `preview:` y Production no se ve afectado.
