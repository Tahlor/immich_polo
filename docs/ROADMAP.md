# Implementation roadmap

See also: [`Product plan`](PRODUCT_PLAN.md) · [`Architecture`](ARCHITECTURE.md) · [`API contract`](API_CONTRACT.md) · [`Client`](CLIENT.md) · [`Scheduling/watch`](SCHEDULING.md) · [`Local tests`](LOCAL_TESTS.md)

GitHub issues are the executable backlog. This document records dependency/order **and current implementation state** so agents do not treat every open issue as equally ready. An issue remains open until its full acceptance criteria and required runtime gates pass; code existing is not the same as the issue being done.

## Current implementation state

### Implemented in the repository

- TypeScript/npm workspace, Fastify API, SQLite migrations/Drizzle schema, Expo universal client, GitHub Actions checks.
- Polo account registration/login/logout and hashed persistent bearer sessions.
- User discovery, thread creation/listing, membership authorization, safe post metadata listing.
- AES-256-GCM Immich credential-sealing primitive, but no real Immich connection route yet.
- `ImmichMediaProvider` interface that deliberately refuses guessed endpoint behavior.
- Durable scheduled-post publisher with idempotent notification outbox.
- Author reschedule/delete controls and persistent per-user seen/video-position/watch state.
- Native SecureStore session restoration plus register/login/conversation client UI; media controls intentionally gated.

### Hard blockers / evidence gates

- The real Immich v3 adapter must be based on #11–#13 runtime evidence, not documentation guesses.
- Bootstrap/device/auth/scheduler behavior still has explicit local gates #14–#17; see [`LOCAL_TESTS.md`](LOCAL_TESTS.md).
- Push delivery, media composition/playback, and deployment E2E remain incomplete.

## Phase 0 — prove assumptions and establish workspace

### #1 — Immich v3 integration contract

**Status:** provider interface exists; endpoint implementation is intentionally blocked on #11 (version/permissions), #12 (read/range/deletion), and #13 (upload/dedup/readiness).

### #2 — TypeScript monorepo bootstrap

**Status:** implementation is substantially present. Do not close until remote CI is green for current `master` and #14/#15 runtime/bootstrap checks pass or any discovered defects are fixed.

**Exit condition:** workspace is reproducibly runnable and Immich boundary is based on observed behavior rather than guesses.

## Phase 1 — first complete posting slice

### #3 — core schema, accounts, threads, authorization

**Status:** schema, Polo auth/sessions, user discovery, thread membership authorization, credential crypto, and negative API tests are implemented. #16 proves persistent runtime behavior. Immich-connection ownership/routes remain pending the verified provider contract.

### #4 — existing Immich media picker + posting

**Status:** client/thread structure and provider abstraction are ready; blocked on #11/#12 before endpoint-specific implementation.

### #5 — local/recorded media upload to Immich

**Status:** post/schema boundaries are ready; blocked on #11/#13 before upload semantics are encoded.

**Exit condition:** two users exchange posts backed by old Immich media and new local media without Polo storing originals.

## Phase 2 — safe media consumption

### #6 — authorized thumbnails/video streaming

**Status:** authorization model exists, but media routes are blocked on #12. Recipient access must begin from Polo thread/post/PostAsset authorization and preserve real byte-range semantics.

**Exit condition:** recipient smoothly watches referenced media without sender credentials or unrelated-library access.

## Phase 3 — Marco-Polo behavior

### #7 — durable scheduling

**Status:** transactional due-post publication, server-time worker, unique notification outbox, author reschedule/delete APIs are implemented. #17 is the restart/race/invisibility runtime gate. Actual push sending remains #9.

### #8 — continuous thread + watch/unread state

**Status:** server PostView persistence/completion rules and metadata thread UI exist. Actual video playback, first-unread flow, unread counts, and playback-driven updates require #6/media UI; Android behavior is partially covered by #14.

**Exit condition:** app behaves like an asynchronous conversation rather than an album browser.

## Phase 4 — shippable V1

### #9 — push notifications

**Status:** durable publication outbox schema/event generation exists. Push provider, device registration lifecycle, delivery/retry/deep links remain.

### #10 — self-hosted deployment + full end-to-end proof

**Status:** not yet complete. Package only after the posting/streaming vertical slice is real enough to exercise the full acceptance scenario.

## Dependency summary

```text
#11 permissions/version ----+
#12 existing/read/range ----+--> #1 verified Immich adapter --> #4 existing post --> #6 safe streaming --+
#13 upload/dedup -----------+-------------------------------> #5 local upload -----------------------------+
                                                                                                             |
#15 fresh bootstrap --> #2 ----> #3 auth/thread --(#16 runtime)----------------------------------------------+--> #10
                                   |                                                                         |
                                   +--> #7 scheduling --(#17 runtime)--> #9 push ----------------------------+
                                   +-------------------------------> #8 conversation/watch <-- #14 Android --+
```

## After V1

Only after #10 genuinely passes, prioritize from observed use: robust background/resumable upload, group polish, reactions/replies, richer Immich search/albums/semantic search, captions/transcription, voice-only messages, migration/import tooling, stronger offline support.

Do not add separate permanent media storage as a shortcut for any feature.
