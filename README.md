# Immich Polo

A private, self-hosted, Marco-Polo-style asynchronous video/photo conversation app built on top of an existing [Immich](https://immich.app/) server.

> **Core invariant:** Immich owns canonical media bytes. Immich Polo owns conversation metadata, authorization, scheduling, and watch state.

## Current status

This is now a runnable application foundation, not only a plan. Current `master` contains:

- Fastify/TypeScript API with numbered SQLite migrations and Drizzle schema;
- Polo registration/login/logout, hashed bearer sessions, user discovery, thread creation/listing, and membership authorization;
- AES-256-GCM server-side Immich credential sealing;
- a deliberately narrow `ImmichMediaProvider` boundary whose real endpoint implementation is blocked until the real Immich v3 evidence tickets pass;
- durable scheduled publication with a transactional/idempotent notification outbox;
- author reschedule/delete APIs plus persistent seen/video-position/watch state;
- Expo Android/iOS/web client with native SecureStore session restoration, registration/login, conversation creation/listing, and thread metadata;
- Gallery/Record/media playback intentionally disabled rather than mocked while Immich behavior is unverified;
- GitHub Actions for repository lint/typecheck/tests/build.

The critical next boundary is **real Immich integration evidence**: [#11](https://github.com/Tahlor/immich_polo/issues/11), [#12](https://github.com/Tahlor/immich_polo/issues/12), and [#13](https://github.com/Tahlor/immich_polo/issues/13). See [`docs/LOCAL_TESTS.md`](docs/LOCAL_TESTS.md) for every runtime gate and [`docs/ROADMAP.md`](docs/ROADMAP.md) for exact dependency order.

## Product goals

V1 must let a user create a conversation, post any existing Immich photo/video without copying it, record/select local media that Polo uploads into Immich first, consume a continuous watched/unwatched thread, and post now or schedule for later. Scheduled media is uploaded immediately; only Polo visibility is delayed.

## Architecture at a glance

```text
Expo mobile/web client
        |
        v
Immich Polo API
  - Polo auth + thread authorization
  - SQLite conversation/scheduling/watch state
  - durable notification outbox
  - encrypted server-held Immich credentials
  - narrow version-tested Immich adapter
        |
        v
      Immich
  - canonical originals
  - thumbnails / previews
  - video transcoding
  - metadata / deduplication
```

A recipient never receives a sender's Immich credential. Future media requests must authorize through the exact Polo thread/post/PostAsset before the server reads the referenced Immich asset.

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

A physical phone needs an API URL reachable from the phone rather than `localhost`; see [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). Do not put `POLO_REGISTRATION_SECRET` into the Expo environment; it is entered only when creating an account.

## Documentation map

- [`docs/README.md`](docs/README.md) — documentation index and source-of-truth rules.
- [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) — V1 requirements, flows, acceptance scenario.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — integration/security/data-flow decisions.
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — implemented vs planned HTTP API.
- [`docs/CLIENT.md`](docs/CLIENT.md) — current mobile/web client and token-storage behavior.
- [`docs/SCHEDULING.md`](docs/SCHEDULING.md) — durable publication/outbox/watch-state contract.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — setup, migrations, commands, evidence standards.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — implementation state and dependency order.
- [`docs/LOCAL_TESTS.md`](docs/LOCAL_TESTS.md) — local-agent runtime/evidence matrix.
- [`AGENTS.md`](AGENTS.md) — development-agent steering rules.

## V1 non-goals

Do not replace/fork Immich, maintain a duplicate permanent media store, build another transcode/thumbnail pipeline, use Immich albums as conversations, add unrelated social-network scope, or require perfect cross-platform background upload before the core flow works.

## Development workflow

`master` is the normal development branch. Make small verified commits directly to `master` unless a feature branch is explicitly requested; delete temporary branches after merge.

Do not implement guessed Immich endpoint behavior to make a demo pass. Record real-server evidence in #11–#13 and only then encode the proven contract inside `packages/immich-client`.
