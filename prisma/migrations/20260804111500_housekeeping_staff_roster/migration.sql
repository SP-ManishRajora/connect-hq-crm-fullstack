-- HkStaff: a single 08:00–20:00 shift, so no rotation table is needed.
-- `workDays` is VARCHAR rather than TEXT because MySQL forbids a default on TEXT.
CREATE TABLE `HkStaff` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `centerId` VARCHAR(191) NOT NULL,
    `shiftStart` VARCHAR(191) NOT NULL DEFAULT '08:00',
    `shiftEnd` VARCHAR(191) NOT NULL DEFAULT '20:00',
    `workDays` VARCHAR(64) NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
    `capacity` INTEGER NOT NULL DEFAULT 10,
    `floorId` VARCHAR(191) NULL,
    `areaIds` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HkStaff_userId_key`(`userId`),
    INDEX `HkStaff_centerId_active_idx`(`centerId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `HkStaff` ADD CONSTRAINT `HkStaff_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `HkStaff` ADD CONSTRAINT `HkStaff_centerId_fkey`
  FOREIGN KEY (`centerId`) REFERENCES `Center`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
