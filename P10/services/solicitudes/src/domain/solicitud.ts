export const ESTADOS_SOLICITUD = [
  "registrada",
  "en_proceso",
  "finalizada",
] as const;

export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];
export type RolUsuario = "cliente" | "admin";

export interface IdentidadUsuario {
  usuarioId: string;
  rol: RolUsuario;
}

export interface Solicitud {
  id: string;
  usuario_id: string;
  categoria_id: number;
  titulo: string;
  descripcion: string;
  prioridad: number;
  estado: EstadoSolicitud;
  creada_en: string;
  actualizada_en: string;
}

export interface DatosCreacionSolicitud {
  categoria_id: number;
  titulo: string;
  descripcion: string;
  prioridad: number;
}

export interface DatosReemplazoSolicitud extends DatosCreacionSolicitud {
  estado: EstadoSolicitud;
}

export interface ResumenSolicitudes {
  total: number;
  registradas: number;
  en_proceso: number;
  finalizadas: number;
  prioridad_alta: number;
}
