# API contract

See also: [`Two-phone milestone`](M1_TWO_PHONE_VERTICAL_SLICE.md) · [`Architecture`](ARCHITECTURE.md) · [`Immich v3 contract`](IMMICH_V3_CONTRACT.md) · [`Client`](CLIENT.md) · [`Scheduling/watch`](SCHEDULING.md)

This file describes routes that exist in current code. Real Immich behavior remains gated by #11–#13 and the runtime provider selection.

## Authentication

Polo has its own accounts. Usernames are normalized to lowercase; passwords are hashed with Node `scrypt`; registration/login returns a random bearer token while SQLite stores only its SHA-256 hash. Sessions expire after `SESSION_TTL_DAYS` (30 by default).

`POST /auth/register` currently requires the server-held `POLO_REGISTRATION_SECRET`. It is bootstrap plumbing, not Universal SSO.

- `POST /auth/register` — `registrationSecret`, `username`, `displayName`, `password`; returns `{token, expiresAt, user}`.
- `POST /auth/login` — username/password session creation.
- `GET /auth/me` — current user.
- `POST /auth/logout` — deletes current session, `204`.
- `GET /users` — public Polo user directory for the small self-hosted instance.

## Health/core/thread

- `GET /health` — liveness.
- `GET /ready` — SQLite readiness plus configured Immich provider name.
- `GET /threads` — only current-user threads.
- `POST /threads` — create thread; current user always included.
- `GET /threads/:threadId/posts` — membership required; members see published posts and an author also sees their own scheduled posts. Raw Immich asset IDs/credentials are not returned.

Current read limitations: thread lists are ordered by thread creation, post lists by post creation (not publication). Responses do not include current-user PostView, unread counts or latest-post summaries. `PUT /posts/:postId/view` persists/returns view state, but there is no read-back route wired into client resume. Correct chronology and read-state summaries are planned in #8; do not treat them as implemented.

## Immich connection and picker routes

All require Polo bearer authentication. Stored API credentials are encrypted using `POLO_CREDENTIAL_KEY` and are never returned by these routes.

### `GET /immich-connections`
Lists only the current user's connection metadata.

### `POST /immich-connections`
Body: `baseUrl`, `apiKey`. The selected provider must successfully verify the connection before Polo encrypts/stores the key. With the default `IMMICH_PROVIDER=unverified`, this fails closed; a validated deployment selects `official-v3`.

If `IMMICH_ALLOWED_BASE_URLS` is configured, other base URLs return `403
immich_base_url_not_allowed` before provider verification. Trailing slashes
are normalized. Archimedes permits only `http://127.0.0.1:2283`; an unset
allowlist remains unrestricted for development and must not be used there.

### `GET /immich-connections/:connectionId/assets`
Connection-owner only. Query: optional `type=image|video`, `limit`, `cursor`. Returns safe picker metadata only.

### `GET /immich-connections/:connectionId/assets/:assetId/thumbnail`
Connection-owner only. Proxies an authenticated picker thumbnail from the exact stored connection. Upstream headers are allowlisted.

## Post creation/media

### `POST /threads/:threadId/posts/from-immich`
Thread member + connection owner required. Body: `connectionId`, `assetId`, optional `caption`, optional future `visibleAt`, optional UUID `sendId`. Polo re-fetches asset metadata server-side rather than trusting client metadata. Existing media is referenced; it is not copied.

### `POST /threads/:threadId/posts/upload/:connectionId`
Thread member + connection owner required. Exactly one multipart image/video file. Optional query parameters: `caption`, `capturedAt`, `visibleAt`, UUID `sendId` and UUID `fileId`. With a send ID, file ID is required and identifies the immutable selected local file.

The API streams file bytes into the selected provider rather than buffering the complete media. After Immich returns a canonical/duplicate asset ID, Polo re-fetches that asset and creates the post using the canonical reference.

### Logical send retry and reconciliation (implemented for #22)

The client freezes destination, source/connection, caption, absolute schedule and
send ID on explicit confirmation. Reuse that ID and identical input for retries;
a deliberate new share uses a new ID. Requests without `sendId` retain the legacy
non-idempotent behavior for compatibility; the current composer always sends one.
The upload's `fileId` must continue to identify the same bytes/file selection.
It is a client identity, not a server-computed content hash or authorization grant.

