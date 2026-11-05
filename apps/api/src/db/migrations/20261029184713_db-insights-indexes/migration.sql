DROP INDEX `idx_notification_userId` ON `ao3track__notification`;--> statement-breakpoint
DROP INDEX `idx_push_token_userId` ON `ao3track__push_token`;--> statement-breakpoint
CREATE INDEX `idx_track_chapter_work_chapter` ON `ao3track__track_chapter` (`workId`,`chapterId`);--> statement-breakpoint
CREATE INDEX `idx_chapters_workId_number` ON `ao3track__work_chapter` (`workId`,`number`);--> statement-breakpoint
CREATE INDEX `idx_tags_work` ON `ao3track__work_tag_link` (`work`);