import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type {
  AssetPage,
  AssetQuery,
  ConnectionInfo,
  ImmichConnectionSecret,
  ImmichMediaProvider,
  MediaAsset,
  MediaStream,
  ThumbnailOptions,
  UploadInput,
  UploadResult,
} from "@immich-polo/immich-client";
import { buildApp } from "../app.js";

const registrationSecret = "local-test-secret-123";
const credentialKey = randomBytes(32).toString("base64");
let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

class FakeProvider implements ImmichMediaProvider {
  readonly seenSecrets: ImmichConnectionSecret[] = [];
  readonly videoRanges: Array<string | undefined> = [];

  async verifyConnection(connection: ImmichConnectionSecret): Promise<ConnectionInfo> {
    this.seenSecrets.push(connection);
    return { serverVersion: "3.test", immichUserId: "immich-user" };
  }

  async listRecentAssets(connection: ImmichConnectionSecret, _query: AssetQuery): Promise<AssetPage> {
    this.seenSecrets.push(connection);
    return { assets: [this.asset("asset-1")] };
  }

  async getAssetMetadata(connection: ImmichConnectionSecret, assetId: string): Promise<MediaAsset> {
    this.seenSecrets.push(connection);
    return this.asset(assetId);
  }

  async getThumbnailStream(connection: ImmichConnectionSecret, _assetId: string, _options?: ThumbnailOptions): Promise<MediaStream> {
    this.seenSecrets.push(connection);
    return { status: 200, headers: { "content-type": "image/jpeg", "x-secret-upstream": "must-not-forward" }, body: this.stream("thumb") };
  }

  async getVideoStream(connection: ImmichConnectionSecret, _assetId: string, range?: string): Promise<MediaStream> {
    this.seenSecrets.push(connection);
    this.videoRanges.push(range);
    return { status: range ? 206 : 200, headers: { "content-type": "video/mp4", "accept-ranges": "bytes", ...(range ? { "content-range": "bytes 100-199/1000" } : {}) }, body: this.stream("video") };
  }

  async uploadAsset(_connection: ImmichConnectionSecret, _input: UploadInput): Promise<UploadResult> {
    return { assetId: "unused", duplicate: false };
  }

  private asset(id: string): MediaAsset {
    return { id, type: "video", capturedAt: new Date("2020-01-02T03:04:05.000Z"), width: 1920, height: 1080, durationMs: 60_000 };
  }

  private stream(text: string): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(text);
    return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
  }
}

async function register(username: string) {
  const response = await app!.inject({ method: "POST", url: "/auth/register", payload: { registrationSecret, username, displayName: username, password: "correct horse battery staple" } });
  expect(response.statusCode).toBe(201);
  return response.json() as { token: string; user: { id: string } };
}

