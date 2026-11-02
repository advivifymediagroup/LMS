-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "blockedOnNotice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blockedOnProbation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "certificateAfterDays" INTEGER,
ADD COLUMN     "longLeaveDays" INTEGER,
ADD COLUMN     "longNoticeDays" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "maxCarryForward" DROP NOT NULL,
ALTER COLUMN "maxCarryForward" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onNoticePeriod" BOOLEAN NOT NULL DEFAULT false;
