/*
  Warnings:

  - You are about to drop the column `canSendPhone` on the `Circle` table. All the data in the column will be lost.
  - You are about to drop the column `groupChat` on the `Circle` table. All the data in the column will be lost.
  - The values [PAID_ACCOUNT] on the enum `User_userType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `Circle` DROP COLUMN `canSendPhone`,
    DROP COLUMN `groupChat`;

-- AlterTable
ALTER TABLE `User` MODIFY `userType` ENUM('ONLY_SMS', 'ACCOUNT', 'ORGANISATION', 'UNCOMPLETE') NOT NULL DEFAULT 'ONLY_SMS';
