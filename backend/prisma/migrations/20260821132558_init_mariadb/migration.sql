-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `status` ENUM('ACTIVE', 'PAUSED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    `deletedAt` DATETIME(3) NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NULL,
    `googleId` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `phoneVerifiedAt` DATETIME(3) NULL,
    `isMajor` BOOLEAN NOT NULL DEFAULT true,
    `publicStatus` VARCHAR(191) NULL,
    `userType` ENUM('ONLY_SMS', 'ACCOUNT', 'PAID_ACCOUNT', 'ORGANISATION') NOT NULL DEFAULT 'ONLY_SMS',
    `hasPaid` BOOLEAN NOT NULL DEFAULT false,
    `confirmedByOwner` BOOLEAN NOT NULL DEFAULT false,
    `otpCodeHash` VARCHAR(191) NULL,
    `otpExpiresAt` DATETIME(3) NULL,
    `otpAttempts` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `User_userName_key`(`userName`),
    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_googleId_key`(`googleId`),
    UNIQUE INDEX `User_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Circle` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `label` VARCHAR(191) NOT NULL,
    `circleType` ENUM('BASIC', 'FIRST', 'ORGANISATION') NOT NULL DEFAULT 'BASIC',
    `status` ENUM('ACTIVE', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `groupChat` BOOLEAN NOT NULL DEFAULT false,
    `canSendPhone` BOOLEAN NOT NULL DEFAULT false,
    `userCompanionId` VARCHAR(191) NOT NULL,

    INDEX `Circle_userCompanionId_status_idx`(`userCompanionId`, `status`),
    UNIQUE INDEX `Circle_id_userCompanionId_key`(`id`, `userCompanionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LinkSentinels` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'REMOVED', 'BLOCKED') NOT NULL DEFAULT 'PENDING',
    `initiatedBy` ENUM('COMPANION', 'SENTINEL') NOT NULL,
    `sentinelType` ENUM('ONLY_SMS', 'SENTINEL', 'LEAD', 'FIRSTCIRCLE', 'UNCOMPLETE') NOT NULL DEFAULT 'ONLY_SMS',
    `requestedAsLead` BOOLEAN NOT NULL DEFAULT false,
    `leadSlot` ENUM('LEAD_1', 'LEAD_2', 'LEAD_3') NULL,
    `groupChat` BOOLEAN NOT NULL DEFAULT false,
    `chat` BOOLEAN NOT NULL DEFAULT false,
    `canSendPhone` BOOLEAN NOT NULL DEFAULT false,
    `userSentinelId` VARCHAR(191) NOT NULL,
    `userCompanionId` VARCHAR(191) NOT NULL,
    `circleId` VARCHAR(191) NOT NULL,

    INDEX `LinkSentinels_userCompanionId_status_idx`(`userCompanionId`, `status`),
    UNIQUE INDEX `LinkSentinels_userSentinelId_userCompanionId_key`(`userSentinelId`, `userCompanionId`),
    UNIQUE INDEX `LinkSentinels_circleId_leadSlot_key`(`circleId`, `leadSlot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LinkSentinelsEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userSentinelsId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'REMOVED', 'BLOCKED') NULL,
    `toStatus` ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'REMOVED', 'BLOCKED') NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LinkSentinelsEvent_userSentinelsId_occurredAt_idx`(`userSentinelsId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Alert` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `launchedAt` DATETIME(3) NULL,
    `activatedAt` DATETIME(3) NULL,
    `closingAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `label` VARCHAR(191) NOT NULL,
    `messageAlert` VARCHAR(191) NOT NULL,
    `alertStatus` ENUM('SENT', 'LAUNCHED', 'ACTIVE', 'CLOSING', 'RESOLVED') NOT NULL DEFAULT 'SENT',
    `alertType` ENUM('BYCOMPANION', 'LITTLEWORRY', 'MISSING', 'INCIDENT', 'UNKNOWN', 'EMERGENCY', 'NOCONTACT') NOT NULL DEFAULT 'UNKNOWN',
    `statusByCompanion` VARCHAR(191) NULL,
    `statusByFirstCircle` VARCHAR(191) NULL,
    `userCompanionId` VARCHAR(191) NOT NULL,
    `firstCircleId` VARCHAR(191) NOT NULL,
    `launchedById` VARCHAR(191) NULL,
    `closedById` VARCHAR(191) NULL,

    INDEX `Alert_userCompanionId_createdAt_idx`(`userCompanionId`, `createdAt`),
    INDEX `Alert_alertStatus_idx`(`alertStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlertParticipant` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `status` ENUM('WAITING', 'CONTACTED', 'RESPONDED', 'ACTIVE', 'DECLINED', 'UNAVAILABLE', 'CLOSED') NOT NULL DEFAULT 'WAITING',
    `contactedAt` DATETIME(3) NULL,
    `answeredAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `response` VARCHAR(191) NULL,
    `isLead` BOOLEAN NOT NULL DEFAULT false,
    `leadAssignedAt` DATETIME(3) NULL,
    `circleId` VARCHAR(191) NOT NULL,
    `circleName` VARCHAR(191) NOT NULL,
    `canSendPhoneAtAlert` BOOLEAN NULL,
    `chatAtAlert` BOOLEAN NULL,
    `groupChatAtAlert` BOOLEAN NULL,
    `alertId` VARCHAR(191) NOT NULL,
    `userSentinelsId` VARCHAR(191) NOT NULL,

    INDEX `AlertParticipant_alertId_status_idx`(`alertId`, `status`),
    UNIQUE INDEX `AlertParticipant_alertId_userSentinelsId_key`(`alertId`, `userSentinelsId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Conversation` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `alertId` VARCHAR(191) NULL,

    INDEX `Conversation_alertId_idx`(`alertId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConversationParticipant` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `ConversationParticipant_conversationId_userId_idx`(`conversationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `editedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `body` VARCHAR(191) NOT NULL,
    `type` ENUM('TEXT', 'IMAGE', 'SYSTEM') NOT NULL DEFAULT 'TEXT',
    `senderId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,

    INDEX `Message_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Circle` ADD CONSTRAINT `Circle_userCompanionId_fkey` FOREIGN KEY (`userCompanionId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LinkSentinels` ADD CONSTRAINT `LinkSentinels_userSentinelId_fkey` FOREIGN KEY (`userSentinelId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LinkSentinels` ADD CONSTRAINT `LinkSentinels_userCompanionId_fkey` FOREIGN KEY (`userCompanionId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LinkSentinels` ADD CONSTRAINT `LinkSentinels_circleId_userCompanionId_fkey` FOREIGN KEY (`circleId`, `userCompanionId`) REFERENCES `Circle`(`id`, `userCompanionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LinkSentinelsEvent` ADD CONSTRAINT `LinkSentinelsEvent_userSentinelsId_fkey` FOREIGN KEY (`userSentinelsId`) REFERENCES `LinkSentinels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_userCompanionId_fkey` FOREIGN KEY (`userCompanionId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_firstCircleId_fkey` FOREIGN KEY (`firstCircleId`) REFERENCES `Circle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_launchedById_fkey` FOREIGN KEY (`launchedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_closedById_fkey` FOREIGN KEY (`closedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertParticipant` ADD CONSTRAINT `AlertParticipant_circleId_fkey` FOREIGN KEY (`circleId`) REFERENCES `Circle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertParticipant` ADD CONSTRAINT `AlertParticipant_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `Alert`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertParticipant` ADD CONSTRAINT `AlertParticipant_userSentinelsId_fkey` FOREIGN KEY (`userSentinelsId`) REFERENCES `LinkSentinels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `Alert`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationParticipant` ADD CONSTRAINT `ConversationParticipant_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationParticipant` ADD CONSTRAINT `ConversationParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
