ALTER TABLE `ao3track__track_work` ADD `private` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_track_chapter_lastReadAt` ON `ao3track__track_chapter` (`lastReadAt`);--> statement-breakpoint
CREATE INDEX `idx_track_work_lastReadAt` ON `ao3track__track_work` (`lastReadAt`);--> statement-breakpoint
CREATE INDEX `idx_track_work_private` ON `ao3track__track_work` (`private`);