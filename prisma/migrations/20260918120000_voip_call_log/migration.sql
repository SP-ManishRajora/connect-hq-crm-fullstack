-- VoIP / telephony: structured call records for CRM click-to-call.
-- See docs/voip/level-1-click-to-call.md and src/lib/voice.ts (provider: FreJun).
--
-- Additive only: creates one new table and two foreign keys. No existing column
-- is altered or dropped, so this is safe to apply to a live database while the
-- web app is running.
--
-- `providerSid` is UNIQUE on purpose: FreJun retries webhook deliveries, and the
-- uniqueness is what stops one call becoming several timeline entries.
--
-- Both foreign keys are ON DELETE SET NULL rather than CASCADE: deleting a lead
-- or a departed user must not erase the record that a call was made, which may
-- be needed for billing reconciliation or a dispute.

-- CreateTable
CREATE TABLE `CallLog` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `agentId` VARCHAR(191) NULL,
    `direction` VARCHAR(191) NOT NULL DEFAULT 'OUTBOUND',
    `status` VARCHAR(191) NOT NULL DEFAULT 'INITIATED',
    `agentPhone` VARCHAR(191) NULL,
    `leadPhone` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NULL,
    `providerSid` VARCHAR(191) NULL,
    `durationSec` INTEGER NULL,
    `recordingUrl` TEXT NULL,
    `failureReason` TEXT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `answeredAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CallLog_providerSid_key`(`providerSid`),
    INDEX `CallLog_leadId_idx`(`leadId`),
    INDEX `CallLog_agentId_idx`(`agentId`),
    INDEX `CallLog_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CallLog` ADD CONSTRAINT `CallLog_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CallLog` ADD CONSTRAINT `CallLog_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
