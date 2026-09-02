# Archimedes deployment

Issue #18 owns host execution and evidence. This document records the intended repository-side deployment contract so machine configuration does not have to be rediscovered.

## Role split

- **Archimedes:** Polo API, Polo SQLite, nginx/public origin, Immich server, Immich database, generated thumbnails/transcodes.
- **Pi3:** existing storage backend used by Immich for canonical originals and backups. Polo does not run on Pi3.
- **Android/web clients:** call Polo over public HTTPS. They never need direct LAN access to Immich.

## Intended runtime

```text
Android / browser
       |
       | HTTPS
       v
polo.taylorarchibald.com
       |
       v
Archimedes nginx
       |
       v
127.0.0.1:<Polo port>
       |
       +-- local SQLite
       |
       +-- Immich API: http://127.0.0.1:2283
                         |
                         +-- existing Pi3-backed originals
```

## Production environment

Expected values, with secrets stored outside Git:

```dotenv
HOST=127.0.0.1
PORT=<dedicated loopback port>
DATABASE_PATH=<local Archimedes path>/polo.sqlite
POLO_REGISTRATION_SECRET=<secret>
POLO_CREDENTIAL_KEY=<32-byte base64 secret>
SESSION_TTL_DAYS=30
IMMICH_PROVIDER=official-v3
```

`IMMICH_PROVIDER=official-v3` is enabled only after #11-#13 validate the actual Immich deployment. Until then keep `unverified` and report media operations as BLOCKED rather than guessing.

The Android build can use:

```dotenv
EXPO_PUBLIC_POLO_API_URL=https://polo.taylorarchibald.com
EXPO_PUBLIC_DEFAULT_IMMICH_URL=http://127.0.0.1:2283
```

The second value is merely a setup-form default. Polo's server stores and consumes it; the Android device does not attempt to reach its own loopback interface.

## systemd/nginx requirements

The local agent should commit reusable templates after verifying them on Archimedes. At minimum:

- non-root service user/runtime;
- explicit working directory and environment file;
- loopback-only application bind;
- restart-on-failure policy;
- nginx HTTPS reverse proxy;
- realistically large upload allowance;
- request buffering disabled for streamed upload paths where needed;
- Range/Content-Range preserved for video playback;
- practical read/send timeouts for long videos;
- no Universal SSO requirement on native API calls;
- backend port not exposed to the WAN.

## Storage

The live SQLite database must remain on local Archimedes disk. A backup copy may be pushed to Pi3, but SQLite must not operate over the Pi SSHFS mount.

Polo must never create a replacement media directory when the existing Immich/Pi mount is unavailable. Immich's existing storage guard remains authoritative.

## Failure behavior

Polo should remain available if Immich is temporarily unavailable. Authentication, thread metadata, scheduling metadata, and durable publication state remain Polo-owned. Media operations return an upstream-unavailable state and recover when Immich recovers.

## Validation

Use #18 for the exact host commands/results. Record:

- exact deployed Polo SHA;
- hostname = `archimedes`;
- install path;
- Node/npm versions;
- systemd unit/port;
- SQLite path;
- local Immich origin;
- nginx validation;
- local/public health/readiness;
- restart persistence;
- real provider behavior when #11-#13 permit it;
- final evidence state.
