-- CreateEnum
CREATE TYPE "ValidationSide" AS ENUM ('SALES', 'DELIVERY');

-- CreateEnum
CREATE TYPE "OfferModel" AS ENUM ('CPI', 'CPA', 'CPS', 'CPL', 'CPR');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'PENDING_FINANCE_REVIEW', 'READY_TO_SEND', 'SENT_TO_PUBLISHER', 'ACKNOWLEDGED', 'DISPUTED', 'REVISED', 'APPROVED', 'PARTIALLY_APPROVED', 'INVOICE_RECEIVED', 'PAYMENT_PENDING', 'PAID', 'CLOSED');

-- CreateTable
CREATE TABLE "Advertiser" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Advertiser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" SERIAL NOT NULL,
    "advertiserId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "geo" TEXT,
    "platform" "Platform",
    "offerModel" "OfferModel",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publisher" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Publisher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Validation" (
    "id" SERIAL NOT NULL,
    "side" "ValidationSide" NOT NULL,
    "number" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "publisherId" INTEGER,
    "clientRef" TEXT,
    "geo" TEXT NOT NULL,
    "platform" "Platform",
    "offerModel" "OfferModel" NOT NULL,
    "totalConversions" INTEGER NOT NULL,
    "approvedConversions" INTEGER NOT NULL,
    "rejectedConversions" INTEGER NOT NULL,
    "payoutRate" DECIMAL(14,4),
    "amount" DECIMAL(14,2) NOT NULL,
    "deduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDate" DATE,
    "sentDate" DATE,
    "remarks" TEXT,
    "status" "ValidationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Validation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationFile" (
    "id" SERIAL NOT NULL,
    "validationId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Advertiser_name_key" ON "Advertiser"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_advertiserId_name_key" ON "Campaign"("advertiserId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Publisher_name_key" ON "Publisher"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Publisher_code_key" ON "Publisher"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Validation_number_key" ON "Validation"("number");

-- CreateIndex
CREATE INDEX "Validation_side_month_idx" ON "Validation"("side", "month");

-- CreateIndex
CREATE INDEX "Validation_campaignId_month_idx" ON "Validation"("campaignId", "month");

-- CreateIndex
CREATE INDEX "Validation_side_status_idx" ON "Validation"("side", "status");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "Advertiser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationFile" ADD CONSTRAINT "ValidationFile_validationId_fkey" FOREIGN KEY ("validationId") REFERENCES "Validation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationFile" ADD CONSTRAINT "ValidationFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Delivery team: owns publisher-side validations.
INSERT INTO "Department" ("name") VALUES ('Delivery') ON CONFLICT ("name") DO NOTHING;
