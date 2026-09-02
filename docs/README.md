# Immich Polo documentation

## Current priority

**[`M1_TWO_PHONE_VERTICAL_SLICE.md`](M1_TWO_PHONE_VERTICAL_SLICE.md)** is the controlling near-term milestone: prove two standalone Android installs can exchange real existing/new Immich media through Archimedes and survive scheduled publication across restart.

Do not prioritize generalized deployment polish ahead of that milestone unless it directly unblocks the two-phone scenario.

## Source-of-truth map

| Document | Purpose |
| --- | --- |
| [`../README.md`](../README.md) | Product summary, current implementation status, quick start |
| [`M1_TWO_PHONE_VERTICAL_SLICE.md`](M1_TWO_PHONE_VERTICAL_SLICE.md) | Current execution order and two-phone acceptance gate |
| [`PRODUCT_PLAN.md`](PRODUCT_PLAN.md) | User flows, requirements, V1 acceptance scenario, scope |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Technical boundaries, security invariants, data flow |
| [`IMMICH_V3_CONTRACT.md`](IMMICH_V3_CONTRACT.md) | Concrete official-v3 provider contract and real-server validation gates |
| [`API_CONTRACT.md`](API_CONTRACT.md) | **Implemented vs planned** HTTP API and mandatory authorization rules |
| [`CLIENT.md`](CLIENT.md) | Implemented mobile/web client behavior and session-storage decisions |
| [`ANDROID.md`](ANDROID.md) | Standalone Android identity/build/runtime acceptance |
| [`SCHEDULING.md`](SCHEDULING.md) | Durable publication, notification outbox, sender controls, watch-state contract |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | Local setup, commands, migrations, verification evidence |
| [`ROADMAP.md`](ROADMAP.md) | Issue-backed dependency order and implementation status |
| [`LOCAL_TESTS.md`](LOCAL_TESTS.md) | Exact local/runtime evidence gates and downstream dependencies |
| [`../AGENTS.md`](../AGENTS.md) | Steering rules for cloud/local development agents |

## Source-of-truth rule

Use the product plan for **what V1 must do**, the two-phone milestone for **what to execute next**, architecture/API/client/scheduling docs for **how the current implementation behaves**, the roadmap for **dependency/status tracking**, and GitHub issues for executable work/evidence. If prose and current code disagree, treat that as a documentation defect and update the relevant behavior document in the same change.

Evidence that requires a real Immich server, process restart, physical device, or real network path belongs in the dedicated tickets linked from [`LOCAL_TESTS.md`](LOCAL_TESTS.md), not in an unverified claim in documentation.

Use **PASS / FAIL / BLOCKED / NOT_DUE / ATTEMPTED_UNVERIFIED / INCOMPLETE_EVIDENCE**. A FAIL must identify the first failed transition, not only the final symptom.
