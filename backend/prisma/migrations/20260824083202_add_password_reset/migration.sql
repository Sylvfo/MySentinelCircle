/*
  Warnings:

  - A unique constraint covering the columns `[passwordResetTokenHash]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `User` ADD COLUMN `passwordResetExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `passwordResetTokenHash` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_passwordResetTokenHash_key` ON `User`(`passwordResetTokenHash`);
