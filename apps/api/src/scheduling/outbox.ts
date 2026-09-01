import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export function enqueuePublicationEvent(
  sqlite: Database.Database,
  postId: string,
  createdAt: number,
): void {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO notification_outbox
       (id, post_id, event_key, event_type, created_at, delivered_at, attempts, last_error)
       VALUES (?, ?, ?, 'post.published', ?, NULL, 0, NULL)`,
    )
    .run(randomUUID(), postId, `post-published:${postId}`, createdAt);
}
