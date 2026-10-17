import "dotenv/config";
import { crearPool } from "../config/database.js";
import { obtenerEnvironment } from "../config/environment.js";
import { ejecutarMigraciones } from "../infrastructure/postgres/migrations.js";

async function main(): Promise<void> {
  const pool = crearPool(obtenerEnvironment());
  try {
    const resultado = await ejecutarMigraciones(pool);
    console.info(
      `Migraciones listas (aplicadas: ${resultado.aplicadas.length}, verificadas: ${resultado.verificadas.length}).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error);
  console.error(`No fue posible aplicar las migraciones: ${mensaje}`);
  process.exitCode = 1;
});
