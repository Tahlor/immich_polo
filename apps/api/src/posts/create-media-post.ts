import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { MediaAsset } from "@immich-polo/immich-client";
import { enqueuePublicationEvent } from "../scheduling/outbox.js";

export interface CreateMediaPostInput {
  threadId: string;
  authorId: string;
  connectionId: string;
  asset: MediaAsset;
  caption?: string;
  visibleAtMs?: number;
  nowMs?: number;
}

export interface CreatedMediaPost {
  id: string;
  postAssetId: string;
  threadId: string;
  authorId: string;
  caption: string | null;
  status: "scheduled" | "published";
  createdAt: number;
  visibleAt: number;
  publishedAt: number | null;
  asset: MediaAsset;
}

export function createMediaPost(
  sqlite: Database.Database,
  input: CreateMediaPostInput,
): CreatedMediaPost {
  const now = input.nowMs ?? Date.now();
  const scheduled = input.visibleAtMs !== undefined;
  const visibleAt = input.visibleAtMs ?? now;
  const status = scheduled ? "scheduled" : "published";
  const publishedAt = scheduled ? null : now;
  const postId = randomUUID();
  const postAssetId = randomUUID();

  const create = sqlite.transaction(() => {
    sqlite
      .prepare(
        `INSERT INTO posts
         (id,thread_id,author_id,reply_to_post_id,caption,status,created_at,visible_at,published_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        postId,
        input.threadId,
        input.authorId,
        null,
        input.caption ?? null,
        status,
        now,
        visibleAt,
        publishedAt,
      );
    sqlite
      .prepare(
        `INSERT INTO post_assets
         (id,post_id,position,immich_connection_id,immich_asset_id,media_type,width,height,duration_ms,captured_at)
         VALUES (?,?,0,?,?,?,?,?,?,?)`,
      )
      .run(
        postAssetId,
        postId,
        input.connectionId,
        input.asset.id,
        input.asset.type,
        input.asset.width,
        input.asset.height,
        input.asset.durationMs,
        input.asset.capturedAt?.getTime() ?? null,
      );
    if (status === "published") enqueuePublicationEvent(sqlite, postId, now);
  });
  create.immediate();

  return {
    id: postId,
    postAssetId,
    threadId: input.threadId,
    authorId: input.authorId,
    caption: input.caption ?? null,
    status,
    createdAt: now,
    visibleAt,
    publishedAt,
    asset: input.asset,
  };
}

export function serializeCreatedMediaPost(post: CreatedMediaPost) {
  return {
    id: post.id,
    threadId: post.threadId,
    authorId: post.authorId,
    caption: post.caption,
    status: post.status,
    createdAt: new Date(post.createdAt).toISOString(),
    visibleAt: new Date(post.visibleAt).toISOString(),
    publishedAt: post.publishedAt === null ? null : new Date(post.publishedAt).toISOString(),
    assets: [{
      id: post.postAssetId,
      position: 0,
      mediaType: post.asset.type,
      width: post.asset.width,
      height: post.asset.height,
      durationMs: post.asset.durationMs,
      capturedAt: post.asset.capturedAt?.toISOString() ?? null,
    }],
  };
}
