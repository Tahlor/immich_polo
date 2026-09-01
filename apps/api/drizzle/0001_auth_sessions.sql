ALTER TABLE `users` ADD COLUMN `password_hash` text;

CREATE TABLE `auth_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `last_used_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `auth_sessions_token_hash_uq` ON `auth_sessions` (`token_hash`);
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`expires_at`);
