import { CatalogoNoDisponibleError } from "../../application/errors.js";
import type { ClienteCatalogo } from "../../domain/ports.js";
import type { IdentidadUsuario } from "../../domain/solicitud.js";

interface RespuestaCatalogo {
  data?: {
    categoria?: { id: number } | null;
  };
  errors?: unknown[];
}

export class GraphqlCatalogoClient implements ClienteCatalogo {
  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
  ) {}

  async existeCategoria(
    id: number,
    identidad: IdentidadUsuario,
  ): Promise<boolean> {
    try {
      const respuesta = await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "connection": "close",
          "x-user-id": identidad.usuarioId,
          "x-user-role": identidad.rol,
        },
        body: JSON.stringify({
          query: "query BuscarCategoria($id: Int!) { categoria(id: $id) { id } }",
          variables: { id },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!respuesta.ok) {
        throw new CatalogoNoDisponibleError();
      }
      const contenido = (await respuesta.json()) as RespuestaCatalogo;
      if (
        (contenido.errors?.length ?? 0) > 0 ||
        contenido.data === undefined ||
        !("categoria" in contenido.data)
      ) {
        throw new CatalogoNoDisponibleError();
      }
      const categoria = contenido.data.categoria;
      if (categoria === null) {
        return false;
      }
      if (
        typeof categoria !== "object" ||
        typeof categoria.id !== "number" ||
        categoria.id !== id
      ) {
        throw new CatalogoNoDisponibleError();
      }
      return true;
    } catch (error) {
      if (error instanceof CatalogoNoDisponibleError) {
        throw error;
      }
      throw new CatalogoNoDisponibleError();
    }
  }
}
