import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { ImmichMediaProvider, MediaStream } from "@immich-polo/immich-client";
import { requireUser } from "../auth/routes.js";
import type { CredentialCrypto } from "../security/credential-crypto.js";
import { ownedConnectionSecret } from "./connections.js";
import { sendImmichError } from "./errors.js";

const CreateConnectionSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1).max(4096),
});
const ConnectionParamsSchema = z.object({ connectionId: z.string().min(1) });
const AssetParamsSchema = z.object({ connectionId: z.string().min(1), assetId: z.string().min(1) });
const AssetQuerySchema = z.object({
  type: z.enum(["image", "video"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});
const SAFE_STREAM_HEADERS = new Set([
  "cache-control",
  "content-length",
  "content-type",
  "etag",
  "last-modified",
]);

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function sendProviderStream(reply: FastifyReply, stream: MediaStream) {
  reply.code(stream.status);
  for (const [name, value] of Object.entries(stream.headers)) {
    if (SAFE_STREAM_HEADERS.has(name.toLowerCase())) reply.header(name, value);
  }
  if (!stream.body) return reply.send();
  return reply.send(Readable.fromWeb(stream.body as Parameters<typeof Readable.fromWeb>[0]));
}

export function registerImmichRoutes(
  app: FastifyInstance,
  sqlite: Database.Database,
  provider: ImmichMediaProvider,
  crypto: CredentialCrypto | null,
): void {
  app.get("/immich-connections", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    const rows = sqlite
      .prepare(
        `SELECT id, base_url AS baseUrl, immich_user_id AS immichUserId,
                server_version AS serverVersion, last_verified_at AS lastVerifiedAt,
                created_at AS createdAt, updated_at AS updatedAt
         FROM immich_connections WHERE user_id = ? ORDER BY created_at DESC`,
      )
      .all(user.id) as Array<Record<string, string | number | null>>;
    return { connections: rows };
  });

  app.post("/immich-connections", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    if (!crypto) return reply.code(503).send({ error: "credential_encryption_not_configured" });
    const parsed = CreateConnectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

    const baseUrl = normalizeBaseUrl(parsed.data.baseUrl);
    let info;
    try {
      info = await provider.verifyConnection({ baseUrl, apiKey: parsed.data.apiKey });
    } catch (error) {
      return sendImmichError(reply, error);
    }

    const id = randomUUID();
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO immich_connections
         (id,user_id,base_url,credential_ciphertext,immich_user_id,server_version,last_verified_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        user.id,
        baseUrl,
        crypto.seal(parsed.data.apiKey),
        info.immichUserId ?? null,
        info.serverVersion,
        now,
        now,
        now,
      );

    return reply.code(201).send({
      connection: {
        id,
        baseUrl,
        immichUserId: info.immichUserId ?? null,
        serverVersion: info.serverVersion,
        lastVerifiedAt: new Date(now).toISOString(),
      },
    });
  });

  app.get("/immich-connections/:connectionId/assets", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    if (!crypto) return reply.code(503).send({ error: "credential_encryption_not_configured" });
    const params = ConnectionParamsSchema.safeParse(request.params);
    const query = AssetQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: "invalid_request" });
    const connection = ownedConnectionSecret(sqlite, crypto, user.id, params.data.connectionId);
    if (!connection) return reply.code(404).send({ error: "immich_connection_not_found" });

    try {
      const page = await provider.listRecentAssets(connection.secret, query.data);
      return {
        assets: page.assets.map((asset) => ({
          ...asset,
          capturedAt: asset.capturedAt?.toISOString() ?? null,
        })),
        nextCursor: page.nextCursor ?? null,
      };
    } catch (error) {
      return sendImmichError(reply, error);
    }
  });

  app.get("/immich-connections/:connectionId/assets/:assetId/thumbnail", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    if (!crypto) return reply.code(503).send({ error: "credential_encryption_not_configured" });
    const params = AssetParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_request" });
    const connection = ownedConnectionSecret(sqlite, crypto, user.id, params.data.connectionId);
    if (!connection) return reply.code(404).send({ error: "immich_connection_not_found" });

    try {
      return sendProviderStream(
        reply,
        await provider.getThumbnailStream(connection.secret, params.data.assetId, { size: "thumbnail" }),
      );
    } catch (error) {
      return sendImmichError(reply, error);
    }
  });
}
