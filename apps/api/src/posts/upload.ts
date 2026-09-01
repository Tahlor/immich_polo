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

const ParamsSchema = z.object({ threadId: z.string().min(1), connectionId: z.string().min(1) });
const QuerySchema = z.object({
  capturedAt: z.string().min(1).optional(),
  visibleAt: z.string().min(1).optional(),
  caption: z.string().trim().max(2000).optional(),
});

function parseOptionalInstant(value: string | undefined, errorName: string): Date | undefined {
  if (!value) return undefined;
  try {
    return parseAbsoluteInstant(value);
  } catch {
    throw new Error(errorName);
  }
}

export function registerLocalUploadRoute(
  app: FastifyInstance,
  sqlite: Database.Database,
  provider: ImmichMediaProvider,
  crypto: CredentialCrypto | null,
): void {
  app.post("/threads/:threadId/posts/upload/:connectionId", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    if (!crypto) return reply.code(503).send({ error: "credential_encryption_not_configured" });
    const params = ParamsSchema.safeParse(request.params);
    const query = QuerySchema.safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: "invalid_request" });
    if (!isThreadMember(sqlite, user.id, params.data.threadId)) {
      return reply.code(403).send({ error: "not_thread_member" });
    }
    const connection = ownedConnectionSecret(sqlite, crypto, user.id, params.data.connectionId);
    if (!connection) return reply.code(404).send({ error: "immich_connection_not_found" });

    let capturedAt: Date | undefined;
    let visibleAt: Date | undefined;
    try {
      capturedAt = parseOptionalInstant(query.data.capturedAt, "invalid_captured_at");
      visibleAt = parseOptionalInstant(query.data.visibleAt, "invalid_visible_at");
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid_timestamp" });
    }
    if (visibleAt && visibleAt.getTime() <= Date.now()) {
      return reply.code(400).send({ error: "visible_at_must_be_future" });
    }

    let part;
    try {
      part = await request.file({ limits: { files: 1, fileSize: 8 * 1024 * 1024 * 1024 } });
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 400;
      return reply.code(statusCode).send({ error: statusCode === 413 ? "upload_too_large" : "invalid_multipart_upload" });
    }
    if (!part) return reply.code(400).send({ error: "file_required" });
    const mediaType = part.mimetype.split("/", 1)[0];
    if (mediaType !== "image" && mediaType !== "video") {
      part.file.resume();
      return reply.code(415).send({ error: "unsupported_media_type" });
    }

    let upload;
    let asset;
    try {
      upload = await provider.uploadAsset(connection.secret, {
        filename: part.filename,
        contentType: part.mimetype,
        ...(capturedAt ? { capturedAt } : {}),
        bytes: part.file as AsyncIterable<Uint8Array>,
      });
      if (part.file.truncated) return reply.code(413).send({ error: "upload_too_large" });
      asset = await provider.getAssetMetadata(connection.secret, upload.assetId);
    } catch (error) {
      return sendImmichError(reply, error);
    }

    const post = createMediaPost(sqlite, {
      threadId: params.data.threadId,
      authorId: user.id,
      connectionId: connection.stored.id,
      asset,
      ...(query.data.caption !== undefined ? { caption: query.data.caption } : {}),
      ...(visibleAt ? { visibleAtMs: visibleAt.getTime() } : {}),
    });
    return reply.code(201).send({ post: serializeCreatedMediaPost(post), upload: { duplicate: upload.duplicate } });
  });
}
