-- Rejection of an inspected area, and per-user targeting for alerts so the
-- rejected inspector is notified directly rather than via a centre email group.
ALTER TABLE `InspectionVisit`
  ADD COLUMN `rejectedById` VARCHAR(191) NULL,
  ADD COLUMN `rejectedAt` DATETIME(3) NULL,
  ADD COLUMN `rejectionReason` TEXT NULL;

CREATE INDEX `InspectionVisit_rejectedById_idx` ON `InspectionVisit`(`rejectedById`);

ALTER TABLE `InspectionVisit` ADD CONSTRAINT `InspectionVisit_rejectedById_fkey`
  FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `HkAlert` ADD COLUMN `targetUserId` VARCHAR(191) NULL;

CREATE INDEX `HkAlert_targetUserId_status_idx` ON `HkAlert`(`targetUserId`, `status`);

ALTER TABLE `HkAlert` ADD CONSTRAINT `HkAlert_targetUserId_fkey`
  FOREIGN KEY (`targetUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
