# AGENTS.md

## Mission

Build a small, reliable, self-hosted asynchronous photo/video conversation app on top of Immich.

> **Governing invariant:** Immich owns canonical media bytes; Immich Polo owns conversation metadata and authorization.

Before work, read [`README.md`](README.md), [`docs/README.md`](docs/README.md), [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and the relevant issue(s). Use [`docs/ROADMAP.md`](docs/ROADMAP.md) for dependency/current status, [`docs/LOCAL_TESTS.md`](docs/LOCAL_TESTS.md) for runtime gates, and [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for evidence format.

## Development workflow

- `master` is the normal development branch.
- Prefer small verified commits directly to `master` unless a feature branch is explicitly requested.
- If a temporary branch is used, merge it and delete it when finished.
- Inspect current `master`, open issues, issue comments, and the roadmap before implementing; do not repeat resolved investigations.
- Update the relevant issue with exact tested commit SHA, evidence, decisions, and remaining work.
- Do not claim tests/CI/runtime behavior passed unless the corresponding command, remote check, real Immich request, or device behavior was actually observed.
- Keep behavior docs synchronized with code. `API_CONTRACT.md` must distinguish implemented from planned routes; `ROADMAP.md` must distinguish code-present from acceptance-complete.

## Architecture constraints

- Do not permanently store a second copy of original user media in Polo.
- Do not use Immich albums as the thread model.
- Do not let arbitrary Immich asset IDs bypass Polo thread/post authorization.
- Do not expose stored Immich API credentials to recipients or clients after connection setup.
- Keep Immich-specific endpoint details behind `packages/immich-client`.
- Treat Immich API compatibility as versioned/contract-tested.
- **Do not fill endpoint-specific Immich code from memory/docs alone.** Runtime issues #11–#13 establish the contract first.
- Deleting Polo metadata must not delete the Immich asset by default.
- Scheduling is durable server/database state and never depends on a client remaining online.
- Publication and notification delivery must be separately idempotent.
- Preserve HTTP range/streaming behavior for video; never buffer complete large videos in API memory.

## Scope discipline

V1 optimizes for the acceptance scenario in [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md), not feature breadth. Do not introduce Redis, Kafka, object storage, or extra backend services without measured need. SQLite + Drizzle, one API process, and a small in-process scheduler are the V1 defaults.

## UX priorities

1. Existing Immich media is a first-class posting source.
2. Local media transparently uploads to Immich before Polo publication.
3. Scheduled posts are visible/editable to sender but undiscoverable to recipients before publication.
4. Thread UI feels conversational rather than like another album browser.
5. Unread/unwatched media is obvious and easy to consume sequentially.
6. Do not enable UI actions whose server/provider behavior is not real yet; visible gating is better than a fake demo.

## Security priorities

Authorization is a release blocker. Every media read must prove requesting Polo user -> current thread membership -> visible post -> exact PostAsset -> owning ImmichConnection -> exact asset before touching Immich. See [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

Never log secrets. Passwords are hashed; session tokens are stored hashed by the API and in platform protected storage on native clients; Immich credentials are encrypted at rest. Add negative authorization tests alongside happy paths.

## Local-agent evidence contract

Follow [`docs/LOCAL_TESTS.md`](docs/LOCAL_TESTS.md). Every runtime report includes exact `master` SHA, environment/version, sanitized preconditions, exact operation/steps, relevant status/headers/UI observations, timestamps where ordering matters, server-owned postconditions, and one final state: **PASS / FAIL / BLOCKED / NOT_DUE / ATTEMPTED_UNVERIFIED / INCOMPLETE_EVIDENCE**.

For FAIL, identify the first failed transition. Never convert an unexecuted instruction into a claimed result and never post credentials/private media in evidence.
