import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    authSubject: text("auth_subject").notNull(),
    notificationEnabled: integer("notification_enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [uniqueIndex("users_auth_subject_uq").on(table.authSubject)],
);

export const immichConnections = sqliteTable(
  "immich_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    baseUrl: text("base_url").notNull(),
    credentialCiphertext: text("credential_ciphertext").notNull(),
    immichUserId: text("immich_user_id"),
    serverVersion: text("server_version"),
    lastVerifiedAt: timestamp("last_verified_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("immich_connections_user_idx").on(table.userId)],
);

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  title: text("title"),
  createdAt: timestamp("created_at").notNull(),
});

export const threadMembers = sqliteTable(
  "thread_members",
  {
    threadId: text("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").notNull(),
    lastReadAt: timestamp("last_read_at"),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.userId] }),
    index("thread_members_user_idx").on(table.userId),
  ],
);

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    replyToPostId: text("reply_to_post_id"),
    caption: text("caption"),
    status: text("status", { enum: ["scheduled", "published", "cancelled", "failed"] }).notNull(),
    createdAt: timestamp("created_at").notNull(),
    visibleAt: timestamp("visible_at").notNull(),
    publishedAt: timestamp("published_at"),
  },
  (table) => [
    index("posts_thread_visible_idx").on(table.threadId, table.status, table.visibleAt),
    index("posts_author_idx").on(table.authorId),
  ],
);

export const postAssets = sqliteTable(
  "post_assets",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    immichConnectionId: text("immich_connection_id").notNull().references(() => immichConnections.id, { onDelete: "restrict" }),
    immichAssetId: text("immich_asset_id").notNull(),
    mediaType: text("media_type", { enum: ["image", "video"] }).notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    capturedAt: timestamp("captured_at"),
  },
  (table) => [
    uniqueIndex("post_assets_position_uq").on(table.postId, table.position),
    index("post_assets_immich_idx").on(table.immichConnectionId, table.immichAssetId),
  ],
);

export const postViews = sqliteTable(
  "post_views",
  {
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    firstSeenAt: timestamp("first_seen_at").notNull(),
    watchedAt: timestamp("watched_at"),
    playbackPositionMs: integer("playback_position_ms"),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })],
);

export const pushRegistrations = sqliteTable(
  "push_registrations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    token: text("token").notNull(),
    platform: text("platform").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    invalidatedAt: timestamp("invalidated_at"),
  },
  (table) => [
    uniqueIndex("push_registrations_token_uq").on(table.provider, table.token),
    index("push_registrations_user_idx").on(table.userId),
  ],
);
