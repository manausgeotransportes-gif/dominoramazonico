CREATE TABLE `calendar_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`dueDate` timestamp NOT NULL,
	`eventType` enum('vencimento','fatura','documento','lembretes','outro') NOT NULL DEFAULT 'outro',
	`priority` enum('baixa','media','alta') NOT NULL DEFAULT 'media',
	`completed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calendar_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `calendar_events_user_id_idx` ON `calendar_events` (`userId`);
--> statement-breakpoint
CREATE INDEX `calendar_events_due_date_idx` ON `calendar_events` (`dueDate`);
