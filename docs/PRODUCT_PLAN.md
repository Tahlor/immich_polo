# Product plan

## Problem

Immich is excellent at owning and organizing a private photo/video library, but it is not an asynchronous video conversation product. Marco Polo is good at conversational video, but it creates a separate media silo and is centered on newly recorded messages.

Immich Polo combines those strengths:

- keep all media canonical in Immich;
- make any old or new photo/video conversational;
- provide a simple continuous back-and-forth thread;
- allow future publication without relying on the sender's device later.

## Product principles

1. **Immich is the source of truth for media bytes.** Polo stores references and conversation metadata, not duplicate originals.
2. **Posting old media should feel first-class.** A 10-year-old Immich video should be just as easy to post as a video recorded 10 seconds ago.
3. **Conversation time and capture time are different.** Thread ordering uses Polo publication time; Immich retains the original capture timestamp.
4. **Scheduling is server-owned.** Media uploads now; publication happens later based on server time.
5. **Recipients need not understand Immich.** Polo authorization determines which referenced assets a recipient may view.
6. **The thread is the product.** Avoid turning Polo into another general gallery/browser.
7. **Self-hosting should stay boring.** Prefer one API process, one small database, and the existing Immich deployment over extra infrastructure.

## Primary V1 flows

### A. Post existing Immich media

1. Open a thread.
2. Tap Gallery.
3. Browse/search recent Immich media (initial implementation may start with recent/filter views before full semantic search).
4. Select one photo or video.
5. Optionally add a caption.
6. Post now or schedule.
7. Polo stores the existing `immich_asset_id`; no media copy is created.

### B. Post local media

1. Open a thread.
2. Record media or select a local device item.
3. Polo uploads the file to Immich immediately.
4. Immich returns the canonical asset ID (including duplicate handling where applicable).
5. Polo creates the post using that asset ID.
6. The media now also exists normally in the sender's Immich library.

If the Immich upload fails, the Polo post must not become published. A recoverable local pending state may be retained for retry.

### C. Schedule a post

1. Prepare a post using either flow above.
2. Choose a future local date/time.
3. Client sends an absolute timestamp plus timezone/display context.
4. Server stores `visible_at` and keeps the post in `scheduled` state.
5. Sender can see/edit/cancel it; recipients cannot discover it through thread APIs or notifications.
6. Once due, the server atomically publishes it and emits notifications.

The sender's phone can be offline at publication time.

### D. Consume a thread

1. Opening a conversation shows a chronological stream of visible posts.
2. Unwatched posts are clearly indicated.
3. Starting at the first unread video should make it easy to continue through subsequent unread posts.
4. Watch state is stored per user/post, not inferred from thread scroll position.
5. Photos participate in the same stream and can be marked seen.

## V1 domain model

### User

- `id`
- `display_name`
- authentication fields
- notification preferences

### ImmichConnection

A server-side encrypted connection belonging to one Polo user.

- `id`
- `user_id`
- `base_url`
- encrypted API credential/token material
- `immich_user_id` if known
- connection health / last verified time

Do not store broad Immich credentials in the mobile/web client longer than needed for setup.

### Thread

- `id`
- `title` (optional for 1:1)
- `created_at`

### ThreadMember

- `thread_id`
- `user_id`
- `joined_at`
- `last_read_at` or equivalent cursor

Schema should not prevent groups later, even if V1 UI primarily targets 1:1 threads.

### Post

- `id`
- `thread_id`
- `author_id`
- `created_at`
- `visible_at`
- `published_at` nullable
- `status`: `scheduled | published | cancelled | failed`
- `caption` nullable
- `reply_to_post_id` nullable (schema-ready; UI optional in V1)

### PostAsset

Keep assets separate from Post so multi-asset posts can be supported without a migration, even if V1 UI begins with one asset per post.

- `id`
- `post_id`
- `position`
- `immich_connection_id`
- `immich_asset_id`
- cached non-authoritative metadata useful to the UI: media type, dimensions, duration, capture timestamp

The canonical bytes and canonical media metadata remain in Immich.

