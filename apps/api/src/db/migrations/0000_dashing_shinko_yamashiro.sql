CREATE TABLE `ao3track__auth_account` (
	`id` varchar(36) NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` varchar(36) NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` timestamp,
	`refreshTokenExpiresAt` timestamp,
	`scope` text,
	`password` text,
	`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ao3track__auth_account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__auth_passkey` (
	`id` varchar(36) NOT NULL,
	`name` text,
	`publicKey` text NOT NULL,
	`userId` varchar(36) NOT NULL,
	`credentialID` varchar(255) NOT NULL,
	`counter` int NOT NULL,
	`deviceType` text NOT NULL,
	`backedUp` boolean NOT NULL,
	`transports` text,
	`createdAt` datetime,
	`aaguid` text,
	CONSTRAINT `ao3track__auth_passkey_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__auth_session` (
	`id` varchar(36) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`token` varchar(255) NOT NULL,
	`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`ipAddress` text,
	`userAgent` text,
	`userId` varchar(36) NOT NULL,
	CONSTRAINT `ao3track__auth_session_id` PRIMARY KEY(`id`),
	CONSTRAINT `ao3track__auth_session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__auth_two_factor` (
	`id` varchar(36) NOT NULL,
	`secret` varchar(255) NOT NULL,
	`backupCodes` text NOT NULL,
	`userId` varchar(36) NOT NULL,
	CONSTRAINT `ao3track__auth_two_factor_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__auth_user` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`emailVerified` boolean NOT NULL DEFAULT false,
	`image` text,
	`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`two_factor_enabled` boolean DEFAULT false,
	CONSTRAINT `ao3track__auth_user_id` PRIMARY KEY(`id`),
	CONSTRAINT `ao3track__auth_user_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__auth_verification` (
	`id` varchar(36) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expiresAt` timestamp(3) NOT NULL,
	`createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ao3track__auth_verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__track_chapter` (
	`userId` varchar(36) NOT NULL,
	`workId` int unsigned NOT NULL,
	`chapterId` int unsigned NOT NULL,
	`lastReadAt` datetime NOT NULL,
	`markedCompleteAt` datetime,
	`readProgress` float unsigned NOT NULL DEFAULT 0,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT `ao3track__track_chapter_userId_workId_chapterId_pk` PRIMARY KEY(`userId`,`workId`,`chapterId`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__track_work` (
	`userId` varchar(36) NOT NULL,
	`workId` int unsigned NOT NULL,
	`lastReadAt` datetime NOT NULL,
	`markedCompleteAt` datetime,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT `ao3track__track_work_userId_workId_pk` PRIMARY KEY(`userId`,`workId`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__work_backup` (
	`r2Key` varchar(512) NOT NULL,
	`workId` int unsigned NOT NULL,
	`format` enum('html','pdf','mobi','epub','azw3') NOT NULL,
	`fileSize` bigint unsigned NOT NULL,
	`ao3UpdatedAt` datetime,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT `ao3track__work_backup_r2Key` PRIMARY KEY(`r2Key`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__work_chapter` (
	`id` int unsigned NOT NULL,
	`workId` int unsigned NOT NULL,
	`number` int unsigned,
	`title` varchar(255),
	`dateUpdated` datetime,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT `ao3track__work_chapter_id_workId_pk` PRIMARY KEY(`id`,`workId`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__work_tag_link` (
	`tag` int unsigned NOT NULL,
	`work` int unsigned NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ao3track__work_tag_link_tag_work_pk` PRIMARY KEY(`tag`,`work`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__work_tag` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`tag` varchar(255) NOT NULL,
	`href` varchar(255) NOT NULL,
	`typeId` int unsigned NOT NULL,
	CONSTRAINT `ao3track__work_tag_id` PRIMARY KEY(`id`),
	CONSTRAINT `ao3track__work_tag_tag_unique` UNIQUE(`tag`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__work` (
	`id` int unsigned NOT NULL,
	`title` varchar(255) NOT NULL,
	`author` varchar(255) NOT NULL,
	`authorUrl` varchar(255),
	`summary` text,
	`language` varchar(50) NOT NULL,
	`wordCount` int unsigned NOT NULL,
	`currentChapters` int unsigned NOT NULL,
	`totalChapters` int unsigned,
	`hits` int unsigned NOT NULL,
	`bookmarks` int unsigned NOT NULL,
	`comments` int unsigned NOT NULL,
	`published` datetime NOT NULL,
	`lastUpdated` datetime NOT NULL,
	`lastRefreshed` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT `ao3track__work_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `ao3track__auth_account` (`userId`);--> statement-breakpoint
CREATE INDEX `passkey_userId_idx` ON `ao3track__auth_passkey` (`userId`);--> statement-breakpoint
CREATE INDEX `passkey_credentialID_idx` ON `ao3track__auth_passkey` (`credentialID`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `ao3track__auth_session` (`userId`);--> statement-breakpoint
CREATE INDEX `twoFactor_secret_idx` ON `ao3track__auth_two_factor` (`secret`);--> statement-breakpoint
CREATE INDEX `twoFactor_userId_idx` ON `ao3track__auth_two_factor` (`userId`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `ao3track__auth_verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `idx_track_chapter_rowCreatedAt` ON `ao3track__track_chapter` (`rowCreatedAt`);--> statement-breakpoint
CREATE INDEX `idx_track_chapter_rowUpdatedAt` ON `ao3track__track_chapter` (`rowUpdatedAt`);--> statement-breakpoint
CREATE INDEX `idx_track_chapter_rowDeletedAt` ON `ao3track__track_chapter` (`rowDeletedAt`);--> statement-breakpoint
CREATE INDEX `idx_track_work_rowCreatedAt` ON `ao3track__track_work` (`rowCreatedAt`);--> statement-breakpoint
CREATE INDEX `idx_track_work_rowUpdatedAt` ON `ao3track__track_work` (`rowUpdatedAt`);--> statement-breakpoint
CREATE INDEX `idx_track_work_rowDeletedAt` ON `ao3track__track_work` (`rowDeletedAt`);--> statement-breakpoint
CREATE INDEX `idx_work_backup_workId` ON `ao3track__work_backup` (`workId`);--> statement-breakpoint
CREATE INDEX `idx_work_backup_format` ON `ao3track__work_backup` (`workId`,`format`);--> statement-breakpoint
CREATE INDEX `idx_work_backup_rowCreatedAt` ON `ao3track__work_backup` (`rowCreatedAt`);--> statement-breakpoint
CREATE INDEX `idx_work_backup_rowDeletedAt` ON `ao3track__work_backup` (`rowDeletedAt`);--> statement-breakpoint
CREATE INDEX `idx_chapters_rowCreatedAt` ON `ao3track__work_chapter` (`rowCreatedAt`);--> statement-breakpoint
CREATE INDEX `idx_chapters_rowUpdatedAt` ON `ao3track__work_chapter` (`rowUpdatedAt`);--> statement-breakpoint
CREATE INDEX `idx_chapters_rowDeletedAt` ON `ao3track__work_chapter` (`rowDeletedAt`);--> statement-breakpoint
CREATE INDEX `idx_tags_rowCreatedAt` ON `ao3track__work_tag_link` (`rowCreatedAt`);--> statement-breakpoint
CREATE INDEX `idx_tags_typeId` ON `ao3track__work_tag` (`typeId`);--> statement-breakpoint
CREATE INDEX `idx_works_title` ON `ao3track__work` (`title`);--> statement-breakpoint
CREATE INDEX `idx_works_author` ON `ao3track__work` (`author`);--> statement-breakpoint
CREATE INDEX `idx_works_language` ON `ao3track__work` (`language`);--> statement-breakpoint
CREATE INDEX `idx_works_wordCount` ON `ao3track__work` (`wordCount`);--> statement-breakpoint
CREATE INDEX `idx_works_published` ON `ao3track__work` (`published`);--> statement-breakpoint
CREATE INDEX `idx_works_lastUpdated` ON `ao3track__work` (`lastUpdated`);--> statement-breakpoint
CREATE INDEX `idx_works_rowCreatedAt` ON `ao3track__work` (`rowCreatedAt`);--> statement-breakpoint
CREATE INDEX `idx_works_rowUpdatedAt` ON `ao3track__work` (`rowUpdatedAt`);--> statement-breakpoint
CREATE INDEX `idx_works_rowDeletedAt` ON `ao3track__work` (`rowDeletedAt`);