describe("Polo-side Immich integration routes", () => {
  it("encrypts connection credentials and prevents another user from browsing them", async () => {
    const provider = new FakeProvider();
    const built = buildApp({ databasePath: ":memory:", registrationSecret, credentialKey, immichProvider: provider });
    app = built.app;
    const alice = await register("alice");
    const bob = await register("bob");

    const create = await app.inject({ method: "POST", url: "/immich-connections", headers: { authorization: `Bearer ${alice.token}` }, payload: { baseUrl: "https://immich.test/", apiKey: "top-secret-key" } });
    expect(create.statusCode).toBe(201);
    const connectionId = create.json().connection.id as string;
    const row = built.database.sqlite.prepare("SELECT credential_ciphertext AS cipher FROM immich_connections WHERE id=?").get(connectionId) as { cipher: string };
    expect(row.cipher).not.toContain("top-secret-key");

    const aliceAssets = await app.inject({ method: "GET", url: `/immich-connections/${connectionId}/assets`, headers: { authorization: `Bearer ${alice.token}` } });
    expect(aliceAssets.statusCode).toBe(200);
    expect(aliceAssets.json().assets[0].id).toBe("asset-1");

    const bobAssets = await app.inject({ method: "GET", url: `/immich-connections/${connectionId}/assets`, headers: { authorization: `Bearer ${bob.token}` } });
    expect(bobAssets.statusCode).toBe(404);
    expect(provider.seenSecrets.some((secret) => secret.apiKey === "top-secret-key")).toBe(true);
  });

  it("creates existing-asset posts and authorizes exact post-scoped range streaming", async () => {
    const provider = new FakeProvider();
    const built = buildApp({ databasePath: ":memory:", registrationSecret, credentialKey, immichProvider: provider });
    app = built.app;
    const alice = await register("alice");
    const bob = await register("bob");
    const mallory = await register("mallory");

    const connection = await app.inject({ method: "POST", url: "/immich-connections", headers: { authorization: `Bearer ${alice.token}` }, payload: { baseUrl: "https://immich.test", apiKey: "alice-key" } });
    const connectionId = connection.json().connection.id as string;
    const thread = await app.inject({ method: "POST", url: "/threads", headers: { authorization: `Bearer ${alice.token}` }, payload: { memberUserIds: [bob.user.id] } });
    const threadId = thread.json().thread.id as string;

    const post = await app.inject({ method: "POST", url: `/threads/${threadId}/posts/from-immich`, headers: { authorization: `Bearer ${alice.token}` }, payload: { connectionId, assetId: "chosen-video", caption: "old memory" } });
    expect(post.statusCode).toBe(201);
    expect(post.json().post.status).toBe("published");
    const postId = post.json().post.id as string;
    const postAssetId = post.json().post.assets[0].id as string;
    expect(built.database.sqlite.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE post_id=?").get(postId)).toEqual({ count: 1 });

    const media = await app.inject({ method: "GET", url: `/posts/${postId}/assets/${postAssetId}/media`, headers: { authorization: `Bearer ${bob.token}`, range: "bytes=100-199" } });
    expect(media.statusCode).toBe(206);
    expect(media.headers["content-range"]).toBe("bytes 100-199/1000");
    expect(media.headers["x-secret-upstream"]).toBeUndefined();
    expect(media.body).toBe("video");
    expect(provider.videoRanges).toEqual(["bytes=100-199"]);

    const denied = await app.inject({ method: "GET", url: `/posts/${postId}/assets/${postAssetId}/media`, headers: { authorization: `Bearer ${mallory.token}` } });
    expect(denied.statusCode).toBe(404);
  });

  it("keeps scheduled existing media invisible to recipients but readable by its author", async () => {
    const provider = new FakeProvider();
    const built = buildApp({ databasePath: ":memory:", registrationSecret, credentialKey, immichProvider: provider });
    app = built.app;
    const alice = await register("alice");
    const bob = await register("bob");
    const connection = await app.inject({ method: "POST", url: "/immich-connections", headers: { authorization: `Bearer ${alice.token}` }, payload: { baseUrl: "https://immich.test", apiKey: "alice-key" } });
    const connectionId = connection.json().connection.id as string;
    const thread = await app.inject({ method: "POST", url: "/threads", headers: { authorization: `Bearer ${alice.token}` }, payload: { memberUserIds: [bob.user.id] } });
    const threadId = thread.json().thread.id as string;
    const visibleAt = new Date(Date.now() + 60_000).toISOString();
    const post = await app.inject({ method: "POST", url: `/threads/${threadId}/posts/from-immich`, headers: { authorization: `Bearer ${alice.token}` }, payload: { connectionId, assetId: "scheduled-video", visibleAt } });
    const postId = post.json().post.id as string;
    const postAssetId = post.json().post.assets[0].id as string;

    const bobMedia = await app.inject({ method: "GET", url: `/posts/${postId}/assets/${postAssetId}/media`, headers: { authorization: `Bearer ${bob.token}` } });
    expect(bobMedia.statusCode).toBe(404);
    const aliceMedia = await app.inject({ method: "GET", url: `/posts/${postId}/assets/${postAssetId}/media`, headers: { authorization: `Bearer ${alice.token}` } });
    expect(aliceMedia.statusCode).toBe(200);
  });
});
