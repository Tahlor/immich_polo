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

let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

class CountingProvider implements ImmichMediaProvider {
  verifyCalls = 0;

  async verifyConnection(_connection: ImmichConnectionSecret): Promise<ConnectionInfo> {
    this.verifyCalls += 1;
    return { serverVersion: "3.test", immichUserId: "immich-user" };
  }

  async listRecentAssets(_connection: ImmichConnectionSecret, _query: AssetQuery): Promise<AssetPage> {
    throw new Error("unused");
  }

  async getAssetMetadata(_connection: ImmichConnectionSecret, _assetId: string): Promise<MediaAsset> {
    throw new Error("unused");
  }

  async getThumbnailStream(_connection: ImmichConnectionSecret, _assetId: string, _options?: ThumbnailOptions): Promise<MediaStream> {
    throw new Error("unused");
  }

  async getVideoStream(_connection: ImmichConnectionSecret, _assetId: string, _range?: string): Promise<MediaStream> {
    throw new Error("unused");
  }

  async uploadAsset(_connection: ImmichConnectionSecret, _input: UploadInput): Promise<UploadResult> {
    throw new Error("unused");
  }
}

describe("Immich connection origin policy", () => {
  it("rejects non-allowlisted origins before the provider is called", async () => {
    const provider = new CountingProvider();
    const registrationSecret = "registration-secret-123";
    const credentialKey = randomBytes(32).toString("base64");
    ({ app } = buildApp({
      databasePath: ":memory:",
      registrationSecret,
      credentialKey,
      immichProvider: provider,
      immichAllowedBaseUrls: ["http://127.0.0.1:2283"],
    }));

    const registered = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        registrationSecret,
        username: "alice",
        displayName: "Alice",
        password: "correct horse battery staple",
      },
    });
    expect(registered.statusCode).toBe(201);
    const token = registered.json().token as string;

    const denied = await app.inject({
      method: "POST",
      url: "/immich-connections",
      headers: { authorization: `Bearer ${token}` },
      payload: { baseUrl: "http://169.254.169.254", apiKey: "not-used" },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: "immich_base_url_not_allowed" });
    expect(provider.verifyCalls).toBe(0);

    const allowed = await app.inject({
      method: "POST",
      url: "/immich-connections",
      headers: { authorization: `Bearer ${token}` },
      payload: { baseUrl: "http://127.0.0.1:2283/", apiKey: "allowed-key" },
    });
    expect(allowed.statusCode).toBe(201);
    expect(allowed.json().connection.baseUrl).toBe("http://127.0.0.1:2283");
    expect(provider.verifyCalls).toBe(1);
  });
});
