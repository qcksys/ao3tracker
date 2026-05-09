CREATE TABLE `ao3track__notification` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` varchar(36) NOT NULL,
	`workId` int unsigned NOT NULL,
	`type` enum('new_chapters','work_completed','work_restricted','work_deleted') NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`payload` text,
	`sentAt` datetime,
	`fcmMessageId` varchar(255),
	`errorMessage` text,
	`retryCount` int unsigned NOT NULL DEFAULT 0,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON
        UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT `ao3track__notification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__push_token` (
	`userId` varchar(36) NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`token` varchar(512) NOT NULL,
	`platform` varchar(16) NOT NULL DEFAULT 'android',
	`lastValidatedAt` datetime NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON
        UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT `ao3track__push_token_userId_deviceId_pk` PRIMARY KEY(`userId`,`deviceId`)
);
--> statement-breakpoint
ALTER TABLE `ao3track__track_chapter` MODIFY COLUMN `rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON
        UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `ao3track__track_work` MODIFY COLUMN `rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON
        UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `ao3track__work_backup` MODIFY COLUMN `rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON
        UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `ao3track__work_chapter` MODIFY COLUMN `rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON
        UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `ao3track__work` MODIFY COLUMN `rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON
        UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `ao3track__track_work` ADD `subscribed` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `ao3track__track_work` ADD `favourite` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_notification_userId` ON `ao3track__notification` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_notification_workId` ON `ao3track__notification` (`workId`);--> statement-breakpoint
CREATE INDEX `idx_notification_status` ON `ao3track__notification` (`status`);--> statement-breakpoint
CREATE INDEX `idx_notification_type` ON `ao3track__notification` (`type`);--> statement-breakpoint
CREATE INDEX `idx_notification_user_status` ON `ao3track__notification` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_notification_rowCreatedAt` ON `ao3track__notification` (`rowCreatedAt`);--> statement-breakpoint
CREATE INDEX `idx_push_token_token` ON `ao3track__push_token` (`token`);--> statement-breakpoint
CREATE INDEX `idx_push_token_userId` ON `ao3track__push_token` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_push_token_rowDeletedAt` ON `ao3track__push_token` (`rowDeletedAt`);--> statement-breakpoint
CREATE INDEX `idx_track_work_subscribed` ON `ao3track__track_work` (`subscribed`);--> statement-breakpoint
CREATE INDEX `idx_track_work_favourite` ON `ao3track__track_work` (`favourite`);