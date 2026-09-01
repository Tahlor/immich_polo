import { ImmichIntegrationNotVerifiedError } from "./errors.js";
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

/**
 * Fails loudly instead of letting application code accidentally depend on a guessed API contract.
 */
export class UnverifiedImmichProvider implements ImmichMediaProvider {
  private fail(): never {
    throw new ImmichIntegrationNotVerifiedError();
  }

  verifyConnection(_connection: ImmichConnectionSecret): Promise<ConnectionInfo> {
    return Promise.reject(this.fail());
  }

  listRecentAssets(_connection: ImmichConnectionSecret, _query: AssetQuery): Promise<AssetPage> {
    return Promise.reject(this.fail());
  }

  getAssetMetadata(_connection: ImmichConnectionSecret, _assetId: string): Promise<MediaAsset> {
    return Promise.reject(this.fail());
  }

  getThumbnailStream(
    _connection: ImmichConnectionSecret,
    _assetId: string,
    _options?: ThumbnailOptions,
  ): Promise<MediaStream> {
    return Promise.reject(this.fail());
  }

  getVideoStream(
    _connection: ImmichConnectionSecret,
    _assetId: string,
    _range?: string,
  ): Promise<MediaStream> {
    return Promise.reject(this.fail());
  }

  uploadAsset(_connection: ImmichConnectionSecret, _input: UploadInput): Promise<UploadResult> {
    return Promise.reject(this.fail());
  }
}
