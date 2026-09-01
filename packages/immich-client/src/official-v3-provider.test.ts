import { afterEach, describe, expect, it, vi } from "vitest";
import { OfficialImmichV3Provider, UnsupportedImmichVersionError } from "./official-v3-provider.js";

const connection = { baseUrl: "https://immich.test/", apiKey: "secret-key" };

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

describe("OfficialImmichV3Provider", () => {
  it("verifies v3 and current user using x-api-key", async () => {
    const seen: Array<{ url: string; key: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      seen.push({ url, key: headers.get("x-api-key") });
      if (url.endsWith("/api/server/version")) return jsonResponse({ major: 3, minor: 4, patch: 2 });
      if (url.endsWith("/api/users/me")) return jsonResponse({ id: "immich-user" });
      return new Response(null, { status: 404 });
    }));

    const provider = new OfficialImmichV3Provider();
    await expect(provider.verifyConnection(connection)).resolves.toEqual({
      serverVersion: "3.4.2",
      immichUserId: "immich-user",
    });
    expect(seen).toEqual([
      { url: "https://immich.test/api/server/version", key: "secret-key" },
      { url: "https://immich.test/api/users/me", key: "secret-key" },
    ]);
  });

  it("rejects a non-v3 server before storing a connection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ major: 2, minor: 9, patch: 0 })));
    const provider = new OfficialImmichV3Provider();
    await expect(provider.verifyConnection(connection)).rejects.toBeInstanceOf(UnsupportedImmichVersionError);
  });

  it("maps stable metadata search and forwards video byte ranges", async () => {
    const requests: Array<{ url: string; method: string; body?: string; range?: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      requests.push({
        url,
        method: init?.method ?? "GET",
        ...(typeof init?.body === "string" ? { body: init.body } : {}),
        ...(headers.has("range") ? { range: headers.get("range") } : {}),
      });
      if (url.endsWith("/api/search/metadata")) {
        return jsonResponse({
          assets: {
            items: [
              { id: "image-1", type: "IMAGE", fileCreatedAt: "2020-01-02T03:04:05.000Z", width: 100, height: 50, duration: null },
              { id: "video-1", type: "VIDEO", fileCreatedAt: "2021-02-03T04:05:06.000Z", width: 1920, height: 1080, duration: 12345 },
            ],
            nextPage: "2",
          },
        });
      }
      if (url.endsWith("/api/assets/video-1/video/playback")) {
        return new Response("video-bytes", {
          status: 206,
          headers: { "content-type": "video/mp4", "content-range": "bytes 100-199/1000" },
        });
      }
      return new Response(null, { status: 404 });
    }));

    const provider = new OfficialImmichV3Provider();
    const page = await provider.listRecentAssets(connection, { limit: 20, cursor: "1" });
    expect(page.nextCursor).toBe("2");
    expect(page.assets).toEqual([
      { id: "image-1", type: "image", capturedAt: new Date("2020-01-02T03:04:05.000Z"), width: 100, height: 50, durationMs: null },
      { id: "video-1", type: "video", capturedAt: new Date("2021-02-03T04:05:06.000Z"), width: 1920, height: 1080, durationMs: 12345 },
    ]);
    expect(JSON.parse(requests[0]!.body!)).toMatchObject({ page: 1, size: 20, order: "desc" });

    const stream = await provider.getVideoStream(connection, "video-1", "bytes=100-199");
    expect(stream.status).toBe(206);
    expect(stream.headers["content-range"]).toBe("bytes 100-199/1000");
    expect(requests[1]!.range).toBe("bytes=100-199");
  });

  it("streams multipart upload bytes and recognizes duplicate responses", async () => {
    let multipart = new Uint8Array();
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body as unknown as AsyncIterable<Uint8Array>;
      const chunks: Uint8Array[] = [];
      for await (const chunk of body) chunks.push(chunk);
      multipart = concat(chunks);
      return jsonResponse({ id: "canonical-id", status: "duplicate" }, 200);
    }));

    const provider = new OfficialImmichV3Provider();
    async function* bytes() {
      yield new TextEncoder().encode("first-");
      yield new TextEncoder().encode("second");
    }
    const result = await provider.uploadAsset(connection, {
      filename: "clip.mp4",
      contentType: "video/mp4",
      capturedAt: new Date("2024-05-06T07:08:09.000Z"),
      bytes: bytes(),
    });

    expect(result).toEqual({ assetId: "canonical-id", duplicate: true });
    const text = new TextDecoder().decode(multipart);
    expect(text).toContain('name="fileCreatedAt"');
    expect(text).toContain("2024-05-06T07:08:09.000Z");
    expect(text).toContain('name="assetData"; filename="clip.mp4"');
    expect(text).toContain("Content-Type: video/mp4");
    expect(text).toContain("first-second");
  });
});
