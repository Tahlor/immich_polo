import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createDatabase } from "../db/client.js";
import { publishDuePosts } from "./publish-due.js";

let sqlite: Database.Database | undefined;

afterEach(() => {
  sqlite?.close();
  sqlite = undefined;
});

function seedUserAndThread(db: Database.Database) {
  const now = Date.now();
  db.prepare("INSERT INTO users (id, display_name, auth_subject, password_hash, notification_enabled, created_at) VALUES ('u1','User','user',NULL,1,?)").run(now);
  db.prepare("INSERT INTO threads (id, title, created_at) VALUES ('t1',NULL,?)").run(now);
  db.prepare("INSERT INTO thread_members (thread_id,user_id,joined_at,last_read_at) VALUES ('t1','u1',?,NULL)").run(now);
}

function seedPost(db: Database.Database, id: string, status: string, visibleAt: number) {
  db.prepare(
    `INSERT INTO posts (id,thread_id,author_id,reply_to_post_id,caption,status,created_at,visible_at,published_at)
     VALUES (?, 't1', 'u1', NULL, NULL, ?, ?, ?, NULL)`,
  ).run(id, status, visibleAt - 100, visibleAt);
}

describe("publishDuePosts", () => {
  it("publishes due posts once and writes one outbox event", () => {
    ({ sqlite } = createDatabase(":memory:"));
    seedUserAndThread(sqlite);
    seedPost(sqlite, "p1", "scheduled", 1_000);

    expect(publishDuePosts(sqlite, 2_000).publishedPostIds).toEqual(["p1"]);
    expect(publishDuePosts(sqlite, 3_000).publishedPostIds).toEqual([]);

    const post = sqlite.prepare("SELECT status, published_at AS publishedAt FROM posts WHERE id='p1'").get() as { status: string; publishedAt: number };
    expect(post).toEqual({ status: "published", publishedAt: 2_000 });
    const events = sqlite.prepare("SELECT event_key AS eventKey FROM notification_outbox WHERE post_id='p1'").all();
    expect(events).toEqual([{ eventKey: "post-published:p1" }]);
  });

  it("leaves future and cancelled posts untouched", () => {
    ({ sqlite } = createDatabase(":memory:"));
    seedUserAndThread(sqlite);
    seedPost(sqlite, "future", "scheduled", 5_000);
    seedPost(sqlite, "cancelled", "cancelled", 1_000);

    expect(publishDuePosts(sqlite, 2_000).publishedPostIds).toEqual([]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM notification_outbox").get()).toEqual({ count: 0 });
  });

  it("remains idempotent if a competing pass already published the row", () => {
    ({ sqlite } = createDatabase(":memory:"));
    seedUserAndThread(sqlite);
    const id = randomUUID();
    seedPost(sqlite, id, "scheduled", 1_000);
    const first = publishDuePosts(sqlite, 2_000);
    const second = publishDuePosts(sqlite, 2_000);
    expect(first.publishedPostIds).toEqual([id]);
    expect(second.publishedPostIds).toEqual([]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE post_id=?").get(id)).toEqual({ count: 1 });
  });
});
