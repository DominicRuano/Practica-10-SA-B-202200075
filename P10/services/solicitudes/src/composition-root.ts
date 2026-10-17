import type { Express } from "express";
import { ServicioSolicitudes } from "./application/solicitud-service.js";
import { crearApp } from "./app.js";
import type {
  ClienteCatalogo,
  ComprobadorSalud,
  RepositorioSolicitudes,
} from "./domain/ports.js";
import { SolicitudController } from "./presentation/http/solicitud-controller.js";
import type { ErrorLogger } from "./presentation/http/error-handler.js";
import {
  crearRouterInterno,
  crearSolicitudRouter,
} from "./presentation/http/solicitud-router.js";

export function construirAplicacion(
  repositorio: RepositorioSolicitudes,
  catalogo: ClienteCatalogo,
  salud: ComprobadorSalud = { comprobar: async () => undefined },
  logger?: ErrorLogger,
): Express {
  const servicio = new ServicioSolicitudes(repositorio, catalogo);
  const controller = new SolicitudController(servicio);
  return crearApp(
    crearSolicitudRouter(controller),
    crearRouterInterno(controller),
    salud,
    logger,
  );
}
