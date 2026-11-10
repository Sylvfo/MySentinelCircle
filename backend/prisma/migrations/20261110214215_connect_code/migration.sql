/*
  Warnings:

  - A unique constraint covering the columns `[connectCode]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `User` ADD COLUMN `connectCode` VARCHAR(32) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_connectCode_key` ON `User`(`connectCode`);
