import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogoNoDisponibleError } from "../src/application/errors.js";
import { GraphqlCatalogoClient } from "../src/infrastructure/http/graphql-catalogo-client.js";

const identidad = {
  usuarioId: "e67ecc8c-cf5b-4a59-b009-c04c34bbc752",
  rol: "cliente" as const,
};

describe("GraphqlCatalogoClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("consulta la categoría y reenvía la identidad", async () => {
    const fetchPrueba = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { categoria: { id: 7 } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchPrueba);
    const cliente = new GraphqlCatalogoClient("http://catalogo/graphql", 500);

    await expect(cliente.existeCategoria(7, identidad)).resolves.toBe(true);
    expect(fetchPrueba).toHaveBeenCalledOnce();
    const opciones = fetchPrueba.mock.calls[0]![1] as RequestInit;
    expect(opciones.headers).toMatchObject({
      "x-user-id": identidad.usuarioId,
      "x-user-role": identidad.rol,
    });
    expect(JSON.parse(String(opciones.body))).toMatchObject({ variables: { id: 7 } });
  });

  it("distingue una categoría inexistente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { categoria: null } }), { status: 200 }),
      ),
    );
    const cliente = new GraphqlCatalogoClient("http://catalogo/graphql", 500);

    await expect(cliente.existeCategoria(99, identidad)).resolves.toBe(false);
  });

  it("convierte fallos HTTP, GraphQL y de red en indisponibilidad", async () => {
    const cliente = new GraphqlCatalogoClient("http://catalogo/graphql", 500);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    await expect(cliente.existeCategoria(1, identidad)).rejects.toBeInstanceOf(
      CatalogoNoDisponibleError,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: [{ message: "falló" }] }), { status: 200 }),
      ),
    );
    await expect(cliente.existeCategoria(1, identidad)).rejects.toBeInstanceOf(
      CatalogoNoDisponibleError,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { categoria: { id: 2 } } }), {
          status: 200,
        }),
      ),
    );
    await expect(cliente.existeCategoria(1, identidad)).rejects.toBeInstanceOf(
      CatalogoNoDisponibleError,
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin conexión")));
    await expect(cliente.existeCategoria(1, identidad)).rejects.toBeInstanceOf(
      CatalogoNoDisponibleError,
    );
  });
});
