/*
  Warnings:

  - You are about to drop the column `canMessageOwnCircleAtAlert` on the `AlertParticipant` table. All the data in the column will be lost.
  - You are about to drop the column `firstCircleMessagingModeAtAlert` on the `AlertParticipant` table. All the data in the column will be lost.
  - You are about to drop the column `canMessageOwnCircle` on the `LinkSentinels` table. All the data in the column will be lost.
  - You are about to drop the column `firstCircleMessagingMode` on the `LinkSentinels` table. All the data in the column will be lost.
  - You are about to drop the column `editedAt` on the `Message` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `AlertParticipant` DROP COLUMN `canMessageOwnCircleAtAlert`,
    DROP COLUMN `firstCircleMessagingModeAtAlert`,
    ADD COLUMN `alertChatWithFirstCircleAtAlert` BOOLEAN NULL;

-- AlterTable
ALTER TABLE `LinkSentinels` DROP COLUMN `canMessageOwnCircle`,
    DROP COLUMN `firstCircleMessagingMode`;

-- AlterTable
ALTER TABLE `Message` DROP COLUMN `editedAt`;
