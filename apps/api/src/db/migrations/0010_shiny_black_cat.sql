CREATE TABLE `ao3track__user_saved_search` (
	`userId` varchar(36) NOT NULL,
	`id` varchar(36) NOT NULL,
	`name` varchar(191) NOT NULL,
	`url` varchar(8192) NOT NULL,
	`deleted` boolean NOT NULL DEFAULT false,
	`updatedAt` datetime NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON
        UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT `ao3track__user_saved_search_userId_id_pk` PRIMARY KEY(`userId`,`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_user_saved_search_user_updatedAt` ON `ao3track__user_saved_search` (`userId`,`updatedAt`);