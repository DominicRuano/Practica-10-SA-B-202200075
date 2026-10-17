import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { TituloSolicitudDuplicadoError } from "../../domain/errors.js";
import type { RepositorioSolicitudes } from "../../domain/ports.js";
import type {
  DatosCreacionSolicitud,
  DatosReemplazoSolicitud,
  EstadoSolicitud,
  IdentidadUsuario,
  ResumenSolicitudes,
  Solicitud,
} from "../../domain/solicitud.js";

interface SolicitudRow {
  id: string;
  usuario_id: string;
  categoria_id: number;
  titulo: string;
  descripcion: string;
  prioridad: number;
  estado: EstadoSolicitud;
  creada_en: Date | string;
  actualizada_en: Date | string;
}

interface ResumenRow {
  total: string | number;
  registradas: string | number;
  en_proceso: string | number;
  finalizadas: string | number;
  prioridad_alta: string | number;
}

interface EventoPendiente {
  eventType: "solicitud.creada" | "solicitud.actualizada" | "solicitud.eliminada";
  data: Solicitud | { id: string };
}

interface ResultadoMutacion<T> {
  resultado: T;
  evento?: EventoPendiente;
}

const CAMPOS = `
  id,
  usuario_id,
  categoria_id,
  titulo,
  descripcion,
  prioridad,
  estado,
  creada_en,
  actualizada_en
`;

function aIso(fecha: Date | string): string {
  return fecha instanceof Date ? fecha.toISOString() : new Date(fecha).toISOString();
}

function mapear(row: SolicitudRow): Solicitud {
  return {
    ...row,
    creada_en: aIso(row.creada_en),
    actualizada_en: aIso(row.actualizada_en),
  };
}

