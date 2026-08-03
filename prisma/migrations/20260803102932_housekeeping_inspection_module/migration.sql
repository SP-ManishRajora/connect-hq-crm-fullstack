-- CreateTable
CREATE TABLE `InspectionLocation` (
    `id` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('BATHROOM', 'COMMON_AREA', 'PARKING', 'FRONT_AREA', 'BACK_AREA', 'GUARD_ROOM', 'ELECTRICITY_ROOM', 'GENERATOR_AREA', 'FUEL_TANK', 'PANTRY', 'MEETING_ROOM', 'RECEPTION', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `geofenceRadiusM` INTEGER NOT NULL DEFAULT 50,
    `requiredPhotoCount` INTEGER NOT NULL DEFAULT 4,
    `requiredAngles` TEXT NULL,
    `checklist` TEXT NULL,
    `minDwellSeconds` INTEGER NOT NULL DEFAULT 60,
    `frequencyPerDay` INTEGER NOT NULL DEFAULT 1,
    `priority` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InspectionLocation_centerId_active_idx`(`centerId`, `active`),
    INDEX `InspectionLocation_floorId_idx`(`floorId`),
    INDEX `InspectionLocation_centerId_sortOrder_idx`(`centerId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LocationQrCode` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `rotatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LocationQrCode_code_key`(`code`),
    INDEX `LocationQrCode_locationId_active_idx`(`locationId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InspectionRound` (
    `id` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('IN_PROGRESS', 'COMPLETED', 'ABANDONED') NOT NULL DEFAULT 'IN_PROGRESS',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `distanceM` DOUBLE NULL,
    `score` DOUBLE NULL,
    `flags` TEXT NULL,
    `notes` TEXT NULL,

    INDEX `InspectionRound_centerId_startedAt_idx`(`centerId`, `startedAt`),
    INDEX `InspectionRound_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InspectionVisit` (
    `id` VARCHAR(191) NOT NULL,
    `roundId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `qrCodeId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `scannedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `submittedAt` DATETIME(3) NULL,
    `dwellSeconds` INTEGER NULL,
    `deviceId` VARCHAR(191) NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `gpsAccuracyM` DOUBLE NULL,
    `distanceM` DOUBLE NULL,
    `geofenceOk` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('SCANNED', 'SUBMITTED', 'REJECTED') NOT NULL DEFAULT 'SCANNED',
    `flags` TEXT NULL,
    `observations` TEXT NULL,

    INDEX `InspectionVisit_roundId_sequence_idx`(`roundId`, `sequence`),
    INDEX `InspectionVisit_locationId_scannedAt_idx`(`locationId`, `scannedAt`),
    INDEX `InspectionVisit_userId_scannedAt_idx`(`userId`, `scannedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InspectionPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `visitId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `angle` VARCHAR(191) NOT NULL,
    `slot` INTEGER NOT NULL,
    `filePath` TEXT NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `captureAt` DATETIME(3) NULL,
    `serverAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `deviceId` VARCHAR(191) NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `pHash` VARCHAR(191) NULL,
    `qualityScore` DOUBLE NULL,
    `source` ENUM('CAMERA', 'GALLERY') NOT NULL DEFAULT 'CAMERA',
    `beforeAfter` VARCHAR(191) NOT NULL DEFAULT 'BEFORE',
    `retakeReason` VARCHAR(191) NULL,
    `flags` TEXT NULL,
    `aiStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InspectionPhoto_visitId_slot_idx`(`visitId`, `slot`),
    INDEX `InspectionPhoto_locationId_createdAt_idx`(`locationId`, `createdAt`),
    INDEX `InspectionPhoto_sha256_idx`(`sha256`),
    INDEX `InspectionPhoto_pHash_idx`(`pHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GpsLog` (
    `id` VARCHAR(191) NOT NULL,
    `roundId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `accuracyM` DOUBLE NULL,

    INDEX `GpsLog_roundId_at_idx`(`roundId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeviceRegistration` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `fingerprint` TEXT NULL,
    `label` VARCHAR(191) NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeviceRegistration_deviceId_idx`(`deviceId`),
    UNIQUE INDEX `DeviceRegistration_userId_deviceId_key`(`userId`, `deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HkSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InspectionLocation` ADD CONSTRAINT `InspectionLocation_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionLocation` ADD CONSTRAINT `InspectionLocation_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LocationQrCode` ADD CONSTRAINT `LocationQrCode_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `InspectionLocation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionRound` ADD CONSTRAINT `InspectionRound_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionRound` ADD CONSTRAINT `InspectionRound_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionVisit` ADD CONSTRAINT `InspectionVisit_roundId_fkey` FOREIGN KEY (`roundId`) REFERENCES `InspectionRound`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionVisit` ADD CONSTRAINT `InspectionVisit_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `InspectionLocation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionVisit` ADD CONSTRAINT `InspectionVisit_qrCodeId_fkey` FOREIGN KEY (`qrCodeId`) REFERENCES `LocationQrCode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionVisit` ADD CONSTRAINT `InspectionVisit_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionPhoto` ADD CONSTRAINT `InspectionPhoto_visitId_fkey` FOREIGN KEY (`visitId`) REFERENCES `InspectionVisit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionPhoto` ADD CONSTRAINT `InspectionPhoto_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `InspectionLocation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InspectionPhoto` ADD CONSTRAINT `InspectionPhoto_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GpsLog` ADD CONSTRAINT `GpsLog_roundId_fkey` FOREIGN KEY (`roundId`) REFERENCES `InspectionRound`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeviceRegistration` ADD CONSTRAINT `DeviceRegistration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
