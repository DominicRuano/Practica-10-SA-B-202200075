import { observe, metrics } from "./telemetry.js";
import express, { type Express, type Router } from "express";
import helmet from "helmet";
import type { ComprobadorSalud } from "./domain/ports.js";
import {
  crearErrorHandler,
  type ErrorLogger,
  rutaNoEncontradaHandler,
} from "./presentation/http/error-handler.js";
import { requerirIdentidad } from "./presentation/http/identidad.js";

export function crearApp(
  solicitudRouter: Router,
  routerInterno: Router,
  salud: ComprobadorSalud,
  logger?: ErrorLogger,
): Express {
  const app = express();
  app.use(observe);
  app.get("/metrics", metrics);
  const jsonParser = express.json({
    limit: "20kb",
    strict: true,
    type: ["application/json", "application/*+json"],
  });

  app.disable("x-powered-by");
  app.set("json escape", true);
  app.use(helmet());

  // Liveness only proves that the HTTP process can answer. PostgreSQL belongs
  // in readiness so a dependency outage does not trigger restart loops.
  app.get("/live", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  // Listening starts after database migrations, which makes this a true
  // startup signal without coupling it to dependencies after startup.
  app.get("/startup", (_request, response) => {
    response.status(200).json({ status: "started" });
  });

  app.get("/ready", async (_request, response) => {
    try {
      await salud.comprobar();
      response.status(200).json({ status: "ready", database: "up" });
    } catch {
      response.status(503).json({ status: "not_ready", database: "down" });
    }
  });

  app.get("/api/v1/solicitudes/health", (_request, response) => {
    response.status(200).json({ status: "ok", servicio: "solicitudes" });
  });

  app.use(
    "/api/v1/solicitudes",
    requerirIdentidad,
    jsonParser,
    solicitudRouter,
  );
  app.use("/internal", requerirIdentidad, routerInterno);
  app.use(rutaNoEncontradaHandler);
  app.use(crearErrorHandler(logger));

  return app;
}
