import "dotenv/config";
import pino from "pino";
import { crearPool, PostgresComprobadorSalud } from "./config/database.js";
import { obtenerEnvironment } from "./config/environment.js";
import { construirAplicacion } from "./composition-root.js";
import { GraphqlCatalogoClient } from "./infrastructure/http/graphql-catalogo-client.js";
import { ejecutarMigraciones } from "./infrastructure/postgres/migrations.js";
import { PostgresOutboxRepository } from "./infrastructure/postgres/postgres-outbox-repository.js";
import { PostgresSolicitudRepository } from "./infrastructure/postgres/postgres-solicitud-repository.js";
import { OutboxPublisher } from "./infrastructure/rabbitmq/outbox-publisher.js";

async function iniciar(): Promise<void> {
  const environment = obtenerEnvironment();
  const logger = pino({ level: environment.LOG_LEVEL });
  const pool = crearPool(environment);
  pool.on("error", (error) => {
    logger.error({ err: error }, "Error inesperado en el pool PostgreSQL");
  });

  try {
    const migraciones = await ejecutarMigraciones(pool);
    logger.info(migraciones, "Migraciones de solicitudes listas");
  } catch (error) {
    await pool.end();
    throw error;
  }

  const repositorio = new PostgresSolicitudRepository(pool);
  const catalogo = new GraphqlCatalogoClient(
    environment.CATALOGO_URL,
    environment.CATALOGO_TIMEOUT_MS,
  );
  const publicador = new OutboxPublisher(
    new PostgresOutboxRepository(pool),
    {
      url: environment.RABBITMQ_URL,
      exchange: environment.RABBITMQ_EXCHANGE,
      pollMs: environment.OUTBOX_POLL_MS,
    },
    logger,
  );
  const app = construirAplicacion(
    repositorio,
    catalogo,
    new PostgresComprobadorSalud(pool),
    logger,
  );

  publicador.start();
  const server = app.listen(environment.PORT, "0.0.0.0", () => {
    logger.info({ port: environment.PORT }, "Servicio de solicitudes iniciado");
  });

  let cerrando = false;
  const cerrar = async (signal: string): Promise<void> => {
    if (cerrando) return;
    cerrando = true;
    logger.info({ signal }, "Cierre ordenado iniciado");
    const temporizador = setTimeout(() => server.closeAllConnections(), 10_000);
    temporizador.unref();
    try {
      server.closeIdleConnections();
      const cerrarHttp = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await Promise.all([cerrarHttp, publicador.stop()]);
      await pool.end();
      logger.info("Cierre ordenado completado");
    } finally {
      clearTimeout(temporizador);
    }
  };

  process.once("SIGINT", () => {
    void cerrar("SIGINT").catch((error: unknown) => {
      logger.error({ err: error }, "Falló el cierre ordenado");
      process.exitCode = 1;
    });
  });
  process.once("SIGTERM", () => {
    void cerrar("SIGTERM").catch((error: unknown) => {
      logger.error({ err: error }, "Falló el cierre ordenado");
      process.exitCode = 1;
    });
  });
}

iniciar().catch((error: unknown) => {
  process.stderr.write(`No fue posible iniciar solicitudes: ${String(error)}\n`);
  process.exitCode = 1;
});
