CREATE TABLE `travel_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`namespace` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `travel_users_namespace_unique` ON `travel_users` (`namespace`);--> statement-breakpoint
CREATE TABLE `travel_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`state_json` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`last_operation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `travel_members` (
	`plan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`plan_id`, `user_id`),
	FOREIGN KEY (`plan_id`) REFERENCES `travel_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `travel_users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `travel_operations` (
	`user_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`result_json` text NOT NULL,
	PRIMARY KEY(`user_id`, `operation_id`)
);
--> statement-breakpoint
CREATE TABLE `travel_versions` (
	`plan_id` text NOT NULL,
	`revision` integer NOT NULL,
	`state_json` text NOT NULL,
	`saved_at` text NOT NULL,
	PRIMARY KEY(`plan_id`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `travel_invites` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_by` text,
	FOREIGN KEY (`plan_id`) REFERENCES `travel_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
