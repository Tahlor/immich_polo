import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ImmichMediaProvider } from "@immich-polo/immich-client";
import { parseAbsoluteInstant } from "@immich-polo/domain";
import { requireUser } from "../auth/routes.js";
import { ownedConnectionSecret } from "../immich/connections.js";
import { sendImmichError } from "../immich/errors.js";
import { enqueuePublicationEvent } from "../scheduling/outbox.js";
import type { CredentialCrypto } from "../security/credential-crypto.js";
import { isThreadMember } from "../threads/authorization.js";

const ParamsSchema = z.object({ threadId: z.string().min(1) });
const BodySchema = z.object({
  connectionId: z.string().min(1),
  assetId: z.string().min(1),
  caption: z.string().trim().max(2000).optional(),
  visibleAt: z.string().min(1).optional(),
});

export function registerExistingImmichPostRoute(
  app: FastifyInstance,
  sqlite: Database.Database,
  provider: ImmichMediaProvider,
  crypto: CredentialCrypto | null,
): void {
  app.post("/threads/:threadId/posts/from-immich", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    if (!crypto) return reply.code(503).send({ error: "credential_encryption_not_configured" });
    const params = ParamsSchema.safeParse(request.params);
    const body = BodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_request" });
    if (!isThreadMember(sqlite, user.id, params.data.threadId)) {
      return reply.code(403).send({ error: "not_thread_member" });
    }

    const connection = ownedConnectionSecret(sqlite, crypto, user.id, body.data.connectionId);
    if (!connection) return reply.code(404).send({ error: "immich_connection_not_found" });

    let asset;
    try {
      asset = await provider.getAssetMetadata(connection.secret, body.data.assetId);
    } catch (error) {
      return sendImmichError(reply, error);
    }

    const now = Date.now();
    let visibleAt = now;
    let status: "scheduled" | "published" = "published";
    if (body.data.visibleAt) {
      let requested: Date;
      try {
        requested = parseAbsoluteInstant(body.data.visibleAt);
      } catch {
        return reply.code(400).send({ error: "invalid_visible_at" });
      }
      if (requested.getTime() <= now) {
        return reply.code(400).send({ error: "visible_at_must_be_future" });
      }
      visibleAt = requested.getTime();
      status = "scheduled";
    }

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
          params.data.threadId,
          user.id,
          null,
          body.data.caption ?? null,
          status,
          now,
          visibleAt,
          status === "published" ? now : null,
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
          connection.stored.id,
          asset.id,
          asset.type,
          asset.width,
          asset.height,
          asset.durationMs,
          asset.capturedAt?.getTime() ?? null,
        );
      if (status === "published") enqueuePublicationEvent(sqlite, postId, now);
    });
    create.immediate();

    return reply.code(201).send({
      post: {
        id: postId,
        threadId: params.data.threadId,
        authorId: user.id,
        caption: body.data.caption ?? null,
        status,
        createdAt: new Date(now).toISOString(),
        visibleAt: new Date(visibleAt).toISOString(),
        publishedAt: status === "published" ? new Date(now).toISOString() : null,
        assets: [{
          id: postAssetId,
          position: 0,
          mediaType: asset.type,
          width: asset.width,
          height: asset.height,
          durationMs: asset.durationMs,
          capturedAt: asset.capturedAt?.toISOString() ?? null,
        }],
      },
    });
  });
}
