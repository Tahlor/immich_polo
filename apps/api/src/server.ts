import { buildApp } from "./app.js";
import { startPublicationScheduler } from "./scheduling/worker.js";

const { app, config, database } = buildApp({ logger: true });
const scheduler = startPublicationScheduler(database.sqlite, app.log);
app.addHook("onClose", async () => scheduler.stop());

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  scheduler.stop();
  app.log.error(error);
  process.exitCode = 1;
}
