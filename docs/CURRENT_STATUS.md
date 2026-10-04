# Current status

Snapshot date: **2026-10-04**.

This document is the shortest authoritative answer to “what is implemented, what is verified, and what is actually deployed?” It should be updated whenever runtime evidence materially changes.

## Bottom line

**Source checks and API infrastructure: VERIFIED. Real-media/device acceptance: BLOCKED / NOT VERIFIED.**

Implementation CI baseline: **`90fee145de14186c7f80dfef047f4024156df7df`** (`ci: use reproducible npm installs`, 2026-09-10).

GitHub Actions run **34442702058** completed successfully for that exact SHA using Node 22.14 / npm 10.9.2 and `npm ci`. The run exercised lint, typecheck, build, and the repository unit/API/provider tests.

On 2026-10-04 the Archimedes agent deployed the API, beginning from current
remote master `2c7156425b3c8230ad99de708c3a5965bdb3ce1c` (Actions run
37142764692: success). Local `npm ci` and `npm run check` passed on Node
24.16.0/npm 11.13.0, including 28 domain/provider/API tests and Expo web export.
Deployment artifact fixes include protected database permissions, the local
origin allowlist, daily backup units and restore ownership preservation.
The final exact deployed/tested SHA and subsequent CI result are recorded
in #18 rather than inferred from this snapshot.

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

**API infrastructure verified; provider/media acceptance BLOCKED.**

Observed runtime: `immich-polo.service` runs as `ubuntu`, enabled, on
`127.0.0.1:13060`; SQLite is local ext4 at
`/var/lib/immich-polo/polo.sqlite` (mode `0600`). Secrets are outside Git at
`/etc/immich-polo/immich-polo.env` (root-only). Direct nginx HTTPS at
`https://polo.taylorarchibald.com` returns `200` health/readiness without SSO.
Three disposable accounts and a shared thread survived service restart,
online-backup restore and a SIGKILL followed by automatic restart; outsider
and unauthenticated requests were denied. Test records were removed afterward.
Daily online SQLite backups are enabled; the matching credential environment
has a root-only backup. Stopping Polo did not stop Immich.

Immich reports `3.1.0` locally. Production permits only
`http://127.0.0.1:2283` and remains `IMMICH_PROVIDER=unverified`. No scoped
test API key is available to the agent, so actual provider requests, upload,
Range and outage recovery remain blocked by #11–#13. The API-only deployment
does not serve a web client or demonstrate #19. #18 remains the owning ticket.
A deployment report must continue to include:

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

Treat infrastructure evidence and real-media acceptance as separate results.

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

1. Keep #18's deployed SHA, local checks and CI evidence current.
2. Supply a dedicated least-privilege test key, then **run #11–#13 against the local Immich origin** and fix only observed contract mismatches.
3. Enable the verified provider and prove real media paths through the deployed API.
4. Build/install the standalone APK (#20/#14).
5. Run the two-phone scenario (#19), including #16/#17 persistence/scheduling evidence.
6. In parallel, close the still-present client correctness/security sub-issues before household rollout.
7. Finish push (#9) and invites (#21) before calling the household MVP complete.

Do not close a runtime issue from source inspection or CI alone.
