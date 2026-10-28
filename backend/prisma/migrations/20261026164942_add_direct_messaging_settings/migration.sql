-- AlterTable
ALTER TABLE `Circle` ADD COLUMN `canMessageMe` BOOLEAN NULL;

-- AlterTable
ALTER TABLE `LinkSentinels` ADD COLUMN `canMessageMe` BOOLEAN NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `allowMessagingByDefault` BOOLEAN NOT NULL DEFAULT true;
