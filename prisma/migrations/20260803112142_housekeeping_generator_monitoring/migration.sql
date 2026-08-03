-- CreateTable
CREATE TABLE `Generator` (
    `id` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `tankCapacityL` DOUBLE NULL,
    `normalLphMin` DOUBLE NULL,
    `normalLphMax` DOUBLE NULL,
    `photoIntervalMin` INTEGER NOT NULL DEFAULT 30,
    `graceMin` INTEGER NOT NULL DEFAULT 10,
    `maxRunHours` DOUBLE NOT NULL DEFAULT 12,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Generator_centerId_active_idx`(`centerId`, `active`),
    UNIQUE INDEX `Generator_centerId_code_key`(`centerId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeneratorEvent` (
    `id` VARCHAR(191) NOT NULL,
    `generatorId` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `type` ENUM('ON', 'OFF') NOT NULL,
    `atServer` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atClaimed` DATETIME(3) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `loadReading` DOUBLE NULL,
    `comments` TEXT NULL,
    `runMinutes` DOUBLE NULL,
    `fuelUsedL` DOUBLE NULL,
    `litresPerHour` DOUBLE NULL,

    INDEX `GeneratorEvent_generatorId_atServer_idx`(`generatorId`, `atServer`),
    INDEX `GeneratorEvent_centerId_type_idx`(`centerId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeneratorReading` (
    `id` VARCHAR(191) NOT NULL,
    `generatorId` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('START', 'PERIODIC', 'STOP', 'REFILL', 'SPOT_CHECK') NOT NULL DEFAULT 'SPOT_CHECK',
    `runningAtReading` BOOLEAN NOT NULL DEFAULT false,
    `fuelReading` DOUBLE NULL,
    `hourMeter` DOUBLE NULL,
    `ocrFuel` DOUBLE NULL,
    `ocrHourMeter` DOUBLE NULL,
    `ocrConfidence` DOUBLE NULL,
    `ocrRaw` TEXT NULL,
    `photoId` VARCHAR(191) NULL,
    `previousReadingId` VARCHAR(191) NULL,
    `fuelDelta` DOUBLE NULL,
    `hourDelta` DOUBLE NULL,
    `eventId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GeneratorReading_previousReadingId_key`(`previousReadingId`),
    INDEX `GeneratorReading_generatorId_at_idx`(`generatorId`, `at`),
    INDEX `GeneratorReading_centerId_at_idx`(`centerId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeneratorPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `generatorId` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `filePath` TEXT NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `pHash` VARCHAR(191) NULL,
    `captureAt` DATETIME(3) NULL,
    `serverAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `flags` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GeneratorPhoto_generatorId_createdAt_idx`(`generatorId`, `createdAt`),
    INDEX `GeneratorPhoto_sha256_idx`(`sha256`),
    INDEX `GeneratorPhoto_pHash_idx`(`pHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeneratorRefill` (
    `id` VARCHAR(191) NOT NULL,
    `generatorId` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,
    `litres` DOUBLE NOT NULL,
    `costPerL` DOUBLE NULL,
    `totalCost` DOUBLE NULL,
    `vendor` VARCHAR(191) NULL,
    `invoiceRef` VARCHAR(191) NULL,
    `photoId` VARCHAR(191) NULL,
    `fuelBefore` DOUBLE NULL,
    `fuelAfter` DOUBLE NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GeneratorRefill_generatorId_at_idx`(`generatorId`, `at`),
    INDEX `GeneratorRefill_centerId_at_idx`(`centerId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeneratorDiscrepancy` (
    `id` VARCHAR(191) NOT NULL,
    `generatorId` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `ruleCode` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'HIGH',
    `title` VARCHAR(191) NOT NULL,
    `detail` TEXT NULL,
    `expected` VARCHAR(191) NULL,
    `actual` VARCHAR(191) NULL,
    `delta` DOUBLE NULL,
    `readingId` VARCHAR(191) NULL,
    `eventId` VARCHAR(191) NULL,
    `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolution` TEXT NULL,
    `issueId` VARCHAR(191) NULL,

    INDEX `GeneratorDiscrepancy_generatorId_detectedAt_idx`(`generatorId`, `detectedAt`),
    INDEX `GeneratorDiscrepancy_centerId_resolvedAt_idx`(`centerId`, `resolvedAt`),
    INDEX `GeneratorDiscrepancy_ruleCode_idx`(`ruleCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Generator` ADD CONSTRAINT `Generator_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorEvent` ADD CONSTRAINT `GeneratorEvent_generatorId_fkey` FOREIGN KEY (`generatorId`) REFERENCES `Generator`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorEvent` ADD CONSTRAINT `GeneratorEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorReading` ADD CONSTRAINT `GeneratorReading_generatorId_fkey` FOREIGN KEY (`generatorId`) REFERENCES `Generator`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorReading` ADD CONSTRAINT `GeneratorReading_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorReading` ADD CONSTRAINT `GeneratorReading_photoId_fkey` FOREIGN KEY (`photoId`) REFERENCES `GeneratorPhoto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorReading` ADD CONSTRAINT `GeneratorReading_previousReadingId_fkey` FOREIGN KEY (`previousReadingId`) REFERENCES `GeneratorReading`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorReading` ADD CONSTRAINT `GeneratorReading_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `GeneratorEvent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorRefill` ADD CONSTRAINT `GeneratorRefill_generatorId_fkey` FOREIGN KEY (`generatorId`) REFERENCES `Generator`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorRefill` ADD CONSTRAINT `GeneratorRefill_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorRefill` ADD CONSTRAINT `GeneratorRefill_photoId_fkey` FOREIGN KEY (`photoId`) REFERENCES `GeneratorPhoto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorDiscrepancy` ADD CONSTRAINT `GeneratorDiscrepancy_generatorId_fkey` FOREIGN KEY (`generatorId`) REFERENCES `Generator`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorDiscrepancy` ADD CONSTRAINT `GeneratorDiscrepancy_readingId_fkey` FOREIGN KEY (`readingId`) REFERENCES `GeneratorReading`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneratorDiscrepancy` ADD CONSTRAINT `GeneratorDiscrepancy_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
