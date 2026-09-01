# Architecture

## Overview

Immich Polo is intentionally a thin conversational application in front of Immich.

```text
+---------------------------+
| Expo client (mobile/web)  |
+-------------+-------------+
              |
              | Polo auth + app API
              v
+---------------------------+
| Immich Polo API           |
|                           |
| Fastify                   |
| Drizzle + SQLite          |
| Scheduler / notification  |
| Immich adapter            |
+-------------+-------------+
              |
              | Immich API using server-held
              | user connection credentials
              v
+---------------------------+
| Immich                    |
| originals / previews /    |
| thumbnails / transcoding  |
+---------------------------+
```

## Why Polo should not ask the official Immich app to sync local media

Coordinating with another mobile app's backup lifecycle creates races and platform-specific behavior:

- Polo cannot reliably know when the official Immich client has completed backup;
- background execution differs by platform;
- matching the local file back to the newly uploaded Immich asset adds complexity;
- scheduling should not depend on either mobile app remaining alive.

Instead, when a local item is posted, Polo sends it through its own upload flow to Immich. Immich remains the final storage destination and returns the canonical asset ID. This is not a second storage system: Polo may use temporary streaming/upload state, but does not retain a second original after the Immich upload succeeds.

Immich currently documents direct API uploads and returns an asset identifier; its CLI/API path also performs server-side hash-based deduplication. Integration code must nevertheless be isolated behind an adapter because Immich v3 introduced breaking API changes for third-party integrations.

## Repository layout

Target layout:

```text
apps/
  api/                 Fastify API + scheduler
  client/              Expo / React Native / web
packages/
  domain/              shared schemas/types/domain rules
  immich-client/       all Immich-specific API integration
  config/              shared lint/typescript config if useful
docs/
  PRODUCT_PLAN.md
  ARCHITECTURE.md
```

Avoid creating separate services unless measured behavior requires them.

## Immich integration boundary

All Immich calls go through `packages/immich-client` (or the equivalent adapter module). The rest of Polo should reason in terms of operations such as:

```ts
interface ImmichMediaProvider {
  verifyConnection(connection: ImmichConnectionSecret): Promise<ConnectionInfo>;
  listRecentAssets(connection: ImmichConnectionSecret, query: AssetQuery): Promise<MediaAsset[]>;
  getAssetMetadata(connection: ImmichConnectionSecret, assetId: string): Promise<MediaAsset>;
  getThumbnailStream(connection: ImmichConnectionSecret, assetId: string, options: ThumbnailOptions): Promise<MediaStream>;
  getVideoStream(connection: ImmichConnectionSecret, assetId: string, range?: string): Promise<MediaStream>;
  uploadAsset(connection: ImmichConnectionSecret, input: UploadInput): Promise<UploadResult>;
}
```

Exact Immich endpoint names must not leak into domain or UI code.

### Version support

At startup / connection verification, capture the Immich server version. Define and test an explicit supported range rather than assuming API compatibility forever. Fail with a useful message when outside the known range.

The integration spike should use current Immich v3 API documentation as the baseline and add a small contract test suite that can run against a real test server.

## Credentials and authorization

### Polo authentication

Polo has its own login/session model. A Polo user may or may not correspond to an Immich user from the recipient's point of view.

### Immich connection

Each sender can connect the Immich account whose library should own their uploads and existing-asset posts. For V1, the pragmatic setup is a per-user Immich API key entered during connection setup and stored encrypted server-side.

Immich supports permission-scoped API keys. Request/document the least permissions needed by the integration spike rather than defaulting to unrestricted keys.

Do **not** expose a stored Immich API key to another Polo user. A recipient accesses a post through Polo, and Polo performs authorization before using the owning sender's Immich connection to retrieve that specific referenced asset.

### Critical authorization invariant

Knowing or guessing an `immich_asset_id` must never be enough to retrieve media through Polo.

Every media endpoint must resolve:

```text
requesting Polo user
  -> thread membership
  -> visible post
  -> PostAsset
  -> exact Immich connection + asset id
  -> permitted media operation
```

Do not offer a generic `/immich/assets/:id` proxy that bypasses this chain.

For author-only picker/search endpoints, require ownership of the referenced Immich connection.

## Media upload flow

```text
Client local URI
   |
   | authenticated multipart/stream
   v
Polo API
   |
   | stream to Immich; avoid loading whole file in memory
   v
Immich upload
   |
   | asset id / duplicate result
   v
Polo creates PostAsset
```

Requirements:

- Preserve original capture/file timestamps where available.
- Surface upload progress to the client where feasible.
- A failed Immich upload cannot produce a published Polo post.
- If Immich identifies a duplicate, reference the canonical returned asset rather than uploading/storing another copy.
- Temporary upload files, if a framework/platform forces their use, must be deleted promptly after success/failure.
- V1 may require the client to remain active during large uploads; robust background/resumable transfer is a follow-up unless the spike identifies an easy reliable solution.

## Existing-asset post flow

```text
Client asks Polo for sender's Immich picker data
        -> Polo queries sender's connected Immich
Client selects asset id
        -> Polo re-fetches/validates asset server-side
        -> creates Post + PostAsset
```

Never trust client-supplied cached metadata for authorization or ownership.

## Media delivery

