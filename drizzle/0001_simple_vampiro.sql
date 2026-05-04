CREATE TABLE `chat_infractions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`infractionCount` int NOT NULL DEFAULT 1,
	`blockDuration` enum('24h','30d','permanent') NOT NULL,
	`blockedAt` timestamp NOT NULL DEFAULT (now()),
	`unblockAt` timestamp,
	`reason` text,
	CONSTRAINT `chat_infractions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`userId` int NOT NULL,
	`message` text NOT NULL,
	`isOffensive` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `friend_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromUserId` int NOT NULL,
	`toUserId` int NOT NULL,
	`gameId` int,
	`status` enum('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `friend_invites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `game_players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`userId` int NOT NULL,
	`playerIndex` int NOT NULL,
	`hand` json,
	`score` int NOT NULL DEFAULT 0,
	`isBot` boolean NOT NULL DEFAULT false,
	CONSTRAINT `game_players_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`status` enum('waiting','playing','finished','abandoned') NOT NULL DEFAULT 'waiting',
	`currentPlayerIndex` int NOT NULL DEFAULT 0,
	`roundNumber` int NOT NULL DEFAULT 1,
	`winnerId` int,
	`boardState` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`finishedAt` timestamp,
	CONSTRAINT `games_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `moves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`userId` int NOT NULL,
	`moveNumber` int NOT NULL,
	`domino` json,
	`side` enum('left','right') NOT NULL,
	`pointsEarned` int NOT NULL DEFAULT 0,
	`isBonus50` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `moves_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `player_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`totalGames` int NOT NULL DEFAULT 0,
	`totalWins` int NOT NULL DEFAULT 0,
	`totalPoints` int NOT NULL DEFAULT 0,
	`level` int NOT NULL DEFAULT 1,
	`winRate` decimal(5,2) NOT NULL DEFAULT '0.00',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `player_stats_id` PRIMARY KEY(`id`),
	CONSTRAINT `player_stats_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `room_players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`userId` int NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`leftAt` timestamp,
	CONSTRAINT `room_players_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`isPrivate` boolean NOT NULL DEFAULT false,
	`createdBy` int NOT NULL,
	`maxPlayers` int NOT NULL DEFAULT 4,
	`currentPlayers` int NOT NULL DEFAULT 0,
	`status` enum('waiting','playing','finished','closed') NOT NULL DEFAULT 'waiting',
	`allowBot` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `isOnline` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isPlaying` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `blockedUntil` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `blockReason` varchar(255);