import type Database from "better-sqlite3";
import type { FastifyBaseLogger } from "fastify";
import { publishDuePosts } from "./publish-due.js";

export interface PublicationScheduler {
  stop(): void;
  runNow(nowMs?: number): void;
}

export function startPublicationScheduler(
  sqlite: Database.Database,
  logger: FastifyBaseLogger,
  intervalMs = 5_000,
): PublicationScheduler {
  const runNow = (nowMs = Date.now()) => {
    try {
      const result = publishDuePosts(sqlite, nowMs);
      if (result.publishedPostIds.length > 0) {
        logger.info({ postCount: result.publishedPostIds.length }, "published due Polo posts");
      }
    } catch (error) {
      logger.error({ err: error }, "scheduled publication pass failed");
    }
  };

  runNow();
  const timer = setInterval(runNow, intervalMs);
  timer.unref();

  return {
    stop: () => clearInterval(timer),
    runNow,
  };
}
