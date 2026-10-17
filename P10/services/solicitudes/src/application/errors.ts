export class SolicitudNoEncontradaError extends Error {
  constructor() {
    super("La solicitud no existe o no está disponible para el usuario.");
    this.name = "SolicitudNoEncontradaError";
  }
}

export class CategoriaNoEncontradaError extends Error {
  constructor(id: number) {
    super(`La categoría ${id} no existe.`);
    this.name = "CategoriaNoEncontradaError";
  }
}

export class CatalogoNoDisponibleError extends Error {
  constructor() {
    super("El servicio de catálogo no está disponible.");
    this.name = "CatalogoNoDisponibleError";
  }
}

export class AutenticacionRequeridaError extends Error {
  constructor() {
    super("Se requiere una identidad de usuario válida.");
    this.name = "AutenticacionRequeridaError";
  }
}

export class TipoContenidoNoSoportadoError extends Error {
  constructor() {
    super("El cuerpo debe enviarse como application/json.");
    this.name = "TipoContenidoNoSoportadoError";
  }
}
