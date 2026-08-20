-- City, area and workspace type captured by the connecthq.co.in website enquiry
-- form. Previously these were folded into the free-text `notes` column, which
-- made them impossible to filter or report on.
ALTER TABLE `Lead`
  ADD COLUMN `city` VARCHAR(191) NULL,
  ADD COLUMN `area` VARCHAR(191) NULL,
  ADD COLUMN `workspaceType` VARCHAR(191) NULL;
