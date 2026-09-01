# Immich Polo

A private, self-hosted, Marco-Polo-style asynchronous video/photo conversation app built on top of an existing [Immich](https://immich.app/) server.

> **Core invariant:** Immich owns canonical media bytes. Immich Polo owns conversation metadata, authorization, scheduling, and watch state.

## Current status

The repository now contains a runnable foundation rather than only a plan:

- npm/TypeScript monorepo;
- Fastify API with liveness/readiness routes;
- SQLite + Drizzle V1 schema for users, Immich connections, threads, posts/assets, watch state, and push registrations;
- AES-256-GCM credential-sealing boundary;
- shared scheduling/watch domain rules with unit tests;
- explicit `ImmichMediaProvider` adapter boundary with endpoint-specific calls intentionally blocked until the real v3 contract is verified;
- Expo/React Native/web shell that checks API connectivity;
- GitHub Actions running the repository check/build pipeline.

The next hard gate is the real-server Immich contract in [issue #1](https://github.com/Tahlor/immich_polo/issues/1), while authentication/thread authorization in [issue #3](https://github.com/Tahlor/immich_polo/issues/3) can continue in parallel where it does not depend on unverified Immich behavior.

## Product goals

A user can eventually:

- create a 1:1 conversation;
- record or pick a local photo/video and post it;
- pick **any existing Immich photo/video**, including old media, and post it without copying it;
- see a continuous chronological thread of posts from both people;
- play video naturally and move through unread posts;
- schedule a post to become visible at a future time;
- edit, reschedule, or cancel a scheduled post before publication;
- see watched/unwatched state;
- receive a notification when a new post becomes visible.

Local media selected in Polo is uploaded to Immich first. Polo then creates a post referencing the resulting Immich asset. Scheduled media is also uploaded immediately; only the Polo post is delayed.

## Architecture at a glance

```text
Expo mobile/web client
        |
        v
Immich Polo API
  - Polo auth + thread authorization
  - SQLite conversation state
  - scheduler / watch state / notifications
  - server-held encrypted Immich credentials
  - narrow Immich media adapter
        |
        v
      Immich
  - original media
  - thumbnails / previews
  - video transcoding
  - metadata / deduplication
```

The recipient never needs a broad Immich API key. A media request is authorized through the Polo thread/post/PostAsset chain before the server touches the exact referenced Immich asset.

## Quick start

Requires Node.js 22.13+.

```bash
npm install
npm run check
npm run dev:api
```

In another shell:

```bash
EXPO_PUBLIC_POLO_API_URL=http://localhost:3000 npm run dev:client
```

Physical phones need an API URL reachable from the phone rather than `localhost`; see [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Documentation map

- [`docs/README.md`](docs/README.md) — documentation index.
- [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) — requirements, flows, V1 acceptance scenario.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — integration/security/data-flow decisions.
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — implemented vs planned HTTP API and mandatory authorization rules.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — setup, commands, evidence standards.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — issue-backed order/status.
- [`AGENTS.md`](AGENTS.md) — instructions for development agents.

## V1 non-goals

- Replacing or forking the Immich UI.
- Maintaining duplicate permanent media storage.
- Building our own transcoding or thumbnail pipeline.
- Using Immich albums as conversations.
- End-to-end encrypted media independent of Immich.
- Rich social-network features.
- Perfect background/resumable uploads on every platform before the core flow works.

## Development workflow

`master` is the normal development branch. Make small, verified commits directly to `master` unless a feature branch is explicitly requested. Temporary branches must be deleted after merge.

Do not implement guessed Immich endpoint behavior to make a demo pass. Record real-server evidence in the integration/local-test issues and then encode the proven contract behind `packages/immich-client`.
