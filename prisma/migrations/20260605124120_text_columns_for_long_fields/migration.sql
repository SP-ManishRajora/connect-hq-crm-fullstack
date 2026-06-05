-- AlterTable
ALTER TABLE `AttendanceLog` MODIFY `issuesNote` TEXT NULL,
    MODIFY `photos` TEXT NULL;

-- AlterTable
ALTER TABLE `Booking` MODIFY `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `Cabin` MODIFY `photos` TEXT NULL,
    MODIFY `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `Center` MODIFY `mapImagePath` TEXT NULL,
    MODIFY `commonAreaPhotos` TEXT NULL;

-- AlterTable
ALTER TABLE `Contract` MODIFY `ocrParsedJson` TEXT NULL;

-- AlterTable
ALTER TABLE `Expense` MODIFY `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `Feedback` MODIFY `body` TEXT NULL;

-- AlterTable
ALTER TABLE `Lead` MODIFY `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `LeaveRequest` MODIFY `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `Proposal` MODIFY `customisations` TEXT NULL,
    MODIFY `imagesJson` TEXT NULL,
    ALTER COLUMN `quotedPrice` DROP DEFAULT,
    ALTER COLUMN `negotiatedPrice` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Referral` MODIFY `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `Repair` MODIFY `photos` TEXT NULL;

-- AlterTable
ALTER TABLE `StaffAttendance` MODIFY `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `Vendor` MODIFY `rateCardJson` TEXT NULL;

-- AlterTable
ALTER TABLE `VendorInvoice` MODIFY `remarks` TEXT NULL;

-- AlterTable
ALTER TABLE `Visitor` MODIFY `notes` TEXT NULL;
