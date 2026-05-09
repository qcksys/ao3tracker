ALTER TABLE `ao3track__work` MODIFY COLUMN `hits` int unsigned NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `ao3track__work` MODIFY COLUMN `bookmarks` int unsigned NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `ao3track__work` MODIFY COLUMN `comments` int unsigned NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `ao3track__work` ADD `kudos` int unsigned DEFAULT 0 NOT NULL;