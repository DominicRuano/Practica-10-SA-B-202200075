import type { ClienteCatalogo, RepositorioSolicitudes } from "../domain/ports.js";
import type {
  IdentidadUsuario,
  ResumenSolicitudes,
  Solicitud,
} from "../domain/solicitud.js";
import {
  CategoriaNoEncontradaError,
  SolicitudNoEncontradaError,
} from "./errors.js";
import {
  creacionSolicitudSchema,
  estadoSolicitudSchema,
  idSolicitudSchema,
  reemplazoSolicitudSchema,
} from "./validation.js";

export class ServicioSolicitudes {
  constructor(
    private readonly repositorio: RepositorioSolicitudes,
    private readonly catalogo: ClienteCatalogo,
  ) {}

  listar(identidad: IdentidadUsuario): Promise<Solicitud[]> {
    return this.repositorio.listar(identidad);
  }

  async obtener(id: unknown, identidad: IdentidadUsuario): Promise<Solicitud> {
    const idValido = idSolicitudSchema.parse(id);
    const solicitud = await this.repositorio.obtener(idValido, identidad);
    if (solicitud === null) {
      throw new SolicitudNoEncontradaError();
    }
    return solicitud;
  }

  async crear(datos: unknown, identidad: IdentidadUsuario): Promise<Solicitud> {
    const datosValidos = creacionSolicitudSchema.parse(datos);
    await this.validarCategoria(datosValidos.categoria_id, identidad);
    return this.repositorio.crear(identidad.usuarioId, datosValidos);
  }

  async reemplazar(
    id: unknown,
    datos: unknown,
    identidad: IdentidadUsuario,
  ): Promise<Solicitud> {
    const idValido = idSolicitudSchema.parse(id);
    const datosValidos = reemplazoSolicitudSchema.parse(datos);
    await this.validarCategoria(datosValidos.categoria_id, identidad);
    const solicitud = await this.repositorio.reemplazar(
      idValido,
      identidad,
      datosValidos,
    );
    if (solicitud === null) {
      throw new SolicitudNoEncontradaError();
    }
    return solicitud;
  }

  async actualizarEstado(
    id: unknown,
    datos: unknown,
    identidad: IdentidadUsuario,
  ): Promise<Solicitud> {
    const idValido = idSolicitudSchema.parse(id);
    const { estado } = estadoSolicitudSchema.parse(datos);
    const solicitud = await this.repositorio.actualizarEstado(
      idValido,
      identidad,
      estado,
    );
    if (solicitud === null) {
      throw new SolicitudNoEncontradaError();
    }
    return solicitud;
  }

  async eliminar(id: unknown, identidad: IdentidadUsuario): Promise<void> {
    const idValido = idSolicitudSchema.parse(id);
    const eliminada = await this.repositorio.eliminar(idValido, identidad);
    if (!eliminada) {
      throw new SolicitudNoEncontradaError();
    }
  }

  resumir(identidad: IdentidadUsuario): Promise<ResumenSolicitudes> {
    return this.repositorio.resumir(identidad);
  }

  private async validarCategoria(
    categoriaId: number,
    identidad: IdentidadUsuario,
  ): Promise<void> {
    const existe = await this.catalogo.existeCategoria(categoriaId, identidad);
    if (!existe) {
      throw new CategoriaNoEncontradaError(categoriaId);
    }
  }
}
