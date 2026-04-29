-- AlterTable
ALTER TABLE "social_accounts" ADD COLUMN     "link_method" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "defaultLanguage" TEXT DEFAULT 'en',
ADD COLUMN     "defaultTone" TEXT;
