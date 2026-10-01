CREATE TABLE `ao3track__user_favourite_tag` (
	`userId` varchar(36) NOT NULL,
	`tagType` int unsigned NOT NULL,
	`tag` varchar(191) NOT NULL,
	`favourited` boolean NOT NULL DEFAULT true,
	`updatedAt` datetime NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON
        UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT `ao3track__user_favourite_tag_userId_tagType_tag_pk` PRIMARY KEY(`userId`,`tagType`,`tag`)
);
--> statement-breakpoint
CREATE INDEX `idx_user_favourite_tag_user_updatedAt` ON `ao3track__user_favourite_tag` (`userId`,`updatedAt`);