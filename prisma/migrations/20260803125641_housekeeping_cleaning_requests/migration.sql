-- CreateTable
CREATE TABLE `CleaningRequestType` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `group` VARCHAR(191) NOT NULL DEFAULT 'CLEANING',
    `slaMinutes` INTEGER NOT NULL DEFAULT 20,
    `autoUrgent` BOOLEAN NOT NULL DEFAULT false,
    `requiresPhotos` INTEGER NOT NULL DEFAULT 1,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CleaningRequestType_slug_key`(`slug`),
    INDEX `CleaningRequestType_group_active_idx`(`group`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientQrCode` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `rotatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ClientQrCode_code_key`(`code`),
    INDEX `ClientQrCode_locationId_active_idx`(`locationId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CleaningRequest` (
    `id` VARCHAR(191) NOT NULL,
    `ticketNo` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `floorId` VARCHAR(191) NULL,
    `typeId` VARCHAR(191) NULL,
    `typeNameSnapshot` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `clientName` VARCHAR(191) NULL,
    `clientPhone` VARCHAR(191) NULL,
    `clientEmail` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `photoId` VARCHAR(191) NULL,
    `priority` ENUM('NORMAL', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `autoUrgentReason` VARCHAR(191) NULL,
    `status` ENUM('NEW', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'AWAITING_CONFIRMATION', 'CLOSED', 'REOPENED', 'CANCELLED') NOT NULL DEFAULT 'NEW',
    `assigneeId` VARCHAR(191) NULL,
    `dueAt` DATETIME(3) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `onTheWayAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `qrVerified` BOOLEAN NOT NULL DEFAULT false,
    `qrVerifiedAt` DATETIME(3) NULL,
    `confirmation` VARCHAR(191) NULL,
    `rating` INTEGER NULL,
    `clientComment` TEXT NULL,
    `confirmedAt` DATETIME(3) NULL,
    `isComplaint` BOOLEAN NOT NULL DEFAULT false,
    `complaintReason` VARCHAR(191) NULL,
    `convertedAt` DATETIME(3) NULL,
    `statusToken` VARCHAR(191) NOT NULL,
    `reopenCount` INTEGER NOT NULL DEFAULT 0,
    `slaBreached` BOOLEAN NOT NULL DEFAULT false,
    `sourceIp` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CleaningRequest_ticketNo_key`(`ticketNo`),
    UNIQUE INDEX `CleaningRequest_statusToken_key`(`statusToken`),
    INDEX `CleaningRequest_centerId_status_idx`(`centerId`, `status`),
    INDEX `CleaningRequest_assigneeId_status_idx`(`assigneeId`, `status`),
    INDEX `CleaningRequest_status_dueAt_idx`(`status`, `dueAt`),
    INDEX `CleaningRequest_clientId_createdAt_idx`(`clientId`, `createdAt`),
    INDEX `CleaningRequest_locationId_createdAt_idx`(`locationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CleaningRequestEvent` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `byClient` BOOLEAN NOT NULL DEFAULT false,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CleaningRequestEvent_requestId_createdAt_idx`(`requestId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CleaningRequestPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'AFTER',
    `filePath` TEXT NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `pHash` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `flags` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CleaningRequestPhoto_requestId_kind_idx`(`requestId`, `kind`),
    INDEX `CleaningRequestPhoto_sha256_idx`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClientQrCode` ADD CONSTRAINT `ClientQrCode_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `InspectionLocation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CleaningRequest` ADD CONSTRAINT `CleaningRequest_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CleaningRequest` ADD CONSTRAINT `CleaningRequest_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `InspectionLocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CleaningRequest` ADD CONSTRAINT `CleaningRequest_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `CleaningRequestType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CleaningRequest` ADD CONSTRAINT `CleaningRequest_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CleaningRequest` ADD CONSTRAINT `CleaningRequest_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CleaningRequestEvent` ADD CONSTRAINT `CleaningRequestEvent_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `CleaningRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CleaningRequestEvent` ADD CONSTRAINT `CleaningRequestEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CleaningRequestPhoto` ADD CONSTRAINT `CleaningRequestPhoto_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `CleaningRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
