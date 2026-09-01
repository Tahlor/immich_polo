# Client behavior and security

See also: [`Product plan`](PRODUCT_PLAN.md) · [`API contract`](API_CONTRACT.md) · [`Scheduling/watch`](SCHEDULING.md) · [`Development`](DEVELOPMENT.md) · [`Roadmap`](ROADMAP.md)

## Implemented client slice

The Expo application now supports the Polo-owned part of the product end to end:

- account registration against the server-side household registration secret;
- login, session restoration, and logout;
- user discovery;
- conversation creation and listing;
- opening a thread and listing currently-visible posts plus the author's own scheduled posts;
- explicit disabled Gallery/Record affordances while the Immich adapter remains intentionally unverified.

The UI must not invent fake media behavior. Gallery, recording/upload, thumbnails, and playback become enabled only as their corresponding server routes land after issues #11–#13.

## Session storage

Native Android/iOS stores the raw bearer session token using `expo-secure-store`, which uses platform protected storage. The API stores only the SHA-256 hash of this token.

Web deliberately uses `sessionStorage`, not persistent `localStorage`, for the V1 bearer token. This means a reload in the same tab can preserve the session, while closing the tab/browser may require login again. This is an intentional conservative compromise until web authentication moves to an HttpOnly-cookie model or another hardened mechanism.

Never place `POLO_REGISTRATION_SECRET` in Expo environment/config. It is a household setup credential entered by a user during registration and sent only to the API over HTTPS.

## Network behavior

`EXPO_PUBLIC_POLO_API_URL` is the only current public client configuration value. A physical phone must be able to resolve/reach it. Use HTTPS outside trusted local development networks.

The client treats API error codes as user-facing state rather than assuming connectivity. Invalid/expired restored sessions are cleared locally.

## Immediate next UI unlocks

Once the verified Immich provider exists:

1. connect an Immich account;
2. enable Gallery backed by existing Immich assets;
3. enable Record/device-local selection and stream upload into Immich;
4. replace metadata-only post cards with authorized thumbnails/video playback;
5. wire view-position updates from actual video playback;
6. expose Send now / Schedule beside composition.

Physical Android behavior is tracked in #14; multi-user API persistence/authorization in #16; media behavior remains #11–#13.
