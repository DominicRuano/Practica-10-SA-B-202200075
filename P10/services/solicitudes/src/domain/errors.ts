export class TituloSolicitudDuplicadoError extends Error {
  constructor() {
    super("Ya existe una solicitud activa con ese título para el usuario.");
    this.name = "TituloSolicitudDuplicadoError";
  }
}
