import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isVideoWatched, parseAbsoluteInstant } from "@immich-polo/domain";
import { requireUser } from "../auth/routes.js";
import { isThreadMember } from "../threads/authorization.js";

const ScheduleSchema = z.object({ visibleAt: z.string().min(1) });
const ViewSchema = z.object({ playbackPositionMs: z.number().int().min(0).max(86_400_000).optional() });
const ParamsSchema = z.object({ postId: z.string().min(1) });

type PostAuthRow = {
  id: string;
  threadId: string;
  authorId: string;
  status: string;
};

function findPost(sqlite: Database.Database, postId: string): PostAuthRow | undefined {
  return sqlite
    .prepare("SELECT id, thread_id AS threadId, author_id AS authorId, status FROM posts WHERE id = ?")
    .get(postId) as PostAuthRow | undefined;
}

export function registerPostRoutes(app: FastifyInstance, sqlite: Database.Database): void {
  app.patch("/posts/:postId/schedule", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    const params = ParamsSchema.safeParse(request.params);
    const body = ScheduleSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_request" });

    const post = findPost(sqlite, params.data.postId);
    if (!post) return reply.code(404).send({ error: "post_not_found" });
    if (post.authorId !== user.id) return reply.code(403).send({ error: "not_post_author" });
    if (post.status !== "scheduled") return reply.code(409).send({ error: "post_not_scheduled" });

    let visibleAt: Date;
    try {
      visibleAt = parseAbsoluteInstant(body.data.visibleAt);
    } catch {
      return reply.code(400).send({ error: "invalid_visible_at" });
    }
    if (visibleAt.getTime() <= Date.now()) {
      return reply.code(400).send({ error: "visible_at_must_be_future" });
    }

    sqlite.prepare("UPDATE posts SET visible_at = ? WHERE id = ? AND status = 'scheduled'").run(visibleAt.getTime(), post.id);
    return { postId: post.id, status: "scheduled", visibleAt: visibleAt.toISOString() };
  });

  app.delete("/posts/:postId", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_request" });
    const post = findPost(sqlite, params.data.postId);
    if (!post) return reply.code(404).send({ error: "post_not_found" });
    if (post.authorId !== user.id) return reply.code(403).send({ error: "not_post_author" });

    sqlite.prepare("DELETE FROM posts WHERE id = ?").run(post.id);
    return reply.code(204).send();
  });

  app.put("/posts/:postId/view", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    const params = ParamsSchema.safeParse(request.params);
    const body = ViewSchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_request" });

    const post = findPost(sqlite, params.data.postId);
    if (!post) return reply.code(404).send({ error: "post_not_found" });
    if (!isThreadMember(sqlite, user.id, post.threadId)) return reply.code(403).send({ error: "not_thread_member" });
    if (post.status !== "published") return reply.code(404).send({ error: "post_not_visible" });

    const asset = sqlite
      .prepare("SELECT media_type AS mediaType, duration_ms AS durationMs FROM post_assets WHERE post_id = ? ORDER BY position LIMIT 1")
      .get(post.id) as { mediaType: "image" | "video"; durationMs: number | null } | undefined;
    if (!asset) return reply.code(409).send({ error: "post_has_no_media" });

    const existing = sqlite
      .prepare("SELECT first_seen_at AS firstSeenAt, watched_at AS watchedAt, playback_position_ms AS playbackPositionMs FROM post_views WHERE post_id = ? AND user_id = ?")
      .get(post.id, user.id) as { firstSeenAt: number; watchedAt: number | null; playbackPositionMs: number | null } | undefined;

    const now = Date.now();
    const firstSeenAt = existing?.firstSeenAt ?? now;
    const playbackPositionMs = body.data.playbackPositionMs ?? existing?.playbackPositionMs ?? null;
    let watchedAt = existing?.watchedAt ?? null;
    if (!watchedAt && asset.mediaType === "image") watchedAt = now;
    if (!watchedAt && asset.mediaType === "video" && asset.durationMs && playbackPositionMs !== null) {
      if (isVideoWatched({ durationMs: asset.durationMs, playbackPositionMs })) watchedAt = now;
    }

    sqlite
      .prepare(
        `INSERT INTO post_views (post_id,user_id,first_seen_at,watched_at,playback_position_ms,updated_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(post_id,user_id) DO UPDATE SET
           watched_at=excluded.watched_at,
           playback_position_ms=excluded.playback_position_ms,
           updated_at=excluded.updated_at`,
      )
      .run(post.id, user.id, firstSeenAt, watchedAt, playbackPositionMs, now);

    return {
      postId: post.id,
      firstSeenAt: new Date(firstSeenAt).toISOString(),
      watchedAt: watchedAt === null ? null : new Date(watchedAt).toISOString(),
      playbackPositionMs,
    };
  });
}
