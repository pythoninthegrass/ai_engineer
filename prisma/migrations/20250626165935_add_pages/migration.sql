/*
  Warnings:

  - You are about to drop the column `documentId` on the `DocumentChunk` table. All the data in the column will be lost.
  - Added the required column `documentPageId` to the `DocumentChunk` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "DocumentChunk" DROP CONSTRAINT "DocumentChunk_documentId_fkey";

-- DropIndex
DROP INDEX "DocumentChunk_documentId_pageNumber_key";

-- AlterTable
ALTER TABLE "DocumentChunk" DROP COLUMN "documentId",
ADD COLUMN     "documentPageId" INTEGER NOT NULL,
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "documentId" INTEGER NOT NULL,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentPageId_fkey" FOREIGN KEY ("documentPageId") REFERENCES "DocumentPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
