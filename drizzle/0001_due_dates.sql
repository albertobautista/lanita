CREATE TABLE `due_dates` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`period` text NOT NULL,
	`due_date` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `due_dates_card_period` ON `due_dates` (`card_id`,`period`);