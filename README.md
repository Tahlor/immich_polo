# Immich Polo

A private, self-hosted, Marco-Polo-style asynchronous video/photo conversation app built on top of an existing [Immich](https://immich.app/) server.

## Core idea

**Immich owns media. Immich Polo owns conversation semantics.**

Immich Polo does not create a second photo/video library. Every posted photo or video is represented by an Immich asset ID plus Polo metadata such as thread, author, order, caption, visibility time, and watch state.

This gives us a conversational layer over the user's complete Immich history while keeping storage, deduplication, thumbnails, transcoding, metadata, and long-term media management in Immich.

## V1 product goals

A user can:

- create a 1:1 conversation;
- record or pick a local photo/video and post it;
- pick **any existing Immich photo/video**, including old media, and post it without copying it;
- see a continuous chronological thread of posts from both people;
- play video naturally and move through unread posts;
- schedule a post to become visible at a future time;
- edit, reschedule, or cancel a scheduled post before publication;
- see watched/unwatched state;
- receive a notification when a new post becomes visible.

Local media selected in Polo is uploaded to Immich first. Polo then creates a post referencing the resulting Immich asset. Scheduled media is also uploaded immediately; only the Polo post is delayed.

## Non-goals for V1

- Replacing or forking the Immich UI.
- Maintaining duplicate media storage.
- Building our own transcoding or thumbnail pipeline.
- Using Immich albums as conversations.
- End-to-end encrypted media independent of Immich.
- Rich social-network features.
- Complex group administration.
- Perfect background/resumable uploads on every platform before the core flow works.

## Architecture at a glance

```text
Mobile / web client
        |
        v
Immich Polo API
  - auth / users
  - threads / membership
  - posts / scheduling
  - watch state
  - notifications
  - Immich credential + API broker
        |
        v
      Immich
  - original media
  - thumbnails
  - video transcoding
  - metadata
  - deduplication
```

The client never needs a broad Immich API key. The Polo server authorizes thread access and brokers the minimum Immich operations needed for the signed-in user.

## Planned stack

Keep the system small and self-hostable:

- **Client:** Expo / React Native + Expo Router, with web/PWA support where practical.
- **API:** TypeScript + Fastify.
- **Database:** SQLite + Drizzle for V1. The expected family/small-group workload does not justify Postgres or Redis initially.
- **Scheduling:** durable database state plus a small server worker; no Redis queue required initially.
- **Notifications:** Expo push notifications initially, behind an interface so native providers can replace it later.
- **Deployment:** Docker Compose, designed to run next to (not inside) an Immich deployment.

See [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Product invariant

A published Polo media post must always be traceable to exactly one canonical Immich asset. If Polo metadata disappears, the original photo/video still exists in Immich. If an Immich asset is removed, Polo should show a clear missing-media state rather than silently creating another copy.

## Development workflow

`master` is the normal development branch. Make small, verified commits directly to `master` unless a feature branch is explicitly requested. Temporary branches must be deleted after merge.
