-- Website phone taps that became leads.
--
-- A tap on the website's phone number is recorded as a phone_click WebEvent,
-- carrying the visitor's gclid and utm_* values. The call that follows reaches
-- a salesperson's phone with none of that. The Website Calls report lets sales
-- match the call to the tap and create the lead from it, so the lead inherits
-- the campaign — and a gclid, which makes the eventual sale uploadable to
-- Google Ads like any form lead.
--
-- Unique so the same tap cannot be turned into two leads by a double click or
-- by two salespeople at once. NULL for every lead that did not come this way,
-- and MySQL allows any number of NULLs under a unique index.
ALTER TABLE `Lead`
  ADD COLUMN `phoneClickEventId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Lead_phoneClickEventId_key` ON `Lead`(`phoneClickEventId`);
