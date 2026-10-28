# Despliegue en el servidor interno (fuera de Vercel)

Guía paso a paso para la persona con acceso al servidor interno de la empresa. Sigue el "camino
rápido" del plan de migración: PostgreSQL reemplaza a Vercel KV sin cambiar ninguna lógica de
negocio. El servidor queda accesible **solo por red interna/VPN**, nunca expuesto a internet.

Nada de este documento se ejecutó contra el servidor real — se validó código por código (ver
`lib/db-postgres.js`, `server.js`, `scripts/migrar-kv-a-postgres.mjs` y sus pruebas en `tests/`),
pero la ejecución real en la máquina de destino la hace quien tenga acceso a ella.

## 1. Requisitos previos

| Requisito | Detalle |
|---|---|
| Acceso a la máquina | Consola o SSH, con permisos para instalar paquetes |
| Node.js | 20 LTS o más nuevo |
| PostgreSQL | 14 o más nuevo (se probó contra PostgreSQL 17) |
| Nginx o Caddy | Como proxy reverso con TLS interno |
| Puerto | Uno libre para el proceso Node (por defecto 3000, interno — nunca expuesto directamente) |
| Copia del código | Este repositorio, en la rama que se vaya a desplegar |

## 2. Instalar Node.js y PostgreSQL

En Debian/Ubuntu (ajustar si es otra distribución):

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib
```

## 3. Crear la base de datos

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE cmms;
CREATE USER cmms_app WITH PASSWORD 'CAMBIA_ESTA_CLAVE';
GRANT ALL PRIVILEGES ON DATABASE cmms TO cmms_app;
SQL
```

Con eso ya queda `DATABASE_URL`:

```
DATABASE_URL=postgresql://cmms_app:CAMBIA_ESTA_CLAVE@localhost:5432/cmms
```

**No hace falta crear tablas a mano.** `lib/db-postgres.js` crea `kv_store` y `kv_sets` solas en
la primera operación real (`CREATE TABLE IF NOT EXISTS`, ver `tests/db-postgres.test.js`).

## 4. Variables de entorno

Crea un archivo `.env.produccion` en el servidor (no se sube a git — ya está en `.gitignore`
como `.env*`) con:

| Variable | Obligatoria | Qué hace |
|---|---|---|
| `DATABASE_URL` | **Sí** | Activa el backend de PostgreSQL en `lib/db.js` (sin ella, el código intentaría usar Vercel KV, que ya no existe) |
| `KV_NAMESPACE=production` | **Sí** | **Crítico.** `lib/db.js` falla cerrado (error 500 en toda la app) si no puede determinar el entorno — en Vercel eso lo daba `VERCEL_ENV`, que aquí no existe. Sin esta variable, el servidor no funciona (a propósito: así nunca mezcla datos por accidente) |
| `AUTH_USER` + `AUTH_PASSWORD_HASH`, o `SUPERADMIN_EMAIL` + `SUPERADMIN_PASSWORD_HASH` (+ `SUPERADMIN_NOMBRE` opcional) | Sí, al menos una de las dos formas | Solo se usa si Postgres arranca **vacío**, para crear el primer SUPER_ADMIN. Si ya migraste los datos reales (sección 7), esto no hace nada porque el SUPER_ADMIN ya existe |
| `RESEND_API_KEY` | No | Envío de alertas por correo (`api/send-email.js`); sin ella, ese endpoint responde error pero el resto de la app funciona igual |
| `PORT` | No (3000 por defecto) | Puerto donde escucha `server.js` — el que debe apuntar Nginx/Caddy |

Genera el hash de una contraseña con el script que ya tiene el proyecto:

```bash
node scripts/hash-password.mjs 'la-contraseña-elegida'
```

## 5. Preparar el código

```bash
git clone <url-del-repo> cmms-biomedico   # o copiar el código ya clonado
cd cmms-biomedico
npm ci --omit=dev        # instala igual que package-lock.json, sin dependencias de desarrollo
npm run build             # genera dist/ — el frontend que server.js sirve como estático
```

## 6. Primer arranque de prueba (antes de pm2/systemd)

```bash
node --env-file=.env.produccion server.js
# [server] CMMS Biomédico escuchando en http://localhost:3000
```

En otra terminal de la misma máquina:

```bash
curl -s http://localhost:3000/api/login
# {"authenticated":false,"entorno":"production"}
```

Si responde eso, el backend y la base de datos ya están conectados correctamente. `Ctrl+C` para
detenerlo y seguir con el proceso administrado.

## 7. Migrar los datos reales (cuando sea el momento del corte)

Antes del corte real, **practica primero sobre Preview**, que no toca nada real:

```bash
# Credenciales de Vercel KV (ver docs/preview-production.md, sección 3) en .env.kv.local
DATABASE_URL=postgresql://cmms_app:CAMBIA_ESTA_CLAVE@localhost:5432/cmms \
  node --env-file=.env.kv.local scripts/migrar-kv-a-postgres.mjs --from=preview --dry-run

# si se ve bien, ahora sí escribe en Postgres (en la base de prueba, no en la de producción)
DATABASE_URL=postgresql://cmms_app:CAMBIA_ESTA_CLAVE@localhost:5432/cmms_prueba \
  node --env-file=.env.kv.local scripts/migrar-kv-a-postgres.mjs --from=preview
```

El día del corte real, con la ventana de mantenimiento ya avisada (ver la sección de riesgos del
plan de migración):

```bash
DATABASE_URL=postgresql://cmms_app:CAMBIA_ESTA_CLAVE@localhost:5432/cmms \
  node --env-file=.env.kv.local scripts/migrar-kv-a-postgres.mjs --from=production --confirm-production
```

