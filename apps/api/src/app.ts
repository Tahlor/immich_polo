import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { UnverifiedImmichProvider, type ImmichMediaProvider } from "@immich-polo/immich-client";
import { registerAuthRoutes } from "./auth/routes.js";
import { loadConfig } from "./config.js";
import { checkDatabase, createDatabase } from "./db/client.js";
import { registerImmichRoutes } from "./immich/routes.js";
import { registerMediaRoutes } from "./media/routes.js";
import { registerExistingImmichPostRoute } from "./posts/from-immich.js";
import { registerPostRoutes } from "./posts/routes.js";
import { registerLocalUploadRoute } from "./posts/upload.js";
import { CredentialCrypto } from "./security/credential-crypto.js";
import { registerThreadRoutes } from "./threads/routes.js";

export interface BuildAppOptions {
  databasePath?: string;
  logger?: boolean;
  registrationSecret?: string;
  credentialKey?: string;
  immichProvider?: ImmichMediaProvider;
}

export function buildApp(options: BuildAppOptions = {}) {
  const env = { ...process.env };
  if (options.databasePath) env.DATABASE_PATH = options.databasePath;
  if (options.registrationSecret) env.POLO_REGISTRATION_SECRET = options.registrationSecret;
  if (options.credentialKey) env.POLO_CREDENTIAL_KEY = options.credentialKey;
  const config = loadConfig(env);
  const database = createDatabase(config.databasePath);
  const app = Fastify({ logger: options.logger ?? false });
  const immichProvider = options.immichProvider ?? new UnverifiedImmichProvider();
  const credentialCrypto = config.credentialKey ? new CredentialCrypto(config.credentialKey) : null;

  app.register(multipart, {
    limits: { files: 1, fields: 8, parts: 10, fileSize: 8 * 1024 * 1024 * 1024 },
  });

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
  registerImmichRoutes(app, database.sqlite, immichProvider, credentialCrypto);
  registerExistingImmichPostRoute(app, database.sqlite, immichProvider, credentialCrypto);
  registerLocalUploadRoute(app, database.sqlite, immichProvider, credentialCrypto);
  registerMediaRoutes(app, database.sqlite, immichProvider, credentialCrypto);

  app.addHook("onClose", async () => {
    database.sqlite.close();
  });

  return { app, config, database, immichProvider };
}