SQLite `send_requests` records are scoped by authenticated author + send ID.
Creation returns `201`; completed replay returns `200` with the original result,
without re-fetching/re-uploading media or creating another post/outbox event.
Changed destination/source/metadata with the same ID returns `409
send_identity_conflict`; a live concurrent attempt returns `409 send_in_progress`.
A 90-second database lease, renewed every 20 seconds, fences stale workers.
Post creation, publication outbox insertion and completion record commit together.
Current membership and connection ownership are required on creation/replay;
current membership is also rechecked after asynchronous provider work.

After a successful upload response, its canonical asset ID is checkpointed before
metadata lookup. A retry can resume metadata/post preparation with no multipart
body if that checkpoint exists. Polo never stores original bytes here. If Immich
accepted bytes but its response was lost before the checkpoint, retry may upload
again; actual provider deduplication/residue remains #13's runtime gate. This
mechanism guarantees a single Polo post per logical send, not unverified Immich
upload behavior.

- `GET /threads/:threadId/sends/:sendId` — current member + send author only;
  `404 send_not_found` for unknown/other-owner/wrong-thread/removed-member reads.
  Returns `{state:"completed", result:{post, upload?}}`, `{state:"processing",
  uploadRequired}`, `{state:"retryable", uploadRequired}`, or `{state:"cancelled"}`.
  `uploadRequired:false` allows a checkpointed upload to resume without a body.
- `DELETE /threads/:threadId/sends/:sendId` — author/member check-and-discard.
  Completed sends return their result and keep the post. Active sends return
  `409 send_in_progress`. Missing/failed/expired sends get a durable cancellation
  tombstone, fencing even an original request that arrives later. This cancels a
  logical send; it never deletes media from Immich.

Status/cancellation responses use `Cache-Control: no-store`. Deleting a created
Polo post retains its send tombstone; replay/reconciliation returns `410
send_post_deleted`, preventing accidental resurrection. Cancelled send IDs return
`410 send_cancelled` on creation. Send records persist across process restarts;
there is no automatic retention pruning in this household-sized implementation.

### `GET /posts/:postId/assets/:postAssetId/thumbnail`
Authorizes the Polo post/post-asset first, then resolves the exact stored Immich connection. A recipient cannot use an arbitrary Immich asset ID as authorization.

### `GET /posts/:postId/assets/:postAssetId/media`
Same authorization boundary. Images currently use the provider preview stream; videos use Immich playback and forward the incoming HTTP `Range` header. Only safe media headers are forwarded.

A recipient receives `404` for scheduled media before publication; the author may inspect their own scheduled media.

## Scheduling/watch

- `PATCH /posts/:postId/schedule` — author-only future reschedule of a scheduled post.
- `DELETE /posts/:postId` — author-only Polo metadata delete; never calls Immich delete.
- `PUT /posts/:postId/view` — published-post member view/watch state; optional `playbackPositionMs`.

The server publication worker persists exactly one notification-outbox event per publication, but actual push delivery remains #9.

## Planned, not implemented

The [household finish plan](MVP_FINISH_PLAN.md) requires invite lifecycle/registration (#21), push registration/preferences/delivery (#9), connection health/credential replacement and client-facing unread/resume summaries. No route signatures are promised here until implementation. Reschedule/delete/view **writes** listed above already exist; they must not be rebuilt as if missing.

## Provider behavior

`IMMICH_PROVIDER` has two supported values:

- `unverified` — default/fail-closed; media provider operations return `immich_integration_unverified`.
- `official-v3` — concrete HTTP implementation of the official Immich v3 surface documented in [`IMMICH_V3_CONTRACT.md`](IMMICH_V3_CONTRACT.md).

The existence of `official-v3` code is **not** evidence that the target server passed. Archimedes #11–#13 remain authoritative for version, minimum permissions, search pagination, thumbnail/video behavior, upload/dedupe, and processing readiness.

## Mandatory authorization invariants

1. Bearer authentication establishes acting Polo user; the client never chooses another acting identity.
2. Thread reads/writes require membership.
3. Immich browsing/upload requires ownership of the chosen connection.
4. Recipient media reads begin from an authorized Polo post + PostAsset and resolve connection/asset server-side.
5. A guessed `immich_asset_id` alone never authorizes retrieval.
6. Scheduled posts/media are hidden from recipients until publication.
7. Polo metadata deletion does not delete canonical Immich media.

## Errors

Polo uses normal `400/401/403/404/409` application errors, `503` for deliberately unconfigured/fail-closed integration, and `502` for unexpected Immich upstream failures. Exact handling for processing-not-ready/missing upstream media may be refined from #11–#13 evidence rather than guessed.
