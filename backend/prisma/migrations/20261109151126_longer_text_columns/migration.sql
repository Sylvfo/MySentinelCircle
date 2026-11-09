-- AlterTable
ALTER TABLE `Alert` MODIFY `messageAlert` TEXT NOT NULL,
    MODIFY `statusByCompanion` VARCHAR(500) NULL,
    MODIFY `statusByFirstCircle` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `Message` MODIFY `body` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `User` MODIFY `publicStatus` VARCHAR(200) NULL,
    MODIFY `deathAnnouncementMessage` TEXT NULL;
