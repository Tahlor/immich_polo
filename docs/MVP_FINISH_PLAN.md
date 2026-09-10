# Household MVP audit and finish plan

Audit date: **2026-09-08**. Source baseline: local and remote `master`
**`a83e4919ce97da6cc7ba1f6ae7ff30e848027d7e`**.

## Bottom line

**Keep the architecture; finish the experience.** The repository has substantial
backend groundwork and a functional client skeleton, but it is not yet an
acceptance-complete conversation product. There is no reason in this audit to add
services, replace SQLite, or rewrite the stack for roughly twelve users.

The next release should let a non-developer **join, send deliberately, notice a
reply, watch it, and continue later** without a developer narrating the steps.
Unread state, upload feedback, recovery, and notifications are MVP work, not
optional polish. Cosmetic refinement alone will not close these gaps.

## Evidence and limits

- Read the product/architecture/runtime docs, application/provider/test code,
  all 21 GitHub issues, and all three existing issue comments. At audit time all
  issues were open; the runtime tickets had no posted results. That means
  **acceptance is unproven**, not that somebody's deployment necessarily failed.
- GitHub reports [CI success for the baseline SHA](https://github.com/Tahlor/immich_polo/actions/runs/33574500845),
  completed 2026-09-02T00:16:17Z. This is observed remote evidence, not a new local run.
- Root tests cover domain, provider and API code; the client is typechecked and
  web-exported but has no client behavior test suite. Green CI does not prove
  preview/send, navigation, resume, or recovery UX.
- Local environment: WSL2 Linux `6.6.87.2-microsoft-standard-WSL2`, Windows
  Node `v25.8.0`, npm `11.11.0`; no Linux `node` on PATH and dependencies not
  installed. `npm run check` was attempted during the 2026-09-08 audit. The first
  failed transition was `build:packages` -> domain `tsc -p tsconfig.json`:
  **`'tsc' is not recognized`**. No local tests/build completed. Local check state:
  **BLOCKED** on installing dependencies in the documented Node 22.14 environment;
  this is not evidence of a source regression. No application or database was started.
- UI findings below are **source-inspection findings**, not observed physical-device
  behavior. No APK, real Immich request, production restart, push delivery, visual
  accessibility assessment, or backup restoration was exercised. Product runtime
  acceptance state: **INCOMPLETE_EVIDENCE**.
- Existing comments on #1–#3 and parts of #14/#15 describe older implementation
  states. Reuse those tickets, but test the current screens/routes; do not rebuild
  already-present auth/provider code or look for the obsolete `Connected` shell.

## Release boundary: household MVP, then broader V1

Planning assumption: the initial users can use Android. If even one required
participant needs browser/iOS access, that platform becomes a delivery requirement,
not something to discover after finishing Android.

| Household MVP — finish now | Later broader V1 / follow-up |
| --- | --- |
| One Archimedes installation, local SQLite, existing Immich | Generic Docker distribution and arbitrary hosting combinations (#10) |
| One tested standalone Android APK and an upgrade path | Browser media parity, PWA install/offline work, dedicated iOS release validation |
| Direct conversations, one photo/video per post, captions | Group management UI, multi-asset posts, replies/reactions, text/voice-only messaging |
| Existing-library picker with practical access to old media | Semantic search, album management, a second gallery product |
| Foreground upload with feedback and deliberate retry | Resumable/background uploads and offline media synchronization |
| Unread/watch/resume, a simple next-unwatched action, push | Elaborate autoplay rules, presence, typing indicators, real-time infrastructure |
| Schedule, reschedule, cancel; ordinary post deletion | Complex scheduling/calendar features |
| Invites, assisted Immich setup, basic account/key recovery | SSO, role-management console, automated account provisioning |
| HTTPS, authorization, protected secrets, one restore drill | HA, Redis, queues as services, object storage, an observability platform |

This is an **intermediate household release**, not a claim that the existing
[broader V1 obligations](PRODUCT_PLAN.md) for web and fresh generic deployments
have been fulfilled. Keep the shared client building; do not advertise unverified
platform support. Immich continues to own all canonical media bytes.

## Findings, ranked by user impact

**P0:** first usable two-phone loop / correctness. **P1:** before inviting the
household. Source locations refer to the audited SHA; implementation has not been
changed by this plan.

| Priority / finding | What is present, and what is missing | Smallest useful finish / ownership |
| --- | --- | --- |
| P0 — real media loop is unproven | Opt-in provider, streaming routes and APK profile exist; no target-runtime evidence is posted. | Run #11–#13, #18, #20/#14 and #19. Fix only observed provider mismatches; do not widen keys or guess endpoints. |
| P0 — choosing is also sending | The library card calls `postExisting`; phone/camera selection calls upload immediately. No Polo review/Send step. [Client:237–309, 401–416](../apps/client/app/index.tsx) | Shared draft -> preview -> caption -> Send / Schedule for all three sources. Permit change/remove/cancel before sending. #4/#5/#8 |
| P0 — local captions are discarded | Upload API accepts captions, but `uploadPickedAsset` omits `caption` and then clears it. The same function parses EXIF with `new Date(...).toISOString()` without checking validity. [Client:260–286](../apps/client/app/index.tsx), [API helper:189–211](../apps/client/lib/api.ts) | Pass captions for phone/camera; safely parse supported capture dates and allow upload when optional metadata is invalid. Add regression cases. #5 |
| P0 — outage becomes logout | Startup catches failure from identity **or home data**, clears SecureStore, and returns to login. Manual refresh handlers have no error handling. [Client:102–138, 354, 470](../apps/client/app/index.tsx) | Clear credentials only for actual session invalidation; keep a retryable unavailable state on network/5xx errors. Handle refresh/picker failures without crashing or discarding work. #14/#8 |
| P0 — cross-conversation stale state | `openThread` switches the header before replacing posts; responses are not scoped to the active thread. Draft caption/schedule are shared across threads. [Client:85–94, 113–115, 175–187](../apps/client/app/index.tsx) | Scope requests/drafts by thread; clear or retain deliberately; ignore stale responses. Back navigation and slow requests must never show A's content beneath B's header. #8 |
| P0 — resume/unread is only half implemented | Server writes PostView, but list responses omit it, client types omit it, and the video player never restores a position. Images mark seen on mount, before successful loading/visibility. [Thread routes:99–138](../apps/api/src/threads/routes.ts), [video](../apps/client/components/AuthorizedVideo.tsx), [image](../apps/client/components/AuthorizedImage.tsx) | Return current-user state, resume after player readiness, save on pause/leave, mark images seen only after loaded and visible. Exclude own/scheduled posts from recipient unread. #8 |
| P0 — timeline does not use publication order | Posts sort by `created_at`; threads sort by thread creation. A scheduled post released today can appear back among yesterday's messages. [Thread routes:30–46, 99–108](../apps/api/src/threads/routes.ts) | Published timeline ordered by publication with stable tie-breaker; latest **visible** activity drives inbox order. Keep author's pending schedule separate/clearly labeled. Test delayed publication. #7/#8 |
| P1 — inbox does not tell you what happened | Conversation rows show names/member counts only. No preview, unread count, automatic refresh, first-unwatched entry point, or next-media action. [Client:347–429, 469–476](../apps/client/app/index.tsx) | Conversation-first home; preview/time/unread; refresh on focus/resume plus modest foreground polling; first-unwatched and Next. No WebSocket service required. #8 |
| P1 — all media mounts in one long page | A `ScrollView` maps every post to an image/player; composer comes after the entire history. [Client:351–399](../apps/client/app/index.tsx) | Virtualized history, bounded history fetch, thumbnail-first cards, one active player, pinned composer, correct Android Back/keyboard behavior. Twelve users can still accumulate many videos. #8 |
| P1 — send has no trustworthy progress/recovery | One generic `busy` flag disables actions; no transfer feedback, retained selected-media draft, or per-send reconciliation. Post creation always assigns a new UUID. [Client:237–309](../apps/client/app/index.tsx), [creation:29–78](../apps/api/src/posts/create-media-post.ts) | Visible Uploading / Preparing / Sent / Failed states; real byte progress where available; keep draft on failure. A retry of the same send must not create a second post. Immich file dedupe is not Polo send idempotency. #5/#13 |
| P1 — missing/processing media has no useful card | Most provider errors become the same 502; media components lack error/loading/retry UI. `!asset` fallback does not handle a deleted Immich original with a surviving PostAsset. [errors](../apps/api/src/immich/errors.ts), [media components](../apps/client/components/) | Normalize states from #12/#13 evidence; show Preparing / Temporarily unavailable / Removed with appropriate retry. Keep caption/history intact. #6/#8 |
| P1 — scheduling/deletion cannot be managed in app | Delay-in-minutes creation exists; reschedule/delete APIs exist, but have no client helpers/controls. [client API](../apps/client/lib/api.ts), [post routes:25–63](../apps/api/src/posts/routes.ts) | Absolute local date/time preview with timezone; author menu for reschedule/cancel/delete, confirmation that Immich original remains. No server rewrite. #7/#8 |
| P1 — old media is technically reachable, not convenient | Picker loads 40 recent assets and Load more; type filter exists in API but not UI; no date navigation. [Client:221–229, 401–416](../apps/client/app/index.tsx), [asset query](../packages/immich-client/src/types.ts) | Surface photo/video filter and dates; add a practical year/date jump after the provider contract proves a bounded date query. No endless paging through a large library; no semantic search project. #4/#12 |
| P1 — joining and reconnecting need an operator | Signup asks for a household secret without field requirements. Connection setup asks for URL/key; “Connected” is stored metadata, not live health. No credential replacement/status route. [auth UI:316–341](../apps/client/app/index.tsx), [connections](../apps/api/src/immich/routes.ts) | Invite code/link, helpful validation, viewing without connecting, guided setup when first sending. Owner-only key replacement preserving connection ID so old posts recover. A documented admin-assisted password reset/session revoke path is enough initially. #21/#4/#3 |
| P1 — nobody is notified | Outbox/schema exist; transport, device registration, preferences and notification navigation do not. [outbox](../apps/api/src/scheduling/outbox.ts), [client routes](../apps/client/app/) | Finish #9: one transport, enable/disable, dead-token handling, retry state per target, cold/warm deep-link into authorized thread/post. A URL scheme alone is not deep linking. |

### Small-instance safety still matters

Do not turn this into a separate hardening program, but do not waive these because
there are only twelve users:

- Keep the tested media authorization chain, exact connection/asset lookup,
  least-privilege keys, encrypted credentials, hashed sessions, and HTTPS.
- `PATCH schedule` and `DELETE post` currently check authorship but not current
  membership, unlike media/view routes. Post mutation/view errors also distinguish
  unknown IDs from some unauthorized scheduled IDs. Close these gaps and add
  negative tests for removed members and prepublication existence probing (#3/#7/#16).
- Configure the existing Immich-origin allowlist on Archimedes. Add simple auth
  throttling appropriate to a public login endpoint, not a new identity platform.
- Verify sanitized application/proxy logs and authorized media cache behavior.
  Do not put new invite/session credentials in URLs that get logged. Upload
  captions currently travel in query strings: check request logging before
  treating that as private (#5/#16/#18).
- Maintain local SQLite and a recoverable backup of metadata **and the credential
  encryption key**, protected separately. Verify restore and APK update once.
  A checked-in dependency lockfile now makes resolution reproducible; #15/#20
  still own fresh-clone install, migration, and upgrade evidence. No packaging
  redesign is necessary.

## Execution plan

Use existing issues as owners. These are delivery slices, not a new service or a
new issue for each checkbox. Keep #19 as the controlling technical acceptance gate;
it is necessary but not sufficient for a pleasant household release.

### 1. Prove the backbone; fix obvious client correctness in parallel

**Owners:** #11–#20 runtime work; #4/#5/#8 client fixes.

- Record one coherent baseline deployment/APK/Immich version. Execute existing
  contract and two-phone cases; report the first failed transition.
- Meanwhile fix session recovery, stale-thread/draft isolation, caption/date
  handling, and explicit Send. These do not depend on new Immich endpoint guesses.
- Do not spend this phase on generic Docker, a new architecture, or visual branding.

**Exit:** both phones deliberately exchange old and new media; canonical ownership
and range seeking are proven. Scheduling/privacy/restart evidence remains explicit
in #17/#19. A pending #9 may be called out for this gate, not hidden as MVP completion.

### 2. Make the conversation the home of the app

**Owner:** #8, with #7 chronology and #3 minimal API additions.

- Separate inbox, conversation, compose/preview, and settings as screens as needed.
  Move Immich URL/version/security explanations out of daily conversation UI.
- Add last-visible-post summaries and current-user view state using ordinary
  SQLite queries. Fix publication ordering and reuse an existing direct thread
  when tapping the same person rather than repeatedly creating empty conversations.
- Use a virtualized timeline, visible unread markers, resume/Next, one active
  player, foreground refresh, and a pinned composer. Preserve scroll position when
  new posts arrive; offer a New posts affordance when reading earlier history.

**Exit:** exchange several mixed photos/videos, leave mid-video, reopen at the
correct position, find all unwatched posts, and finish them without guessing or
manual refresh. Switching threads during a slow request never mixes content.

### 3. Finish sending, old-media selection, and sender controls

**Owners:** #4/#5/#6/#7/#8; provider refinements depend on #12/#13.

- Complete the shared preview flow, media/date filters, and practical old-media access.
- Retain a draft and its destination while uploading; show actual state/progress,
  clear foreground-only guidance, actionable failures, and an explicit retry.
- Use a small SQLite-backed per-send request identity/reconciliation path. Reuse
  it on retry; a deliberate new share of the same asset is a distinct post. Test
  the lost-response case as well as an upstream failure; do not confuse outbox
  publication idempotency with send retry or push delivery idempotency.
- Add scheduled date/time review, reschedule/cancel, normal post delete and the
  missing/processing/revoked-key recovery states.

**Exit:** a failed send retains the selection/caption; retry yields one logical
post. Scheduled cards can be managed in-app, publish in the right place, and stay
absent to recipients beforehand. Deleted originals leave understandable history.

### 4. Make joining and returning work without developer coaching

**Owners:** #21, #9, #4/#3 for account/connection recovery.

- Invite -> register -> conversation. Connecting an Immich library is optional for
  receiving, required and explained when sending. Preconfigure this installation's
  server address; do not expose advanced setup on the primary screen.
- Deliver push only after publication, excluding the sender and ineligible members.
  Persist per-device outcomes so retrying one failed target does not resend all
  successful targets. Do not promise transport-level exactly-once delivery that
  has not been demonstrated.
- Open the right thread/post from a notification with the app foregrounded,
  backgrounded, or closed; handle expired sessions/deleted posts safely.
- Show password/username rules, camera-denied recovery, notification preference,
  reconnect status and useful error copy. Permit admin-assisted account recovery.

**Exit:** a fresh tester can join and receive before linking Immich; then send with
one guided setup. A reply brings them back to the right place. Expired invites,
revoked keys, denied permissions and session expiry are recoverable.

### 5. Small-group release check, not an enterprise launch

**Owners:** #14/#16/#17/#18/#19/#20; #10 tracks broader follow-up separately.

- Run the household script below on the exact candidate APK/server SHA; use a
  third account for negative authorization. Reuse evidence across tickets rather
  than inventing duplicate test programs.
- Check small-screen/large-text layout, Android Back, keyboard overlap, touch
  targets, labels, contrast, loading/empty/error states, portrait/fullscreen media,
  and a conversation with enough videos to expose all-player mounting problems.
- Verify one server restart, one backup restoration and one in-place APK upgrade.
  Document installation, reconnect/recovery, foreground-upload limitation and
  the single supported Immich version/build.
- Start with 2–3 people for a few days, fix observed friction, then invite the rest.
  This is a proposed rollout, not evidence already collected.

**Exit:** no P0/P1 household blockers remain; the following script passes without
operator intervention except the explicitly documented one-time Immich setup and
admin recovery. CI is green for the release SHA and runtime evidence names that SHA.

## Household acceptance script

1. Install the APK from the documented handoff; join by invite without knowing a
   registration secret, API hostname, or another person's Immich key.
2. Open the inviter's conversation and consume a received photo/video without
   connecting a personal Immich account.
3. Link Immich when first sending. Find a years-old video without saving it to the
   phone or paging through the entire recent library; preview it, add a caption,
   and explicitly Send. No extra Immich original is created.
4. Reply with a camera recording and a phone-library item. Both retain captions;
   the upload's canonical asset is present in the sender's Immich library.
5. Interrupt connectivity during a send, including the ambiguous lost-response
   case. Show the true failure/unknown state, retain the draft, reconcile/retry,
   and verify one logical Polo post and no permanent Polo original.
6. Recipient sees new activity while using the app and gets a usable notification
   when away. Seek repeatedly, pause midway, reopen, resume and continue to the
   next unwatched item. Unloaded/offscreen photos are not silently marked seen.
7. Schedule, reschedule and cancel from the UI. A surviving scheduled post stays
   undiscoverable before due, publishes once after a server restart, appears at
   its publication position, and follows the same notification path as Send now.
8. Switch conversations while a slow fetch/upload completes. Check destination,
   header, media, caption, draft and unread counts remain associated correctly.
9. Delete a disposable original in Immich: keep the thread usable. Delete a Polo
   post: verify its Immich original remains. Revoke/replace a test key and recover
   existing referenced posts without recreating them.
10. Exercise offline startup, server recovery, expired session, denied camera and
    notification permissions, app kill/reopen and APK upgrade. Never silently
    discard a valid login because the network is unavailable.
11. Third account and removed members cannot retrieve unrelated media or discover
    scheduled content through reads, mutations, summaries, unread or notifications.
12. Restore Polo metadata with the required encryption key from protected backup;
    confirm the documented deployment can recover without copying original media.

## First implementation commits

1. **Client recovery and isolation:** preserve valid sessions on transient failure,
   handle manual refresh errors, scope async responses/drafts to thread, and add
   focused client regression tests (#8/#14).
2. **Deliberate composition:** shared selected-media draft/preview with explicit
   Send, caption forwarding for local media, safe capture-date handling (#4/#5).
3. **Read the state already being written:** return current-user PostView and
   visible activity, fix publication ordering, wire resume/unread with regression
   tests for scheduled visibility and image visibility (#7/#8).

Introduce only the components/tests needed by each slice. Do not precede these
commits with a full state-management rewrite, generic design-system package, or
backend “scalability” project. Exact provider fixes remain owned by real evidence.
