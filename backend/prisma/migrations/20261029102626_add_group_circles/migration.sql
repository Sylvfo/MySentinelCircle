/*
  Warnings:

  - A unique constraint covering the columns `[userCompanionId,groupRootId]` on the table `Circle` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Circle` ADD COLUMN `groupRootId` VARCHAR(191) NULL,
    MODIFY `circleType` ENUM('BASIC', 'FIRST', 'ORGANISATION', 'RESERVED', 'GROUP') NOT NULL DEFAULT 'BASIC';

-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('ALERT_RAISED', 'ALERT_ESCALATED', 'ALERT_RESPONSE', 'ALERT_CLOSED', 'ALERT_CIRCLE_NO_RESPONSE', 'ALERT_LEAD_CLAIMED', 'SENTINEL_GROUP_INVITED', 'NEW_MESSAGE', 'SENTINEL_INVITATION_RECEIVED', 'SENTINEL_REQUEST_RECEIVED', 'SENTINEL_LINK_ANSWERED') NOT NULL;

-- CreateTable
CREATE TABLE `SentinelGroupInvitation` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `groupRootId` VARCHAR(191) NOT NULL,
    `invitedUserId` VARCHAR(191) NOT NULL,
    `invitedById` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'REMOVED', 'BLOCKED') NOT NULL DEFAULT 'PENDING',

    UNIQUE INDEX `SentinelGroupInvitation_groupRootId_invitedUserId_key`(`groupRootId`, `invitedUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Circle_userCompanionId_groupRootId_key` ON `Circle`(`userCompanionId`, `groupRootId`);

-- AddForeignKey
ALTER TABLE `Circle` ADD CONSTRAINT `Circle_groupRootId_fkey` FOREIGN KEY (`groupRootId`) REFERENCES `Circle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SentinelGroupInvitation` ADD CONSTRAINT `SentinelGroupInvitation_groupRootId_fkey` FOREIGN KEY (`groupRootId`) REFERENCES `Circle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SentinelGroupInvitation` ADD CONSTRAINT `SentinelGroupInvitation_invitedUserId_fkey` FOREIGN KEY (`invitedUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SentinelGroupInvitation` ADD CONSTRAINT `SentinelGroupInvitation_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
