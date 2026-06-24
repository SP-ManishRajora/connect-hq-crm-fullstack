-- CreateTable
CREATE TABLE `Floor` (
    `id` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Floor_centerId_idx`(`centerId`),
    UNIQUE INDEX `Floor_centerId_level_key`(`centerId`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Zone` (
    `id` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Zone_centerId_idx`(`centerId`),
    INDEX `Zone_floorId_idx`(`floorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Space` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('DEDICATED_SEAT', 'HOT_DESK', 'CABIN', 'MEETING_ROOM', 'PRIVATE_OFFICE', 'VIRTUAL_OFFICE') NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'BLOCKED') NOT NULL DEFAULT 'AVAILABLE',
    `centerId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NULL,
    `zoneId` VARCHAR(191) NULL,
    `cabinId` VARCHAR(191) NULL,
    `seatId` VARCHAR(191) NULL,
    `meetingRoomId` VARCHAR(191) NULL,
    `gridX` INTEGER NULL,
    `gridY` INTEGER NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Space_centerId_status_idx`(`centerId`, `status`),
    INDEX `Space_floorId_idx`(`floorId`),
    INDEX `Space_zoneId_idx`(`zoneId`),
    INDEX `Space_type_status_idx`(`type`, `status`),
    UNIQUE INDEX `Space_centerId_code_key`(`centerId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Allocation` (
    `id` VARCHAR(191) NOT NULL,
    `spaceId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NULL,
    `seatsTaken` INTEGER NOT NULL DEFAULT 1,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'EXPIRED', 'TERMINATED', 'TRANSFERRED') NOT NULL DEFAULT 'ACTIVE',
    `allocatedById` VARCHAR(191) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Allocation_clientId_idx`(`clientId`),
    INDEX `Allocation_spaceId_status_idx`(`spaceId`, `status`),
    INDEX `Allocation_status_endDate_idx`(`status`, `endDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OccupancyHistory` (
    `id` VARCHAR(191) NOT NULL,
    `allocationId` VARCHAR(191) NULL,
    `spaceId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `prevClientId` VARCHAR(191) NULL,
    `event` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `vacatedAt` DATETIME(3) NULL,
    `actorId` VARCHAR(191) NULL,
    `meta` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OccupancyHistory_spaceId_idx`(`spaceId`),
    INDEX `OccupancyHistory_clientId_idx`(`clientId`),
    INDEX `OccupancyHistory_allocationId_idx`(`allocationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reservation` (
    `id` VARCHAR(191) NOT NULL,
    `spaceId` VARCHAR(191) NOT NULL,
    `reservedById` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `reservedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `released` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Reservation_expiresAt_released_idx`(`expiresAt`, `released`),
    INDEX `Reservation_spaceId_idx`(`spaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SpaceTransfer` (
    `id` VARCHAR(191) NOT NULL,
    `spaceId` VARCHAR(191) NOT NULL,
    `fromClientId` VARCHAR(191) NULL,
    `toClientId` VARCHAR(191) NULL,
    `fromAllocationId` VARCHAR(191) NULL,
    `toAllocationId` VARCHAR(191) NULL,
    `batchId` VARCHAR(191) NULL,
    `transferredById` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SpaceTransfer_batchId_idx`(`batchId`),
    INDEX `SpaceTransfer_spaceId_idx`(`spaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Floor` ADD CONSTRAINT `Floor_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Zone` ADD CONSTRAINT `Zone_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Zone` ADD CONSTRAINT `Zone_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Space` ADD CONSTRAINT `Space_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Space` ADD CONSTRAINT `Space_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Space` ADD CONSTRAINT `Space_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `Zone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Space` ADD CONSTRAINT `Space_cabinId_fkey` FOREIGN KEY (`cabinId`) REFERENCES `Cabin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Space` ADD CONSTRAINT `Space_seatId_fkey` FOREIGN KEY (`seatId`) REFERENCES `Seat`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Space` ADD CONSTRAINT `Space_meetingRoomId_fkey` FOREIGN KEY (`meetingRoomId`) REFERENCES `MeetingRoom`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Allocation` ADD CONSTRAINT `Allocation_spaceId_fkey` FOREIGN KEY (`spaceId`) REFERENCES `Space`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Allocation` ADD CONSTRAINT `Allocation_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Allocation` ADD CONSTRAINT `Allocation_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Allocation` ADD CONSTRAINT `Allocation_allocatedById_fkey` FOREIGN KEY (`allocatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OccupancyHistory` ADD CONSTRAINT `OccupancyHistory_allocationId_fkey` FOREIGN KEY (`allocationId`) REFERENCES `Allocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_spaceId_fkey` FOREIGN KEY (`spaceId`) REFERENCES `Space`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_reservedById_fkey` FOREIGN KEY (`reservedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SpaceTransfer` ADD CONSTRAINT `SpaceTransfer_spaceId_fkey` FOREIGN KEY (`spaceId`) REFERENCES `Space`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
