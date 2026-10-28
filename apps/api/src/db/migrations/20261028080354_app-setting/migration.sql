CREATE TABLE `ao3track__app_setting` (
	`key` varchar(64) PRIMARY KEY,
	`value` json NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime
);
