import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { startWorkers, shutdownWorkers } from "./jobs/queue.js";

async function main() {
  const app = createApp();
  await startWorkers();
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.ENVIRONMENT }, "FinLink API ready");
    // eslint-disable-next-line no-console
    console.log(`FinLink API listening on http://localhost:${config.PORT}  (docs: /api/docs)`);
  });

  const shutdown = async (sig: string) => {
    logger.info({ sig }, "shutting down");
    server.close();
    await shutdownWorkers();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
