-- AlterTable
ALTER TABLE `User` ADD COLUMN `termsAcceptedAt` DATETIME(3) NULL,
    ADD COLUMN `termsVersion` VARCHAR(191) NULL;
