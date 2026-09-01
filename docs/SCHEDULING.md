# Scheduling and watch-state contract

See also: [`Product plan`](PRODUCT_PLAN.md) · [`Architecture`](ARCHITECTURE.md) · [`API contract`](API_CONTRACT.md) · [`Roadmap`](ROADMAP.md) · [`Development`](DEVELOPMENT.md)

## Durable publication

Scheduling is represented entirely in SQLite. A media upload is completed before a real post reaches this stage; delaying publication never means delaying the media upload.

A post is recipient-visible only when `status = published`. `visible_at` is the requested absolute UTC instant; `published_at` records when a server worker actually made it visible.

The production API process runs a small periodic worker. Each pass:

1. finds `scheduled` rows whose `visible_at` is due according to server time;
2. atomically changes each still-scheduled row to `published` and sets `published_at`;
3. inserts one `notification_outbox` row with stable key `post-published:<postId>` in the same transaction.

Both the guarded update and unique outbox key are intentional. Re-running the pass after a restart or from a competing worker must not republish the post or enqueue another logical notification.

The outbox is durable groundwork for issue #9. Current code **does not yet send push notifications**; `delivered_at`, `attempts`, and `last_error` exist so a later sender can retry independently of publication.

## Sender controls

`PATCH /posts/:postId/schedule` may reschedule only an author's still-`scheduled` post, and the new `visibleAt` must be a future absolute timestamp.

`DELETE /posts/:postId` deletes Polo metadata only. Cascades remove Polo view/outbox/attachment-reference metadata; there is deliberately no Immich delete call in this operation.

## Watch state

`PUT /posts/:postId/view` requires current thread membership and a published post. Scheduled posts remain undiscoverable to recipients through this route.

For V1's one-media-per-post UI:

- images are marked watched/seen on the first explicit view update;
- videos store `playback_position_ms`;
- the server uses cached authoritative-at-post-time duration metadata and the shared domain rule: watched at 90% playback or with at most 3 seconds remaining;
- `first_seen_at` never moves forward after the first view;
- `watched_at` is sticky once achieved.

Scrolling past a video does not call this endpoint by itself and therefore does not mark it watched.

## Required runtime verification

Unit/API tests cover ordinary and repeated publication plus watch transitions. Local issue #17 is the runtime gate for file-backed SQLite, process restart, two competing publication passes, cancellation/reschedule timing, and recipient invisibility before due time.
