ALTER TABLE `ao3track__auth_two_factor` ADD `verified` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `ao3track__auth_two_factor` ADD `failedVerificationCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `ao3track__auth_two_factor` ADD `lockedUntil` datetime(3);