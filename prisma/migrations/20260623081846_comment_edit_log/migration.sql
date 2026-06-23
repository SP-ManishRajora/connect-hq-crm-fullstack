-- AlterTable
ALTER TABLE `Comment` ADD COLUMN `editedAt` DATETIME(3) NULL,
    ADD COLUMN `editedById` VARCHAR(191) NULL,
    MODIFY `body` TEXT NOT NULL;

-- CreateTable
CREATE TABLE `CommentEdit` (
    `id` VARCHAR(191) NOT NULL,
    `commentId` VARCHAR(191) NOT NULL,
    `prevBody` TEXT NOT NULL,
    `editorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CommentEdit` ADD CONSTRAINT `CommentEdit_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `Comment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommentEdit` ADD CONSTRAINT `CommentEdit_editorId_fkey` FOREIGN KEY (`editorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
