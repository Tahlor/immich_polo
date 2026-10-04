# Client behavior and security

See also: [`Two-phone milestone`](M1_TWO_PHONE_VERTICAL_SLICE.md) · [`Android`](ANDROID.md) · [`API contract`](API_CONTRACT.md) · [`Immich v3 contract`](IMMICH_V3_CONTRACT.md) · [`Scheduling/watch`](SCHEDULING.md)

## Product surface

Android is the primary V1 client and must be distributed as a standalone APK. Web/PWA remains a secondary surface from the same Expo codebase; iOS shares the implementation unless a documented platform limitation remains.

Universal SSO is **not** required for normal Polo API access. Polo owns its accounts and bearer sessions.

## Implemented client slice

The Expo application currently implements:

- account registration against the server-side household bootstrap secret;
- login, native session restoration, and logout;
- user discovery plus direct-conversation creation/listing;
- visible thread posts plus the author's scheduled posts;
- per-user Immich connection setup using a permission-scoped API key;
- authenticated existing-Immich asset browsing with thumbnails;
- shared media review with explicit Send/Schedule for existing, phone and camera media;
- device photo/video selection;
- camera video capture;
- multipart upload through Polo into the connected Immich account;
- authorized image rendering;
- bearer-authenticated video playback and seeking on the native app;
- playback-position updates to Polo watch state.

These application paths exist in code, but the production server remains fail-closed by default with `IMMICH_PROVIDER=unverified`. Issues #11–#13 must validate the actual Archimedes Immich v3 server before #18 enables `official-v3` in production.

## Known gaps at the 2026-09-08 audit

The [MVP finish plan](MVP_FINISH_PLAN.md) distinguishes code-present paths from a complete user experience. Currently:

- playback position is written but not read/restored by the player; no unread summaries/Next flow is wired;
- images report seen on mount rather than successful visible rendering;
- transient startup/home-load failure clears the stored session; manual refresh errors are not handled;
- broader conversation request/unread/navigation isolation remains #23; the compose draft and send keep their original destination, and post refresh ignores a response for another active thread;
- reschedule/delete routes have no client controls, and media loading/error/processing recovery is unfinished;
- the thread is an unbounded ScrollView with manual refresh and its composer below the history.

These source-inspection findings are planned work, not claimed runtime test results.

## Session storage

Native Android/iOS stores the raw bearer session token using `expo-secure-store`; the API stores only the SHA-256 hash of the token.

Web deliberately uses `sessionStorage`, not persistent `localStorage`, for the V1 bearer token. Closing the browser/tab can therefore require login again. A future hardened web-cookie model can improve that without changing native authentication.

Never place `POLO_REGISTRATION_SECRET` or an Immich API key in Expo build-time environment/config.

## Media authorization

The client does not receive another user's Immich credential. Existing-library thumbnails are available only for the current user's own stored connection. Once media is posted, recipients request it using Polo `postId + postAssetId`; Polo authorizes thread visibility first and resolves the exact Immich connection/asset server-side.

Native video sources send the Polo bearer token as a request header so seeking continues to use the authorized Polo proxy. Real Range behavior still requires #12 plus the public nginx/device test.

The web/PWA media surface is secondary. Browser-native media elements cannot always attach the same custom Authorization headers as Android/iOS playback; do not claim parity until the web path is verified or replaced with a short-lived signed-media URL/cookie design.

## Composition

The current composer uses one shared review flow for **Immich**, **Phone**, and
**Record**. Selecting/recording media creates a draft without publishing or
uploading. Existing media previews its authenticated picker thumbnail; local
images/videos preview from the selected URI (local videos have playback controls).
The review shows the destination and source, caption, delay in minutes, and a
local date/time/timezone preview before explicit **Send Polo** / **Schedule Polo**.
Source buttons change media; Remove keeps caption/schedule; Cancel drops the
unsubmitted draft. Phone and camera captions are forwarded. Invalid optional
capture dates are ignored; ISO dates and the standard EXIF date format are parsed.

Confirmation freezes a UUID send identity, source/file identity, destination,
caption, and absolute publication instant. Double taps cannot start a second
request. Checking / Uploading / Preparing / Sent / Failed states are separate
from the ordinary busy flag. Upload percentage is shown when the native/browser
transport supplies computable byte progress; it is never simulated. Preparing
starts after the upload body finishes transfer, while awaiting the API result.

A failed/ambiguous request keeps its draft. **Check & retry** first asks the server
for that logical send; an existing result is acknowledged without resending.
A checkpointed upload resumes metadata preparation without uploading the file
again. Retry otherwise uses the same ID and frozen input. After an attempt,
editing is locked until reconciliation. **Check & discard draft** atomically
cancels an unsent/expired send, refuses a live send, or acknowledges a completed
post without deleting it. Cancelling a draft never deletes Immich media.
Success clears the draft only after a server result is known; a subsequent thread
refresh failure reports that sending succeeded and offers ordinary refresh.

The draft retains its original destination while navigating between conversations;
a different conversation offers **Return to draft** instead of silently moving
it. Drafts/retry identities are kept in memory for this foreground MVP. Keep Polo
open while uploading/recovering; force-killing/reinstalling the client is not yet
a durable draft-recovery feature. No permanent duplicate original is stored by
Polo. Device URI survival across app kill and real Immich upload/deduplication
still require #13/#14. Wider chronology/unread/player/session recovery stays #23.

The delay control remains a first-slice schedule UI. A calendar/date-time picker
can follow without changing the server's absolute-instant scheduling contract.
Client state/wire-format regression tests run in `npm run check`; those tests and
web export do not substitute for physical APK acceptance (#14/#20/#19).

## Runtime configuration

- `EXPO_PUBLIC_POLO_API_URL` — public HTTPS Polo API origin.
- `EXPO_PUBLIC_DEFAULT_IMMICH_URL` — optional connection-form default. For the Archimedes-targeted build this may be `http://127.0.0.1:2283`; the value is consumed by the Polo server after submission, not contacted directly by the phone.

Physical Android evidence belongs in #14/#20; the full two-phone product gate is #19.
