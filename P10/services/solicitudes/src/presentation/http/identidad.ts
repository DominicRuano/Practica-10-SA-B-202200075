import type { NextFunction, Request, Response } from "express";
import { AutenticacionRequeridaError } from "../../application/errors.js";
import { identidadSchema } from "../../application/validation.js";
import type { IdentidadUsuario } from "../../domain/solicitud.js";

export function requerirIdentidad(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const resultado = identidadSchema.safeParse({
    usuarioId: request.get("x-user-id"),
    rol: request.get("x-user-role"),
  });
  if (!resultado.success) {
    next(new AutenticacionRequeridaError());
    return;
  }
  response.locals.identidad = resultado.data;
  next();
}

export function obtenerIdentidad(response: Response): IdentidadUsuario {
  return response.locals.identidad as IdentidadUsuario;
}
