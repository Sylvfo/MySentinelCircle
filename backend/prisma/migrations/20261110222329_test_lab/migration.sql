-- CreateTable
CREATE TABLE `LabSms` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `phone` VARCHAR(32) NOT NULL,
    `direction` ENUM('OUT', 'IN') NOT NULL,
    `body` TEXT NOT NULL,

    INDEX `LabSms_phone_createdAt_idx`(`phone`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LabFeedback` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `testerName` VARCHAR(80) NOT NULL,
    `scenario` VARCHAR(64) NOT NULL,
    `tags` VARCHAR(191) NOT NULL,
    `text` TEXT NULL,
    `screenshotPath` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
