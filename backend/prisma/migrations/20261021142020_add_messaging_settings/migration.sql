-- AlterTable
ALTER TABLE `AlertParticipant` DROP COLUMN `chatAtAlert`,
    DROP COLUMN `groupChatAtAlert`,
    ADD COLUMN `canMessageOwnCircleAtAlert` BOOLEAN NULL,
    ADD COLUMN `firstCircleMessagingModeAtAlert` ENUM('NONE', 'INDIVIDUAL', 'GROUP') NULL;

-- AlterTable
ALTER TABLE `LinkSentinels` DROP COLUMN `chat`,
    DROP COLUMN `groupChat`,
    ADD COLUMN `canMessageOwnCircle` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `firstCircleMessagingMode` ENUM('NONE', 'INDIVIDUAL', 'GROUP') NOT NULL DEFAULT 'NONE';

