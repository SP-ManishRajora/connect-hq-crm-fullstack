-- Inbound calls matched to website phone taps.
--
-- An inbound FreJun call is matched to the phone_click WebEvent that preceded
-- it, which is how the call inherits the visitor's campaign and gclid, and how
-- a call through a Google forwarding number is told apart from one to our own
-- number (the tap records which number was on the page).
--
-- Unique so one tap is never credited with two calls. NULL for outbound calls
-- and for inbound calls with no single matching tap.
ALTER TABLE `CallLog`
  ADD COLUMN `phoneClickEventId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `CallLog_phoneClickEventId_key` ON `CallLog`(`phoneClickEventId`);
