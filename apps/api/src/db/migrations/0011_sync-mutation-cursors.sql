ALTER TABLE `ao3track__track_chapter` MODIFY COLUMN `lastReadAt` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `ao3track__track_chapter` MODIFY COLUMN `markedCompleteAt` datetime(3);--> statement-breakpoint
ALTER TABLE `ao3track__track_chapter` MODIFY COLUMN `rowCreatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__track_chapter` MODIFY COLUMN `rowUpdatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__track_chapter` MODIFY COLUMN `rowDeletedAt` datetime(3);--> statement-breakpoint
ALTER TABLE `ao3track__track_work` MODIFY COLUMN `lastReadAt` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `ao3track__track_work` MODIFY COLUMN `markedCompleteAt` datetime(3);--> statement-breakpoint
ALTER TABLE `ao3track__track_work` MODIFY COLUMN `subscribedUpdatedAt` datetime(3);--> statement-breakpoint
ALTER TABLE `ao3track__track_work` MODIFY COLUMN `favouriteUpdatedAt` datetime(3);--> statement-breakpoint
ALTER TABLE `ao3track__track_work` MODIFY COLUMN `rowCreatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__track_work` MODIFY COLUMN `rowUpdatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__track_work` MODIFY COLUMN `rowDeletedAt` datetime(3);--> statement-breakpoint
ALTER TABLE `ao3track__user_favourite_tag` MODIFY COLUMN `updatedAt` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `ao3track__user_favourite_tag` MODIFY COLUMN `rowCreatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__user_favourite_tag` MODIFY COLUMN `rowUpdatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__user_favourite_tag` MODIFY COLUMN `rowDeletedAt` datetime(3);--> statement-breakpoint
ALTER TABLE `ao3track__user_saved_search` MODIFY COLUMN `updatedAt` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `ao3track__user_saved_search` MODIFY COLUMN `rowCreatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__user_saved_search` MODIFY COLUMN `rowUpdatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__user_saved_search` MODIFY COLUMN `rowDeletedAt` datetime(3);--> statement-breakpoint
ALTER TABLE `ao3track__work_chapter` MODIFY COLUMN `rowCreatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__work_chapter` MODIFY COLUMN `rowUpdatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__work_chapter` MODIFY COLUMN `rowDeletedAt` datetime(3);--> statement-breakpoint
ALTER TABLE `ao3track__work` MODIFY COLUMN `rowCreatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__work` MODIFY COLUMN `rowUpdatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `ao3track__work` MODIFY COLUMN `rowDeletedAt` datetime(3);
