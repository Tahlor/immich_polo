# AGENTS.md

## Mission

Build a small, reliable, self-hosted asynchronous photo/video conversation app on top of Immich.

The governing product invariant is:

> Immich owns canonical media bytes; Immich Polo owns conversation metadata and authorization.

Before work, read [`README.md`](README.md), [`docs/README.md`](docs/README.md), [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and the relevant issue(s). Use [`docs/ROADMAP.md`](docs/ROADMAP.md) for dependency order and [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for verification/evidence format.

## Development workflow

- `master` is the normal development branch.
- Prefer small verified commits directly to `master` unless a feature branch is explicitly requested.
- If a temporary branch is used, merge it and delete it when finished.
- Inspect current `master`, open issues, and issue comments before implementing work; do not repeat already-resolved investigations.
- Update the relevant issue with the exact tested commit SHA, evidence, decisions, and remaining work.
- Do not claim tests/CI/runtime behavior passed unless the corresponding command, remote check, real Immich request, or device behavior was actually observed.
- Keep documentation synchronized with behavior: `API_CONTRACT.md` must clearly distinguish implemented from planned routes.

## Architecture constraints

- Do not permanently store a second copy of original user media in Polo.
- Do not use Immich albums as the thread model.
- Do not let arbitrary Immich asset IDs bypass Polo thread/post authorization.
- Do not expose stored Immich API credentials to recipients or clients after connection setup.
- Keep Immich-specific endpoint details behind `packages/immich-client`.
- Treat Immich API compatibility as versioned/contract-tested because third-party API behavior can change.
- **Do not fill in endpoint-specific Immich code from memory/docs alone.** First record the current real-server semantics required by issue #1/local test issues, then encode and contract-test them.
- Deleting a Polo post must not delete the Immich asset by default.
- Scheduling must be durable server/database state and must not rely on a client remaining online.
- Publication and notification handling must be idempotent.
- Preserve HTTP range/streaming behavior for video; never buffer complete large videos in API process memory.

## Scope discipline

V1 optimizes for the end-to-end scenario in [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md), not feature breadth.

Avoid adding infrastructure merely because it is common in larger systems. In particular, do not introduce Redis, Kafka, object storage, or multiple backend services until a measured requirement justifies them.

SQLite + Drizzle and a small in-process scheduler are the default V1 design.

## UX priorities

1. Posting an existing Immich asset should be nearly instantaneous.
2. Posting local media should transparently upload it to Immich first.
3. Old Immich media is a first-class posting source, not a buried import feature.
4. Scheduled posts are visible/editable to the sender but undiscoverable to recipients before publication.
5. The thread should feel like an ongoing conversation, not an album browser.
6. Unread/unwatched media should be obvious and easy to play sequentially.

## Security priorities

Authorization is a release blocker, not cleanup work.

For every media read, prove the requesting Polo user is authorized through the visible post and thread membership before touching the referenced Immich asset. See [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

Never log secrets. Encrypt stored Immich credentials at rest. Add negative authorization tests alongside happy-path tests.

## Local-agent evidence contract

When an issue asks for runtime/Immich/device evidence, report:

- exact `master` SHA tested;
- environment: Immich version and deployment type, or device/OS/app runtime as appropriate;
- sanitized preconditions and configuration (never API keys);
- exact operation/steps;
- relevant request/response status and headers or UI observations;
- timestamps where ordering/readiness matters;
- server-owned postconditions (for example asset ID exists, duplicate result, byte-range status, database publication state);
- one final state: **PASS / FAIL / BLOCKED / NOT_DUE / ATTEMPTED_UNVERIFIED / INCOMPLETE_EVIDENCE**;
- first failed transition if FAIL, not just the final symptom.

For Immich integration, evidence must cover connection/version, list/select, upload/deduplication, thumbnails, video range seeking, processing readiness, and deleted/missing media as split across the local-test issues.

For scheduling, test restart/retry and duplicate-worker cases, not only the ordinary timer path.
