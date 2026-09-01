# Development

See also: [`README`](../README.md) · [`Product plan`](PRODUCT_PLAN.md) · [`Architecture`](ARCHITECTURE.md) · [`API contract`](API_CONTRACT.md) · [`Roadmap`](ROADMAP.md) · [`Agent rules`](../AGENTS.md)

## Prerequisites

- Node.js 22.13+ (Expo SDK 57 requires Node 22.13+).
- npm.
- A real disposable/test Immich v3 server is required only for integration-contract issues #11–#13; the repository must otherwise build without Immich.

## Install and verify

```bash
npm install
npm run check
```

`npm run check` runs compiler-based lint checks, type checks, unit/API tests, package/API builds, and an Expo web export. GitHub Actions runs the same command on `master`.

## Run the API

```bash
cp .env.example .env
```

Set a development-only `POLO_REGISTRATION_SECRET` with at least 12 characters, then:

```bash
npm run dev:api
```

Default endpoints include `GET http://localhost:3000/health` and `/ready`; see [`API_CONTRACT.md`](API_CONTRACT.md) for implemented auth/thread routes.

The default SQLite path is `./data/polo.sqlite`. Startup applies numbered SQL migrations from `apps/api/drizzle/` once each and records them in `_polo_migrations`. The schema source remains `apps/api/src/db/schema.ts`; use Drizzle Kit to generate/review future SQL changes.

## Run the client

```bash
EXPO_PUBLIC_POLO_API_URL=http://localhost:3000 npm run dev:client
```

For a physical phone, `localhost` means the phone itself. Set `EXPO_PUBLIC_POLO_API_URL` to an HTTPS URL or LAN address reachable from the phone. Runtime verification is tracked in #14 (Android) and #15 (fresh-clone/web).

## Authentication/session security

- Registration requires `POLO_REGISTRATION_SECRET`; do not expose it in a client bundle or commit it.
- Passwords are stored only as `scrypt` hashes.
- Login/registration returns a high-entropy bearer session token; SQLite stores only its SHA-256 hash.
- V1 clients must treat the raw token as a credential. Persistent mobile storage should use platform secure storage when the login UI is implemented.
- Use HTTPS outside trusted localhost/private development environments.

## Credential encryption

Before storing a real Immich API key, configure `POLO_CREDENTIAL_KEY` as base64 for exactly 32 random bytes. The current code provides an AES-256-GCM sealing boundary and tests it, but Immich connection routes remain blocked on the verified contract work.

## Database migrations

Schema source is `apps/api/src/db/schema.ts`; reviewed SQL lives in `apps/api/drizzle/` and is applied in filename order by the small startup migration runner.

When the schema changes, run Drizzle Kit locally to generate the candidate migration, review the SQL, and commit a new numbered migration. Do not rewrite already-used migrations to reinterpret persistent data.

## Immich integration rule

`packages/immich-client` deliberately has **no guessed endpoint implementation** yet. Runtime evidence is split across #11 (version/permissions), #12 (read/range behavior), and #13 (upload/dedup/readiness). Once those are proven, encode endpoint behavior only inside that package.

## What counts as verified

- Cloud/CI evidence: exact commit SHA plus workflow/check result.
- Local Immich evidence: server version, endpoint/operation tested, timestamp, request/response semantics with secrets redacted, and PASS/FAIL/BLOCKED.
- Physical-device evidence: exact commit SHA, device/platform, preconditions, steps, observed result, and PASS/FAIL/BLOCKED.

Do not turn an unexecuted instruction into a claimed test result.
