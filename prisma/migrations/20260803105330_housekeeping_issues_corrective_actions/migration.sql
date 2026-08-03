-- CreateTable
CREATE TABLE `HkIssue` (
    `id` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `visitId` VARCHAR(191) NULL,
    `source` ENUM('INSPECTION', 'AI', 'CLIENT', 'MANUAL') NOT NULL DEFAULT 'MANUAL',
    `category` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `severity` ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'CLOSED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `beforePhotoId` VARCHAR(191) NULL,
    `raisedById` VARCHAR(191) NOT NULL,
    `assigneeId` VARCHAR(191) NULL,
    `dueAt` DATETIME(3) NULL,
    `escalatedAt` DATETIME(3) NULL,
    `closedById` VARCHAR(191) NULL,
    `closedAt` DATETIME(3) NULL,
    `ticketId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HkIssue_centerId_status_idx`(`centerId`, `status`),
    INDEX `HkIssue_assigneeId_status_idx`(`assigneeId`, `status`),
    INDEX `HkIssue_status_dueAt_idx`(`status`, `dueAt`),
    INDEX `HkIssue_locationId_idx`(`locationId`),
    INDEX `HkIssue_visitId_idx`(`visitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CorrectiveAction` (
    `id` VARCHAR(191) NOT NULL,
    `issueId` VARCHAR(191) NOT NULL,
    `assigneeId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `afterPhotoId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `unableReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CorrectiveAction_issueId_idx`(`issueId`),
    INDEX `CorrectiveAction_assigneeId_idx`(`assigneeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReinspectionRecord` (
    `id` VARCHAR(191) NOT NULL,
    `issueId` VARCHAR(191) NOT NULL,
    `actionId` VARCHAR(191) NULL,
    `verifiedById` VARCHAR(191) NOT NULL,
    `verdict` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReinspectionRecord_issueId_idx`(`issueId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HkIssue` ADD CONSTRAINT `HkIssue_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HkIssue` ADD CONSTRAINT `HkIssue_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `InspectionLocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HkIssue` ADD CONSTRAINT `HkIssue_visitId_fkey` FOREIGN KEY (`visitId`) REFERENCES `InspectionVisit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HkIssue` ADD CONSTRAINT `HkIssue_beforePhotoId_fkey` FOREIGN KEY (`beforePhotoId`) REFERENCES `InspectionPhoto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HkIssue` ADD CONSTRAINT `HkIssue_raisedById_fkey` FOREIGN KEY (`raisedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HkIssue` ADD CONSTRAINT `HkIssue_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HkIssue` ADD CONSTRAINT `HkIssue_closedById_fkey` FOREIGN KEY (`closedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CorrectiveAction` ADD CONSTRAINT `CorrectiveAction_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `HkIssue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CorrectiveAction` ADD CONSTRAINT `CorrectiveAction_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CorrectiveAction` ADD CONSTRAINT `CorrectiveAction_afterPhotoId_fkey` FOREIGN KEY (`afterPhotoId`) REFERENCES `InspectionPhoto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReinspectionRecord` ADD CONSTRAINT `ReinspectionRecord_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `HkIssue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReinspectionRecord` ADD CONSTRAINT `ReinspectionRecord_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
