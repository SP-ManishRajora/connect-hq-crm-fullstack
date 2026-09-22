-- Campaign attribution for website leads.
--
-- theme.js on connecthq.co.in captures gclid/utm_* on a visitor's first arrival
-- and persists them, and connecthqEmail.php has been posting them to
-- /api/leads/public all along — but the Lead model had nowhere to put them, so
-- they survived only as text mirrored into `notes`. That made paid-search
-- performance unreportable, and left the gclid of a closed deal recoverable
-- only by parsing prose.
--
-- gclid, landingPage and referrer are TEXT rather than VARCHAR(191): a gclid
-- runs past 100 characters and URLs with a full query string routinely exceed
-- 191. The remaining utm_* values are short labels, so VARCHAR(191) fits and
-- keeps them indexable.
ALTER TABLE `Lead`
  ADD COLUMN `gclid` TEXT NULL,
  ADD COLUMN `utmSource` VARCHAR(191) NULL,
  ADD COLUMN `utmMedium` VARCHAR(191) NULL,
  ADD COLUMN `utmCampaign` VARCHAR(191) NULL,
  ADD COLUMN `utmTerm` VARCHAR(191) NULL,
  ADD COLUMN `utmContent` VARCHAR(191) NULL,
  ADD COLUMN `landingPage` TEXT NULL,
  ADD COLUMN `referrer` TEXT NULL,
  ADD COLUMN `websiteLeadId` VARCHAR(191) NULL;

-- Campaign reporting groups by campaign over a date range.
CREATE INDEX `Lead_utmCampaign_createdAt_idx` ON `Lead`(`utmCampaign`, `createdAt`);

-- Tracing one enquiry from the website's logs into the CRM.
CREATE INDEX `Lead_websiteLeadId_idx` ON `Lead`(`websiteLeadId`);
