import type { Pool } from "pg";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import {
  PostgresOutboxRepository,
  type RepositorioOutbox,
} from "../src/infrastructure/postgres/postgres-outbox-repository.js";
import {
  type CanalConfirmacionRabbit,
  type ConexionRabbit,
  OutboxPublisher,
} from "../src/infrastructure/rabbitmq/outbox-publisher.js";

const evento = {
  eventId: "b51e72f8-d77f-44f5-a5fd-743929619183",
  eventType: "solicitud.creada",
  routingKey: "solicitud.creada",
  occurredAt: "2026-08-29T12:00:00.000Z",
  data: { id: "794a42e9-df11-4776-bc55-7d0ecf029fef", titulo: "Constancia" },
};

function doblesRabbit(confirmacion: Promise<void> = Promise.resolve()) {
  const canal: CanalConfirmacionRabbit = {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockReturnValue(true),
    waitForConfirms: vi.fn().mockReturnValue(confirmacion),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  const conexion: ConexionRabbit = {
    createConfirmChannel: vi.fn().mockResolvedValue(canal),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  return { canal, conexion };
}

describe("publicador outbox", () => {
  it("declara un topic durable y publica JSON persistente con confirms", async () => {
    const repositorio: RepositorioOutbox = {
      publicarSiguiente: async (publicar) => {
        await publicar(evento);
        return true;
      },
    };
    const { canal, conexion } = doblesRabbit();
    const publicador = new OutboxPublisher(
      repositorio,
      { url: "amqp://rabbit", exchange: "sa.events", pollMs: 100 },
      pino({ level: "silent" }),
      vi.fn().mockResolvedValue(conexion),
    );

    await expect(publicador.publicarSiguiente()).resolves.toBe(true);
    expect(canal.assertExchange).toHaveBeenCalledWith("sa.events", "topic", {
      durable: true,
    });
    expect(canal.publish).toHaveBeenCalledOnce();
    const llamada = vi.mocked(canal.publish).mock.calls[0]!;
    expect(llamada[0]).toBe("sa.events");
    expect(llamada[1]).toBe("solicitud.creada");
    expect(JSON.parse(llamada[2].toString("utf8"))).toEqual({
      event_id: evento.eventId,
      event_type: evento.eventType,
      occurred_at: evento.occurredAt,
      data: evento.data,
    });
    expect(llamada[3]).toMatchObject({
      persistent: true,
      contentType: "application/json",
      messageId: evento.eventId,
      type: evento.eventType,
    });
    expect(canal.waitForConfirms).toHaveBeenCalledOnce();
    await publicador.stop();
  });

  it("propaga un confirm fallido para conservar el evento pendiente", async () => {
    const repositorio: RepositorioOutbox = {
      publicarSiguiente: async (publicar) => {
        await publicar(evento);
        return true;
      },
    };
    const { conexion } = doblesRabbit(Promise.reject(new Error("nack")));
    const publicador = new OutboxPublisher(
      repositorio,
      { url: "amqp://rabbit", exchange: "sa.events", pollMs: 100 },
      pino({ level: "silent" }),
      vi.fn().mockResolvedValue(conexion),
    );

    await expect(publicador.publicarSiguiente()).rejects.toThrow("nack");
    await publicador.stop();
  });

  it("bloquea con SKIP LOCKED y marca publicado después del envío", async () => {
    const operaciones: string[] = [];
    const client = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        const normalizada = sql.replace(/\s+/gu, " ").trim();
        operaciones.push(normalizada);
        if (normalizada.startsWith("SELECT id, event_type")) {
          return {
            rows: [
              {
                id: evento.eventId,
                event_type: evento.eventType,
                routing_key: evento.routingKey,
                occurred_at: new Date(evento.occurredAt),
                data: evento.data,
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const repositorio = new PostgresOutboxRepository(pool);
    const publicar = vi.fn().mockImplementation(async () => {
      operaciones.push("PUBLICAR");
    });

    await expect(repositorio.publicarSiguiente(publicar)).resolves.toBe(true);
    const seleccion = operaciones.find((item) => item.startsWith("SELECT id, event_type"));
    expect(seleccion).toContain("FOR UPDATE SKIP LOCKED");
    expect(operaciones.indexOf("PUBLICAR")).toBeLessThan(
      operaciones.findIndex((item) => item.startsWith("UPDATE outbox_events")),
    );
    expect(operaciones.at(-1)).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
