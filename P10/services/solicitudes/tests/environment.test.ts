import { describe, expect, it } from "vitest";
import { obtenerEnvironment } from "../src/config/environment.js";

describe("configuración de solicitudes", () => {
  it("configura RabbitMQ, el polling y el nivel de log", () => {
    const environment = obtenerEnvironment({
      NODE_ENV: "test",
      RABBITMQ_URL: "amqps://usuario:clave@rabbit.example:5671/vhost",
      RABBITMQ_EXCHANGE: "eventos.prueba",
      OUTBOX_POLL_MS: "250",
      LOG_LEVEL: "debug",
    });

    expect(environment.RABBITMQ_URL).toBe(
      "amqps://usuario:clave@rabbit.example:5671/vhost",
    );
    expect(environment.RABBITMQ_EXCHANGE).toBe("eventos.prueba");
    expect(environment.OUTBOX_POLL_MS).toBe(250);
    expect(environment.LOG_LEVEL).toBe("debug");
  });

  it("usa valores seguros conocidos y rechaza configuración inválida", () => {
    const environment = obtenerEnvironment({ NODE_ENV: "test" });
    expect(environment.RABBITMQ_EXCHANGE).toBe("sa.events");
    expect(environment.OUTBOX_POLL_MS).toBe(1_000);
    expect(environment.LOG_LEVEL).toBe("info");

    expect(() =>
      obtenerEnvironment({
        NODE_ENV: "test",
        RABBITMQ_URL: "https://rabbit.example",
      }),
    ).toThrow();
    expect(() =>
      obtenerEnvironment({ NODE_ENV: "test", LOG_LEVEL: "verbose" }),
    ).toThrow();
  });
});
