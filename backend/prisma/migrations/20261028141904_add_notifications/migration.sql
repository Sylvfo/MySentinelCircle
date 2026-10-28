-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readAt` DATETIME(3) NULL,
    `type` ENUM('ALERT_RAISED', 'ALERT_ESCALATED', 'ALERT_RESPONSE', 'ALERT_CLOSED', 'NEW_MESSAGE', 'SENTINEL_INVITATION_RECEIVED', 'SENTINEL_REQUEST_RECEIVED', 'SENTINEL_LINK_ANSWERED') NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `actorLabel` VARCHAR(191) NULL,
    `accepted` BOOLEAN NULL,
    `targetId` VARCHAR(191) NULL,

    INDEX `Notification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
