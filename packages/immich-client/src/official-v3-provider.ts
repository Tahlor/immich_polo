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
} from "./types.js";

interface VersionDto {
  major: number;
  minor: number;
  patch: number;
}

interface UserDto {
  id: string;
}

interface AssetDto {
  id: string;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "OTHER";
  fileCreatedAt?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
}

interface SearchDto {
  assets: {
    items: AssetDto[];
    nextPage?: string | null;
  };
}

interface UploadDto {
  id: string;
  status?: "created" | "duplicate";
  duplicate?: boolean;
}

export class ImmichHttpError extends Error {
  constructor(
    readonly status: number,
    readonly operation: string,
  ) {
    super(`Immich ${operation} failed with HTTP ${status}`);
    this.name = "ImmichHttpError";
  }
}

export class UnsupportedImmichVersionError extends Error {
  constructor(readonly version: string) {
    super(`Immich Polo currently supports the verified v3 API contract; server reported ${version}`);
    this.name = "UnsupportedImmichVersionError";
  }
}

function apiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const apiBase = base.endsWith("/api") ? base : `${base}/api`;
  return `${apiBase}${path}`;
}

function authHeaders(connection: ImmichConnectionSecret): Headers {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("x-api-key", connection.apiKey);
  return headers;
}

async function expectJson<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) throw new ImmichHttpError(response.status, operation);
  return (await response.json()) as T;
}

function mapAsset(asset: AssetDto): MediaAsset {
  if (asset.type !== "IMAGE" && asset.type !== "VIDEO") {
    throw new Error(`Unsupported Immich asset type: ${asset.type}`);
  }
  let capturedAt: Date | null = null;
  if (asset.fileCreatedAt) {
    const parsed = new Date(asset.fileCreatedAt);
    if (!Number.isNaN(parsed.getTime())) capturedAt = parsed;
  }
  return {
    id: asset.id,
    type: asset.type === "IMAGE" ? "image" : "video",
    capturedAt,
    width: asset.width ?? null,
    height: asset.height ?? null,
    durationMs: asset.duration ?? null,
  };
}

function streamResult(response: Response): MediaStream {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  return { status: response.status, headers, body: response.body };
}

function safeFilename(filename: string): string {
  return filename.replace(/[\r\n"]/g, "_");
}

function field(boundary: string, name: string, value: string): Uint8Array {
  return new TextEncoder().encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
}

async function* multipartBody(input: UploadInput, boundary: string): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const createdAt = (input.capturedAt ?? new Date()).toISOString();
  const modifiedAt = new Date().toISOString();
  const filename = safeFilename(input.filename);

  yield field(boundary, "fileCreatedAt", createdAt);
  yield field(boundary, "fileModifiedAt", modifiedAt);
  yield field(boundary, "filename", filename);
  yield encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="assetData"; filename="${filename}"\r\nContent-Type: ${input.contentType}\r\n\r\n`,
  );
  for await (const chunk of input.bytes) yield chunk;
  yield encoder.encode(`\r\n--${boundary}--\r\n`);
}

/**
 * HTTP implementation of the stable Immich v3 operations Polo needs.
 *
 * The endpoint contract follows the official Immich v3 OpenAPI surface. The
 * actual Archimedes deployment is still the runtime authority: issues #11-#13
 * must validate version, least-privilege permissions, upload/dedupe behavior,
 * thumbnail behavior, and byte-range playback before production is declared
 * verified.
 */
export class OfficialImmichV3Provider implements ImmichMediaProvider {
  async verifyConnection(connection: ImmichConnectionSecret): Promise<ConnectionInfo> {
    const version = await expectJson<VersionDto>(
      await fetch(apiUrl(connection.baseUrl, "/server/version"), { headers: authHeaders(connection) }),
      "server version",
    );
    const versionString = `${version.major}.${version.minor}.${version.patch}`;
    if (version.major !== 3) throw new UnsupportedImmichVersionError(versionString);

    const user = await expectJson<UserDto>(
      await fetch(apiUrl(connection.baseUrl, "/users/me"), { headers: authHeaders(connection) }),
      "current user",
    );
    return { serverVersion: versionString, immichUserId: user.id };
  }

  async listRecentAssets(connection: ImmichConnectionSecret, query: AssetQuery): Promise<AssetPage> {
    const page = query.cursor === undefined ? 1 : Number.parseInt(query.cursor, 10);
    if (!Number.isInteger(page) || page < 1) throw new Error("Invalid Immich search cursor");
    const headers = authHeaders(connection);
    headers.set("Content-Type", "application/json");
    const body: Record<string, unknown> = {
      page,
      size: query.limit ?? 50,
      order: "desc",
    };
    if (query.type) body.type = query.type === "image" ? "IMAGE" : "VIDEO";

    const result = await expectJson<SearchDto>(
      await fetch(apiUrl(connection.baseUrl, "/search/metadata"), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      "asset search",
    );

    const assets = result.assets.items
      .filter((asset) => asset.type === "IMAGE" || asset.type === "VIDEO")
      .map(mapAsset);
    return {
      assets,
      ...(result.assets.nextPage ? { nextCursor: result.assets.nextPage } : {}),
    };
  }

  async getAssetMetadata(connection: ImmichConnectionSecret, assetId: string): Promise<MediaAsset> {
    const asset = await expectJson<AssetDto>(
      await fetch(apiUrl(connection.baseUrl, `/assets/${encodeURIComponent(assetId)}`), {
        headers: authHeaders(connection),
      }),
      "asset metadata",
    );
    return mapAsset(asset);
  }

  async getThumbnailStream(
    connection: ImmichConnectionSecret,
    assetId: string,
    options: ThumbnailOptions = {},
  ): Promise<MediaStream> {
    const size = options.size ?? "preview";
    const response = await fetch(
      apiUrl(connection.baseUrl, `/assets/${encodeURIComponent(assetId)}/thumbnail?size=${encodeURIComponent(size)}`),
      { headers: authHeaders(connection), redirect: "manual" },
    );
    if (!response.ok) throw new ImmichHttpError(response.status, "asset thumbnail");
    return streamResult(response);
  }

  async getVideoStream(
    connection: ImmichConnectionSecret,
    assetId: string,
    range?: string,
  ): Promise<MediaStream> {
    const headers = authHeaders(connection);
    if (range) headers.set("Range", range);
    const response = await fetch(
      apiUrl(connection.baseUrl, `/assets/${encodeURIComponent(assetId)}/video/playback`),
      { headers },
    );
    if (!response.ok) throw new ImmichHttpError(response.status, "video playback");
    return streamResult(response);
  }

  async uploadAsset(connection: ImmichConnectionSecret, input: UploadInput): Promise<UploadResult> {
    const boundary = `immich-polo-${globalThis.crypto.randomUUID()}`;
    const headers = authHeaders(connection);
    headers.set("Content-Type", `multipart/form-data; boundary=${boundary}`);
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers,
      body: multipartBody(input, boundary) as unknown as BodyInit,
      duplex: "half",
    };
    const response = await fetch(apiUrl(connection.baseUrl, "/assets"), init);
    const result = await expectJson<UploadDto>(response, "asset upload");
    return {
      assetId: result.id,
      duplicate: result.status === "duplicate" || result.duplicate === true || response.status === 200,
    };
  }
}
