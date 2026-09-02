# Immich v3 integration contract

This document records the upstream contract implemented by `OfficialImmichV3Provider`. It is a code-level starting point, not a substitute for runtime evidence from the target server.

## Production gate

`IMMICH_PROVIDER` defaults to `unverified`. The Archimedes deployment should enable `IMMICH_PROVIDER=official-v3` only after issues #11, #12, and #13 validate the deployed Immich server and least-privilege API-key behavior.

`OfficialImmichV3Provider.verifyConnection()` rejects non-v3 major versions.

## Stable operations used

The adapter follows the current official Immich v3 OpenAPI surface:

| Polo operation | Immich operation | Expected permission |
| --- | --- | --- |
| verify version | `GET /api/server/version` | server/version access as supported by API key |
| identify connection owner | `GET /api/users/me` | `user.read` |
| recent media picker | `POST /api/search/metadata` | `asset.read` |
| re-validate selected asset | `GET /api/assets/:id` | `asset.read` |
| thumbnail/preview | `GET /api/assets/:id/thumbnail` | `asset.view` |
| video playback/seek | `GET /api/assets/:id/video/playback` | `asset.view` |
| upload local media | `POST /api/assets` | `asset.upload` |

The exact minimal API-key permission set is deliberately not hard-coded in setup documentation until #11 proves it against Archimedes.

## Search mapping

Polo currently requests metadata search ordered descending, with page/size pagination and optional IMAGE/VIDEO filtering. Immich's `nextPage` value is stored as an opaque Polo cursor but currently parsed as the numeric page expected by the v3 metadata-search request. #12 must verify this against multiple pages on the deployed server.

Polo caches only the media fields needed for thread UX: asset ID, image/video type, capture instant, width, height, and duration. Canonical metadata remains in Immich.

## Upload mapping

The adapter streams multipart data without constructing a complete file buffer in Polo. It supplies:

- `fileCreatedAt` from the source capture time when known;
- `fileModifiedAt` at upload time when the client has not supplied a distinct modified timestamp;
- `filename`;
- `assetData` with source content type.

Immich's returned ID is treated as canonical. A duplicate response is also successful and Polo references that canonical ID.

#13 must verify exact duplicate behavior, processing readiness, and interrupted-upload cleanup on Archimedes before production acceptance.

## Video mapping

Polo forwards the recipient's HTTP `Range` header to Immich video playback and only returns a safe allowlist of media response headers. #12 must verify middle-of-file and repeated range behavior through both the local provider and the public Polo nginx path.

## Security boundary

Clients never call these Immich operations with another user's credential. Polo first authorizes the user/thread/post or connection ownership, decrypts the exact stored connection server-side, then calls Immich. Media proxy routes accept Polo post/post-asset identities rather than arbitrary recipient-supplied Immich asset IDs.
