/*
  Warnings:

  - You are about to drop the column `filePath` on the `Document` table. All the data in the column will be lost.
  - Added the required column `data` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileName` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `size` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Document" DROP COLUMN "filePath",
ADD COLUMN     "data" BYTEA NOT NULL,
ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "size" INTEGER NOT NULL;
