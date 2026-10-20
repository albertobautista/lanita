CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`color` text NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bank_statements` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`period` text NOT NULL,
	`no_interest_payment` integer NOT NULL,
	`minimum_payment` integer,
	`notes` text DEFAULT '' NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_statements_card_period` ON `bank_statements` (`card_id`,`period`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_category_unique` ON `budgets` (`category`);--> statement-breakpoint
CREATE TABLE `card_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`period` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`account_id` text,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_payments_card_period` ON `card_payments` (`card_id`,`period`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`bank` text DEFAULT '' NOT NULL,
	`last4` text DEFAULT '' NOT NULL,
	`credit_limit` integer NOT NULL,
	`cutoff_day` integer NOT NULL,
	`due_day` integer NOT NULL,
	`color` text NOT NULL,
	`min_pct_balance` integer DEFAULT 150 NOT NULL,
	`min_pct_limit` integer DEFAULT 125 NOT NULL,
	`annual_rate` integer DEFAULT 0 NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`account_id` text,
	`is_sample` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target` integer NOT NULL,
	`target_date` text,
	`color` text NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`description` text NOT NULL,
	`category` text DEFAULT 'Otros' NOT NULL,
	`amount` integer NOT NULL,
	`months` integer NOT NULL,
	`date` text NOT NULL,
	`annual_rate` integer DEFAULT 0 NOT NULL,
	`with_vat` integer DEFAULT true NOT NULL,
	`settled_period` text,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchases_card` ON `purchases` (`card_id`);--> statement-breakpoint
CREATE TABLE `recurring` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`is_subscription` integer DEFAULT false NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`day` integer NOT NULL,
	`yearly_month` integer,
	`account_id` text,
	`card_id` text,
	`start_period` text NOT NULL,
	`end_period` text,
	`canceled_on` text,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recurring_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`recurring_id` text NOT NULL,
	`start_period` text NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_per_period` ON `recurring_prices` (`recurring_id`,`start_period`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`category` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`account_id` text,
	`card_id` text,
	`recurring_id` text,
	`period` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transactions_date` ON `transactions` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_recurring_period` ON `transactions` (`recurring_id`,`period`);--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
