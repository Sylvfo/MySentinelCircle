/*
  Warnings:

  - You are about to drop the column `hasPaid` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Alert` ADD COLUMN `paidById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `hasPaid`,
    ADD COLUMN `deathNoticePurchasedAt` DATETIME(3) NULL,
    ADD COLUMN `paidUntil` DATETIME(3) NULL;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_paidById_fkey` FOREIGN KEY (`paidById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
