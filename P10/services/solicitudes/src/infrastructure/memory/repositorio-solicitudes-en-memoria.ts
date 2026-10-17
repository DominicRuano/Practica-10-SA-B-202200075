import { randomUUID } from "node:crypto";
import { TituloSolicitudDuplicadoError } from "../../domain/errors.js";
import type { RepositorioSolicitudes } from "../../domain/ports.js";
import type {
  DatosCreacionSolicitud,
  DatosReemplazoSolicitud,
  EstadoSolicitud,
  IdentidadUsuario,
  ResumenSolicitudes,
  Solicitud,
} from "../../domain/solicitud.js";

function copiar(solicitud: Solicitud): Solicitud {
  return { ...solicitud };
}

function puedeAcceder(solicitud: Solicitud, identidad: IdentidadUsuario): boolean {
  return identidad.rol === "admin" || solicitud.usuario_id === identidad.usuarioId;
}

export class RepositorioSolicitudesEnMemoria implements RepositorioSolicitudes {
  private readonly solicitudes = new Map<string, Solicitud>();

  constructor(iniciales: Solicitud[] = []) {
    for (const solicitud of iniciales) {
      this.solicitudes.set(solicitud.id, copiar(solicitud));
    }
  }

  async listar(identidad: IdentidadUsuario): Promise<Solicitud[]> {
    return [...this.solicitudes.values()]
      .filter((solicitud) => puedeAcceder(solicitud, identidad))
      .sort((a, b) => b.creada_en.localeCompare(a.creada_en) || a.id.localeCompare(b.id))
      .map(copiar);
  }

  async obtener(
    id: string,
    identidad: IdentidadUsuario,
  ): Promise<Solicitud | null> {
    const solicitud = this.solicitudes.get(id);
    return solicitud !== undefined && puedeAcceder(solicitud, identidad)
      ? copiar(solicitud)
      : null;
  }

  async crear(
    usuarioId: string,
    datos: DatosCreacionSolicitud,
  ): Promise<Solicitud> {
    this.validarTituloUnico(usuarioId, datos.titulo);
    const ahora = new Date().toISOString();
    const solicitud: Solicitud = {
      id: randomUUID(),
      usuario_id: usuarioId,
      ...datos,
      estado: "registrada",
      creada_en: ahora,
      actualizada_en: ahora,
    };
    this.solicitudes.set(solicitud.id, solicitud);
    return copiar(solicitud);
  }

  async reemplazar(
    id: string,
    identidad: IdentidadUsuario,
    datos: DatosReemplazoSolicitud,
  ): Promise<Solicitud | null> {
    const actual = this.solicitudes.get(id);
    if (actual === undefined || !puedeAcceder(actual, identidad)) {
      return null;
    }
    if (datos.estado !== "finalizada") {
      this.validarTituloUnico(actual.usuario_id, datos.titulo, id);
    }
    const solicitud: Solicitud = {
      ...actual,
      ...datos,
      actualizada_en: new Date().toISOString(),
    };
    this.solicitudes.set(id, solicitud);
    return copiar(solicitud);
  }

  async actualizarEstado(
    id: string,
    identidad: IdentidadUsuario,
    estado: EstadoSolicitud,
  ): Promise<Solicitud | null> {
    const actual = this.solicitudes.get(id);
    if (actual === undefined || !puedeAcceder(actual, identidad)) {
      return null;
    }
    if (estado !== "finalizada") {
      this.validarTituloUnico(actual.usuario_id, actual.titulo, id);
    }
    const solicitud: Solicitud = {
      ...actual,
      estado,
      actualizada_en: new Date().toISOString(),
    };
    this.solicitudes.set(id, solicitud);
    return copiar(solicitud);
  }

  async eliminar(id: string, identidad: IdentidadUsuario): Promise<boolean> {
    const solicitud = this.solicitudes.get(id);
    if (solicitud === undefined || !puedeAcceder(solicitud, identidad)) {
      return false;
    }
    return this.solicitudes.delete(id);
  }

  async resumir(identidad: IdentidadUsuario): Promise<ResumenSolicitudes> {
    const solicitudes = [...this.solicitudes.values()].filter((solicitud) =>
      puedeAcceder(solicitud, identidad),
    );
    return {
      total: solicitudes.length,
      registradas: solicitudes.filter((item) => item.estado === "registrada").length,
      en_proceso: solicitudes.filter((item) => item.estado === "en_proceso").length,
      finalizadas: solicitudes.filter((item) => item.estado === "finalizada").length,
      prioridad_alta: solicitudes.filter((item) => item.prioridad >= 4).length,
    };
  }

  private validarTituloUnico(
    usuarioId: string,
    titulo: string,
    idIgnorado?: string,
  ): void {
    const normalizado = titulo.trim().toLocaleLowerCase("es");
    const existe = [...this.solicitudes.values()].some(
      (solicitud) =>
        solicitud.id !== idIgnorado &&
        solicitud.usuario_id === usuarioId &&
        solicitud.estado !== "finalizada" &&
        solicitud.titulo.trim().toLocaleLowerCase("es") === normalizado,
    );
    if (existe) {
      throw new TituloSolicitudDuplicadoError();
    }
  }
}
