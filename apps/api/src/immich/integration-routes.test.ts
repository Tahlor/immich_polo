import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimSend } from "../posts/send-requests.js";
import { createMediaPost, serializeCreatedMediaPost } from "../posts/create-media-post.js";
import { createDatabase } from "../db/client.js";
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
  readonly uploads: Array<{ filename: string; contentType: string; capturedAt?: Date; bytes: string }> = [];

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

  async uploadAsset(connection: ImmichConnectionSecret, input: UploadInput): Promise<UploadResult> {
    this.seenSecrets.push(connection);
    const chunks: Buffer[] = [];
    for await (const chunk of input.bytes) chunks.push(Buffer.from(chunk));
    this.uploads.push({
      filename: input.filename,
      contentType: input.contentType,
      ...(input.capturedAt ? { capturedAt: input.capturedAt } : {}),
      bytes: Buffer.concat(chunks).toString("utf8"),
    });
    return { assetId: "uploaded-canonical", duplicate: false };
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
  it("encrypts connection credentials and prevents another user from browsing or thumbnailing them", async () => {
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
    const thumbnail = await app.inject({ method: "GET", url: `/immich-connections/${connectionId}/assets/asset-1/thumbnail`, headers: { authorization: `Bearer ${alice.token}` } });
    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.body).toBe("thumb");
    expect(thumbnail.headers["x-secret-upstream"]).toBeUndefined();

    const bobAssets = await app.inject({ method: "GET", url: `/immich-connections/${connectionId}/assets`, headers: { authorization: `Bearer ${bob.token}` } });
    expect(bobAssets.statusCode).toBe(404);
    const bobThumbnail = await app.inject({ method: "GET", url: `/immich-connections/${connectionId}/assets/asset-1/thumbnail`, headers: { authorization: `Bearer ${bob.token}` } });
    expect(bobThumbnail.statusCode).toBe(404);
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

  it("streams a multipart local upload into the provider and stores only its canonical asset reference", async () => {
    const provider = new FakeProvider();
    const built = buildApp({ databasePath: ":memory:", registrationSecret, credentialKey, immichProvider: provider });
    app = built.app;
    const alice = await register("alice");
    const bob = await register("bob");
    const connection = await app.inject({ method: "POST", url: "/immich-connections", headers: { authorization: `Bearer ${alice.token}` }, payload: { baseUrl: "https://immich.test", apiKey: "alice-key" } });
    const connectionId = connection.json().connection.id as string;
    const thread = await app.inject({ method: "POST", url: "/threads", headers: { authorization: `Bearer ${alice.token}` }, payload: { memberUserIds: [bob.user.id] } });
    const threadId = thread.json().thread.id as string;
    const capturedAt = "2024-05-06T07:08:09.000Z";
    const boundary = "----polo-test-boundary";
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.mp4"\r\nContent-Type: video/mp4\r\n\r\nhello-stream\r\n--${boundary}--\r\n`,
    );

    const upload = await app.inject({
      method: "POST",
      url: `/threads/${threadId}/posts/upload/${connectionId}?capturedAt=${encodeURIComponent(capturedAt)}`,
      headers: {
        authorization: `Bearer ${alice.token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(upload.statusCode).toBe(201);
    expect(upload.json().upload).toEqual({ duplicate: false });
    expect(provider.uploads).toEqual([{ filename: "clip.mp4", contentType: "video/mp4", capturedAt: new Date(capturedAt), bytes: "hello-stream" }]);
    expect(built.database.sqlite.prepare("SELECT immich_asset_id AS assetId FROM post_assets WHERE post_id=?").get(upload.json().post.id)).toEqual({ assetId: "uploaded-canonical" });
    expect(built.database.sqlite.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE post_id=?").get(upload.json().post.id)).toEqual({ count: 1 });

    const bobAttempt = await app.inject({
      method: "POST",
      url: `/threads/${threadId}/posts/upload/${connectionId}`,
      headers: {
        authorization: `Bearer ${bob.token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(bobAttempt.statusCode).toBe(404);
    expect(provider.uploads).toHaveLength(1);
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

async function sendFixture(databasePath = ":memory:") {
  const provider = new FakeProvider();
  const built = buildApp({ databasePath, registrationSecret, credentialKey, immichProvider: provider });
  app = built.app;
  const alice = await register("alice");
  const bob = await register("bob");
  const connection = await app.inject({ method: "POST", url: "/immich-connections", headers: { authorization: `Bearer ${alice.token}` }, payload: { baseUrl: "https://immich.test", apiKey: "test-key" } });
  const connectionId = connection.json().connection.id as string;
  const thread = await app.inject({ method: "POST", url: "/threads", headers: { authorization: `Bearer ${alice.token}` }, payload: { memberUserIds: [bob.user.id] } });
  const threadId = thread.json().thread.id as string;
  const headers = { authorization: `Bearer ${alice.token}` };
  const sendId = randomUUID();
  const payload = { connectionId, assetId: "existing-video", caption: "Review caption", sendId };
  const url = `/threads/${threadId}/posts/from-immich`;
  const statusUrl = `/threads/${threadId}/sends/${sendId}`;
  return { built, provider, alice, bob, connectionId, threadId, headers, sendId, payload, url, statusUrl };
}

function multipartVideo() {
  return {
    payload: Buffer.from('--polo-boundary\r\nContent-Disposition: form-data; name="file"; filename="review.mp4"\r\nContent-Type: video/mp4\r\n\r\nsample-bytes\r\n--polo-boundary--\r\n'),
    headers: { "content-type": "multipart/form-data; boundary=polo-boundary" },
  };
}

describe("durable logical sends", () => {
  it("reconciles a lost response, rejects changed input and permits a deliberate second share", async () => {
    const f = await sendFixture();
    const metadata = vi.spyOn(f.provider, "getAssetMetadata");
    const first = await app!.inject({ method: "POST", url: f.url, headers: f.headers, payload: f.payload });
    expect(first.statusCode).toBe(201);
    const status = await app!.inject({ method: "GET", url: f.statusUrl, headers: f.headers });
    expect(status.json()).toEqual({ state: "completed", result: first.json() });
    expect(status.headers["cache-control"]).toBe("no-store");
    const replay = await app!.inject({ method: "POST", url: f.url, headers: f.headers, payload: f.payload });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(metadata).toHaveBeenCalledTimes(1);
    const changed = await app!.inject({ method: "POST", url: f.url, headers: f.headers, payload: { ...f.payload, caption: "changed" } });
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error).toBe("send_identity_conflict");
    const second = await app!.inject({ method: "POST", url: f.url, headers: f.headers, payload: { ...f.payload, sendId: randomUUID() } });
    expect(second.statusCode).toBe(201);
    expect(second.json().post.id).not.toBe(first.json().post.id);
    expect(f.built.database.sqlite.prepare("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 2 });
    expect(f.built.database.sqlite.prepare("SELECT count(*) AS n FROM notification_outbox").get()).toEqual({ n: 2 });
  });

  it("keeps reconciliation author-only and rechecks membership on replay and after provider work", async () => {
    const f = await sendFixture();
    let started!: () => void;
    let finish!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const wait = new Promise<void>((resolve) => { finish = resolve; });
    const original = f.provider.getAssetMetadata.bind(f.provider);
    vi.spyOn(f.provider, "getAssetMetadata").mockImplementation(async (secret, id) => { started(); await wait; return original(secret, id); });
    const first = app!.inject({ method: "POST", url: f.url, headers: f.headers, payload: f.payload });
    await ready;
    const bobStatus = await app!.inject({ method: "GET", url: f.statusUrl, headers: { authorization: `Bearer ${f.bob.token}` } });
    expect(bobStatus.statusCode).toBe(404);
    f.built.database.sqlite.prepare("DELETE FROM thread_members WHERE user_id=? AND thread_id=?").run(f.alice.user.id, f.threadId);
    finish();
    expect((await first).statusCode).toBe(403);
    const deniedReplay = await app!.inject({ method: "POST", url: f.url, headers: f.headers, payload: f.payload });
    expect(deniedReplay.statusCode).toBe(403);
    const deniedStatus = await app!.inject({ method: "GET", url: f.statusUrl, headers: f.headers });
    expect(deniedStatus.statusCode).toBe(404);
    expect(f.built.database.sqlite.prepare("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 0 });
  });

  it("serializes concurrent attempts and refuses cancellation while a live send is processing", async () => {
    const f = await sendFixture();
    let started!: () => void;
    let finish!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const wait = new Promise<void>((resolve) => { finish = resolve; });
    const original = f.provider.getAssetMetadata.bind(f.provider);
    vi.spyOn(f.provider, "getAssetMetadata").mockImplementation(async (secret, id) => { started(); await wait; return original(secret, id); });
    const first = app!.inject({ method: "POST", url: f.url, headers: f.headers, payload: f.payload });
    await ready;
    try {
      const second = await app!.inject({ method: "POST", url: f.url, headers: f.headers, payload: f.payload });
      expect(second.statusCode).toBe(409);
      expect(second.json().error).toBe("send_in_progress");
      expect((await app!.inject({ method: "GET", url: f.statusUrl, headers: f.headers })).json().state).toBe("processing");
      expect((await app!.inject({ method: "DELETE", url: f.statusUrl, headers: f.headers })).statusCode).toBe(409);
    } finally { finish(); }
    expect((await first).statusCode).toBe(201);
    expect(f.built.database.sqlite.prepare("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 1 });
  });

  it("check-and-discard fences a delayed original and does not delete an already completed post", async () => {
    const f = await sendFixture();
    expect((await app!.inject({ method: "DELETE", url: f.statusUrl, headers: f.headers })).json().state).toBe("cancelled");
    const delayed = await app!.inject({ method: "POST", url: f.url, headers: f.headers, payload: f.payload });
    expect(delayed.statusCode).toBe(410);
    expect(delayed.json().error).toBe("send_cancelled");
    const newId = randomUUID();
    const created = await app!.inject({ method: "POST", url: f.url, headers: f.headers, payload: { ...f.payload, sendId: newId } });
    const reconcile = await app!.inject({ method: "DELETE", url: `/threads/${f.threadId}/sends/${newId}`, headers: f.headers });
    expect(reconcile.json()).toEqual({ state: "completed", result: created.json() });
    await app!.inject({ method: "DELETE", url: `/posts/${created.json().post.id}`, headers: f.headers });
    const retryDeleted = await app!.inject({ method: "POST", url: f.url, headers: f.headers, payload: { ...f.payload, sendId: newId } });
    expect(retryDeleted.statusCode).toBe(410);
    expect(retryDeleted.json().error).toBe("send_post_deleted");
    expect(f.built.database.sqlite.prepare("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 0 });
  });

  it("persists a scheduled lost-response result across API recreation, even after due time", async () => {
    const directory = mkdtempSync(join(tmpdir(), "polo-send-test-"));
    try {
      const f = await sendFixture(join(directory, "polo.sqlite"));
      const payload = { ...f.payload, visibleAt: new Date(Date.now() + 1000).toISOString() };
      const first = await app!.inject({ method: "POST", url: f.url, headers: f.headers, payload });
      expect(first.statusCode).toBe(201);
      expect(first.json().post.status).toBe("scheduled");
      await app!.close();
      app = undefined;
      const restarted = buildApp({ databasePath: join(directory, "polo.sqlite"), registrationSecret, credentialKey, immichProvider: f.provider });
      app = restarted.app;
      vi.spyOn(Date, "now").mockReturnValue(Date.parse(payload.visibleAt) + 1000);
      try {
        const replay = await app.inject({ method: "POST", url: f.url, headers: f.headers, payload });
        expect(replay.statusCode).toBe(200);
        expect(replay.json()).toEqual(first.json());
      } finally { vi.restoreAllMocks(); }
      expect(restarted.database.sqlite.prepare("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 1 });
      expect(restarted.database.sqlite.prepare("SELECT count(*) AS n FROM notification_outbox").get()).toEqual({ n: 0 });
    } finally {
      if (app) { await app.close(); app = undefined; }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("checkpoints an uploaded canonical ID and resumes metadata after restart without uploading again", async () => {
    const directory = mkdtempSync(join(tmpdir(), "polo-upload-retry-"));
    try {
      const f = await sendFixture(join(directory, "polo.sqlite"));
      const fileId = randomUUID();
      const url = `/threads/${f.threadId}/posts/upload/${f.connectionId}?sendId=${f.sendId}&fileId=${fileId}&caption=camera%20caption&capturedAt=2020-01-02T03%3A04%3A05.000Z`;
      vi.spyOn(f.provider, "getAssetMetadata").mockRejectedValueOnce(new Error("temporary metadata failure"));
      const form = multipartVideo();
      const failed = await app!.inject({ method: "POST", url, headers: { ...f.headers, ...form.headers }, payload: form.payload });
      expect(failed.statusCode).toBe(502);
      expect(f.provider.uploads).toHaveLength(1);
      expect(f.built.database.sqlite.prepare("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 0 });
      const status = await app!.inject({ method: "GET", url: f.statusUrl, headers: f.headers });
      expect(status.json()).toEqual({ state: "retryable", uploadRequired: false });
      await app!.close(); app = undefined;
      const restarted = buildApp({ databasePath: join(directory, "polo.sqlite"), registrationSecret, credentialKey, immichProvider: f.provider });
      app = restarted.app;
      const result = await app.inject({ method: "POST", url, headers: f.headers });
      expect(result.statusCode).toBe(201);
      expect(result.json().post.caption).toBe("camera caption");
      expect(result.json().post.assets[0].capturedAt).toBe("2020-01-02T03:04:05.000Z");
      expect(f.provider.uploads).toHaveLength(1);
      const replay = await app.inject({ method: "POST", url, headers: f.headers });
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toEqual(result.json());
      expect(restarted.database.sqlite.prepare("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 1 });
      expect(restarted.database.sqlite.prepare("SELECT count(*) AS n FROM notification_outbox").get()).toEqual({ n: 1 });
      const changedFile = await app.inject({ method: "POST", url: url.replace(fileId, randomUUID()), headers: f.headers });
      expect(changedFile.statusCode).toBe(409);
    } finally {
      if (app) { await app.close(); app = undefined; }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("retries an upload failure with the same identity and creates no post before success", async () => {
    const f = await sendFixture();
    const upload = vi.spyOn(f.provider, "uploadAsset").mockRejectedValueOnce(new Error("upstream unavailable"));
    const form = multipartVideo();
    const url = `/threads/${f.threadId}/posts/upload/${f.connectionId}?sendId=${f.sendId}&fileId=${randomUUID()}&caption=phone%20caption`;
    const input = { method: "POST" as const, url, headers: { ...f.headers, ...form.headers }, payload: form.payload };
    expect((await app!.inject(input)).statusCode).toBe(502);
    expect(f.built.database.sqlite.prepare("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 0 });
    expect((await app!.inject({ method: "GET", url: f.statusUrl, headers: f.headers })).json()).toEqual({ state: "retryable", uploadRequired: true });
    const retry = await app!.inject(input);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().post.caption).toBe("phone caption");
    expect(upload).toHaveBeenCalledTimes(2);
    expect(f.built.database.sqlite.prepare("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 1 });
  });

  it("fences an expired worker after another DB connection claims the send", async () => {
    const directory = mkdtempSync(join(tmpdir(), "polo-lease-test-"));
    let second: ReturnType<typeof createDatabase> | undefined;
    let firstLease: ReturnType<typeof claimSend> | undefined;
    let secondLease: ReturnType<typeof claimSend> | undefined;
    try {
      const f = await sendFixture(join(directory, "polo.sqlite"));
      firstLease = claimSend(f.built.database.sqlite, f.alice.user.id, f.sendId, f.threadId, f.payload);
      f.built.database.sqlite.prepare("UPDATE send_requests SET lease_until=0").run();
      second = createDatabase(join(directory, "polo.sqlite"));
      secondLease = claimSend(second.sqlite, f.alice.user.id, f.sendId, f.threadId, f.payload);
      const asset = await f.provider.getAssetMetadata({ baseUrl: "https://immich.test", apiKey: "test-key" }, "test-asset");
      const create = () => ({ post: serializeCreatedMediaPost(createMediaPost(second!.sqlite, { threadId: f.threadId, authorId: f.alice.user.id, connectionId: f.connectionId, asset })) });
      expect(() => firstLease!.complete!(create)).toThrow("send_in_progress");
      secondLease.complete!(create);
      expect(second.sqlite.prepare("SELECT count(*) AS n FROM posts").get()).toEqual({ n: 1 });
      expect(second.sqlite.prepare("SELECT count(*) AS n FROM notification_outbox").get()).toEqual({ n: 1 });
    } finally {
      firstLease?.release?.(); secondLease?.release?.();
      second?.sqlite.close();
      if (app) { await app.close(); app = undefined; }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
