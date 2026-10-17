import { Pool } from "pg";
import type { ComprobadorSalud } from "../domain/ports.js";
import type { Environment } from "./environment.js";

export function crearPool(environment: Environment): Pool {
  return new Pool({
    connectionString: environment.DATABASE_URL,
    ssl: environment.DB_SSL ? { rejectUnauthorized: true } : false,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    application_name: "practica5-solicitudes",
  });
}

export class PostgresComprobadorSalud implements ComprobadorSalud {
  constructor(private readonly pool: Pool) {}

  async comprobar(): Promise<void> {
    await this.pool.query("SELECT 1");
  }
}
