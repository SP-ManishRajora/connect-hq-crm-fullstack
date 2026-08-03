-- CreateTable
CREATE TABLE `EmailGroup` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'CUSTOM',
    `centerId` VARCHAR(191) NULL,
    `toEmails` TEXT NOT NULL,
    `ccEmails` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmailGroup_kind_active_idx`(`kind`, `active`),
    INDEX `EmailGroup_centerId_idx`(`centerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HkAlert` (
    `id` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `alertType` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'HIGH',
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,
    `subjectType` VARCHAR(191) NULL,
    `subjectId` VARCHAR(191) NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `meta` TEXT NULL,
    `status` ENUM('NEW', 'ACKNOWLEDGED', 'RESOLVED') NOT NULL DEFAULT 'NEW',
    `ackById` VARCHAR(191) NULL,
    `ackAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HkAlert_centerId_status_idx`(`centerId`, `status`),
    INDEX `HkAlert_alertType_createdAt_idx`(`alertType`, `createdAt`),
    UNIQUE INDEX `HkAlert_dedupeKey_key`(`dedupeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationLog` (
    `id` VARCHAR(191) NOT NULL,
    `alertId` VARCHAR(191) NULL,
    `channel` VARCHAR(191) NOT NULL DEFAULT 'EMAIL',
    `recipients` TEXT NOT NULL,
    `subject` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `error` TEXT NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NotificationLog_alertId_idx`(`alertId`),
    INDEX `NotificationLog_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HkEfficiencyScore` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `score` DOUBLE NOT NULL,
    `breakdown` TEXT NOT NULL,
    `issuesClosed` INTEGER NOT NULL DEFAULT 0,
    `issuesLate` INTEGER NOT NULL DEFAULT 0,
    `reworkCount` INTEGER NOT NULL DEFAULT 0,
    `overrideScore` DOUBLE NULL,
    `overrideReason` TEXT NULL,
    `overrideById` VARCHAR(191) NULL,
    `overrideAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HkEfficiencyScore_centerId_periodStart_idx`(`centerId`, `periodStart`),
    UNIQUE INDEX `HkEfficiencyScore_userId_periodStart_periodEnd_key`(`userId`, `periodStart`, `periodEnd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmailGroup` ADD CONSTRAINT `EmailGroup_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HkAlert` ADD CONSTRAINT `HkAlert_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HkAlert` ADD CONSTRAINT `HkAlert_ackById_fkey` FOREIGN KEY (`ackById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationLog` ADD CONSTRAINT `NotificationLog_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `HkAlert`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HkEfficiencyScore` ADD CONSTRAINT `HkEfficiencyScore_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HkEfficiencyScore` ADD CONSTRAINT `HkEfficiencyScore_overrideById_fkey` FOREIGN KEY (`overrideById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