function esViolacionUnica(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

/** PostgreSQL repository whose writes atomically append an outbox event. */
export class PostgresSolicitudRepository implements RepositorioSolicitudes {
  constructor(private readonly pool: Pool) {}

  async listar(identidad: IdentidadUsuario): Promise<Solicitud[]> {
    const resultado = await this.pool.query<SolicitudRow>(
      `
        SELECT ${CAMPOS}
        FROM solicitudes
        WHERE $1::boolean OR usuario_id = $2::uuid
        ORDER BY creada_en DESC, id ASC
      `,
      [identidad.rol === "admin", identidad.usuarioId],
    );
    return resultado.rows.map(mapear);
  }

  async obtener(
    id: string,
    identidad: IdentidadUsuario,
  ): Promise<Solicitud | null> {
    const resultado = await this.pool.query<SolicitudRow>(
      `
        SELECT ${CAMPOS}
        FROM solicitudes
        WHERE id = $1::uuid
          AND ($2::boolean OR usuario_id = $3::uuid)
      `,
      [id, identidad.rol === "admin", identidad.usuarioId],
    );
    const row = resultado.rows[0];
    return row === undefined ? null : mapear(row);
  }

  async crear(
    usuarioId: string,
    datos: DatosCreacionSolicitud,
  ): Promise<Solicitud> {
    try {
      return await this.mutar(async (client) => {
        const resultado = await client.query<SolicitudRow>(
          `
            INSERT INTO solicitudes (
              usuario_id,
              categoria_id,
              titulo,
              descripcion,
              prioridad
            )
            VALUES ($1::uuid, $2, $3, $4, $5)
            RETURNING ${CAMPOS}
          `,
          [
            usuarioId,
            datos.categoria_id,
            datos.titulo,
            datos.descripcion,
            datos.prioridad,
          ],
        );
        const solicitud = mapear(resultado.rows[0]!);
        return {
          resultado: solicitud,
          evento: { eventType: "solicitud.creada", data: solicitud },
        };
      });
    } catch (error) {
      if (esViolacionUnica(error)) throw new TituloSolicitudDuplicadoError();
      throw error;
    }
  }

  async reemplazar(
    id: string,
    identidad: IdentidadUsuario,
    datos: DatosReemplazoSolicitud,
  ): Promise<Solicitud | null> {
    try {
      return await this.mutar(async (client) => {
        const resultado = await client.query<SolicitudRow>(
          `
            UPDATE solicitudes
            SET categoria_id = $1,
                titulo = $2,
                descripcion = $3,
                prioridad = $4,
                estado = $5,
                actualizada_en = NOW()
            WHERE id = $6::uuid
              AND ($7::boolean OR usuario_id = $8::uuid)
            RETURNING ${CAMPOS}
          `,
          [
            datos.categoria_id,
            datos.titulo,
            datos.descripcion,
            datos.prioridad,
            datos.estado,
            id,
            identidad.rol === "admin",
            identidad.usuarioId,
          ],
        );
        const row = resultado.rows[0];
        if (row === undefined) return { resultado: null };
        const solicitud = mapear(row);
        return {
          resultado: solicitud,
          evento: { eventType: "solicitud.actualizada", data: solicitud },
        };
      });
    } catch (error) {
      if (esViolacionUnica(error)) throw new TituloSolicitudDuplicadoError();
      throw error;
    }
  }

  async actualizarEstado(
    id: string,
    identidad: IdentidadUsuario,
    estado: EstadoSolicitud,
  ): Promise<Solicitud | null> {
    try {
      return await this.mutar(async (client) => {
        const resultado = await client.query<SolicitudRow>(
          `
            UPDATE solicitudes
            SET estado = $1,
                actualizada_en = NOW()
            WHERE id = $2::uuid
              AND ($3::boolean OR usuario_id = $4::uuid)
            RETURNING ${CAMPOS}
          `,
          [estado, id, identidad.rol === "admin", identidad.usuarioId],
        );
        const row = resultado.rows[0];
        if (row === undefined) return { resultado: null };
        const solicitud = mapear(row);
        return {
          resultado: solicitud,
          evento: { eventType: "solicitud.actualizada", data: solicitud },
        };
      });
    } catch (error) {
      if (esViolacionUnica(error)) throw new TituloSolicitudDuplicadoError();
      throw error;
    }
  }

  async eliminar(id: string, identidad: IdentidadUsuario): Promise<boolean> {
    return this.mutar(async (client) => {
      const resultado = await client.query<{ id: string }>(
        `
          DELETE FROM solicitudes
          WHERE id = $1::uuid
            AND ($2::boolean OR usuario_id = $3::uuid)
          RETURNING id
        `,
        [id, identidad.rol === "admin", identidad.usuarioId],
      );
      const eliminada = resultado.rows[0];
      if (eliminada === undefined) return { resultado: false };
      return {
        resultado: true,
        evento: { eventType: "solicitud.eliminada", data: { id: eliminada.id } },
      };
    });
  }

  async resumir(identidad: IdentidadUsuario): Promise<ResumenSolicitudes> {
    const resultado = await this.pool.query<ResumenRow>(
      `
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE estado = 'registrada') AS registradas,
          COUNT(*) FILTER (WHERE estado = 'en_proceso') AS en_proceso,
          COUNT(*) FILTER (WHERE estado = 'finalizada') AS finalizadas,
          COUNT(*) FILTER (WHERE prioridad >= 4) AS prioridad_alta
        FROM solicitudes
        WHERE $1::boolean OR usuario_id = $2::uuid
      `,
      [identidad.rol === "admin", identidad.usuarioId],
    );
    const row = resultado.rows[0]!;
    return {
      total: Number(row.total),
      registradas: Number(row.registradas),
      en_proceso: Number(row.en_proceso),
      finalizadas: Number(row.finalizadas),
      prioridad_alta: Number(row.prioridad_alta),
    };
  }

  private async mutar<T>(
    operacion: (client: PoolClient) => Promise<ResultadoMutacion<T>>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { resultado, evento } = await operacion(client);
      if (evento !== undefined) await this.guardarEvento(client, evento);
      await client.query("COMMIT");
      return resultado;
    } catch (error) {
      await rollbackSilencioso(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async guardarEvento(
    client: PoolClient,
    evento: EventoPendiente,
  ): Promise<void> {
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    await client.query(
      `INSERT INTO outbox_events (
         id, event_type, routing_key, occurred_at, data
       ) VALUES ($1::uuid, $2, $3, $4::timestamptz, $5::jsonb)`,
      [
        eventId,
        evento.eventType,
        evento.eventType,
        occurredAt,
        JSON.stringify(evento.data),
      ],
    );
  }
}

async function rollbackSilencioso(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {}
}
