ALTER TABLE `Proposal`
  ADD COLUMN `quotedPrice` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `negotiatedPrice` DOUBLE NOT NULL DEFAULT 0;

UPDATE `Proposal` SET `quotedPrice` = `rentPerSeat` * `seats`, `negotiatedPrice` = `rentPerSeat` * `seats`;

ALTER TABLE `Proposal`
  DROP COLUMN `seats`,
  DROP COLUMN `rentPerSeat`;
