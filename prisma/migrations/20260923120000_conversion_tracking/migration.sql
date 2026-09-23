-- Full-funnel conversion tracking: offline conversions, call sources.
--
-- Closes the loop between a Google click and a paying customer. Until now the
-- CRM could say a lead arrived with a gclid, but nothing recorded whether that
-- lead's eventual sale was ever reported back to Google — so Ads kept bidding
-- on form fills rather than on revenue.

-- Offline conversion upload state, per lead.
--
-- Three columns rather than a boolean flag, because "was this uploaded" is not
-- the only question that matters: reconciling a disputed Ads report needs the
-- conversion action it was sent as and the value that went with it. Nullable
-- and unset by default — an un-uploaded lead is the normal case.
ALTER TABLE `Lead`
  ADD COLUMN `conversionUploadedAt`   DATETIME(3)  NULL,
  ADD COLUMN `conversionUploadedName` VARCHAR(191) NULL,
  ADD COLUMN `conversionValue`        DOUBLE       NULL;

-- The funnel report counts leads per stage over a date range.
CREATE INDEX `Lead_status_createdAt_idx` ON `Lead`(`status`, `createdAt`);

-- The upload worklist asks for won leads that have NOT been uploaded yet, which
-- is a scan of NULLs — cheap with an index, a full table scan without one.
CREATE INDEX `Lead_conversionUploadedAt_idx` ON `Lead`(`conversionUploadedAt`);

-- Where an inbound call came from.
--
-- CallLog already carried a direction, so inbound calls could be stored, but
-- nothing distinguished a caller who dialled a Google forwarding number (which
-- Ads can attribute to a click) from one who tapped the number on the website.
-- Those are different lines in the funnel and were previously indistinguishable.
--
-- gclid is TEXT to match the column on Lead: they hold the same kind of value
-- and a gclid runs well past 191 characters.
ALTER TABLE `CallLog`
  ADD COLUMN `callSource` VARCHAR(191) NULL,
  ADD COLUMN `gclid`      TEXT         NULL;

-- "Inbound calls from ads this month", grouped by source over a date range.
CREATE INDEX `CallLog_direction_callSource_startedAt_idx`
  ON `CallLog`(`direction`, `callSource`, `startedAt`);
