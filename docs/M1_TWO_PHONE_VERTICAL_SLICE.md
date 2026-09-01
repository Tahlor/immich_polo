# Milestone 1: two-phone vertical slice

This is the near-term product milestone. It takes priority over generalized self-host packaging polish.

## Acceptance scenario

On the Archimedes deployment, using two independently installed Android APKs and two Polo accounts:

1. Both users can install and launch Immich Polo without Universal SSO.
2. Each user can create/login to a Polo account and the native session survives an app restart.
3. Each user can connect a permission-scoped Immich API key to the Polo server.
4. User A opens a direct conversation with User B.
5. A browses their Immich library in Polo, selects an older image/video, and posts it without copying the source media.
6. B receives and plays/views the post through Polo without receiving A's Immich credential or arbitrary library access. Video seeking must work.
7. B records or selects a new local video from Android and posts it.
8. Polo streams the upload into B's Immich account; Polo references the canonical returned asset ID and does not retain a permanent second copy.
9. A views the new post and server watch state persists across app restart/reload.
10. A selects an existing Immich asset and schedules it for a future instant.
11. B cannot discover the scheduled post before `visible_at`.
12. Polo is restarted before the due time; the post still publishes exactly once after the due time.
13. Notification delivery opens the correct thread/post, or is explicitly the only remaining blocker if every other step passes.

## Product decisions

- **Primary client:** standalone Android app/APK.
- **Secondary client:** web/PWA from the same Expo codebase.
- **Authentication:** Polo-owned accounts and bearer sessions. Universal SSO is not required for native API use.
- **Media ownership:** Immich owns canonical media bytes. Polo owns conversation, authorization, schedule, view/watch, and notification metadata.
- **Production host:** Archimedes. Pi3 remains only the existing Immich storage backend.
- **Polo -> Immich:** server-to-server through the Archimedes local Immich origin where available, not through public DNS.
- **Live Polo SQLite:** local Archimedes disk, never the Pi SSHFS mount.

## Work order

### Gate A — prove the real Immich contract

Issues #11, #12, and #13 run against the actual Archimedes Immich deployment. They must record exact server version, permissions, upload/deduplication behavior, thumbnail behavior, and byte-range video behavior.

Cloud implementation may follow the current official stable Immich v3 OpenAPI contract, but runtime evidence from Archimedes is authoritative. If the deployed server differs, update the adapter rather than adding client-side special cases.

### Gate B — production runtime

Issue #18 installs Polo on Archimedes with local SQLite, loopback binding, systemd, nginx/public routing where authorized, and local Immich connectivity.

### Gate C — Android media UX

Unlock the client in this order:

1. Immich connection setup.
2. Existing-Immich gallery browser with thumbnails.
3. Post existing asset now.
4. Android camera/device picker and streamed upload.
5. Authorized image/video rendering and video seeking.
6. Watch-position updates.
7. Send now / schedule controls.
8. Push notifications and deep-link open.

### Gate D — distributable APK

A release/profile build must produce an installable Android APK with a stable package ID and production API URL. Physical-device evidence belongs in #14 and the APK-specific issue.

### Gate E — humane onboarding

The server-side household registration secret remains valid bootstrap plumbing, but normal invitees should not have to type it. Add short-lived single-use invite links/codes after the two-phone media loop is working; do not block the first vertical slice on a polished invite system.

## Parallel ownership

- **Cloud/repository agent:** API/provider implementation, app UX, tests, docs, issues, build configuration.
- **Archimedes local agent:** exact-server contract evidence, host deployment, nginx/systemd, physical Android/runtime tests, and sanitized logs/screenshots.

Neither agent should duplicate the other's work. Runtime claims require runtime evidence.

## Definition of done

This milestone is done only when the acceptance scenario is demonstrated with two physical Android installs against Archimedes, with exact deployed SHA(s) recorded. Use PASS / FAIL / BLOCKED / NOT_DUE / ATTEMPTED_UNVERIFIED / INCOMPLETE_EVIDENCE and identify the first failed transition on failures.
