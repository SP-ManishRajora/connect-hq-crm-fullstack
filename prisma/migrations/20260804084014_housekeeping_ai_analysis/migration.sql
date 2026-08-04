-- CreateTable
CREATE TABLE `AiAnalysisJob` (
    `id` VARCHAR(191) NOT NULL,
    `subjectType` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'PHOTO',
    `status` ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `driver` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `modelVersion` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AiAnalysisJob_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `AiAnalysisJob_subjectType_subjectId_idx`(`subjectType`, `subjectId`),
    INDEX `AiAnalysisJob_centerId_createdAt_idx`(`centerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiPhotoFinding` (
    `id` VARCHAR(191) NOT NULL,
    `photoId` VARCHAR(191) NOT NULL,
    `visitId` VARCHAR(191) NULL,
    `centerId` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `issue` TEXT NOT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `confidence` DOUBLE NOT NULL,
    `recommendedAction` TEXT NULL,
    `driver` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `modelVersion` VARCHAR(191) NULL,
    `analysedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `raw` TEXT NULL,
    `verdict` ENUM('UNREVIEWED', 'ACCEPTED', 'CORRECTED', 'ADDED', 'NOT_APPLICABLE') NOT NULL DEFAULT 'UNREVIEWED',
    `correctedIssue` TEXT NULL,
    `correctedSeverity` VARCHAR(191) NULL,
    `reviewNote` TEXT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `issueId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiPhotoFinding_photoId_idx`(`photoId`),
    INDEX `AiPhotoFinding_visitId_idx`(`visitId`),
    INDEX `AiPhotoFinding_verdict_idx`(`verdict`),
    INDEX `AiPhotoFinding_centerId_analysedAt_idx`(`centerId`, `analysedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AreaSummary` (
    `id` VARCHAR(191) NOT NULL,
    `visitId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `overallCondition` VARCHAR(191) NOT NULL,
    `cleanlinessScore` DOUBLE NULL,
    `maintenanceScore` DOUBLE NULL,
    `safetyScore` DOUBLE NULL,
    `consumablesScore` DOUBLE NULL,
    `overallScore` DOUBLE NULL,
    `criticalCount` INTEGER NOT NULL DEFAULT 0,
    `nonCriticalCount` INTEGER NOT NULL DEFAULT 0,
    `reinspectionRequired` BOOLEAN NOT NULL DEFAULT false,
    `newIssues` TEXT NULL,
    `resolvedIssues` TEXT NULL,
    `repeatIssues` TEXT NULL,
    `trend` VARCHAR(191) NULL,
    `recommendedActions` TEXT NULL,
    `driver` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `analysedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AreaSummary_visitId_key`(`visitId`),
    INDEX `AreaSummary_locationId_createdAt_idx`(`locationId`, `createdAt`),
    INDEX `AreaSummary_centerId_createdAt_idx`(`centerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AiPhotoFinding` ADD CONSTRAINT `AiPhotoFinding_photoId_fkey` FOREIGN KEY (`photoId`) REFERENCES `InspectionPhoto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiPhotoFinding` ADD CONSTRAINT `AiPhotoFinding_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AreaSummary` ADD CONSTRAINT `AreaSummary_visitId_fkey` FOREIGN KEY (`visitId`) REFERENCES `InspectionVisit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AreaSummary` ADD CONSTRAINT `AreaSummary_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `InspectionLocation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
