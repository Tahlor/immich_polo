import Fastify from "fastify";
import { registerAuthRoutes } from "./auth/routes.js";
import { loadConfig } from "./config.js";
import { checkDatabase, createDatabase } from "./db/client.js";
import { registerPostRoutes } from "./posts/routes.js";
import { registerThreadRoutes } from "./threads/routes.js";

export interface BuildAppOptions {
  databasePath?: string;
  logger?: boolean;
  registrationSecret?: string;
}

export function buildApp(options: BuildAppOptions = {}) {
  const env = { ...process.env };
  if (options.databasePath) env.DATABASE_PATH = options.databasePath;
  if (options.registrationSecret) env.POLO_REGISTRATION_SECRET = options.registrationSecret;
  const config = loadConfig(env);
  const database = createDatabase(config.databasePath);
  const app = Fastify({ logger: options.logger ?? false });

  app.get("/health", async () => ({ ok: true, service: "immich-polo-api" }));

  app.get("/ready", async (_request, reply) => {
    try {
      checkDatabase(database.sqlite);
      return { ok: true, database: "ready" };
    } catch (error) {
      app.log.error({ err: error }, "readiness check failed");
      return reply.code(503).send({ ok: false, database: "unavailable" });
    }
  });

  registerAuthRoutes(app, database.sqlite, config);
  registerThreadRoutes(app, database.sqlite);
  registerPostRoutes(app, database.sqlite);

  app.addHook("onClose", async () => {
    database.sqlite.close();
  });

  return { app, config, database };
}
