import { connect } from "amqplib";
import type { Logger } from "pino";
import type {
  EventoOutbox,
  RepositorioOutbox,
} from "../postgres/postgres-outbox-repository.js";

export interface CanalConfirmacionRabbit {
  assertExchange(
    exchange: string,
    type: "topic",
    options: { durable: true },
  ): Promise<unknown>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: {
      persistent: true;
      contentType: "application/json";
      contentEncoding: "utf-8";
      messageId: string;
      type: string;
      timestamp: number;
      appId: string;
    },
  ): boolean;
  waitForConfirms(): Promise<void>;
  close(): Promise<void>;
  on(event: "error", listener: (error: Error) => void): unknown;
}

export interface ConexionRabbit {
  createConfirmChannel(): Promise<CanalConfirmacionRabbit>;
  close(): Promise<void>;
  on(event: "error", listener: (error: Error) => void): unknown;
}

export type ConectarRabbit = (url: string) => Promise<ConexionRabbit>;

export interface OutboxPublisherOptions {
  url: string;
  exchange: string;
  pollMs: number;
}

type OutboxLogger = Pick<Logger, "debug" | "info" | "warn">;

const conectarRabbit: ConectarRabbit = async (url) => {
  const connection = await connect(url, { timeout: 5_000 });
  return connection as unknown as ConexionRabbit;
};

/** At-least-once publisher backed by PostgreSQL and RabbitMQ confirms. */
export class OutboxPublisher {
  private activo = false;
  private bucle: Promise<void> | undefined;
  private conexion: ConexionRabbit | undefined;
  private canal: CanalConfirmacionRabbit | undefined;
  private interrumpirEspera: (() => void) | undefined;

  constructor(
    private readonly repositorio: RepositorioOutbox,
    private readonly options: OutboxPublisherOptions,
    private readonly logger: OutboxLogger,
    private readonly conectar: ConectarRabbit = conectarRabbit,
  ) {}

  start(): void {
    if (this.activo) return;
    this.activo = true;
    this.bucle = this.ejecutarBucle();
  }

  async stop(): Promise<void> {
    if (!this.activo && this.bucle === undefined) {
      await this.cerrarTransporte();
      return;
    }
    this.activo = false;
    this.interrumpirEspera?.();
    await this.bucle;
    this.bucle = undefined;
    await this.cerrarTransporte();
  }

  /** Publishes at most one event; exposed to make delivery semantics testable. */
  async publicarSiguiente(): Promise<boolean> {
    const canal = await this.obtenerCanal();
    return this.repositorio.publicarSiguiente(async (evento) => {
      await this.publicarConfirmado(canal, evento);
    });
  }

  private async ejecutarBucle(): Promise<void> {
    while (this.activo) {
      try {
        const publicado = await this.publicarSiguiente();
        if (!publicado) await this.esperar(this.options.pollMs);
      } catch (error) {
        this.logger.warn({ err: error }, "No fue posible publicar el evento outbox; se reintentará");
        await this.cerrarTransporte();
        if (this.activo) await this.esperar(this.options.pollMs);
      }
    }
  }

  private async obtenerCanal(): Promise<CanalConfirmacionRabbit> {
    if (this.canal !== undefined) return this.canal;

    const conexion = await this.conectar(this.options.url);
    conexion.on("error", (error) => {
      this.logger.warn({ err: error }, "Conexión RabbitMQ interrumpida");
    });
    try {
      const canal = await conexion.createConfirmChannel();
      canal.on("error", (error) => {
        this.logger.warn({ err: error }, "Canal RabbitMQ interrumpido");
      });
      await canal.assertExchange(this.options.exchange, "topic", { durable: true });
      this.conexion = conexion;
      this.canal = canal;
      this.logger.info({ exchange: this.options.exchange }, "Publicador outbox conectado a RabbitMQ");
      return canal;
    } catch (error) {
      await conexion.close().catch(() => undefined);
      throw error;
    }
  }

  private async publicarConfirmado(
    canal: CanalConfirmacionRabbit,
    evento: EventoOutbox,
  ): Promise<void> {
    const mensaje = Buffer.from(
      JSON.stringify({
        event_id: evento.eventId,
        event_type: evento.eventType,
        occurred_at: evento.occurredAt,
        data: evento.data,
      }),
      "utf8",
    );
    canal.publish(this.options.exchange, evento.routingKey, mensaje, {
      persistent: true,
      contentType: "application/json",
      contentEncoding: "utf-8",
      messageId: evento.eventId,
      type: evento.eventType,
      timestamp: Math.floor(new Date(evento.occurredAt).getTime() / 1_000),
      appId: "practica5-solicitudes",
    });
    await canal.waitForConfirms();
    this.logger.debug(
      { eventId: evento.eventId, routingKey: evento.routingKey },
      "Evento outbox confirmado por RabbitMQ",
    );
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.interrumpirEspera = undefined;
        resolve();
      }, ms);
      this.interrumpirEspera = () => {
        clearTimeout(timer);
        this.interrumpirEspera = undefined;
        resolve();
      };
    });
  }

  private async cerrarTransporte(): Promise<void> {
    const canal = this.canal;
    const conexion = this.conexion;
    this.canal = undefined;
    this.conexion = undefined;
    await canal?.close().catch(() => undefined);
    await conexion?.close().catch(() => undefined);
  }
}
