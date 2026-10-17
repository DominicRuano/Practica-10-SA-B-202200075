import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresSolicitudRepository } from "../src/infrastructure/postgres/postgres-solicitud-repository.js";

const usuarioId = "2bd93120-3a23-4da5-a3b5-c4ba5575a670";
const solicitudId = "794a42e9-df11-4776-bc55-7d0ecf029fef";
const identidad = { usuarioId, rol: "cliente" as const };
const row = {
  id: solicitudId,
  usuario_id: usuarioId,
  categoria_id: 1,
  titulo: "Constancia de estudios",
  descripcion: "Solicitud para presentar en una beca.",
  prioridad: 4,
  estado: "registrada" as const,
  creada_en: new Date("2026-08-29T12:00:00.000Z"),
  actualizada_en: new Date("2026-08-29T12:00:00.000Z"),
};

function crearDobles() {
  const query = vi.fn().mockImplementation(async (sql: string) => {
    const normalizada = sql.replace(/\s+/gu, " ").trim();
    if (
      normalizada.startsWith("INSERT INTO solicitudes") ||
      normalizada.startsWith("UPDATE solicitudes")
    ) {
      return { rows: [row], rowCount: 1 };
    }
    if (normalizada.startsWith("DELETE FROM solicitudes")) {
      return { rows: [{ id: solicitudId }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
  return { query, client, repositorio: new PostgresSolicitudRepository(pool) };
}

function eventosInsertados(query: ReturnType<typeof vi.fn>) {
  return query.mock.calls.filter(([sql]) =>
    String(sql).replace(/\s+/gu, " ").trim().startsWith("INSERT INTO outbox_events"),
  );
}

describe("outbox transaccional de solicitudes", () => {
  it("confirma la solicitud creada y su evento completo en la misma transacción", async () => {
    const { repositorio, query, client } = crearDobles();

    const creada = await repositorio.crear(usuarioId, {
      categoria_id: row.categoria_id,
      titulo: row.titulo,
      descripcion: row.descripcion,
      prioridad: row.prioridad,
    });

    expect(creada).toMatchObject({ id: solicitudId, usuario_id: usuarioId });
    const eventos = eventosInsertados(query);
    expect(eventos).toHaveLength(1);
    const parametros = eventos[0]![1] as unknown[];
    expect(parametros[1]).toBe("solicitud.creada");
    expect(parametros[2]).toBe("solicitud.creada");
    expect(JSON.parse(String(parametros[4]))).toEqual(creada);
    expect(query.mock.calls[0]![0]).toBe("BEGIN");
    expect(query.mock.calls.at(-1)![0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("genera eventos para reemplazo, cambio de estado y eliminación", async () => {
    const { repositorio, query } = crearDobles();

    await repositorio.reemplazar(solicitudId, identidad, {
      categoria_id: 1,
      titulo: row.titulo,
      descripcion: row.descripcion,
      prioridad: 4,
      estado: "en_proceso",
    });
    await repositorio.actualizarEstado(solicitudId, identidad, "finalizada");
    await repositorio.eliminar(solicitudId, identidad);

    const parametros = eventosInsertados(query).map((llamada) => llamada[1] as unknown[]);
    expect(parametros.map((item) => item[1])).toEqual([
      "solicitud.actualizada",
      "solicitud.actualizada",
      "solicitud.eliminada",
    ]);
    expect(JSON.parse(String(parametros[0]![4]))).toMatchObject({ id: solicitudId });
    expect(JSON.parse(String(parametros[1]![4]))).toMatchObject({ id: solicitudId });
    expect(JSON.parse(String(parametros[2]![4]))).toEqual({ id: solicitudId });
  });
});
