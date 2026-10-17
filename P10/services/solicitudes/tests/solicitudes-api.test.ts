import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { CatalogoNoDisponibleError } from "../src/application/errors.js";
import { construirAplicacion } from "../src/composition-root.js";
import type { ClienteCatalogo, ComprobadorSalud } from "../src/domain/ports.js";
import type { IdentidadUsuario } from "../src/domain/solicitud.js";
import { RepositorioSolicitudesEnMemoria } from "../src/infrastructure/memory/repositorio-solicitudes-en-memoria.js";

const USUARIO_UNO = "2bd93120-3a23-4da5-a3b5-c4ba5575a670";
const USUARIO_DOS = "e67ecc8c-cf5b-4a59-b009-c04c34bbc752";
const ADMIN = "92d6269e-a24e-4486-8646-d4f4ab032644";

const headersUsuarioUno = {
  "x-user-id": USUARIO_UNO,
  "x-user-role": "cliente",
};
const headersUsuarioDos = {
  "x-user-id": USUARIO_DOS,
  "x-user-role": "cliente",
};
const headersAdmin = {
  "x-user-id": ADMIN,
  "x-user-role": "admin",
};

const datosValidos = {
  categoria_id: 1,
  titulo: "Constancia de estudios",
  descripcion: "Solicitud para presentar en una beca.",
  prioridad: 4,
};

class CatalogoPrueba implements ClienteCatalogo {
  constructor(
    private readonly categorias = new Set([1, 2, 3]),
    private readonly disponible = true,
  ) {}

  async existeCategoria(
    id: number,
    _identidad: IdentidadUsuario,
  ): Promise<boolean> {
    if (!this.disponible) {
      throw new CatalogoNoDisponibleError();
    }
    return this.categorias.has(id);
  }
}

function crearAplicacion(catalogo: ClienteCatalogo = new CatalogoPrueba()): Express {
  return construirAplicacion(new RepositorioSolicitudesEnMemoria(), catalogo);
}

