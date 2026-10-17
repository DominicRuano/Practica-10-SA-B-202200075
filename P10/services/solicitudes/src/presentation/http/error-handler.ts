import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import {
  AutenticacionRequeridaError,
  CatalogoNoDisponibleError,
  CategoriaNoEncontradaError,
  SolicitudNoEncontradaError,
  TipoContenidoNoSoportadoError,
} from "../../application/errors.js";
import { TituloSolicitudDuplicadoError } from "../../domain/errors.js";

function esJsonInvalido(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    typeof error === "object" &&
    error !== null &&
    "body" in error
  );
}

function esPayloadGrande(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("status" in error && error.status === 413) ||
      ("type" in error && error.type === "entity.too.large"))
  );
}

export const rutaNoEncontradaHandler: RequestHandler = (_request, response) => {
  response.status(404).json({
    error: {
      code: "RUTA_NO_ENCONTRADA",
      message: "La ruta solicitada no existe.",
    },
  });
};

export interface ErrorLogger {
  error(input: object, message: string): void;
}

export function crearErrorHandler(logger?: ErrorLogger): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "DATOS_INVALIDOS",
        message: "La solicitud contiene datos inválidos.",
        details: error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (esJsonInvalido(error)) {
    response.status(400).json({
      error: { code: "JSON_INVALIDO", message: "El cuerpo no contiene JSON válido." },
    });
    return;
  }

  if (error instanceof CategoriaNoEncontradaError) {
    response.status(400).json({
      error: { code: "CATEGORIA_NO_ENCONTRADA", message: error.message },
    });
    return;
  }

  if (error instanceof AutenticacionRequeridaError) {
    response.status(401).json({
      error: { code: "NO_AUTORIZADO", message: error.message },
    });
    return;
  }

  if (error instanceof SolicitudNoEncontradaError) {
    response.status(404).json({
      error: { code: "SOLICITUD_NO_ENCONTRADA", message: error.message },
    });
    return;
  }

  if (error instanceof TituloSolicitudDuplicadoError) {
    response.status(409).json({
      error: { code: "SOLICITUD_DUPLICADA", message: error.message },
    });
    return;
  }

  if (error instanceof CatalogoNoDisponibleError) {
    response.status(503).json({
      error: { code: "CATALOGO_NO_DISPONIBLE", message: error.message },
    });
    return;
  }

  if (error instanceof TipoContenidoNoSoportadoError) {
    response.status(415).json({
      error: { code: "TIPO_CONTENIDO_NO_SOPORTADO", message: error.message },
    });
    return;
  }

  if (esPayloadGrande(error)) {
    response.status(413).json({
      error: {
        code: "PAYLOAD_DEMASIADO_GRANDE",
        message: "El cuerpo supera el límite permitido de 20 KB.",
      },
    });
    return;
  }

  logger?.error({ err: error }, "Error interno no controlado");
  response.status(500).json({
    error: { code: "ERROR_INTERNO", message: "Ocurrió un error interno." },
  });
  };
}
