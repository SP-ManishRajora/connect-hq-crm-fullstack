-- Reshape Partner into a firm + many contacts. No data exists yet, so this is a clean rebuild.

-- Drop old lead -> partner FK and column
ALTER TABLE `Lead` DROP FOREIGN KEY `Lead_partnerId_fkey`;
ALTER TABLE `Lead` DROP COLUMN `partnerId`;

-- Old flat Partner table (one row per contact) is replaced
DROP TABLE `Partner`;

-- Partner firm
CREATE TABLE `Partner` (
  `id` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `organisation` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Partner_type_organisation_key`(`type`, `organisation`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Contact person under a firm
CREATE TABLE `PartnerContact` (
  `id` VARCHAR(191) NOT NULL,
  `partnerId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `PartnerContact_partnerId_idx`(`partnerId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PartnerContact`
  ADD CONSTRAINT `PartnerContact_partnerId_fkey`
  FOREIGN KEY (`partnerId`) REFERENCES `Partner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- New lead -> partner contact link
ALTER TABLE `Lead` ADD COLUMN `partnerContactId` VARCHAR(191) NULL;
ALTER TABLE `Lead`
  ADD CONSTRAINT `Lead_partnerContactId_fkey`
  FOREIGN KEY (`partnerContactId`) REFERENCES `PartnerContact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
