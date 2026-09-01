# API contract

See also: [`Product plan`](PRODUCT_PLAN.md) · [`Architecture`](ARCHITECTURE.md) · [`Development`](DEVELOPMENT.md) · [`Roadmap`](ROADMAP.md)

This file distinguishes routes that exist **now** from planned routes so clients and agents do not code against documentation fiction.

## Authentication model implemented now

Polo has its own accounts. Usernames are normalized to lowercase; passwords are hashed with Node's `scrypt`; successful registration/login returns a random bearer token. Only a SHA-256 hash of that session token is stored in SQLite. Sessions expire after `SESSION_TTL_DAYS` (30 by default).

Self-hosted account creation is intentionally simple for V1: `POST /auth/register` requires the server-held `POLO_REGISTRATION_SECRET`. This avoids introducing email infrastructure. Use HTTPS for any non-local deployment. The registration secret and returned session token are credentials and must never be logged or committed.

### `POST /auth/register`

Body: `registrationSecret`, `username`, `displayName`, `password` (minimum 10 characters). Returns `201` with `{ token, expiresAt, user }`.

### `POST /auth/login`

Body: `username`, `password`. Returns `{ token, expiresAt, user }` or `401`.

### `GET /auth/me`

Requires `Authorization: Bearer <token>`. Returns the current public user.

### `POST /auth/logout`

Requires bearer auth. Deletes the current session and returns `204`.

### `GET /users`

Requires bearer auth. Returns public IDs/display names/usernames for the small self-hosted Polo user set so a client can choose conversation members. No password/session/Immich credential material is returned.

## Core/thread routes implemented now

### `GET /health`

Liveness only. Returns `200` while Fastify is serving requests.

### `GET /ready`

Checks SQLite connectivity and migration state. Returns `200` or `503`.

### `GET /threads`

Bearer auth required. Lists only threads containing the current user, with members.

### `POST /threads`

Bearer auth required. Body: optional `title`, `memberUserIds`. The current user is always included. Unknown user IDs fail the request.

### `GET /threads/:threadId/posts`

Bearer auth + current thread membership required. Non-members receive `403`. Published posts are visible to members; a user may additionally see their own scheduled posts. Raw Immich asset IDs/connection credentials are not returned by this route.

## Planned media/application surface

Still pending the verified Immich boundary and later milestones:

```text
POST   /threads/:threadId/posts/from-immich
POST   /threads/:threadId/posts/upload
PATCH  /posts/:postId/schedule
DELETE /posts/:postId
PUT    /posts/:postId/view
POST   /immich-connections
GET    /immich-connections/:id/status
GET    /immich-connections/:id/assets
GET    /posts/:postId/assets/:postAssetId/thumbnail
GET    /posts/:postId/assets/:postAssetId/media
```

## Mandatory authorization invariants

1. Authentication establishes the acting Polo `user_id`; clients never select an arbitrary acting user ID.
2. Thread reads/writes require current membership.
3. Author-only Immich browsing/upload operations require ownership of the selected `ImmichConnection`.
4. Recipient media reads start from an authorized **Polo post + PostAsset** and resolve the exact connection/asset server-side.
5. A caller-supplied or guessed `immich_asset_id` alone can never authorize media retrieval.
6. Scheduled posts are absent from recipient list/detail/media APIs until publication; the author may see their own scheduled card.
7. Deleting a Polo post deletes Polo metadata only unless a future separately-confirmed operation explicitly says otherwise.

## Error behavior requirements

Current routes use `400` for invalid input, `401` for missing/invalid sessions, `403` for authorization/registration-secret failures, `409` for username collisions, and `503` when registration is disabled or readiness fails.

Future Immich routes must additionally normalize missing media, upstream unavailability, and processing-not-ready states. Do not freeze exact Immich-derived status mapping until issues #11–#13 provide real-server evidence.
