-- AlterTable
-- allowedModules stores a JSON array of module keys. There are now 42 modules,
-- so a full selection serialises to ~535 chars and overflowed VARCHAR(191) (P2000).
ALTER TABLE `User` MODIFY `allowedModules` TEXT NULL;

-- AlterTable
ALTER TABLE `UserInvite` MODIFY `allowedModules` TEXT NULL;
