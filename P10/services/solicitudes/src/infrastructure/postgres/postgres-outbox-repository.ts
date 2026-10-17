import type { Pool, PoolClient } from "pg";

export interface EventoOutbox {
  eventId: string;
  eventType: string;
  routingKey: string;
  occurredAt: string;
  data: unknown;
}

export type PublicarEvento = (evento: EventoOutbox) => Promise<void>;

export interface RepositorioOutbox {
  publicarSiguiente(publicar: PublicarEvento): Promise<boolean>;
}

interface EventoOutboxRow {
  id: string;
  event_type: string;
  routing_key: string;
  occurred_at: Date | string;
  data: unknown;
}

/**
 * Claims one event while holding its row lock. SKIP LOCKED distributes pending
 * rows across replicas. The row is marked only after RabbitMQ confirms the
 * publish; a failed confirmation rolls back and leaves it available for retry.
 */
export class PostgresOutboxRepository implements RepositorioOutbox {
  constructor(private readonly pool: Pool) {}

  async publicarSiguiente(publicar: PublicarEvento): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const resultado = await client.query<EventoOutboxRow>(`
        SELECT id, event_type, routing_key, occurred_at, data
        FROM outbox_events
        WHERE published_at IS NULL
        ORDER BY occurred_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      const row = resultado.rows[0];
      if (row === undefined) {
        await client.query("COMMIT");
        return false;
      }

      await publicar({
        eventId: row.id,
        eventType: row.event_type,
        routingKey: row.routing_key,
        occurredAt:
          row.occurred_at instanceof Date
            ? row.occurred_at.toISOString()
            : new Date(row.occurred_at).toISOString(),
        data: row.data,
      });
      await client.query(
        `UPDATE outbox_events
         SET published_at = NOW(), publish_attempts = publish_attempts + 1
         WHERE id = $1 AND published_at IS NULL`,
        [row.id],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await rollbackSilencioso(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function rollbackSilencioso(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {}
}
