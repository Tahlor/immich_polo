import { Readable } from "node:stream";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ImmichMediaProvider, MediaStream } from "@immich-polo/immich-client";
import { requireUser } from "../auth/routes.js";
import { connectionSecret, findImmichConnection } from "../immich/connections.js";
import { sendImmichError } from "../immich/errors.js";
import type { CredentialCrypto } from "../security/credential-crypto.js";
import { isThreadMember } from "../threads/authorization.js";

const ParamsSchema = z.object({ postId: z.string().min(1), postAssetId: z.string().min(1) });
const SAFE_HEADERS = new Set([
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
]);

type MediaRow = {
  threadId: string;
  status: string;
  authorId: string;
  connectionId: string;
  immichAssetId: string;
  mediaType: "image" | "video";
};

function resolveAuthorizedAsset(
  sqlite: Database.Database,
  userId: string,
  postId: string,
  postAssetId: string,
): MediaRow | null {
  const row = sqlite
    .prepare(
      `SELECT p.thread_id AS threadId, p.status, p.author_id AS authorId,
              pa.immich_connection_id AS connectionId, pa.immich_asset_id AS immichAssetId,
              pa.media_type AS mediaType
       FROM posts p
       JOIN post_assets pa ON pa.post_id = p.id
       WHERE p.id = ? AND pa.id = ?`,
    )
    .get(postId, postAssetId) as MediaRow | undefined;
  if (!row || !isThreadMember(sqlite, userId, row.threadId)) return null;
  if (row.status !== "published" && !(row.status === "scheduled" && row.authorId === userId)) return null;
  return row;
}

function sendProviderStream(reply: FastifyReply, stream: MediaStream) {
  reply.code(stream.status);
  for (const [name, value] of Object.entries(stream.headers)) {
    if (SAFE_HEADERS.has(name.toLowerCase())) reply.header(name, value);
  }
  if (!stream.body) return reply.send();
  const nodeStream = Readable.fromWeb(stream.body as Parameters<typeof Readable.fromWeb>[0]);
  return reply.send(nodeStream);
}

export function registerMediaRoutes(
  app: FastifyInstance,
  sqlite: Database.Database,
  provider: ImmichMediaProvider,
  crypto: CredentialCrypto | null,
): void {
  const handler = (kind: "thumbnail" | "media") => async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    if (!crypto) return reply.code(503).send({ error: "credential_encryption_not_configured" });
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_request" });
    const asset = resolveAuthorizedAsset(sqlite, user.id, params.data.postId, params.data.postAssetId);
    if (!asset) return reply.code(404).send({ error: "post_asset_not_found" });
    const stored = findImmichConnection(sqlite, asset.connectionId);
    if (!stored) return reply.code(410).send({ error: "immich_connection_missing" });
    const secret = connectionSecret(stored, crypto);

    try {
      if (kind === "thumbnail" || asset.mediaType === "image") {
        return sendProviderStream(reply, await provider.getThumbnailStream(secret, asset.immichAssetId, { size: "preview" }));
      }
      const rangeHeader = request.headers.range;
      const range = Array.isArray(rangeHeader) ? rangeHeader[0] : rangeHeader;
      return sendProviderStream(reply, await provider.getVideoStream(secret, asset.immichAssetId, range));
    } catch (error) {
      return sendImmichError(reply, error);
    }
  };

  app.get("/posts/:postId/assets/:postAssetId/thumbnail", handler("thumbnail"));
  app.get("/posts/:postId/assets/:postAssetId/media", handler("media"));
}
