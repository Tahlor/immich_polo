# Product plan

See also: [`Two-phone milestone`](M1_TWO_PHONE_VERTICAL_SLICE.md) · [`Architecture`](ARCHITECTURE.md) · [`Client`](CLIENT.md) · [`Android`](ANDROID.md) · [`Archimedes deployment`](DEPLOYMENT_ARCHIMEDES.md)

## Product

Immich Polo is a Marco-Polo-style asynchronous private conversation app whose canonical media lives in Immich.

> **Immich owns canonical media bytes. Polo owns conversation metadata, authorization, publication timing, watch state, and notifications.**

An existing Immich asset is referenced without copying it. A new device-local recording/file is uploaded through Polo into the sender's Immich library; after Immich returns the canonical asset identity, the Polo post references that identity.

Capture time and publication time are independent. A years-old Immich video can be posted today, and a post can be scheduled for future publication after its media has already been uploaded to Immich.

## Current controlling milestone

The immediate target is [`M1_TWO_PHONE_VERTICAL_SLICE.md`](M1_TWO_PHONE_VERTICAL_SLICE.md): **two independently installed Android APKs exchange a real older Immich asset and a newly recorded/uploaded asset through Polo on Archimedes, then prove scheduled publication across a server restart.**

This takes priority over generalized self-host packaging polish.

## Product principles

1. **Immich is the media source of truth.** Polo does not maintain a permanent second original store.
2. **Old media is first-class.** Posting a 10-year-old Immich video should be as natural as recording one now.
3. **Thread time differs from capture time.** Polo orders by publication; Immich retains canonical capture metadata.
4. **Scheduling is server-owned.** Upload now, publish later from server time; sender phone may be offline.
5. **Recipients need not understand Immich.** Polo authorization grants access only to media referenced by visible posts.
6. **The conversation is the product.** Do not turn Polo into another general gallery.
7. **Android is primary.** The standalone Android app is the design target; web/PWA is a secondary shared-client surface.
8. **No Universal SSO requirement.** Polo owns account/session auth for native API use.
9. **Self-hosting stays boring.** One small API, SQLite, a worker, and the existing Immich deployment unless measured need proves otherwise.

## V1 client surfaces

- **Android:** required, primary, installable standalone APK; Expo Go does not count as product acceptance.
- **Web/PWA:** required secondary surface from the shared Expo implementation, with documented limitations where browser media authorization differs.
- **iOS:** should work through shared Expo code unless a specific documented limitation remains.

## Primary V1 flows

### Post existing Immich media

1. Open a conversation.
2. Tap **Immich**.
3. Browse recent image/video assets through Polo-authorized thumbnails.
4. Select one asset.
5. Add optional caption.
6. Send now or schedule.
7. Polo re-validates the selected asset server-side and stores only the exact Immich connection/asset reference.

### Post local media

1. Open a conversation.
2. Tap **Phone** or **Record**.
3. Select or record an image/video.
4. Client streams multipart media to Polo.
5. Polo streams those bytes into the sender's Immich account rather than retaining a complete duplicate.
6. Immich returns a canonical asset ID, including duplicate handling where applicable.
7. Polo re-fetches canonical metadata and creates the post referencing that asset.

If the Immich upload fails, a published Polo post must not be created.

### Schedule

1. Prepare either an existing-asset or local-upload post.
2. Choose future publication time.
3. Client sends an absolute instant.
4. Polo stores `visible_at` and `scheduled` status.
5. Author may see/manage it; recipients cannot discover post/media before due.
6. Server atomically publishes after due and writes exactly one notification-outbox event.

### Consume a conversation

1. Thread is a chronological stream of visible photo/video posts.
2. Watch state is per user/post, not inferred from scroll position.
3. Images become seen when rendered.
4. Video playback reports position; server determines completion using the shared completion rule.
5. Seeking must use HTTP byte-range behavior without exposing sender Immich credentials.
6. Unread/sequential playback polish follows the functional media loop.

## Authentication and onboarding

Polo currently has username/password accounts plus random bearer sessions. Native tokens are stored in platform-protected storage; the API stores only token hashes.

The server-held `POLO_REGISTRATION_SECRET` is valid bootstrap plumbing, but ordinary invitees should not need to type it. #21 adds short-lived single-use invite codes/deep links after the core two-phone media loop is proven.

## V1 domain model

### User

Polo identity, display name, authentication/session relationships, notification preferences.

