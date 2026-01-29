-- AlterTable: Add sourceContentHash field to translations table
-- This field stores the hash of the source content at translation time
-- to enable detection of outdated translations when source content changes

ALTER TABLE "translations" ADD COLUMN "sourceContentHash" TEXT NOT NULL DEFAULT '';

-- Remove default after adding the column (for future inserts must provide value)
ALTER TABLE "translations" ALTER COLUMN "sourceContentHash" DROP DEFAULT;
