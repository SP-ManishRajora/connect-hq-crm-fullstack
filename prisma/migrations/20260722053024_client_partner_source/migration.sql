-- AlterTable
ALTER TABLE `Client` ADD COLUMN `partnerContactId` VARCHAR(191) NULL,
    ADD COLUMN `sourceType` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_partnerContactId_fkey` FOREIGN KEY (`partnerContactId`) REFERENCES `PartnerContact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
