# Development

See also: [`README`](../README.md) · [`Product plan`](PRODUCT_PLAN.md) · [`Architecture`](ARCHITECTURE.md) · [`API contract`](API_CONTRACT.md) · [`Roadmap`](ROADMAP.md) · [`Agent rules`](../AGENTS.md)

## Prerequisites

- Node.js 22.13+ (Expo SDK 57 requires Node 22.13+).
- npm.
- A real disposable/test Immich v3 server is required only for the integration-contract work in issue #1; the repository must otherwise build without Immich.

## Install and verify

```bash
npm install
npm run check
```

`npm run check` runs compiler-based lint checks, type checks, unit tests, package/API builds, and an Expo web export. GitHub Actions runs the same command on `master`.

## Run the API

```bash
cp .env.example .env
npm run dev:api
```

Default endpoints:

- `GET http://localhost:3000/health` — process liveness.
- `GET http://localhost:3000/ready` — SQLite readiness.

The default SQLite path is `./data/polo.sqlite` relative to the API process. The application enables foreign keys and WAL for file-backed databases.

## Run the client

```bash
EXPO_PUBLIC_POLO_API_URL=http://localhost:3000 npm run dev:client
```

For a physical phone, `localhost` means the phone itself. Set `EXPO_PUBLIC_POLO_API_URL` to an HTTPS URL or a LAN address reachable from the phone. Local-agent device testing should record the exact URL/network path used without posting secrets.

## Credential encryption

Before storing a real Immich API key, configure `POLO_CREDENTIAL_KEY` as base64 for exactly 32 random bytes. The current code provides an AES-256-GCM sealing boundary and tests it, but the connection/auth routes are not implemented yet.

Never commit the key. Never log plaintext Immich credentials.

## Database migrations

The initial schema is checked in under `apps/api/drizzle/`. Schema source is `apps/api/src/db/schema.ts`.

When the schema changes:

```bash
npm run db:generate --workspace @immich-polo/api
```

Review generated SQL before committing it. Do not edit an already-released migration to reinterpret existing data; add a new migration.

## Immich integration rule

`packages/immich-client` deliberately has **no guessed endpoint implementation** yet. Issue #1 is required to prove the current Immich v3 contract against a real server first. Once verified, endpoint-specific code belongs only in that package.

## What counts as verified

- Cloud/CI evidence: exact commit SHA plus workflow/check result.
- Local Immich evidence: server version, endpoint/operation tested, timestamp, request/response semantics with secrets redacted, and PASS/FAIL/BLOCKED.
- Physical-device evidence: exact commit SHA, device/platform, preconditions, steps, observed result, and PASS/FAIL/BLOCKED.

Do not turn an unexecuted instruction into a claimed test result.
