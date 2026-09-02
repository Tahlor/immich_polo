# Android client

See also: [`Two-phone milestone`](M1_TWO_PHONE_VERTICAL_SLICE.md) · [`Client behavior`](CLIENT.md) · [`Archimedes deployment`](DEPLOYMENT_ARCHIMEDES.md)

Android is the primary V1 client surface. The product must be installable as a standalone app; Expo Go is development tooling, not the release experience.

## Identity

- Expo app name: `Immich Polo`
- Scheme: `immichpolo://`
- Android package: `com.taylorarchibald.immichpolo`
- iOS bundle identifier: `com.taylorarchibald.immichpolo`

## Runtime configuration

The standalone build needs:

- `EXPO_PUBLIC_POLO_API_URL`: public HTTPS origin for the Polo API, e.g. the Archimedes Polo hostname.
- `EXPO_PUBLIC_DEFAULT_IMMICH_URL` (optional): value prefilled into Immich connection setup. On the Archimedes deployment this can be `http://127.0.0.1:2283` because the value is consumed server-side by Polo; the Android device itself never calls that loopback address.

Neither value is a secret. Never compile the household registration secret or an Immich API key into the app.

## Standalone APK

`apps/client/eas.json` contains a `preview` profile whose Android build type is `apk`. From `apps/client`, an authenticated EAS environment can build it with:

```bash
npx eas-cli build --platform android --profile preview
```

If EAS credentials/project setup is unavailable on the runtime host, the local agent may use Expo's generated native Android project/local Gradle path, but must document the exact commands and resulting artifact. Do not call an Expo Go launch a standalone APK test.

## Media behavior

The client now has application paths for:

- permission-scoped Immich connection setup;
- existing Immich asset browsing with Polo-authorized thumbnails;
- posting an existing asset;
- choosing phone photos/videos;
- camera video capture;
- streamed upload into the user's connected Immich account;
- image rendering and authenticated video playback through Polo;
- video seeking with bearer-authenticated requests;
- server watch-position updates;
- immediate or delay-in-minutes scheduled posting.

The exact underlying Immich behavior remains subject to runtime validation in #11-#13 before `IMMICH_PROVIDER=official-v3` is enabled in production.

## Physical-device acceptance

Issue #14 is the authoritative physical Android evidence ticket, while #20 owns the distributable APK artifact. Together they must eventually include:

1. clean APK install;
2. account login and SecureStore session restoration after process/app restart;
3. Immich connection against Archimedes;
4. older Immich asset browse/post/play/seek;
5. local gallery upload;
6. camera-recorded video upload;
7. server restart/recovery;
8. notification/deep-link behavior when #9 lands;
9. upgrade install over the previous APK without losing the Polo session unless intentionally invalidated.

Use exact APK/app version and deployed server SHA in evidence. The full two-phone acceptance gate is #19.
