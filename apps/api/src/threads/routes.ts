import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/routes.js";
import { isThreadMember } from "./authorization.js";

const CreateThreadSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  memberUserIds: z.array(z.string().min(1)).max(20).default([]),
});

function threadMembers(sqlite: Database.Database, threadId: string) {
  return sqlite
    .prepare(
      `SELECT u.id, u.display_name AS displayName, u.auth_subject AS username
       FROM thread_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.thread_id = ?
       ORDER BY tm.joined_at, u.id`,
    )
    .all(threadId) as Array<{ id: string; displayName: string; username: string }>;
}

export function registerThreadRoutes(app: FastifyInstance, sqlite: Database.Database): void {
  app.get("/threads", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;

    const rows = sqlite
      .prepare(
        `SELECT t.id, t.title, t.created_at AS createdAt
         FROM threads t
         JOIN thread_members tm ON tm.thread_id = t.id
         WHERE tm.user_id = ?
         ORDER BY t.created_at DESC, t.id DESC`,
      )
      .all(user.id) as Array<{ id: string; title: string | null; createdAt: number }>;

    return {
      threads: rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: new Date(row.createdAt).toISOString(),
        members: threadMembers(sqlite, row.id),
      })),
    };
  });

  app.post("/threads", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    const parsed = CreateThreadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

    const memberIds = [...new Set([user.id, ...parsed.data.memberUserIds])];
    const placeholders = memberIds.map(() => "?").join(",");
    const found = sqlite
      .prepare(`SELECT id FROM users WHERE id IN (${placeholders})`)
      .all(...memberIds) as Array<{ id: string }>;
    if (found.length !== memberIds.length) {
      return reply.code(400).send({ error: "unknown_member" });
    }

    const threadId = randomUUID();
    const now = Date.now();
    const create = sqlite.transaction(() => {
      sqlite.prepare("INSERT INTO threads (id, title, created_at) VALUES (?, ?, ?)").run(
        threadId,
        parsed.data.title ?? null,
        now,
      );
      const insertMember = sqlite.prepare(
        "INSERT INTO thread_members (thread_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, NULL)",
      );
      for (const memberId of memberIds) insertMember.run(threadId, memberId, now);
    });
    create();

    return reply.code(201).send({
      thread: {
        id: threadId,
        title: parsed.data.title ?? null,
        createdAt: new Date(now).toISOString(),
        members: threadMembers(sqlite, threadId),
      },
    });
  });

  app.get("/threads/:threadId/posts", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    const params = z.object({ threadId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_request" });
    if (!isThreadMember(sqlite, user.id, params.data.threadId)) {
      return reply.code(403).send({ error: "not_thread_member" });
    }

    const posts = sqlite
      .prepare(
        `SELECT p.id, p.author_id AS authorId, u.display_name AS authorDisplayName,
                p.caption, p.status, p.created_at AS createdAt, p.visible_at AS visibleAt,
                p.published_at AS publishedAt
         FROM posts p
         JOIN users u ON u.id = p.author_id
         WHERE p.thread_id = ?
           AND (p.status = 'published' OR (p.author_id = ? AND p.status = 'scheduled'))
         ORDER BY p.created_at ASC, p.id ASC`,
      )
      .all(params.data.threadId, user.id) as Array<{
        id: string;
        authorId: string;
        authorDisplayName: string;
        caption: string | null;
        status: string;
        createdAt: number;
        visibleAt: number;
        publishedAt: number | null;
      }>;

    const assetStatement = sqlite.prepare(
      `SELECT id, position, media_type AS mediaType, width, height, duration_ms AS durationMs, captured_at AS capturedAt
       FROM post_assets WHERE post_id = ? ORDER BY position`,
    );

    return {
      posts: posts.map((post) => ({
        ...post,
        createdAt: new Date(post.createdAt).toISOString(),
        visibleAt: new Date(post.visibleAt).toISOString(),
        publishedAt: post.publishedAt === null ? null : new Date(post.publishedAt).toISOString(),
        assets: (assetStatement.all(post.id) as Array<Record<string, unknown>>).map((asset) => ({
          ...asset,
          capturedAt:
            typeof asset.capturedAt === "number" ? new Date(asset.capturedAt).toISOString() : null,
        })),
      })),
    };
  });
}
