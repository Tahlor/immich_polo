# API contract

See also: [`Product plan`](PRODUCT_PLAN.md) · [`Architecture`](ARCHITECTURE.md) · [`Scheduling/watch`](SCHEDULING.md) · [`Development`](DEVELOPMENT.md) · [`Roadmap`](ROADMAP.md)

This file distinguishes routes that exist **now** from planned routes so clients and agents do not code against documentation fiction.

## Authentication model implemented now

Polo has its own accounts. Usernames are normalized to lowercase; passwords are hashed with Node's `scrypt`; successful registration/login returns a random bearer token. Only a SHA-256 hash of that session token is stored in SQLite. Sessions expire after `SESSION_TTL_DAYS` (30 by default).

Self-hosted account creation is intentionally simple for V1: `POST /auth/register` requires the server-held `POLO_REGISTRATION_SECRET`. Use HTTPS for any non-local deployment. The registration secret and returned session token are credentials and must never be logged or committed.

### `POST /auth/register`
Body: `registrationSecret`, `username`, `displayName`, `password` (minimum 10 characters). Returns `201` with `{ token, expiresAt, user }`.

### `POST /auth/login`
Body: `username`, `password`. Returns `{ token, expiresAt, user }` or `401`.

### `GET /auth/me`
Bearer auth required. Returns current public user.

### `POST /auth/logout`
Bearer auth required. Deletes the current session and returns `204`.

### `GET /users`
Bearer auth required. Returns only public IDs/display names/usernames for the small self-hosted user set.

## Core/thread routes implemented now

### `GET /health`
Liveness only.

### `GET /ready`
Checks SQLite connectivity and migration state.

### `GET /threads`
Bearer auth required. Lists only threads containing current user, with members.

### `POST /threads`
Bearer auth required. Body: optional `title`, `memberUserIds`; current user is always included.

### `GET /threads/:threadId/posts`
Bearer auth + membership required. Published posts are visible to members; an author additionally sees their own scheduled posts. Raw Immich asset IDs/connection credentials are not returned.

## Scheduling/watch routes implemented now

### `PATCH /posts/:postId/schedule`
Author only. Reschedules an existing `scheduled` post to a future absolute `visibleAt`. Published/cancelled/failed posts cannot be rescheduled through this route.

### `DELETE /posts/:postId`
Author only. Deletes Polo metadata and **never calls Immich to delete the canonical media**.

### `PUT /posts/:postId/view`
Thread member + published post required. Optional body `playbackPositionMs`. Records first-seen state and video resume position; images become seen immediately, while videos use the documented server-side completion rule in [`SCHEDULING.md`](SCHEDULING.md).

The production server also runs the durable publication worker described in [`SCHEDULING.md`](SCHEDULING.md); publication writes a durable notification outbox event but does not send push yet.

## Planned media/application surface

Pending the verified Immich boundary and later milestones:

```text
POST   /threads/:threadId/posts/from-immich
POST   /threads/:threadId/posts/upload
POST   /immich-connections
GET    /immich-connections/:id/status
GET    /immich-connections/:id/assets
GET    /posts/:postId/assets/:postAssetId/thumbnail
GET    /posts/:postId/assets/:postAssetId/media
```

## Mandatory authorization invariants

1. Authentication establishes acting Polo `user_id`; clients never select arbitrary acting identity.
2. Thread reads/writes require current membership.
3. Author-only Immich browsing/upload operations require ownership of selected `ImmichConnection`.
4. Recipient media reads start from authorized **Polo post + PostAsset** and resolve exact connection/asset server-side.
5. Caller-supplied or guessed `immich_asset_id` alone can never authorize media retrieval.
6. Scheduled posts are absent from recipient list/detail/media/view APIs until publication; author may see their own scheduled card.
7. Deleting a Polo post deletes Polo metadata only unless a future separately-confirmed operation explicitly says otherwise.

## Error behavior requirements

Current routes use `400` for invalid input, `401` for missing/invalid sessions, `403` for authorization/registration-secret failures, `404` for missing or recipient-hidden resources, `409` for invalid state/collisions, and `503` when registration is disabled or readiness fails.

Future Immich routes must normalize missing media, upstream unavailability, and processing-not-ready states. Do not freeze exact Immich-derived status mapping until issues #11–#13 provide real-server evidence.
