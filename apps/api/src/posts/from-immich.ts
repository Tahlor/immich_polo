import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ImmichMediaProvider } from "@immich-polo/immich-client";
import { parseAbsoluteInstant } from "@immich-polo/domain";
import { requireUser } from "../auth/routes.js";
import { ownedConnectionSecret } from "../immich/connections.js";
import { sendImmichError } from "../immich/errors.js";
import type { CredentialCrypto } from "../security/credential-crypto.js";
import { isThreadMember } from "../threads/authorization.js";
import { createMediaPost, serializeCreatedMediaPost } from "./create-media-post.js";

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

    let visibleAtMs: number | undefined;
    if (body.data.visibleAt) {
      let requested: Date;
      try {
        requested = parseAbsoluteInstant(body.data.visibleAt);
      } catch {
        return reply.code(400).send({ error: "invalid_visible_at" });
      }
      if (requested.getTime() <= Date.now()) {
        return reply.code(400).send({ error: "visible_at_must_be_future" });
      }
      visibleAtMs = requested.getTime();
    }

    const post = createMediaPost(sqlite, {
      threadId: params.data.threadId,
      authorId: user.id,
      connectionId: connection.stored.id,
      asset,
      ...(body.data.caption !== undefined ? { caption: body.data.caption } : {}),
      ...(visibleAtMs !== undefined ? { visibleAtMs } : {}),
    });
    return reply.code(201).send({ post: serializeCreatedMediaPost(post) });
  });
}
