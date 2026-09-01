# Local/runtime verification matrix

See also: [`Roadmap`](ROADMAP.md) · [`Development`](DEVELOPMENT.md) · [`API contract`](API_CONTRACT.md) · [`Client`](CLIENT.md) · [`Scheduling/watch`](SCHEDULING.md) · [`Agent rules`](../AGENTS.md)

Cloud CI, mocks, and API unit tests are not substitutes for boundaries that depend on a real Immich deployment, process restart, network path, or physical phone. These issues are the explicit runtime gates.

| Issue | Boundary to prove | Depends on | Unblocks / validates |
| --- | --- | --- | --- |
| [#11](https://github.com/Tahlor/immich_polo/issues/11) | Immich v3 version + least-privilege API-key permissions | test Immich v3 | #1 and the real provider implementation |
| [#12](https://github.com/Tahlor/immich_polo/issues/12) | existing-media listing, metadata, thumbnail, deleted asset, repeated byte-range video seeking | #11 | #4, #6 |
| [#13](https://github.com/Tahlor/immich_polo/issues/13) | image/video upload, dedup canonical ID, derived-media readiness, interrupted upload behavior | #11 | #5 |
| [#14](https://github.com/Tahlor/immich_polo/issues/14) | physical Android auth/session restore, conversation UI, network outage/recovery | runnable API/client | #2, #3, #8 mobile behavior |
| [#15](https://github.com/Tahlor/immich_polo/issues/15) | fresh-clone install/check, migrations, API, Expo web smoke | runnable repo | #2 bootstrap quality |
| [#16](https://github.com/Tahlor/immich_polo/issues/16) | persistent multi-user registration/sessions/thread authorization | auth/thread API | #3 runtime authorization |
| [#17](https://github.com/Tahlor/immich_polo/issues/17) | scheduled publication over restart/races/reschedule/delete + recipient invisibility | scheduler + file SQLite | #7 and scheduling portion of #8/#9 |

## Rules for local agents

Always test the latest `master` unless the issue names an exact different SHA, and always report the exact SHA actually tested. If `master` moves during the test, finish the coherent run against the recorded SHA; only repeat on newer `master` when the changed code could affect the result.

Use the final-state vocabulary from [`AGENTS.md`](../AGENTS.md): **PASS / FAIL / BLOCKED / NOT_DUE / ATTEMPTED_UNVERIFIED / INCOMPLETE_EVIDENCE**. A FAIL must identify the first failed transition, not just the eventual symptom.

Never paste API keys, bearer tokens, passwords, registration secrets, private media, or credential ciphertext into GitHub. Sanitized IDs and relevant non-secret headers/status codes are preferred.

If runtime evidence reveals a code/doc defect and the fix is straightforward, fix it on `master`, remotely verify the resulting commit, and post both the failing SHA/evidence and the fixed SHA/result. Do not silently rewrite the historical evidence.

## What remains cloud-buildable while local tests run

Work that does not depend on guessing Immich behavior may continue: Polo auth/thread authorization, scheduling/watch state, UI structure, deployment scaffolding, outbox/push abstractions, and negative tests. Existing-media picker/upload/streaming endpoint details must wait for #11–#13 evidence.
