-- AlterTable
ALTER TABLE `Alert` ADD COLUMN `checkInSchedule` VARCHAR(191) NULL,
    ADD COLUMN `pausedUntil` DATETIME(3) NULL,
    ADD COLUMN `shareItineraryWithFirstCircle` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `shareValidationsWithFirstCircle` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `tripId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Circle` ADD COLUMN `tripId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('ALERT_RAISED', 'ALERT_ESCALATED', 'ALERT_RESPONSE', 'ALERT_CLOSED', 'ALERT_CIRCLE_NO_RESPONSE', 'ALERT_LEAD_CLAIMED', 'SENTINEL_GROUP_INVITED', 'NEW_MESSAGE', 'SENTINEL_INVITATION_RECEIVED', 'SENTINEL_REQUEST_RECEIVED', 'SENTINEL_LINK_ANSWERED', 'DEATH_NOTICE_REPORTED', 'DEATH_NOTICE_CONFIRMED', 'DEATH_NOTICE_REJECTED', 'SENTINEL_LEFT', 'CIRCLE_MOVE_PROPOSED', 'CIRCLE_MOVE_ANSWERED', 'SENTINEL_TO_RESERVE', 'TRAVEL_CIRCLE_ADDED', 'WATCH_CHECK_DUE', 'WATCH_PAUSE_SOON') NOT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `timeZone` VARCHAR(64) NULL;

-- CreateTable
CREATE TABLE `TravelCheckpoint` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `expectedAt` DATETIME(3) NOT NULL,
    `alertAt` DATETIME(3) NOT NULL,
    `placeName` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `remindedAt` DATETIME(3) NULL,
    `validatedAt` DATETIME(3) NULL,
    `validatedLatitude` DOUBLE NULL,
    `validatedLongitude` DOUBLE NULL,
    `validatedPlace` VARCHAR(191) NULL,
    `validatedNote` VARCHAR(500) NULL,
    `missedAt` DATETIME(3) NULL,
    `alertId` VARCHAR(191) NOT NULL,
    `openedAlertId` VARCHAR(191) NULL,

    INDEX `TravelCheckpoint_alertId_expectedAt_idx`(`alertId`, `expectedAt`),
    INDEX `TravelCheckpoint_validatedAt_expectedAt_idx`(`validatedAt`, `expectedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Circle_tripId_idx` ON `Circle`(`tripId`);

-- AddForeignKey
ALTER TABLE `Circle` ADD CONSTRAINT `Circle_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Alert`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Alert`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TravelCheckpoint` ADD CONSTRAINT `TravelCheckpoint_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `Alert`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TravelCheckpoint` ADD CONSTRAINT `TravelCheckpoint_openedAlertId_fkey` FOREIGN KEY (`openedAlertId`) REFERENCES `Alert`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