### PostView

- `post_id`
- `user_id`
- `first_seen_at`
- `watched_at` nullable
- `playback_position_ms` nullable

### PushRegistration

- `user_id`
- device/provider token
- platform
- updated/invalidated timestamps

## V1 UX

### Conversation list

Each row should emphasize:

- person/thread name;
- latest visible media thumbnail;
- latest author/time;
- unread count/state.

### Conversation screen

A vertically ordered stream of photo/video cards. Keep layout stable when entering composition or planning. The primary composer actions are:

- **Record**
- **Gallery**

The Gallery picker should make the distinction between Immich-backed and device-local media understandable without making the user manage synchronization manually.

### Scheduling UI

A scheduling affordance belongs next to Send/Post, not in a separate workflow. Scheduled entries remain visible to the sender in the thread with a clear clock/status treatment, but they are absent for other members until due.

## Required behavior / acceptance criteria

V1 is successful when two accounts can complete this end-to-end scenario on a real Immich deployment:

1. User A connects an Immich account.
2. A and B share a thread.
3. A selects an existing Immich video from years ago and posts it.
4. B can view it without obtaining A's Immich credential or broad access to A's library.
5. B records/selects a new local video and posts it.
6. The file is uploaded to B's configured Immich account and the Polo post references that resulting asset.
7. A watches B's video and the watch state persists across devices/reloads.
8. A schedules an existing photo/video for the future.
9. B cannot access or infer the scheduled post before `visible_at`.
10. At/after `visible_at`, the post appears exactly once and B receives at most one publication notification.
11. Restarting the Polo server before a scheduled time does not lose or duplicate publication.
12. Deleting Polo metadata never deletes the corresponding Immich asset by default.

## Important edge cases

- Immich reports a local upload as a duplicate.
- Asset exists at post creation but is later deleted in Immich.
- Immich is temporarily unavailable while browsing or streaming.
- Sender revokes/replaces an Immich API key.
- Large video upload is interrupted.
- Client clock is wrong.
- Scheduled publication worker restarts or runs twice.
- Recipient is removed from a thread before a scheduled post publishes.
- Video playback uses HTTP range requests and seeking.
- Thumbnail/preview is ready before video transcoding finishes.
- Multiple timezones / DST changes: `visible_at` is stored as an absolute instant; timezone is display/input context only.

## Deferred after V1

- Group-thread UI polish.
- Reactions and threaded replies.
- Voice-only posts.
- Rich captions/transcription.
- Full Immich semantic search in the picker.
- Offline queue with robust background/resumable uploads.
- Expiring posts.
- Admin moderation/audit UI.
- End-to-end encryption beyond the security characteristics of the user's Immich deployment.
- Import/migration from Marco Polo.

## Milestones

### Milestone 0 — integration spike

Prove against a real supported Immich version that Polo can authenticate server-side, list/select assets, fetch thumbnails, stream video with seeking, and upload a local video to receive a reusable asset ID.

### Milestone 1 — vertical slice

One hard-coded/dev pair of users, one thread, existing-Immich post, local upload, chronological playback.

### Milestone 2 — real accounts and authorization

Polo authentication, encrypted per-user Immich connections, thread membership authorization, media proxying, missing/revoked credential handling.

### Milestone 3 — scheduling and watch state

Durable `visible_at`, scheduler, idempotent publication/notifications, sender-only scheduled UI, watched/unwatched state.

### Milestone 4 — mobile-quality V1

Recording/device picker, push notifications, upload progress/retry, polished unread playback flow, Dockerized deployment, end-to-end tests on a real Immich test instance.

## Definition of done for V1

- The acceptance scenario above passes on Android and the supported web/PWA surface; iOS should work through the Expo implementation unless a documented platform limitation remains.
- No original media bytes are stored permanently by Polo.
- Authorization tests prove a thread member cannot use Polo to browse unrelated Immich assets.
- Scheduled publication is durable and idempotent.
- Video streaming supports seek/range behavior without buffering the entire file through application memory.
- Setup and upgrade instructions are documented.
