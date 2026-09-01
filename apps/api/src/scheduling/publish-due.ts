import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export interface PublicationResult {
  publishedPostIds: string[];
}

/**
 * Atomically publishes every currently-due scheduled post and creates one durable
 * notification-outbox event per successful publication. Calling this repeatedly,
 * after restart, or from competing workers is safe: the guarded status update and
 * unique outbox keys make publication idempotent.
 */
export function publishDuePosts(
  sqlite: Database.Database,
  nowMs = Date.now(),
): PublicationResult {
  const work = sqlite.transaction(() => {
    const due = sqlite
      .prepare(
        `SELECT id FROM posts
         WHERE status = 'scheduled' AND visible_at <= ?
         ORDER BY visible_at ASC, id ASC`,
      )
      .all(nowMs) as Array<{ id: string }>;

    const publishedPostIds: string[] = [];
    const publish = sqlite.prepare(
      `UPDATE posts
       SET status = 'published', published_at = ?
       WHERE id = ? AND status = 'scheduled' AND visible_at <= ?`,
    );
    const enqueue = sqlite.prepare(
      `INSERT OR IGNORE INTO notification_outbox
       (id, post_id, event_key, event_type, created_at, delivered_at, attempts, last_error)
       VALUES (?, ?, ?, 'post.published', ?, NULL, 0, NULL)`,
    );

    for (const post of due) {
      const result = publish.run(nowMs, post.id, nowMs);
      if (result.changes !== 1) continue;
      enqueue.run(randomUUID(), post.id, `post-published:${post.id}`, nowMs);
      publishedPostIds.push(post.id);
    }

    return { publishedPostIds };
  });

  return work.immediate();
}
