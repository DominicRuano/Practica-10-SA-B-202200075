import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

type ManejadorAsincrono = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<void>;

export function asyncHandler(manejador: ManejadorAsincrono): RequestHandler {
  return (request, response, next) => {
    void manejador(request, response, next).catch(next);
  };
}
