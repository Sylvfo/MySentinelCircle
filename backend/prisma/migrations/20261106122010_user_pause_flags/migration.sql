/*
  Warnings:

  - The values [PAUSED] on the enum `User_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `User` ADD COLUMN `pausedForMe` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `pausedForOthers` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `status` ENUM('ACTIVE', 'DELETED', 'DECEASED') NOT NULL DEFAULT 'ACTIVE';