### ImmichConnection

Encrypted server-side connection owned by exactly one Polo user:

- base URL;
- encrypted API key/token material;
- Immich user ID/server version when known;
- verification timestamps/health metadata.

The client does not keep another user's Immich credential and never receives one from a media route.

### Thread / ThreadMember

Private conversation plus membership. Schema remains group-ready even when the first polished UI emphasizes direct threads.

### Post

- thread/author;
- created, visible, published timestamps;
- `scheduled | published | cancelled | failed` state;
- optional caption/reply reference.

### PostAsset

Separate from Post so the schema remains multi-asset-ready. Stores exact Immich connection ID + asset ID and small cached non-authoritative UI metadata (type, dimensions, duration, capture instant).

### PostView

Per-user first seen, watched time, playback position.

### PushRegistration / NotificationOutbox

Device delivery registration plus durable idempotent publication event. Push transport itself is #9.

## Authorization requirements

- Polo authentication establishes acting user; client cannot choose another acting identity.
- Thread operations require membership.
- Existing-library browse and local upload require ownership of the selected Immich connection.
- Recipient media retrieval starts from an authorized Polo Post + PostAsset, never a caller-supplied arbitrary Immich asset ID.
- Scheduled posts/media are absent to recipients until publication.
- Deleting Polo metadata does not delete canonical Immich media by default.
- Missing/deleted Immich media must degrade the post instead of corrupting the thread.

## Primary deployment

For the current real deployment:

- Polo API/client service: **Archimedes**;
- live Polo SQLite: local Archimedes disk;
- Immich server: Archimedes, local origin `http://127.0.0.1:2283`;
- Pi3: existing Immich originals/storage/backup backend only.

Polo should not be deployed on Pi3. Generic Docker/self-host packaging remains a V1 goal after the behavior is proven on Archimedes.

## Required two-user acceptance

1. Two standalone Android installs authenticate independently.
2. User A connects Immich and shares a direct thread with B.
3. A posts a years-old existing Immich video without a copy.
4. B views/seeks it without receiving A's credential or unrelated-library access.
5. B records/selects a new local video and posts it.
6. File lands normally in B's Immich account; Polo references the canonical returned asset.
7. A watches it and watch state survives reopen.
8. A schedules an existing asset for later.
9. B cannot discover post/media before `visible_at`.
10. Polo restarts before due and publishes exactly once afterward.
11. Notification delivery opens the correct conversation/post, or #9 is explicitly the only remaining blocker after earlier steps pass.
12. Deleting an Immich referenced asset creates a missing-media state without thread corruption.
13. Deleting a Polo post does not delete its Immich original by default.

## Important edge cases

- duplicate upload response;
- deleted/revoked asset or connection;
- Immich temporarily unavailable;
- interrupted large upload;
- client clock wrong;
- scheduler race/restart;
- recipient removed before scheduled publication;
- repeated/middle-of-file video ranges;
- thumbnail ready before encoded video playback;
- DST/timezone display while `visible_at` stays an absolute instant.

## Execution milestones

### Gate A — real Immich contract

#11–#13 prove exact Archimedes Immich v3 version, least-privilege permissions, search/pagination, thumbnails, byte-range playback, upload/dedupe, and processing readiness. The official-v3 adapter may follow upstream docs, but target-server evidence is authoritative.

### Gate B — Archimedes runtime

#18 installs Polo on Archimedes with systemd, loopback bind, local SQLite, HTTPS nginx/public origin, and local Immich communication.

### Gate C — standalone Android

#20 produces the actual APK; #14 verifies physical-device behavior. #19 ties two devices, real media, and scheduling into the controlling acceptance scenario.

### Gate D — product completion

#9 push/deep links, #21 humane invite onboarding, unread/playback/upload polish, then generalized self-host packaging #10.

## Deferred after V1

Group UI polish, reactions/threaded replies, voice-only posts, transcription/rich captions, full semantic Immich search, robust resumable/background upload, expiring posts, moderation/audit UI, additional end-to-end encryption, Marco Polo import/migration.

## Definition of done

V1 is done when the real acceptance scenario passes with exact deployment/APK evidence, no permanent original media bytes live in Polo, authorization prevents unrelated-library access, scheduled publication is durable/idempotent, video seeks without whole-file application buffering, and a fresh supported deployment can follow documented setup/backup/upgrade instructions.
