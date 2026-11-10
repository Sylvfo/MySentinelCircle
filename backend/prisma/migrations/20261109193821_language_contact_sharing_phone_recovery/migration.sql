-- AlterTable
ALTER TABLE `User` ADD COLUMN `alertContactSharing` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `language` VARCHAR(5) NULL,
    ADD COLUMN `phoneRecoveryConfirmedById` VARCHAR(191) NULL,
    ADD COLUMN `phoneRecoveryRequestedAt` DATETIME(3) NULL;
