-- AlterTable
ALTER TABLE `CleaningRequestPhoto` ADD COLUMN `purgedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `GeneratorPhoto` ADD COLUMN `purgedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `InspectionPhoto` ADD COLUMN `purgedAt` DATETIME(3) NULL;
