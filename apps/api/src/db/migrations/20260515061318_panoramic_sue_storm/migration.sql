CREATE TABLE `ao3track__email_send_log` (
	`email` varchar(255) NOT NULL,
	`type` enum('password_reset','email_verification') NOT NULL,
	`lastSentAt` datetime NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`rowUpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON
        UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT `ao3track__email_send_log_email_type_pk` PRIMARY KEY(`email`,`type`)
);
--> statement-breakpoint
CREATE TABLE `ao3track__auth_rate_limit` (
	`id` varchar(36) NOT NULL,
	`key` varchar(255) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`lastRequest` bigint NOT NULL,
	CONSTRAINT `ao3track__auth_rate_limit_id` PRIMARY KEY(`id`),
	CONSTRAINT `ao3track__auth_rate_limit_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE INDEX `idx_email_send_log_lastSentAt` ON `ao3track__email_send_log` (`lastSentAt`);