Polo should broker media access rather than hand out sender credentials.

### Thumbnails

Proxy thumbnail/preview responses with suitable cache headers. The client may cache normal non-sensitive UI thumbnails according to application policy.

### Video

Video delivery must preserve HTTP byte-range semantics so seeking works. The API must stream response bodies and forward relevant status/headers instead of buffering entire videos in process memory.

The integration spike must explicitly test:

- initial playback;
- seek into the middle of a video;
- repeated range requests;
- Immich preview/transcode not ready yet;
- missing/deleted asset.

If a later Immich API offers a secure short-lived URL mechanism appropriate to this use case, it can replace proxying, but V1 must not rely on a capability that has not been verified.

## Scheduling model

Scheduling is database state, not an external job per post.

Recommended fields:

```text
status       scheduled | published | cancelled | failed
visible_at   absolute UTC instant
published_at nullable UTC instant
```

A small worker periodically claims due posts in a transaction. Publication must be idempotent.

Pseudo-flow:

```text
BEGIN
  select due scheduled posts
  atomically transition each scheduled -> published
  set published_at
COMMIT

enqueue/send notification using stable publication idempotency key
```

The thread query shown to recipients includes only published posts. Sender views may additionally include their own scheduled posts.

### Scheduler guarantees

- Server restart does not lose scheduled work.
- Running two scheduler loops does not publish twice.
- A notification retry does not create a second publication.
- Cancelling before publication prevents recipient visibility.
- Rescheduling updates `visible_at` without creating a new media asset.
- Server/database time is authoritative; client clock is not.

## Notifications

Create a notification abstraction separate from Expo-specific code:

```ts
interface PushProvider {
  notifyPostPublished(input: PublishedPostNotification): Promise<void>;
}
```

Persist enough state to make retries idempotent and to invalidate dead device tokens.

Never notify recipients about scheduled posts before publication.

## Watch state

Watch/seen state belongs to Polo, because it is conversational state, not media-library state.

For videos, update `playback_position_ms` periodically or on pause/navigation, and set `watched_at` after a documented completion threshold. The exact threshold can be tuned later; do not couple core authorization to it.

## Data deletion semantics

Default behavior is deliberately asymmetric:

- Deleting/cancelling a Polo post deletes Polo metadata only.
- It does **not** delete the Immich asset.
- Deleting an Immich asset causes the Polo post to render a missing-media state.

A future explicit "delete from Immich too" action, if ever added, must be separately confirmed and authorized.

## Database choice

SQLite is appropriate initially because:

- writes are low-volume;
- the expected deployment is a single Polo server for a household/small group;
- scheduling can be made durable with normal transactions;
- it keeps deployment to one application container plus a mounted database file.

Use Drizzle migrations from the beginning. Keep IDs and schema portable enough that Postgres remains a straightforward future move if concurrency or hosting requirements change.

## API shape

Exact routes are implementation details, but the domain should approximately expose:

```text
POST   /auth/...
GET    /threads
POST   /threads
GET    /threads/:threadId/posts
POST   /threads/:threadId/posts/from-immich
POST   /threads/:threadId/posts/upload
PATCH  /posts/:postId/schedule
DELETE /posts/:postId              # Polo metadata only
PUT    /posts/:postId/view

POST   /immich-connections
GET    /immich-connections/:id/status
GET    /immich-connections/:id/assets

GET    /posts/:postId/assets/:assetId/thumbnail
GET    /posts/:postId/assets/:assetId/media
```

The post-scoped media routes are intentional: authorization starts from the Polo post, not from an arbitrary Immich asset ID.

## Testing strategy

### Unit

- scheduling state transitions;
- thread/post authorization;
- time calculations;
- watch-state transitions;
- credential encryption/decryption boundary.

### API integration

- user cannot read a thread they are not a member of;
- scheduled post is absent to recipient but visible to author;
- guessed asset ID cannot bypass post authorization;
- duplicate scheduler executions publish once;
- cancellation/reschedule behavior.

### Immich contract tests

Against a disposable/test Immich server:

- verify connection/version;
- list media;
- upload image/video;
- duplicate upload behavior;
- fetch thumbnail;
- stream/seek video;
- deleted asset behavior.

### End-to-end

At least one Android-oriented end-to-end path and browser path covering the V1 acceptance scenario in `PRODUCT_PLAN.md`.

## Security notes

- Encrypt Immich API keys at rest using a server-held secret.
- Never log API keys or authorization headers.
- Redact sensitive connection data from error telemetry.
- Apply explicit file-size/type limits to upload endpoints.
- Treat all media metadata and captions as user-controlled input.
- Enforce thread authorization server-side for every read/write.
- Use HTTPS outside trusted localhost/private development environments.

## Open implementation questions to resolve in Milestone 0

1. Exact minimum Immich v3 API-key permissions for listing, metadata, preview/video retrieval, and upload.
2. Best current Immich endpoint/representation for video playback and how transcoding readiness is surfaced.
3. Whether Polo should request originals or Immich-encoded video by default for conversational playback.
4. How duplicate upload responses identify the canonical existing asset in every supported case.
5. Whether Expo web/mobile can share the chosen upload implementation cleanly or needs a thin platform adapter.

These are spike questions, not reasons to duplicate media or alter the core product model.
