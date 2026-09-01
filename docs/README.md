# Immich Polo documentation

Start with the document that matches the question you are trying to answer:

| Document | Purpose |
| --- | --- |
| [`../README.md`](../README.md) | Product summary, current implementation status, quick start |
| [`PRODUCT_PLAN.md`](PRODUCT_PLAN.md) | User flows, requirements, V1 acceptance scenario, scope |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Technical boundaries, security invariants, data flow |
| [`API_CONTRACT.md`](API_CONTRACT.md) | **Implemented vs planned** HTTP API and mandatory authorization rules |
| [`CLIENT.md`](CLIENT.md) | Implemented mobile/web client behavior and session-storage decisions |
| [`SCHEDULING.md`](SCHEDULING.md) | Durable publication, notification outbox, sender controls, watch-state contract |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | Local setup, commands, migrations, verification evidence |
| [`ROADMAP.md`](ROADMAP.md) | Issue-backed dependency order and implementation status |
| [`LOCAL_TESTS.md`](LOCAL_TESTS.md) | Exact local/runtime evidence gates and downstream dependencies |
| [`../AGENTS.md`](../AGENTS.md) | Steering rules for cloud/local development agents |

## Source-of-truth rule

Use the product plan for **what V1 must do**, architecture/API/client/scheduling docs for **how the current implementation behaves**, the roadmap for **what should happen next**, and GitHub issues for executable work/evidence. If prose and current code disagree, treat that as a documentation defect and update the relevant behavior document in the same change.

Evidence that requires a real Immich server, process restart, physical device, or real network path belongs in the dedicated tickets linked from [`LOCAL_TESTS.md`](LOCAL_TESTS.md), not in an unverified claim in documentation.