describe("API de solicitudes", () => {
  let app: Express;

  beforeEach(() => {
    app = crearAplicacion();
  });

  it("publica un healthcheck sin exigir identidad", async () => {
    const respuesta = await request(app).get("/api/v1/solicitudes/health");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ status: "ok", servicio: "solicitudes" });
  });

  it("separa liveness, startup y readiness", async () => {
    const salud: ComprobadorSalud = {
      comprobar: async () => Promise.reject(new Error("postgres no disponible")),
    };
    const appSinBase = construirAplicacion(
      new RepositorioSolicitudesEnMemoria(),
      new CatalogoPrueba(),
      salud,
    );

    await request(appSinBase).get("/live").expect(200, { status: "ok" });
    await request(appSinBase).get("/startup").expect(200, { status: "started" });
    await request(appSinBase)
      .get("/ready")
      .expect(503, { status: "not_ready", database: "down" });
  });

  it("declara readiness cuando PostgreSQL responde", async () => {
    await request(app).get("/ready").expect(200, { status: "ready", database: "up" });
  });

  it("rechaza solicitudes protegidas sin headers o con una identidad inválida", async () => {
    const sinHeaders = await request(app).get("/api/v1/solicitudes");
    const rolInvalido = await request(app)
      .get("/api/v1/solicitudes")
      .set("x-user-id", USUARIO_UNO)
      .set("x-user-role", "supervisor");

    expect(sinHeaders.status).toBe(401);
    expect(sinHeaders.body.error.code).toBe("NO_AUTORIZADO");
    expect(rolInvalido.status).toBe(401);
  });

  it("crea una solicitud registrada y valida estrictamente sus campos", async () => {
    const creada = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send(datosValidos);

    expect(creada.status).toBe(201);
    expect(creada.headers.location).toBe(
      `/api/v1/solicitudes/${creada.body.data.id}`,
    );
    expect(creada.body.data).toMatchObject({
      usuario_id: USUARIO_UNO,
      ...datosValidos,
      estado: "registrada",
    });
    expect(creada.body.data.creada_en).toEqual(expect.any(String));

    const conEstado = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send({ ...datosValidos, titulo: "Otra solicitud", estado: "finalizada" });
    const tituloCorto = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send({ ...datosValidos, titulo: " x " });
    const prioridadInvalida = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send({ ...datosValidos, prioridad: 6 });

    expect(conEstado.status).toBe(400);
    expect(tituloCorto.status).toBe(400);
    expect(prioridadInvalida.status).toBe(400);
  });

  it("responde 400 cuando la categoría no existe y 503 cuando catálogo falla", async () => {
    const inexistente = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send({ ...datosValidos, categoria_id: 99 });

    app = crearAplicacion(new CatalogoPrueba(new Set([1]), false));
    const noDisponible = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send(datosValidos);

    expect(inexistente.status).toBe(400);
    expect(inexistente.body.error.code).toBe("CATEGORIA_NO_ENCONTRADA");
    expect(noDisponible.status).toBe(503);
    expect(noDisponible.body.error.code).toBe("CATALOGO_NO_DISPONIBLE");
  });

  it("evita títulos activos duplicados y libera el título al finalizar", async () => {
    const primera = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send(datosValidos);
    expect(primera.status).toBe(201);

    const duplicada = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send({ ...datosValidos, titulo: "  CONSTANCIA DE ESTUDIOS  " });
    expect(duplicada.status).toBe(409);
    expect(duplicada.body.error.code).toBe("SOLICITUD_DUPLICADA");

    await request(app)
      .patch(`/api/v1/solicitudes/${primera.body.data.id}/estado`)
      .set(headersUsuarioUno)
      .send({ estado: "finalizada" })
      .expect(200);

    const reutilizada = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send({ ...datosValidos, titulo: "  CONSTANCIA DE ESTUDIOS  " });
    expect(reutilizada.status).toBe(201);
    expect(reutilizada.body.data.estado).toBe("registrada");

    const reaperturaConflictiva = await request(app)
      .patch(`/api/v1/solicitudes/${primera.body.data.id}/estado`)
      .set(headersUsuarioUno)
      .send({ estado: "en_proceso" });
    expect(reaperturaConflictiva.status).toBe(409);
    expect(reaperturaConflictiva.body.error.code).toBe("SOLICITUD_DUPLICADA");

    const terceraActiva = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send(datosValidos);
    const otroUsuario = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioDos)
      .send(datosValidos);

    expect(terceraActiva.status).toBe(409);
    expect(otroUsuario.status).toBe(201);
  });

  it("aísla listar y obtener, mientras el administrador puede consultar todo", async () => {
    const primera = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send(datosValidos);
    await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioDos)
      .send({ ...datosValidos, titulo: "Cambio de carrera", prioridad: 2 });

    const listaUno = await request(app)
      .get("/api/v1/solicitudes")
      .set(headersUsuarioUno);
    const listaAdmin = await request(app)
      .get("/api/v1/solicitudes")
      .set(headersAdmin);
    const ajena = await request(app)
      .get(`/api/v1/solicitudes/${primera.body.data.id}`)
      .set(headersUsuarioDos);
    const vistaAdmin = await request(app)
      .get(`/api/v1/solicitudes/${primera.body.data.id}`)
      .set(headersAdmin);

    expect(listaUno.body.data).toHaveLength(1);
    expect(listaAdmin.body.data).toHaveLength(2);
    expect(ajena.status).toBe(404);
    expect(vistaAdmin.status).toBe(200);
  });

  it("reemplaza, cambia estado y elimina respetando propiedad y permisos", async () => {
    const creada = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send(datosValidos);
    const id = creada.body.data.id as string;
    const reemplazo = {
      categoria_id: 2,
      titulo: "Equivalencia de cursos",
      descripcion: "Revisión completa del expediente académico.",
      prioridad: 3,
      estado: "en_proceso",
    };

    await request(app)
      .put(`/api/v1/solicitudes/${id}`)
      .set(headersUsuarioDos)
      .send(reemplazo)
      .expect(404);

    const reemplazada = await request(app)
      .put(`/api/v1/solicitudes/${id}`)
      .set(headersAdmin)
      .send(reemplazo);
    expect(reemplazada.status).toBe(200);
    expect(reemplazada.body.data).toMatchObject({
      usuario_id: USUARIO_UNO,
      ...reemplazo,
    });

    const estadoInvalido = await request(app)
      .patch(`/api/v1/solicitudes/${id}/estado`)
      .set(headersUsuarioUno)
      .send({ estado: "cancelada" });
    expect(estadoInvalido.status).toBe(400);

    const finalizada = await request(app)
      .patch(`/api/v1/solicitudes/${id}/estado`)
      .set(headersUsuarioUno)
      .send({ estado: "finalizada" });
    expect(finalizada.status).toBe(200);
    expect(finalizada.body.data.estado).toBe("finalizada");

    await request(app)
      .delete(`/api/v1/solicitudes/${id}`)
      .set(headersUsuarioDos)
      .expect(404);
    await request(app)
      .delete(`/api/v1/solicitudes/${id}`)
      .set(headersAdmin)
      .expect(204);
    await request(app)
      .get(`/api/v1/solicitudes/${id}`)
      .set(headersAdmin)
      .expect(404);
  });

  it("genera el resumen aislado para clientes y global para admin", async () => {
    const primera = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .send(datosValidos);
    await request(app)
      .patch(`/api/v1/solicitudes/${primera.body.data.id}/estado`)
      .set(headersUsuarioUno)
      .send({ estado: "finalizada" });
    await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioDos)
      .send({ ...datosValidos, titulo: "Certificación de notas", prioridad: 2 });

    const resumenUsuario = await request(app)
      .get("/internal/resumen")
      .set(headersUsuarioUno);
    const resumenAdmin = await request(app)
      .get("/internal/resumen")
      .set(headersAdmin);

    expect(resumenUsuario.body).toEqual({
      data: {
        total: 1,
        registradas: 0,
        en_proceso: 0,
        finalizadas: 1,
        prioridad_alta: 1,
      },
    });
    expect(resumenAdmin.body.data).toEqual({
      total: 2,
      registradas: 1,
      en_proceso: 0,
      finalizadas: 1,
      prioridad_alta: 1,
    });
  });

  it("responde 400, 404 y 415 ante formatos o rutas inválidas", async () => {
    const uuidInvalido = await request(app)
      .get("/api/v1/solicitudes/no-es-uuid")
      .set(headersUsuarioUno);
    const inexistente = await request(app)
      .get("/api/v1/solicitudes/bb0cb838-38cf-4689-bc9e-fe60120c8392")
      .set(headersUsuarioUno);
    const sinJson = await request(app)
      .post("/api/v1/solicitudes")
      .set(headersUsuarioUno)
      .type("text")
      .send("contenido");

    expect(uuidInvalido.status).toBe(400);
    expect(inexistente.status).toBe(404);
    expect(sinJson.status).toBe(415);
  });
});
