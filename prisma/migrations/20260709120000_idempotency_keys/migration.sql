-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "fingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_householdId_externalId_key" ON "Transaction"("householdId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_householdId_fingerprint_key" ON "Transaction"("householdId", "fingerprint");

