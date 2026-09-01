# API contract

See also: [`Product plan`](PRODUCT_PLAN.md) · [`Architecture`](ARCHITECTURE.md) · [`Development`](DEVELOPMENT.md) · [`Roadmap`](ROADMAP.md)

This file distinguishes routes that exist **now** from planned routes so clients and agents do not code against documentation fiction.

## Implemented now

### `GET /health`

Liveness only. Returns `200` while the Fastify process is serving requests.

```json
{ "ok": true, "service": "immich-polo-api" }
```

### `GET /ready`

Checks SQLite connectivity. Returns `200` with `{ "ok": true, "database": "ready" }` or `503` when the database probe fails.

These endpoints intentionally do not claim that a user's Immich connection is healthy.

## Planned application surface

The approximate V1 surface remains:

```text
POST   /auth/...
GET    /threads
POST   /threads
GET    /threads/:threadId/posts
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

Route names may evolve while issues #1–#6 are implemented. The authorization invariants may not.

## Mandatory authorization invariants

1. Authentication establishes a Polo `user_id`; clients never select an arbitrary acting user ID.
2. Thread reads/writes require current membership.
3. Author-only Immich browsing/upload operations require ownership of the selected `ImmichConnection`.
4. Recipient media reads start from an authorized **Polo post + PostAsset** and resolve the exact connection/asset server-side.
5. A caller-supplied or guessed `immich_asset_id` alone can never authorize media retrieval.
6. Scheduled posts are absent from recipient list/detail/media APIs until publication.
7. Deleting a Polo post deletes Polo metadata only unless a future separately-confirmed operation explicitly says otherwise.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full reasoning and issue #3/#6 for required negative tests.

## Error behavior requirements

Future routes should distinguish at least:

- unauthenticated (`401`),
- authenticated but unauthorized (`403` or intentionally non-enumerating `404`, documented per route),
- missing Polo resource (`404`),
- Immich asset missing (`410`/domain missing-media response as finalized),
- Immich temporarily unavailable (`502`/`503`),
- media processing not ready (`409`/`425`/`503` as proven by issue #1 and normalized by the adapter),
- invalid scheduling/input (`400`/`422`).

Do not freeze exact Immich-derived status mapping until real-server contract evidence exists.
