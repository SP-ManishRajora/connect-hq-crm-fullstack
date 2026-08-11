-- Management sign-off on an inspected area. Nullable and additive: existing
-- visits simply read as not-yet-approved.
ALTER TABLE `InspectionVisit`
  ADD COLUMN `approvedById` VARCHAR(191) NULL,
  ADD COLUMN `approvedAt` DATETIME(3) NULL,
  ADD COLUMN `approvalNote` TEXT NULL;

CREATE INDEX `InspectionVisit_approvedById_idx` ON `InspectionVisit`(`approvedById`);

ALTER TABLE `InspectionVisit` ADD CONSTRAINT `InspectionVisit_approvedById_fkey`
  FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
