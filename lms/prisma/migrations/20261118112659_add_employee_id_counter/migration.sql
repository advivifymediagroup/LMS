-- CreateTable
CREATE TABLE "EmployeeIdCounter" (
    "role" "Role" NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EmployeeIdCounter_pkey" PRIMARY KEY ("role")
);
