// lib/db-postgres.js
// Implementación de la interfaz `kv` (get/set/del/sadd/smembers/srem) sobre PostgreSQL — el
// reemplazo de Vercel KV para el despliegue fuera de Vercel (ver el plan de migración).
// No reemplaza ninguna lógica de negocio: lib/db.js sigue siendo el único punto de entrada a
// los datos, y esta pieza solo cambia DÓNDE viven, no cómo se usan.
//
// Requiere dos tablas (ver KV_POSTGRES_SCHEMA más abajo):
//   kv_store(key TEXT PRIMARY KEY, value JSONB NOT NULL, expires_at TIMESTAMPTZ NULL)
//   kv_sets(key TEXT, member TEXT, PRIMARY KEY(key, member))
//
// `pool` es cualquier objeto con `.query(text, params) -> { rows, rowCount }` (una instancia
// de pg.Pool en producción; en tests, un pool simulado — ver tests/db-postgres.test.js).

export const KV_POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS kv_store (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  expires_at  TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS kv_store_expires_at_idx ON kv_store (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS kv_sets (
  key     TEXT NOT NULL,
  member  TEXT NOT NULL,
  PRIMARY KEY (key, member)
);
`;

// now() + make_interval(secs => N), o NULL si no hay TTL. Parametrizado (nunca interpolado) para
// que "ex" pueda ir como bind param igual que el resto de los valores.
const EXPIRES_AT_EXPR = `CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(secs => $3::int) END`;

function exSeconds(opts) {
  if (opts?.ex == null) return null;
  const n = Number(opts.ex);
  if (!Number.isFinite(n)) throw new Error('kv.set: "ex" debe ser un número de segundos');
  return n;
}

export function createPostgresKv(pool) {
  return {
    async get(key) {
      const { rows } = await pool.query(
        `SELECT value FROM kv_store WHERE key = $1 AND (expires_at IS NULL OR expires_at > now())`,
        [key]
      );
      return rows.length ? rows[0].value : null;
    },

    async set(key, value, opts) {
      const ex = exSeconds(opts);
      const params = [key, JSON.stringify(value), ex];

      if (opts?.nx) {
        // SET NX: inserta si la clave no existe, o si existe pero ya venció. Si ya existe y
        // sigue vigente, la condición del WHERE es falsa, no hay UPDATE, y no se devuelve fila
        // — igual que Redis, que en ese caso devuelve null y no toca el valor.
        const { rows } = await pool.query(
          `INSERT INTO kv_store(key, value, expires_at)
           VALUES ($1, $2::jsonb, ${EXPIRES_AT_EXPR})
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
             WHERE kv_store.expires_at IS NOT NULL AND kv_store.expires_at <= now()
           RETURNING key`,
          params
        );
        return rows.length ? 'OK' : null;
      }

      await pool.query(
        `INSERT INTO kv_store(key, value, expires_at)
         VALUES ($1, $2::jsonb, ${EXPIRES_AT_EXPR})
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
        params
      );
      return 'OK';
    },

    async del(...keys) {
      if (!keys.length) return 0;
      const { rowCount } = await pool.query(`DELETE FROM kv_store WHERE key = ANY($1::text[])`, [keys]);
      return rowCount;
    },

    async sadd(key, ...members) {
      if (!members.length) return 0;
      const { rowCount } = await pool.query(
        `INSERT INTO kv_sets(key, member) SELECT $1, m FROM unnest($2::text[]) AS m ON CONFLICT DO NOTHING RETURNING member`,
        [key, members]
      );
      return rowCount;
    },

    async smembers(key) {
      const { rows } = await pool.query(`SELECT member FROM kv_sets WHERE key = $1`, [key]);
      return rows.map(r => r.member);
    },

    async srem(key, ...members) {
      if (!members.length) return 0;
      const { rowCount } = await pool.query(`DELETE FROM kv_sets WHERE key = $1 AND member = ANY($2::text[])`, [key, members]);
      return rowCount;
    },
  };
}
