-- AlterTable
ALTER TABLE "Validation" ADD COLUMN     "approvedAmount" DECIMAL(14,2),
ADD COLUMN     "paidDate" DATE,
ADD COLUMN     "paymentRef" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

