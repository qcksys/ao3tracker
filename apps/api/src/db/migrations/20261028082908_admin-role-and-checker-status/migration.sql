CREATE TABLE `ao3track__work_checker_status` (
	`checkerId` varchar(64) PRIMARY KEY,
	`status` json NOT NULL,
	`reportedAt` datetime(3) NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime
);
--> statement-breakpoint
ALTER TABLE `ao3track__auth_user` ADD `role` varchar(32) DEFAULT 'user' NOT NULL;
