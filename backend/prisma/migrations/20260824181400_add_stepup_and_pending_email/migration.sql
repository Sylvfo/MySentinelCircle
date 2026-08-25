/*
  Warnings:

  - A unique constraint covering the columns `[pendingEmailTokenHash]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `User` ADD COLUMN `pendingEmail` VARCHAR(191) NULL,
    ADD COLUMN `pendingEmailExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `pendingEmailTokenHash` VARCHAR(191) NULL,
    ADD COLUMN `stepUpVerifiedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_pendingEmailTokenHash_key` ON `User`(`pendingEmailTokenHash`);
