CREATE TABLE IF NOT EXISTS `ignored_external_transactions` (
	`external_id` text PRIMARY KEY NOT NULL,
	`ignored_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
