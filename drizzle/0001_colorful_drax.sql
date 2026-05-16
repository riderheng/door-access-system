CREATE TABLE `accessLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`roomId` varchar(50) NOT NULL,
	`accessType` enum('entry','exit') NOT NULL,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`qrCodeId` int,
	`ipAddress` varchar(45),
	`deviceInfo` text,
	`isOfflineSync` boolean NOT NULL DEFAULT false,
	`status` enum('success','failed','warning') NOT NULL DEFAULT 'success',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accessLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accessSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` varchar(50) NOT NULL,
	`dayOfWeek` tinyint NOT NULL,
	`startTime` varchar(5) NOT NULL,
	`endTime` varchar(5) NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accessSchedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `doorSensors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` varchar(50) NOT NULL,
	`roomName` varchar(100) NOT NULL,
	`sensorStatus` enum('open','closed','error') NOT NULL DEFAULT 'closed',
	`lastStatusChange` timestamp DEFAULT (now()),
	`alertEnabled` boolean NOT NULL DEFAULT true,
	`alertSoundUrl` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `doorSensors_id` PRIMARY KEY(`id`),
	CONSTRAINT `doorSensors_roomId_unique` UNIQUE(`roomId`)
);
--> statement-breakpoint
CREATE TABLE `notificationSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`notificationType` enum('email','line','telegram','slack') NOT NULL,
	`webhookUrl` varchar(500),
	`isEnabled` boolean NOT NULL DEFAULT true,
	`eventTypes` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `offlineSyncQueue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dataType` varchar(50) NOT NULL,
	`data` text NOT NULL,
	`deviceId` varchar(100) NOT NULL,
	`syncedAt` timestamp,
	`status` enum('pending','synced','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `offlineSyncQueue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qrCodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(255) NOT NULL,
	`studentId` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qrCodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `qrCodes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `reentryWindows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`roomId` varchar(50) NOT NULL,
	`lastExitTime` timestamp NOT NULL,
	`windowExpiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reentryWindows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `s3Backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`backupType` varchar(50) NOT NULL,
	`s3Key` varchar(500) NOT NULL,
	`s3Url` varchar(500) NOT NULL,
	`fileSize` int,
	`status` enum('completed','failed') NOT NULL DEFAULT 'completed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `s3Backups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` varchar(20) NOT NULL,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`email` varchar(320),
	`phone` varchar(20),
	`year` enum('1','2','3','4') NOT NULL,
	`branch` varchar(100) NOT NULL,
	`status` enum('active','inactive','graduated') NOT NULL DEFAULT 'active',
	`profileImage` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `students_studentId_unique` UNIQUE(`studentId`)
);
--> statement-breakpoint
CREATE TABLE `systemSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `systemSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `systemSettings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `webhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`studentId` int,
	`roomId` varchar(50),
	`data` text NOT NULL,
	`webhookUrl` varchar(500) NOT NULL,
	`webhookType` enum('line','telegram','email','slack') NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`retryCount` int NOT NULL DEFAULT 0,
	`lastError` text,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhookEvents_id` PRIMARY KEY(`id`)
);
