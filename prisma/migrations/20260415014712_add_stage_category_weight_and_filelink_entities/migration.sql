-- AlterTable
ALTER TABLE "file_links" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "leadId" TEXT,
ALTER COLUMN "contactId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "pipeline_stages" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN     "weight" INTEGER NOT NULL DEFAULT 50;

-- AddForeignKey
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
