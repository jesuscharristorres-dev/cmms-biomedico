#!/usr/bin/env bash
# scripts/respaldo-postgres.sh
# Respaldo diario de la base de datos del CMMS Biomédico (PostgreSQL) — mitigación del riesgo
# "los respaldos ya no los gestiona Vercel de forma transparente" del plan de migración.
# Pensado para un cron o un systemd timer en el servidor interno (ver
# docs/despliegue-servidor-interno.md, que lo instala como un paso más).
#
# Uso:
#   DATABASE_URL=postgresql://... ./scripts/respaldo-postgres.sh
#
# Variables de entorno:
#   DATABASE_URL     (obligatoria) cadena de conexión a PostgreSQL
#   BACKUP_DIR       (opcional, por defecto /var/backups/cmms-biomedico)
#   RETENTION_DAYS   (opcional, por defecto 14) — respaldos más viejos que esto se borran
#
# Formato: pg_dump --format=custom (comprimido, binario) — se restaura con pg_restore, no con
# psql (ver "Cómo restaurar" en docs/despliegue-servidor-interno.md).
#
# Después de cada respaldo se verifica con `pg_restore --list` que el archivo es un dump válido
# — no basta con que pg_dump "termine sin error" para confiar en el archivo. Si la verificación
# falla, el script termina con código de salida distinto de 0 (para que cron/systemd lo
# reporten como fallo) y NO borra el archivo sospechoso, para poder inspeccionarlo.

set -euo pipefail

: "${DATABASE_URL:?Falta DATABASE_URL en el entorno}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cmms-biomedico}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

marca=$(date +%Y%m%d-%H%M%S)
archivo="$BACKUP_DIR/cmms-$marca.dump"

echo "[respaldo] Generando $archivo ..."
if ! pg_dump "$DATABASE_URL" --format=custom --file="$archivo"; then
  echo "[respaldo] ERROR: pg_dump falló. Se borra el archivo parcial ($archivo)." >&2
  rm -f "$archivo"
  exit 1
fi

echo "[respaldo] Verificando que el archivo es un dump válido ..."
if ! pg_restore --list "$archivo" > /dev/null; then
  echo "[respaldo] ERROR: $archivo no es un dump válido. No se borra, para poder inspeccionarlo." >&2
  exit 1
fi

tamano=$(du -h "$archivo" | cut -f1)
echo "[respaldo] OK: $archivo ($tamano)"

echo "[respaldo] Borrando respaldos de más de $RETENTION_DAYS días en $BACKUP_DIR ..."
find "$BACKUP_DIR" -name 'cmms-*.dump' -mtime +"$RETENTION_DAYS" -print -delete

echo "[respaldo] Listo."
