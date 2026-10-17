import type { Request, Response } from "express";
import type { ServicioSolicitudes } from "../../application/solicitud-service.js";
import { obtenerIdentidad } from "./identidad.js";

export class SolicitudController {
  constructor(private readonly servicio: ServicioSolicitudes) {}

  async listar(_request: Request, response: Response): Promise<void> {
    const solicitudes = await this.servicio.listar(obtenerIdentidad(response));
    response.status(200).json({ data: solicitudes });
  }

  async obtener(request: Request, response: Response): Promise<void> {
    const solicitud = await this.servicio.obtener(
      request.params.id,
      obtenerIdentidad(response),
    );
    response.status(200).json({ data: solicitud });
  }

  async crear(request: Request, response: Response): Promise<void> {
    const solicitud = await this.servicio.crear(
      request.body,
      obtenerIdentidad(response),
    );
    response
      .location(`/api/v1/solicitudes/${solicitud.id}`)
      .status(201)
      .json({ data: solicitud });
  }

  async reemplazar(request: Request, response: Response): Promise<void> {
    const solicitud = await this.servicio.reemplazar(
      request.params.id,
      request.body,
      obtenerIdentidad(response),
    );
    response.status(200).json({ data: solicitud });
  }

  async actualizarEstado(request: Request, response: Response): Promise<void> {
    const solicitud = await this.servicio.actualizarEstado(
      request.params.id,
      request.body,
      obtenerIdentidad(response),
    );
    response.status(200).json({ data: solicitud });
  }

  async eliminar(request: Request, response: Response): Promise<void> {
    await this.servicio.eliminar(request.params.id, obtenerIdentidad(response));
    response.status(204).send();
  }

  async resumen(_request: Request, response: Response): Promise<void> {
    const resumen = await this.servicio.resumir(obtenerIdentidad(response));
    response.status(200).json({ data: resumen });
  }
}
