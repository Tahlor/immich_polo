# AGENTS.md

## Mission

Build a small, reliable, self-hosted asynchronous photo/video conversation app on top of Immich.

The governing product invariant is:

> Immich owns canonical media bytes; Immich Polo owns conversation metadata and authorization.

Read `README.md`, `docs/PRODUCT_PLAN.md`, and `docs/ARCHITECTURE.md` before making architectural changes.

## Development workflow

- `master` is the normal development branch.
- Prefer small verified commits directly to `master` unless a feature branch is explicitly requested.
- If a temporary branch is used, merge it and delete it when finished.
- Inspect current repository state and existing issues before implementing work; do not repeat already-resolved investigations.
- Update the relevant issue with evidence, decisions, and remaining work.
- Do not claim tests/CI passed unless the corresponding command or remote check was actually observed.

## Architecture constraints

- Do not permanently store a second copy of original user media in Polo.
- Do not use Immich albums as the thread model.
- Do not let arbitrary Immich asset IDs bypass Polo thread/post authorization.
- Do not expose stored Immich API credentials to recipients or clients after connection setup.
- Keep Immich-specific endpoint details behind the media-provider adapter.
- Treat Immich API compatibility as versioned/contract-tested because third-party API behavior can change.
- Deleting a Polo post must not delete the Immich asset by default.
- Scheduling must be durable server/database state and must not rely on a client remaining online.
- Publication and notification handling must be idempotent.
- Preserve HTTP range/streaming behavior for video; never buffer complete large videos in API process memory.

## Scope discipline

V1 should optimize for the end-to-end scenario in `docs/PRODUCT_PLAN.md`, not feature breadth.

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

For every media read, prove the requesting Polo user is authorized through the visible post and thread membership before touching the referenced Immich asset.

Never log secrets. Encrypt stored Immich credentials at rest. Add negative authorization tests alongside happy-path tests.

## Verification expectations

For Immich integration changes, prefer evidence against a real disposable/test Immich instance in addition to mocks. At minimum cover:

- connection/version detection;
- list/select existing media;
- upload and duplicate behavior;
- thumbnail/preview retrieval;
- video playback with byte-range seeking;
- deleted/missing asset behavior.

For scheduling, test restart/retry and duplicate-worker cases, not only the ordinary timer path.
