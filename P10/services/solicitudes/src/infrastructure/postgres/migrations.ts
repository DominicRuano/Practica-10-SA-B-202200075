import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

const migrationsDirectory = fileURLToPath(
  new URL("../../../migrations/", import.meta.url),
);

export interface ResultadoMigraciones {
  aplicadas: string[];
  verificadas: string[];
}

/**
 * Applies every migration under a transaction-scoped advisory lock. This is
 * safe when multiple Kubernetes replicas start at the same time: only one
 * migrates and the remaining replicas verify the committed checksums.
 */
export async function ejecutarMigraciones(
  pool: Pool,
  directorio = migrationsDirectory,
): Promise<ResultadoMigraciones> {
  const client = await pool.connect();
  const resultado: ResultadoMigraciones = { aplicadas: [], verificadas: [] };

  try {
    const archivos = (await readdir(directorio))
      .filter((archivo) => /^\d+[_-].+\.sql$/u.test(archivo))
      .sort((a, b) => a.localeCompare(b));

    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [20_220_007_504]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const aplicadas = await client.query<{ filename: string; checksum: string }>(
      "SELECT filename, checksum FROM schema_migrations ORDER BY filename",
    );
    const checksumPorArchivo = new Map(
      aplicadas.rows.map((item) => [item.filename, item.checksum.trim()]),
    );

    for (const archivo of archivos) {
      const sql = await readFile(join(directorio, archivo), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const anterior = checksumPorArchivo.get(archivo);
      if (anterior !== undefined) {
        if (anterior !== checksum) {
          throw new Error(`La migración aplicada ${archivo} fue modificada.`);
        }
        resultado.verificadas.push(archivo);
        continue;
      }

      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
        [archivo, checksum],
      );
      resultado.aplicadas.push(archivo);
    }

    await client.query("COMMIT");
    return resultado;
  } catch (error) {
    await rollbackSilencioso(client);
    throw error;
  } finally {
    client.release();
  }
}

async function rollbackSilencioso(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {}
}
