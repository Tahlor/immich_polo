# Implementation roadmap

See also: [`Two-phone milestone`](M1_TWO_PHONE_VERTICAL_SLICE.md) · [`Next moves`](NEXT_MOVES.md) · [`Issue map`](ISSUE_PLAN.md) · [`Local tests`](LOCAL_TESTS.md)

GitHub issues are the executable backlog. Code existing is not the same as runtime acceptance passing.

## Current priority

**#19 is the controlling milestone:** two standalone Android APK installs exchange real existing/new Immich media through Polo on Archimedes and prove scheduled publication across restart.

Generic Docker/self-host polish in #10 follows that proof rather than preceding it.

## Implemented in repository

- TypeScript/npm workspace; Fastify API; SQLite migrations/Drizzle schema; Expo universal client.
- Polo accounts, hashed bearer sessions, native SecureStore restoration, user discovery, direct/group-ready threads, membership authorization.
- encrypted per-user Immich credentials and owner-only connection routes.
- opt-in `OfficialImmichV3Provider` for current official v3 version/user/search/metadata/thumbnail/video-playback/upload operations.
- fail-closed `IMMICH_PROVIDER=unverified` default until target-server evidence passes.
- existing Immich picker metadata + authenticated thumbnails.
- existing-asset posting without copying canonical media.
- streamed multipart local/device upload into Immich, canonical asset re-fetch/reference, duplicate-aware result.
- post-scoped image/video proxy, recipient authorization, HTTP Range forwarding for video.
- durable scheduler, idempotent notification outbox, author reschedule/delete, watch/resume state.
- Android client paths for Immich setup, existing picker, phone gallery, camera video recording, image/video rendering, seeking/watch updates, captions, and simple scheduling.
- stable Android package identity and EAS preview APK profile.
- Archimedes systemd/nginx/env/SQLite backup/restore templates.

## Runtime gates

### #11 — Immich version + minimum API-key permissions

**Code state:** concrete v3 adapter exists.

**Gate:** Archimedes must prove the exact deployed v3 version and least-privilege permissions. Do not broaden permissions to hide a failed operation.

### #12 — existing media / thumbnail / video ranges

**Code state:** search, picker thumbnail, post media proxy, Android playback/seek are implemented against the v3 contract.

**Gate:** prove pagination, thumbnail semantics, middle/repeated Range responses, missing/deleted media, and public nginx behavior on the real server.

### #13 — upload / duplicate / processing readiness

**Code state:** phone/camera bytes stream Polo -> provider -> Immich; Polo stores canonical returned asset reference.

**Gate:** prove exact multipart behavior, duplicate semantics, readiness timing, interrupted upload cleanup/retry, and retrieval of canonical media on Archimedes.

### #14 / #20 — physical standalone Android

**Code state:** native client and APK build profile exist.

**Gate:** build an actual APK, install it on physical Android devices, prove SecureStore persistence, media actions, server outage recovery, and later upgrade behavior. Expo Go does not count.

### #15 / #16 / #17 — bootstrap/auth/scheduler runtime

Fresh clone/install, persistent multi-user authorization, and restart/race scheduling evidence remain explicit runtime gates even though their application code exists.

### #18 — Archimedes deployment

**Code state:** reusable deployment templates exist under `deploy/archimedes/` plus [`DEPLOYMENT_ARCHIMEDES.md`](DEPLOYMENT_ARCHIMEDES.md).

**Gate:** local agent works on **Archimedes**, verifies port/path/Node version, installs systemd/nginx/local SQLite, and uses local Immich origin `http://127.0.0.1:2283`. Pi3 stays storage only.

### #9 — push notifications

Notification outbox exists; provider/device registration/retry/deep-link delivery remains implementation work.

### #21 — invite onboarding

Manual household bootstrap secret works, but normal invitees should eventually use short-lived single-use invite codes/deep links. This follows the core media loop unless onboarding itself blocks the second tester.

### #10 — generalized self-host V1

Package/document generic deployment only after #19 proves the real behavior. Reuse the same media/auth/scheduling invariants rather than building a second architecture.

## Execution order

```text
#11 version/permissions -----+
#12 search/thumb/range ------+--> enable official-v3 on #18 Archimedes deployment
#13 upload/dedup/readiness --+                         |
                                                       v
#20 standalone APK --> #14 physical Android -------> #19 TWO-PHONE MEDIA LOOP
                                                       |
#16 auth persistence ---------------------------------+
#17 scheduler restart --------------------------------+
                                                       |
                                                       +--> #9 push/deep links
                                                       +--> #21 invite UX
                                                       +--> #10 generic packaging
```

## Verification

Repository CI must be green for the tested SHA, but CI does not substitute for #11–#20 runtime evidence. Every real-server/device failure reports the first failed transition and one of PASS / FAIL / BLOCKED / NOT_DUE / ATTEMPTED_UNVERIFIED / INCOMPLETE_EVIDENCE.

## After V1

Prioritize from observed use: upload progress/retry, robust background/resumable upload, unread/sequential playback polish, group UX, richer Immich search, reactions/replies, captions/transcription, voice-only posts, offline support, migration/import tooling.

Never add separate permanent media storage as a shortcut.
