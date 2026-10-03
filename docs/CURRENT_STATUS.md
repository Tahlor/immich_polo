# Current status

Snapshot date: **2026-10-03**.

This document is the shortest authoritative answer to “what is implemented, what is verified, and what is actually deployed?” It should be updated whenever runtime evidence materially changes.

## Bottom line

**Source/CI status: VERIFIED. Deployment/runtime status: NOT VERIFIED.**

Latest `master`: **`90fee145de14186c7f80dfef047f4024156df7df`** (`ci: use reproducible npm installs`, 2026-09-10).

GitHub Actions run **34442702058** completed successfully for that exact SHA using Node 22.14 / npm 10.9.2 and `npm ci`. The run exercised lint, typecheck, build, and the repository unit/API/provider tests.

There is **no recorded evidence that this SHA, or any earlier Immich Polo SHA, has been deployed and validated on Archimedes**. Issue #18 remains open with no deployment report. There is no recorded deployed SHA, systemd unit/port, `/health` + `/ready` result, public Polo hostname, persistent SQLite result, or restart/backup evidence. Treat the production deployment state as **INCOMPLETE_EVIDENCE / not demonstrated**, not as deployed.

Likewise, there is no posted standalone APK/two-phone acceptance result. #20 and #19 remain open.

## What is implemented in `master`

The repository contains substantial application code rather than only planning:

- Fastify/TypeScript API, numbered SQLite migrations and Drizzle schema;
- Polo accounts, hashed bearer sessions, user discovery, direct-thread primitives and membership checks;
- AES-256-GCM sealed Immich credentials;
- opt-in `OfficialImmichV3Provider` for version/user verification, metadata search, asset metadata, thumbnails, video playback/Range forwarding and streamed upload;
- fail-closed provider mode until real-server validation is complete;
- owner-only Immich connection setup and asset browsing;
- existing-Immich-asset posting without copying canonical media;
- streamed phone/camera upload into Immich followed by canonical asset reference;
- post-scoped authorized thumbnail/image/video delivery;
- durable scheduled publication and idempotent notification outbox;
- persistent PostView seen/watch/playback-position writes;
- Expo client with native SecureStore session restoration, Immich browser, device picker, camera recording, authorized image/video playback and basic scheduling;
- stable Android package identity and EAS APK profile;
- Archimedes systemd/nginx/environment/backup templates;
- checked-in `package-lock.json` and reproducible `npm ci` CI path.

## What is verified

### Verified by current GitHub CI

- dependency resolution from the lockfile;
- TypeScript lint/typechecking;
- repository builds;
- domain/provider/API tests, including mocked Immich provider behavior and authorization cases.

### Not verified by CI

CI does **not** prove:

- the real Archimedes Immich API contract or minimum key permissions;
- real thumbnail/video Range behavior through Immich + nginx;
- real upload/dedupe/transcode-readiness semantics;
- file-backed production persistence/restart behavior;
- physical Android/SecureStore behavior;
- an installable APK on either test phone;
- two-phone exchange of real media;
- push delivery/deep links;
- SQLite + credential-key restore.

Those remain runtime gates in #11–#20.

## Deployment status

### Archimedes

**NOT VERIFIED / no deployment report exists.**

The repo contains reusable deployment templates, but templates are not a deployment. #18 is still the owning ticket. A valid deployment report must include at minimum:

- exact deployed Polo SHA;
- host `archimedes`;
- project/install path;
- Node/npm versions;
- systemd unit + loopback port;
- local SQLite path;
- `IMMICH_PROVIDER` and allowed local Immich origin (without secrets);
- local `/health` and `/ready` evidence;
- restart/persistence evidence;
- nginx/public HTTPS result if configured;
- real Polo -> `http://127.0.0.1:2283` evidence;
- final PASS / FAIL / BLOCKED / INCOMPLETE_EVIDENCE state.

Until that is posted to #18, do not describe Polo as deployed.

### Android

**NOT VERIFIED / no standalone APK acceptance report exists.**

The build profile and package identity exist, but #20 still owns artifact build/hash/install/upgrade evidence and #14 owns physical-device behavior. #19 owns the actual two-phone product loop.

## Source defects still present on 2026-10-03

These were rechecked against current `master`, not merely copied from the September audit:

1. **Selecting media still sends immediately.** Existing Immich selection calls `postExisting`; phone/camera selection uploads immediately. There is no shared preview/draft with explicit Send/Schedule confirmation.
2. **Phone/camera captions are still dropped.** `uploadPickedAsset` does not pass the current caption into `uploadLocalPost`, then clears the caption afterward.
3. **Optional EXIF capture-time parsing can still throw.** `new Date(DateTimeOriginal).toISOString()` is used without validating the parsed date.
4. **A startup home/network failure still clears the saved session.** The startup path catches identity or home-load failure together and clears SecureStore instead of distinguishing an invalid token from temporary API failure.
5. **Thread requests/drafts are not isolated.** `selectedThread` changes before the new post response lands; shared caption/schedule state can cross thread transitions and stale responses are not scoped to the active request/thread.
6. **PostView is write-only from the conversation list API’s perspective.** `/threads/:threadId/posts` does not return the current user’s view/resume state, so the client cannot restore saved playback from that response.
7. **Timeline/inbox ordering is still creation-based.** Thread list uses thread creation time; post list uses `posts.created_at`, not publication/latest-visible activity. Delayed publication can therefore appear at the wrong conversational position.
8. **Author mutations do not also require current membership.** `PATCH /posts/:postId/schedule` and `DELETE /posts/:postId` check authorship but not current thread membership; error differences also expose some post-existence/state information.

Dedicated sub-issues created from this snapshot should remain cross-linked to the existing parent issues rather than replacing #4–#9/#14/#16/#19.

## Outstanding runtime gates

- #11 — real Immich v3 version/minimum permission matrix
- #12 — real existing-media search/thumbnail/video Range/deletion behavior
- #13 — real upload/dedupe/processing readiness
- #14 — physical Android auth/session/conversation behavior
- #15 — fresh-clone/migration/web smoke
- #16 — persistent multi-user authorization
- #17 — scheduled publication across restart/races
- #18 — actual Archimedes deployment
- #19 — controlling two-phone real-media acceptance scenario
- #20 — standalone APK build/distribution/install/upgrade evidence
- #9 — push transport/device registration/deep-link delivery
- #21 — invite-based onboarding

## Recommended execution order

1. **Deploy the green `master` SHA to Archimedes under #18** with provider fail-closed initially and record all deployment evidence.
2. **Run #11–#13 against the local Immich origin** and fix only observed contract mismatches.
3. Enable the verified provider and prove real media paths through the deployed API.
4. Build/install the standalone APK (#20/#14).
5. Run the two-phone scenario (#19), including #16/#17 persistence/scheduling evidence.
6. In parallel, close the still-present client correctness/security sub-issues before household rollout.
7. Finish push (#9) and invites (#21) before calling the household MVP complete.

Do not close a runtime issue from source inspection or CI alone.