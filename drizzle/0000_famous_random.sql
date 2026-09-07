CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`counterparty` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'PEN' NOT NULL,
	`category` text DEFAULT 'Otros' NOT NULL,
	`transaction_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_external_id_unique` ON `transactions` (`external_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `idx_transactions_type_date` ON `transactions` (`type`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `idx_transactions_category_date` ON `transactions` (`category`,`transaction_date`);