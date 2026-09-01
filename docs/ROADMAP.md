# Implementation roadmap

The GitHub issues are the executable backlog. This file records intended dependency/order so agents do not treat all open issues as equally ready.

## Phase 0 — prove assumptions and establish the workspace

### #1 — Immich v3 integration contract

Highest technical priority. Prove real upload/list/thumbnail/video-range behavior, least-privilege permissions, duplicate semantics, deletion behavior, and version handling against an actual Immich server.

### #2 — TypeScript monorepo bootstrap

Can proceed in parallel with #1 as long as it does not hard-code unverified Immich endpoint behavior.

**Exit condition:** the workspace is runnable and the Immich boundary is based on observed behavior rather than guesses.

## Phase 1 — first complete posting slice

### #3 — core schema, accounts, threads, authorization

Build this before exposing recipient media routes. Authorization is structural, not a later hardening pass.

### #4 — existing Immich media picker + posting

This is the distinctive product feature and should land early. A years-old asset should become a post without a media copy.

### #5 — local/recorded media upload to Immich

Use the same post model as #4, but first upload to Immich and then reference the returned canonical asset.

**Exit condition:** two users can exchange posts backed by both old Immich media and new local media.

## Phase 2 — safe media consumption

### #6 — authorized thumbnails/video streaming

Recipient access must begin from Polo thread/post authorization, not arbitrary Immich IDs. Preserve video byte-range seeking.

**Exit condition:** the other participant can actually watch media smoothly without receiving broad Immich access.

## Phase 3 — Marco-Polo behavior

### #7 — durable scheduling

Upload media immediately but keep the Polo post server-hidden until `visible_at`. Publication survives process restarts and is idempotent.

### #8 — continuous thread + watch/unread state

Make the stream conversational: clear unread media, resume/watch state, easy sequential consumption, sender-only scheduled entries.

**Exit condition:** the app behaves like an asynchronous video conversation rather than a media browser.

## Phase 4 — shippable V1

### #9 — push notifications

Notify on publication only, including scheduled publication, through a replaceable push-provider abstraction.

### #10 — self-hosted deployment + full end-to-end proof

Package the app beside Immich and execute the complete V1 acceptance scenario on real infrastructure and required platforms.

## Dependency summary

```text
#1 Immich contract -----+------> #4 existing assets ---+
                       |                              |
#2 bootstrap -----------+--> #3 auth/schema ----------+--> #6 media delivery --> #8 thread/watch --+
                       |                              |                                      |
                       +-----------------------------> #5 local upload ---------------------+--> #10 V1 proof
                                                                                           |
#3 + #4/#5 + #6 ----------------------------------------------------------------> #7 schedule --> #9 push --+
```

Some work may overlap, but do not let UI progress bypass the authorization and real-Immich contract requirements.

## After V1

Only after #10 is genuinely passing, prioritize from observed use rather than speculative feature breadth. Likely candidates include:

- robust background/resumable mobile upload;
- group-thread UI polish;
- reactions and explicit replies;
- richer Immich picker search/albums/semantic search;
- captions/transcription;
- optional voice-only messages;
- migration/import tooling;
- stronger offline support.

Do not add separate permanent media storage as a shortcut for any of these.
