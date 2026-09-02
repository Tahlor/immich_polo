# Milestone issue map

The two-phone milestone is decomposed so host/runtime proof and cloud implementation do not duplicate each other.

## Controlling milestone

- **#19 — two standalone Android phones exchange real Immich media through Archimedes.** This is the near-term product acceptance gate.

## Runtime/evidence dependencies

- #11 — real Immich v3 connection/version/minimum permissions on Archimedes.
- #12 — real existing-media search/thumbnail/video-Range semantics on Archimedes.
- #13 — real upload/deduplication/processing semantics on Archimedes.
- #14 — physical Android auth/session/application behavior.
- #15 — fresh-clone/install smoke.
- #16 — persistent multi-user authorization.
- #17 — scheduler restart/race evidence.
- #18 — install and validate Polo on **Archimedes**; Pi3 remains Immich storage only.
- #20 — build/distribute/verify the standalone Android APK used by #19.

## Follow-on product work

- #9 — push notification delivery/deep linking; required to finish the full notification experience.
- #21 — replace manual household registration-secret entry with short-lived single-use invite codes/links after the core media loop is proven.
- #10 — generalized self-host packaging/full V1, intentionally after the Archimedes two-phone loop proves behavior.

The controlling written acceptance contract is [`M1_TWO_PHONE_VERTICAL_SLICE.md`](M1_TWO_PHONE_VERTICAL_SLICE.md). Runtime claims belong in their issue evidence, with exact SHA/device/server version and PASS / FAIL / BLOCKED / NOT_DUE / ATTEMPTED_UNVERIFIED / INCOMPLETE_EVIDENCE.
