# Next moves

This is a short execution view. The first runtime acceptance contract is [`M1_TWO_PHONE_VERTICAL_SLICE.md`](M1_TWO_PHONE_VERTICAL_SLICE.md); the complete household UX finish plan is [`MVP_FINISH_PLAN.md`](MVP_FINISH_PLAN.md).

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
3. **Provider-independent client correctness**
   - preserve sessions on network failures and handle refresh errors;
   - isolate requests/drafts when switching conversations;
   - add preview + explicit Send for all media sources; retain local captions and tolerate invalid optional capture metadata;
   - round-trip existing watch state and fix publication chronology;
   - fix provider mismatches only against #11–#13 evidence; keep CI green before physical testing.

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

## Then — finish the household product

1. Make conversations the home screen: visible activity/unread, publication ordering, resume/Next, bounded timeline and foreground refresh (#8).
2. Finish practical old-media selection, upload feedback/retry, missing/processing-media recovery and in-app schedule/delete controls (#4–#8).
3. Finish push/deep links (#9), single-use invites (#21), guided Immich setup/reconnect and basic account recovery.
4. Execute the [household acceptance script](MVP_FINISH_PLAN.md#household-acceptance-script), including offline recovery, one backup restore and APK upgrade; roll out first to 2–3 testers, then the household.
5. Keep generic Docker/self-host packaging (#10) and unneeded platform parity outside this intermediate release. Track broader V1 work honestly; do not call it completed.

## Stop conditions

Do not work around a failed Immich call by guessing a different endpoint or broadening permissions. Capture the first failed transition in #11-#13 and fix the adapter against evidence.

Do not call Expo Go proof of a standalone Android build. Do not call API unit tests proof of the real Immich deployment. Do not call a successful upload proof of canonical persistence until Immich itself can retrieve the returned asset after processing/restart as required by the local test.
