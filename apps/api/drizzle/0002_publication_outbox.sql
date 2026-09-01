CREATE TABLE `notification_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL,
  `event_key` text NOT NULL,
  `event_type` text NOT NULL,
  `created_at` integer NOT NULL,
  `delivered_at` integer,
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_error` text,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `notification_outbox_post_uq` ON `notification_outbox` (`post_id`);
CREATE UNIQUE INDEX `notification_outbox_event_key_uq` ON `notification_outbox` (`event_key`);
CREATE INDEX `notification_outbox_pending_idx` ON `notification_outbox` (`delivered_at`, `created_at`);
