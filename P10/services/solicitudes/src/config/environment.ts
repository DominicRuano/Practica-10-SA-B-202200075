import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z
    .string()
    .min(1)
    .default(
      "postgresql://solicitudes:solicitudes@postgres-solicitudes:5432/solicitudes",
    ),
  DB_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  CATALOGO_URL: z
    .url()
    .default("http://catalogo:8000/api/v1/catalogo/graphql"),
  CATALOGO_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(3_000),
  RABBITMQ_URL: z
    .string()
    .min(1)
    .default("amqp://guest:guest@rabbitmq:5672")
    .refine((value) => {
      try {
        return ["amqp:", "amqps:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, "Debe ser una URL amqp:// o amqps:// válida."),
  RABBITMQ_EXCHANGE: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default("sa.events"),
  OUTBOX_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type Environment = z.infer<typeof environmentSchema>;

export function obtenerEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  return environmentSchema.parse(source);
}
