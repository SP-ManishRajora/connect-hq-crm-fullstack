-- AlterTable
ALTER TABLE `MeetingRoom` ADD COLUMN `amenities` TEXT NULL;

-- CreateTable
CREATE TABLE `ClientInvite` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'INVITE',
    `email` VARCHAR(191) NOT NULL,
    `employerClientId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `invitedById` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ClientInvite_token_key`(`token`),
    INDEX `ClientInvite_email_idx`(`email`),
    INDEX `ClientInvite_employerClientId_idx`(`employerClientId`),
    INDEX `ClientInvite_expiresAt_usedAt_idx`(`expiresAt`, `usedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClientInvite` ADD CONSTRAINT `ClientInvite_employerClientId_fkey` FOREIGN KEY (`employerClientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientInvite` ADD CONSTRAINT `ClientInvite_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
