import type {
  DatosCreacionSolicitud,
  DatosReemplazoSolicitud,
  EstadoSolicitud,
  IdentidadUsuario,
  ResumenSolicitudes,
  Solicitud,
} from "./solicitud.js";

export interface RepositorioSolicitudes {
  listar(identidad: IdentidadUsuario): Promise<Solicitud[]>;
  obtener(id: string, identidad: IdentidadUsuario): Promise<Solicitud | null>;
  crear(usuarioId: string, datos: DatosCreacionSolicitud): Promise<Solicitud>;
  reemplazar(
    id: string,
    identidad: IdentidadUsuario,
    datos: DatosReemplazoSolicitud,
  ): Promise<Solicitud | null>;
  actualizarEstado(
    id: string,
    identidad: IdentidadUsuario,
    estado: EstadoSolicitud,
  ): Promise<Solicitud | null>;
  eliminar(id: string, identidad: IdentidadUsuario): Promise<boolean>;
  resumir(identidad: IdentidadUsuario): Promise<ResumenSolicitudes>;
}

export interface ClienteCatalogo {
  existeCategoria(id: number, identidad: IdentidadUsuario): Promise<boolean>;
}

export interface ComprobadorSalud {
  comprobar(): Promise<void>;
}
