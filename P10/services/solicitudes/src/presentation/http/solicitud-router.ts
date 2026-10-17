import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { TipoContenidoNoSoportadoError } from "../../application/errors.js";
import { asyncHandler } from "./async-handler.js";
import type { SolicitudController } from "./solicitud-controller.js";

function requerirJson(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (!request.is(["application/json", "application/*+json"])) {
    next(new TipoContenidoNoSoportadoError());
    return;
  }
  next();
}

export function crearSolicitudRouter(controller: SolicitudController): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler((request, response) => controller.listar(request, response)),
  );
  router.get(
    "/:id",
    asyncHandler((request, response) => controller.obtener(request, response)),
  );
  router.post(
    "/",
    requerirJson,
    asyncHandler((request, response) => controller.crear(request, response)),
  );
  router.put(
    "/:id",
    requerirJson,
    asyncHandler((request, response) => controller.reemplazar(request, response)),
  );
  router.patch(
    "/:id/estado",
    requerirJson,
    asyncHandler((request, response) =>
      controller.actualizarEstado(request, response),
    ),
  );
  router.delete(
    "/:id",
    asyncHandler((request, response) => controller.eliminar(request, response)),
  );

  return router;
}

export function crearRouterInterno(controller: SolicitudController): Router {
  const router = Router();
  router.get(
    "/resumen",
    asyncHandler((request, response) => controller.resumen(request, response)),
  );
  return router;
}
