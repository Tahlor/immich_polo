import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { checkDatabase, createDatabase } from "./db/client.js";

export interface BuildAppOptions {
  databasePath?: string;
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}) {
  const env = { ...process.env };
  if (options.databasePath) env.DATABASE_PATH = options.databasePath;
  const config = loadConfig(env);
  const database = createDatabase(config.databasePath);
  const app = Fastify({ logger: options.logger ?? false });

  app.get("/health", async () => ({
    ok: true,
    service: "immich-polo-api",
  }));

  app.get("/ready", async (_request, reply) => {
    try {
      checkDatabase(database.sqlite);
      return { ok: true, database: "ready" };
    } catch (error) {
      app.log.error({ err: error }, "readiness check failed");
      return reply.code(503).send({ ok: false, database: "unavailable" });
    }
  });

  app.addHook("onClose", async () => {
    database.sqlite.close();
  });

  return { app, config, database };
}
