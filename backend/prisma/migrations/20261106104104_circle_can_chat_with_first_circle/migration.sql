/*
  Warnings:

  - You are about to drop the column `canMessageMe` on the `Circle` table. All the data in the column will be lost.
  - You are about to drop the column `canMessageMe` on the `LinkSentinels` table. All the data in the column will be lost.
  - You are about to drop the column `allowMessagingByDefault` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Circle` DROP COLUMN `canMessageMe`,
    ADD COLUMN `alertChatWithFirstCircle` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `LinkSentinels` DROP COLUMN `canMessageMe`;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `allowMessagingByDefault`,
    ADD COLUMN `alertChatWithFirstCircle` BOOLEAN NOT NULL DEFAULT true;
