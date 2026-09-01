PRAGMA foreign_keys = ON;

CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `display_name` text NOT NULL,
  `auth_subject` text NOT NULL,
  `notification_enabled` integer DEFAULT true NOT NULL,
  `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `users_auth_subject_uq` ON `users` (`auth_subject`);

CREATE TABLE `immich_connections` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `base_url` text NOT NULL,
  `credential_ciphertext` text NOT NULL,
  `immich_user_id` text,
  `server_version` text,
  `last_verified_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `immich_connections_user_idx` ON `immich_connections` (`user_id`);

CREATE TABLE `threads` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text,
  `created_at` integer NOT NULL
);

CREATE TABLE `thread_members` (
  `thread_id` text NOT NULL,
  `user_id` text NOT NULL,
  `joined_at` integer NOT NULL,
  `last_read_at` integer,
  PRIMARY KEY (`thread_id`, `user_id`),
  FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `thread_members_user_idx` ON `thread_members` (`user_id`);

CREATE TABLE `posts` (
  `id` text PRIMARY KEY NOT NULL,
  `thread_id` text NOT NULL,
  `author_id` text NOT NULL,
  `reply_to_post_id` text,
  `caption` text,
  `status` text NOT NULL,
  `created_at` integer NOT NULL,
  `visible_at` integer NOT NULL,
  `published_at` integer,
  FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE INDEX `posts_thread_visible_idx` ON `posts` (`thread_id`, `status`, `visible_at`);
CREATE INDEX `posts_author_idx` ON `posts` (`author_id`);

CREATE TABLE `post_assets` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL,
  `position` integer NOT NULL,
  `immich_connection_id` text NOT NULL,
  `immich_asset_id` text NOT NULL,
  `media_type` text NOT NULL,
  `width` integer,
  `height` integer,
  `duration_ms` integer,
  `captured_at` integer,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`immich_connection_id`) REFERENCES `immich_connections`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE UNIQUE INDEX `post_assets_position_uq` ON `post_assets` (`post_id`, `position`);
CREATE INDEX `post_assets_immich_idx` ON `post_assets` (`immich_connection_id`, `immich_asset_id`);

CREATE TABLE `post_views` (
  `post_id` text NOT NULL,
  `user_id` text NOT NULL,
  `first_seen_at` integer NOT NULL,
  `watched_at` integer,
  `playback_position_ms` integer,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`post_id`, `user_id`),
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `push_registrations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `token` text NOT NULL,
  `platform` text NOT NULL,
  `updated_at` integer NOT NULL,
  `invalidated_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `push_registrations_token_uq` ON `push_registrations` (`provider`, `token`);
CREATE INDEX `push_registrations_user_idx` ON `push_registrations` (`user_id`);
