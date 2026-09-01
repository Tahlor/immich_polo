export interface ImmichConnectionSecret {
  baseUrl: string;
  apiKey: string;
}

export interface ConnectionInfo {
  serverVersion: string;
  immichUserId?: string;
}

export type PoloMediaType = "image" | "video";

export interface MediaAsset {
  id: string;
  type: PoloMediaType;
  capturedAt: Date | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface AssetQuery {
  limit?: number;
  type?: PoloMediaType;
  cursor?: string;
}

export interface AssetPage {
  assets: MediaAsset[];
  nextCursor?: string;
}

export interface ThumbnailOptions {
  size?: "preview" | "thumbnail";
}

export interface MediaStream {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: ReadableStream<Uint8Array> | null;
}

export interface UploadInput {
  filename: string;
  contentType: string;
  capturedAt?: Date;
  bytes: AsyncIterable<Uint8Array>;
}

export interface UploadResult {
  assetId: string;
  duplicate: boolean;
}

/**
 * Every Immich endpoint/version detail belongs behind this interface.
 * Do not implement guessed v3 routes: issue #1 requires real-server evidence first.
 */
export interface ImmichMediaProvider {
  verifyConnection(connection: ImmichConnectionSecret): Promise<ConnectionInfo>;
  listRecentAssets(connection: ImmichConnectionSecret, query: AssetQuery): Promise<AssetPage>;
  getAssetMetadata(connection: ImmichConnectionSecret, assetId: string): Promise<MediaAsset>;
  getThumbnailStream(
    connection: ImmichConnectionSecret,
    assetId: string,
    options?: ThumbnailOptions,
  ): Promise<MediaStream>;
  getVideoStream(
    connection: ImmichConnectionSecret,
    assetId: string,
    range?: string,
  ): Promise<MediaStream>;
  uploadAsset(connection: ImmichConnectionSecret, input: UploadInput): Promise<UploadResult>;
}
