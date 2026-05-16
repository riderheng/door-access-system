CREATE TABLE `accessApprovals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`roomId` varchar(50) NOT NULL,
	`approvedBy` int NOT NULL,
	`approvalType` enum('manual_approval','auto_open','reentry_window') NOT NULL,
	`reason` text NOT NULL,
	`expiresAt` timestamp,
	`approvedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accessApprovals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `adminActivityLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`activityType` varchar(64) NOT NULL,
	`targetType` varchar(64),
	`targetId` varchar(255),
	`targetName` varchar(255),
	`description` text,
	`oldValue` text,
	`newValue` text,
	`ipAddress` varchar(45),
	`userAgent` text,
	`status` enum('success','failed') NOT NULL DEFAULT 'success',
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminActivityLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `adminRoles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('super_admin','admin','moderator') NOT NULL,
	`permissions` text,
	`assignedBy` int,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `adminRoles_id` PRIMARY KEY(`id`),
	CONSTRAINT `adminRoles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`actionType` varchar(64) NOT NULL,
	`entityType` varchar(64),
	`entityId` varchar(255),
	`reason` text,
	`status` enum('success','failed','pending') NOT NULL DEFAULT 'success',
	`details` text,
	`ipAddress` varchar(45),
	`userAgent` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `systemActionLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actionType` varchar(64) NOT NULL,
	`actionReason` text NOT NULL,
	`targetEntity` varchar(64),
	`targetEntityId` varchar(255),
	`status` enum('success','failed','pending') NOT NULL DEFAULT 'pending',
	`details` text,
	`errorMessage` text,
	`retryCount` int NOT NULL DEFAULT 0,
	`maxRetries` int NOT NULL DEFAULT 3,
	`nextRetryAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `systemActionLogs_id` PRIMARY KEY(`id`)
);
