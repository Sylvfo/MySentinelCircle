-- AlterTable
ALTER TABLE `Alert` ADD COLUMN `labelUpdatedAt` DATETIME(3) NULL,
    ADD COLUMN `labelUpdatedById` VARCHAR(191) NULL,
    ADD COLUMN `statusUpdatedAt` DATETIME(3) NULL,
    ADD COLUMN `statusUpdatedById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `AlertParticipant` ADD COLUMN `requestedById` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_statusUpdatedById_fkey` FOREIGN KEY (`statusUpdatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_labelUpdatedById_fkey` FOREIGN KEY (`labelUpdatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertParticipant` ADD CONSTRAINT `AlertParticipant_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
