# Next moves

This is a short execution view. The detailed acceptance contract is [`M1_TWO_PHONE_VERTICAL_SLICE.md`](M1_TWO_PHONE_VERTICAL_SLICE.md).

## Now — unblock the real media loop

Run in parallel:

1. **Archimedes Immich evidence (#11-#13)**
   - exact v3 version;
   - minimum API-key permissions;
   - metadata search pagination;
   - picker thumbnails/previews;
   - video byte ranges;
   - upload/deduplication/processing readiness.
2. **Archimedes Polo deployment (#18)**
   - local SQLite;
   - systemd loopback service;
   - public HTTPS API origin;
   - local `127.0.0.1:2283` Immich connection;
   - streaming-safe nginx.
3. **Cloud implementation**
   - keep the official-v3 provider aligned to current OpenAPI and local evidence;
   - keep Android media UX/build green;
   - fix CI before declaring a SHA ready for physical testing.

## Immediately after #11-#13 pass

1. Set the Archimedes Polo environment to `IMMICH_PROVIDER=official-v3`.
2. Connect a real permission-scoped Immich key through Polo using `http://127.0.0.1:2283` as the connection base URL.
3. Run existing-media picker/post/play/seek through Polo.
4. Run phone-gallery and camera upload through Polo and verify the returned canonical asset exists normally in Immich.
5. Verify a second Polo user cannot browse the first user's library or prefetch a scheduled post.

## Android release gate

1. Build the `preview` APK profile with production `EXPO_PUBLIC_POLO_API_URL`.
2. Install the same artifact on two physical Android phones.
3. Execute #14 plus the two-phone milestone.
4. Publish/copy the verified APK into the existing phone APK distribution flow only after its SHA/server compatibility is recorded.

## Then

1. Finish push notifications/deep linking (#9).
2. Replace manual household-secret registration for invitees with short-lived one-time invite codes/links.
3. Polish unread continuous playback and upload progress/retry.
4. Only then finish generalized Docker/self-host packaging (#10) around the behavior already proven on Archimedes.

## Stop conditions

Do not work around a failed Immich call by guessing a different endpoint or broadening permissions. Capture the first failed transition in #11-#13 and fix the adapter against evidence.

Do not call Expo Go proof of a standalone Android build. Do not call API unit tests proof of the real Immich deployment. Do not call a successful upload proof of canonical persistence until Immich itself can retrieve the returned asset after processing/restart as required by the local test.
