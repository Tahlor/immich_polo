# Immich Polo

A private, self-hosted, Marco-Polo-style asynchronous video/photo conversation app built on top of an existing [Immich](https://immich.app/) server.

> **Core invariant:** Immich owns canonical media bytes. Immich Polo owns conversation metadata, authorization, scheduling, watch state, and notifications.

## Current target

The near-term product gate is **[#19: two standalone Android phones exchange real Immich media through the Archimedes deployment](https://github.com/Tahlor/immich_polo/issues/19)**. See [`docs/M1_TWO_PHONE_VERTICAL_SLICE.md`](docs/M1_TWO_PHONE_VERTICAL_SLICE.md).

Android is the primary V1 client. Web/PWA is secondary. Polo uses its own accounts and bearer sessions; **Universal SSO is not required for the native app/API**.

## Current status

Current `master` contains:

- Fastify/TypeScript API with numbered SQLite migrations and Drizzle schema;
- Polo registration/login/logout, hashed bearer sessions, user discovery, thread creation/listing, and membership authorization;
- AES-256-GCM server-side Immich credential sealing;
- an opt-in `OfficialImmichV3Provider` implementing the current official v3 search/metadata/thumbnail/video-playback/upload surface;
- default fail-closed `IMMICH_PROVIDER=unverified` until the real Archimedes Immich tests #11–#13 pass;
- owner-only Immich connection setup, asset browsing, and picker thumbnails;
- existing-asset posting without a media copy;
- streamed multipart phone/camera upload into Immich followed by canonical asset reference;
- post-scoped authorized image/video proxying with video `Range` forwarding;
- durable scheduled publication with a transactional/idempotent notification outbox;
- author reschedule/delete APIs plus persistent seen/video-position/watch state;
- Expo Android/iOS/web client with native SecureStore session restoration;
- Android Immich browser, phone picker, camera recording, authenticated image/video playback, seek/watch updates, captions, and scheduling controls;
- stable Android package identity plus an EAS preview profile that targets a standalone APK;
- Archimedes systemd/nginx/environment/SQLite-backup templates under `deploy/archimedes/`.

Code existence is not runtime proof. Real Immich behavior is still gated by [#11](https://github.com/Tahlor/immich_polo/issues/11), [#12](https://github.com/Tahlor/immich_polo/issues/12), and [#13](https://github.com/Tahlor/immich_polo/issues/13); deployment is [#18](https://github.com/Tahlor/immich_polo/issues/18); standalone APK evidence is [#20](https://github.com/Tahlor/immich_polo/issues/20).

## Primary deployment

For this installation, Polo belongs on **Archimedes**, beside the Immich server:

```text
Android / browser
       |
       | HTTPS
       v
Polo on Archimedes
  - local SQLite
  - auth / conversations / schedule / watch state
       |
       | server-to-server
       v
http://127.0.0.1:2283  (Immich on Archimedes)
       |
       v
existing Pi3-backed Immich originals
```

Polo itself should not run on Pi3. The live SQLite database stays on local Archimedes disk; Pi3 remains the existing storage/backup backend used by Immich.

## Product flow

V1 lets a user:

1. install the standalone Android app and log into Polo;
2. connect a permission-scoped Immich API key once;
3. open a private conversation;
4. choose an existing old Immich photo/video and post it without copying it, **or** choose/record local media which Polo streams into Immich first;
5. view/seek media through Polo authorization without exposing another user's Immich credential;
6. send now or schedule for later;
7. preserve seen/watch/resume state across reopen;
8. receive a push notification/deep link once #9 is complete.

## Quick start

Requires Node.js 22.13+.

```bash
npm install
npm run check
cp .env.example .env
```

Set a development-only `POLO_REGISTRATION_SECRET` in `.env` (at least 12 characters), then:

```bash
npm run dev:api
```

In another shell:

```bash
EXPO_PUBLIC_POLO_API_URL=http://localhost:3000 npm run dev:client
```

A physical phone needs a reachable HTTPS API origin rather than `localhost`. Never put `POLO_REGISTRATION_SECRET` or an Immich API key into Expo build-time environment variables.

## Documentation map

- [`docs/README.md`](docs/README.md) — documentation index/source-of-truth rules.
- [`docs/M1_TWO_PHONE_VERTICAL_SLICE.md`](docs/M1_TWO_PHONE_VERTICAL_SLICE.md) — controlling near-term acceptance scenario.
- [`docs/NEXT_MOVES.md`](docs/NEXT_MOVES.md) — executable work order.
- [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) — V1 requirements and flows.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — integration/security/data-flow decisions.
- [`docs/IMMICH_V3_CONTRACT.md`](docs/IMMICH_V3_CONTRACT.md) — concrete provider contract and runtime gates.
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — implemented HTTP API.
- [`docs/CLIENT.md`](docs/CLIENT.md) — current native/web behavior and security.
- [`docs/ANDROID.md`](docs/ANDROID.md) — standalone APK contract.
- [`docs/DEPLOYMENT_ARCHIMEDES.md`](docs/DEPLOYMENT_ARCHIMEDES.md) — primary production topology.
- [`docs/SCHEDULING.md`](docs/SCHEDULING.md) — durable publication/outbox/watch-state contract.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — implementation/dependency state.
- [`docs/LOCAL_TESTS.md`](docs/LOCAL_TESTS.md) — local-agent runtime/evidence matrix.
- [`docs/ISSUE_PLAN.md`](docs/ISSUE_PLAN.md) — issue ownership.
- [`AGENTS.md`](AGENTS.md) — development-agent steering rules.

## Non-goals

Do not replace/fork Immich, maintain a duplicate permanent media store, build another transcode/thumbnail pipeline, use Immich albums as conversations, require Universal SSO for native API access, or delay the real two-phone loop for generalized infrastructure polish.

## Development workflow

`master` is the normal development branch. Make small verified commits directly to `master` unless a feature branch is explicitly requested; delete temporary branches after merge.

Official-v3 code is still subordinate to evidence from the actual server. Do not broaden permissions or guess alternate endpoints to make a demo pass; record the first failed transition in #11–#13 and fix the adapter against evidence.
