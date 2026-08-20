-- Mobile app (Android housekeeping staff): bearer auth, push targets and
-- offline-captured inspection visits.
--
-- Additive only: no existing column is altered or dropped, so this is safe to
-- apply to a live database while the web app is running.

-- AlterTable — offline capture metadata on InspectionVisit.
-- `scannedAt` keeps its meaning (server time) and is untouched; these columns
-- record what a device CLAIMED and when the queued visit actually arrived.
ALTER TABLE `InspectionVisit`
    ADD COLUMN `capturedAt` DATETIME(3) NULL,
    ADD COLUMN `syncedAt` DATETIME(3) NULL,
    ADD COLUMN `offlineCaptured` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `clientVisitId` VARCHAR(191) NULL;

-- CreateTable — the revocable half of mobile auth. Stores a sha256 of the token.
CREATE TABLE `MobileRefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `MobileRefreshToken_tokenHash_key`(`tokenHash`),
    INDEX `MobileRefreshToken_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `MobileRefreshToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable — Expo push targets (URGENT requests / CRITICAL issues only).
CREATE TABLE `MobilePushToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NULL,
    `platform` VARCHAR(191) NOT NULL DEFAULT 'android',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `MobilePushToken_token_key`(`token`),
    INDEX `MobilePushToken_userId_active_idx`(`userId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `InspectionVisit_clientVisitId_key` ON `InspectionVisit`(`clientVisitId`);
CREATE INDEX `InspectionVisit_offlineCaptured_syncedAt_idx` ON `InspectionVisit`(`offlineCaptured`, `syncedAt`);

-- AddForeignKey
ALTER TABLE `MobileRefreshToken` ADD CONSTRAINT `MobileRefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MobilePushToken` ADD CONSTRAINT `MobilePushToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
