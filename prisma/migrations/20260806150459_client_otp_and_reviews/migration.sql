-- CreateTable
CREATE TABLE `ClientOtp` (
    `id` VARCHAR(191) NOT NULL,
    `destination` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL DEFAULT 'SMS',
    `codeHash` VARCHAR(191) NOT NULL,
    `salt` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `centerId` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `requestIp` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ClientOtp_destination_consumedAt_idx`(`destination`, `consumedAt`),
    INDEX `ClientOtp_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientReview` (
    `id` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `companyNameSnapshot` VARCHAR(191) NULL,
    `companyVerified` BOOLEAN NOT NULL DEFAULT false,
    `rating` INTEGER NOT NULL,
    `comment` TEXT NULL,
    `contact` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL DEFAULT 'SMS',
    `reviewerName` VARCHAR(191) NULL,
    `otpId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `hiddenById` VARCHAR(191) NULL,
    `hiddenAt` DATETIME(3) NULL,
    `sourceIp` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ClientReview_centerId_createdAt_idx`(`centerId`, `createdAt`),
    INDEX `ClientReview_locationId_createdAt_idx`(`locationId`, `createdAt`),
    INDEX `ClientReview_clientId_idx`(`clientId`),
    INDEX `ClientReview_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClientReview` ADD CONSTRAINT `ClientReview_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientReview` ADD CONSTRAINT `ClientReview_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `InspectionLocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientReview` ADD CONSTRAINT `ClientReview_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientReview` ADD CONSTRAINT `ClientReview_otpId_fkey` FOREIGN KEY (`otpId`) REFERENCES `ClientOtp`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