El script **nunca escribe en Vercel KV** (solo lee); al final compara, clave por clave, que lo
que quedó en PostgreSQL coincide exactamente con lo que había en Vercel KV, y se detiene con
error si algo no coincide — no sigas con el corte hasta que todas las claves muestren ✔.

## 8. Dejarlo corriendo como proceso permanente (pm2)

```bash
sudo npm install -g pm2
pm2 start "node --env-file=.env.produccion server.js" --name cmms-biomedico
pm2 save
pm2 startup   # sigue las instrucciones que imprime, para que arranque solo si el servidor reinicia
```

Comandos útiles: `pm2 logs cmms-biomedico`, `pm2 restart cmms-biomedico` (tras un `git pull` +
`npm run build`).

**Alternativa con systemd**, si se prefiere no depender de pm2:

```ini
# /etc/systemd/system/cmms-biomedico.service
[Unit]
Description=CMMS Biomédico
After=network.target postgresql.service

[Service]
WorkingDirectory=/ruta/a/cmms-biomedico
EnvironmentFile=/ruta/a/cmms-biomedico/.env.produccion
ExecStart=/usr/bin/node server.js
Restart=on-failure
User=cmms

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now cmms-biomedico
```

## 9. Nginx como proxy reverso, con TLS interno

Certificado autofirmado (suficiente para acceso solo por VPN/red interna; si la empresa tiene
una autoridad certificadora interna, usa esa en su lugar):

```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/cmms.key -out /etc/nginx/ssl/cmms.crt \
  -subj "/CN=cmms.interno.empresa"
```

```nginx
# /etc/nginx/sites-available/cmms-biomedico
server {
  listen 443 ssl;
  server_name cmms.interno.empresa;

  ssl_certificate     /etc/nginx/ssl/cmms.crt;
  ssl_certificate_key /etc/nginx/ssl/cmms.key;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    # Imprescindibles: lib/auth.js los usa para la cookie "Secure" de sesión y para el
    # límite de intentos de login por IP. Sin ellos, la app ve todas las peticiones como
    # HTTP y como si vinieran de la IP de Nginx, no la del usuario real.
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}

server {
  listen 80;
  server_name cmms.interno.empresa;
  return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cmms-biomedico /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 10. Respaldos automáticos (pg_dump)

Con Vercel, los respaldos de la base de datos los garantizaba el proveedor. En el servidor
propio, eso pasa a ser responsabilidad de la empresa — por eso el proyecto trae
`scripts/respaldo-postgres.sh`, probado de punta a punta (generar el respaldo, verificar que es
válido, y restaurarlo en una base nueva y confirmar que los datos quedan idénticos) antes de
entregar esta guía.

```bash
DATABASE_URL=postgresql://cmms_app:CAMBIA_ESTA_CLAVE@localhost:5432/cmms \
  ./scripts/respaldo-postgres.sh
```

Por defecto guarda en `/var/backups/cmms-biomedico/` y borra lo que tenga más de 14 días
(ajustable con `BACKUP_DIR` y `RETENTION_DAYS`). Si `pg_dump` falla o el archivo generado no es
un dump válido, el script termina con error y **no** borra nada — así cron/systemd lo reportan
como fallo en vez de quedar en silencio.

**Con cron** (más simple):

```bash
# crontab -e del usuario que corre la app (p. ej. `cmms`) — todos los días a las 2:30 a.m.
30 2 * * * DATABASE_URL=postgresql://cmms_app:CAMBIA_ESTA_CLAVE@localhost:5432/cmms /ruta/a/cmms-biomedico/scripts/respaldo-postgres.sh >> /var/log/cmms-respaldo.log 2>&1
```

**Con systemd timer** (si ya se eligió systemd para la app en el paso 8):

```ini
# /etc/systemd/system/cmms-respaldo.service
[Unit]
Description=Respaldo de PostgreSQL del CMMS Biomédico

[Service]
Type=oneshot
EnvironmentFile=/ruta/a/cmms-biomedico/.env.produccion
ExecStart=/ruta/a/cmms-biomedico/scripts/respaldo-postgres.sh
User=cmms
```

```ini
# /etc/systemd/system/cmms-respaldo.timer
[Unit]
Description=Respaldo diario del CMMS Biomédico

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now cmms-respaldo.timer
systemctl list-timers cmms-respaldo.timer   # confirma cuándo corre el próximo
```

**Cómo restaurar un respaldo** (probado: ver arriba). Nunca con `psql` — el formato es binario
comprimido (`--format=custom`), se restaura con `pg_restore`:

```bash
# en una base NUEVA y vacía (nunca sobre la base en uso, salvo que sea justo lo que quieres)
createdb -h localhost -U cmms_app cmms_restaurada
pg_restore -h localhost -U cmms_app -d cmms_restaurada --no-owner /var/backups/cmms-biomedico/cmms-AAAAMMDD-HHMMSS.dump
```

## 11. Verificación final (antes de apagar Vercel)

1. Desde un equipo conectado por VPN: abre `https://cmms.interno.empresa` y confirma que carga.
2. Inicia sesión con un usuario real y revisa que sus datos (equipos, empresas, etc.) son los
   mismos que había en Vercel — exactamente lo que el paso 7 ya verificó clave por clave.
3. Prueba crear/editar un registro y confirma que persiste tras recargar.
4. Deja el proyecto de Vercel sin tráfico (DNS/VPN ya apuntando al servidor nuevo) pero **sin
   eliminarlo** durante unos días, como respaldo (Fase 6 del plan de migración).
5. Confirma que el respaldo automático (paso 10) ya corrió al menos una vez y dejó un archivo en
   `/var/backups/cmms-biomedico/` — no esperes al primer problema real para descubrir que no
   estaba programado.
