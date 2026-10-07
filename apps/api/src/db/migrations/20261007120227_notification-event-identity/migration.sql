ALTER TABLE `ao3track__notification` ADD `eventKey` varchar(64);--> statement-breakpoint
ALTER TABLE `ao3track__notification` ADD `dispatchClaim` varchar(36);--> statement-breakpoint
ALTER TABLE `ao3track__notification` ADD `dispatchClaimedAt` datetime;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notification_event` ON `ao3track__notification` (`userId`,`workId`,`type`,`eventKey`);