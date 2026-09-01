import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { buildApp } from "../app.js";

const registrationSecret = "local-test-secret-123";
let app: FastifyInstance | undefined;
let sqlite: Database.Database | undefined;

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
  sqlite = undefined;
});

async function register(username: string) {
  const response = await app!.inject({ method: "POST", url: "/auth/register", payload: { registrationSecret, username, displayName: username, password: "correct horse battery staple" } });
  return response.json() as { token: string; user: { id: string } };
}

async function createThread(token: string, memberUserIds: string[] = []) {
  const response = await app!.inject({ method: "POST", url: "/threads", headers: { authorization: `Bearer ${token}` }, payload: { memberUserIds } });
  return response.json().thread.id as string;
}

function seedConnection(userId: string): string {
  const id = randomUUID();
  const now = Date.now();
  sqlite!.prepare("INSERT INTO immich_connections (id,user_id,base_url,credential_ciphertext,created_at,updated_at) VALUES (?,?, 'https://example.invalid','sealed',?,?)").run(id, userId, now, now);
  return id;
}

function seedPost(input: { id: string; threadId: string; authorId: string; connectionId: string; status: string; visibleAt?: number; mediaType?: string; durationMs?: number | null }) {
  const now = Date.now();
  const visibleAt = input.visibleAt ?? now;
  sqlite!.prepare("INSERT INTO posts (id,thread_id,author_id,status,created_at,visible_at,published_at) VALUES (?,?,?,?,?,?,?)").run(input.id, input.threadId, input.authorId, input.status, now, visibleAt, input.status === "published" ? now : null);
  sqlite!.prepare("INSERT INTO post_assets (id,post_id,position,immich_connection_id,immich_asset_id,media_type,duration_ms) VALUES (?,?,0,?,'asset-1',?,?)").run(randomUUID(), input.id, input.connectionId, input.mediaType ?? "video", input.durationMs ?? 60_000);
}

describe("post scheduling/deletion/view routes", () => {
  it("records video progress and only marks watched at the server threshold", async () => {
    const built = buildApp({ databasePath: ":memory:", registrationSecret });
    app = built.app; sqlite = built.database.sqlite;
    const alice = await register("alice");
    const bob = await register("bob");
    const threadId = await createThread(alice.token, [bob.user.id]);
    const connectionId = seedConnection(alice.user.id);
    seedPost({ id: "post1", threadId, authorId: alice.user.id, connectionId, status: "published", durationMs: 60_000 });

    const early = await app.inject({ method: "PUT", url: "/posts/post1/view", headers: { authorization: `Bearer ${bob.token}` }, payload: { playbackPositionMs: 10_000 } });
    expect(early.statusCode).toBe(200);
    expect(early.json().watchedAt).toBeNull();

    const finished = await app.inject({ method: "PUT", url: "/posts/post1/view", headers: { authorization: `Bearer ${bob.token}` }, payload: { playbackPositionMs: 58_000 } });
    expect(finished.statusCode).toBe(200);
    expect(finished.json().watchedAt).not.toBeNull();
  });

  it("hides scheduled view state from recipients and permits only author reschedule/delete", async () => {
    const built = buildApp({ databasePath: ":memory:", registrationSecret });
    app = built.app; sqlite = built.database.sqlite;
    const alice = await register("alice");
    const bob = await register("bob");
    const threadId = await createThread(alice.token, [bob.user.id]);
    const connectionId = seedConnection(alice.user.id);
    seedPost({ id: "scheduled1", threadId, authorId: alice.user.id, connectionId, status: "scheduled", visibleAt: Date.now() + 60_000 });

    const hidden = await app.inject({ method: "PUT", url: "/posts/scheduled1/view", headers: { authorization: `Bearer ${bob.token}` }, payload: {} });
    expect(hidden.statusCode).toBe(404);

    const forbidden = await app.inject({ method: "PATCH", url: "/posts/scheduled1/schedule", headers: { authorization: `Bearer ${bob.token}` }, payload: { visibleAt: new Date(Date.now() + 120_000).toISOString() } });
    expect(forbidden.statusCode).toBe(403);

    const rescheduled = await app.inject({ method: "PATCH", url: "/posts/scheduled1/schedule", headers: { authorization: `Bearer ${alice.token}` }, payload: { visibleAt: new Date(Date.now() + 180_000).toISOString() } });
    expect(rescheduled.statusCode).toBe(200);

    const deleted = await app.inject({ method: "DELETE", url: "/posts/scheduled1", headers: { authorization: `Bearer ${alice.token}` } });
    expect(deleted.statusCode).toBe(204);
    expect(sqlite.prepare("SELECT id FROM posts WHERE id='scheduled1'").get()).toBeUndefined();
  });
});
