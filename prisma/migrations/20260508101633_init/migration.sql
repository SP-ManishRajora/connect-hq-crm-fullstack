-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "centerId" TEXT,
    "employerClientId" TEXT,
    "aadhaar" TEXT,
    "pan" TEXT,
    "designation" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_employerClientId_fkey" FOREIGN KEY ("employerClientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Center" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "totalSeats" INTEGER NOT NULL DEFAULT 0,
    "mapImagePath" TEXT,
    "commonAreaPhotos" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Cabin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "photos" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cabin_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "seatsNeeded" INTEGER,
    "budget" REAL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "ownerId" TEXT,
    "centerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "aadhaar" TEXT,
    "pan" TEXT,
    "kycVerified" BOOLEAN NOT NULL DEFAULT false,
    "digilockerRef" TEXT,
    "tourTaken" BOOLEAN NOT NULL DEFAULT false,
    "tourDate" DATETIME,
    "leadId" TEXT,
    "centerId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Visitor_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Visitor_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT,
    "centerId" TEXT NOT NULL,
    "cabinId" TEXT,
    "seats" INTEGER NOT NULL,
    "rentPerSeat" REAL NOT NULL,
    "securityDeposit" REAL NOT NULL,
    "lockInMonths" INTEGER NOT NULL,
    "customisations" TEXT,
    "imagesJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "belowThreshold" BOOLEAN NOT NULL DEFAULT false,
    "approverNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "sentAt" DATETIME,
    "acceptedAt" DATETIME,
    "acceptanceFile" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Proposal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Proposal_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Proposal_cabinId_fkey" FOREIGN KEY ("cabinId") REFERENCES "Cabin" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Proposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Proposal_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "centerId" TEXT NOT NULL,
    "cabinId" TEXT,
    "proposalId" TEXT,
    "startDate" DATETIME,
    "specialAgreement" TEXT,
    "sentToOps" BOOLEAN NOT NULL DEFAULT false,
    "cmConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "clientConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "occupiedSeats" INTEGER NOT NULL DEFAULT 0,
    "totalCabinSeats" INTEGER NOT NULL DEFAULT 0,
    "unusedSeatReminderSent" BOOLEAN NOT NULL DEFAULT false,
    "unusedSeatLastReminderAt" DATETIME,
    "picUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Client_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Client_cabinId_fkey" FOREIGN KEY ("cabinId") REFERENCES "Cabin" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Client_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Client_picUserId_fkey" FOREIGN KEY ("picUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "monthlyRent" REAL NOT NULL,
    "securityDeposit" REAL NOT NULL,
    "incrementPct" REAL NOT NULL,
    "revisionDate" DATETIME NOT NULL,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "filePath" TEXT,
    "ocrParsedJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "gstin" TEXT,
    "panNumber" TEXT,
    "bankDetails" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklistRemarks" TEXT,
    "deletedAt" DATETIME,
    "rateCardJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseRequest_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequest_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poNumber" TEXT NOT NULL,
    "prId" TEXT,
    "vendorId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence" TEXT,
    "category" TEXT NOT NULL,
    "piFile" TEXT,
    "invoiceFile" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "deliveryConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "deliveryNotes" TEXT,
    "deliveryPhotos" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrder_prId_fkey" FOREIGN KEY ("prId") REFERENCES "PurchaseRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VendorInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendorId" TEXT NOT NULL,
    "poId" TEXT,
    "filePath" TEXT NOT NULL,
    "ocrJson" TEXT,
    "invoiceNo" TEXT,
    "invoiceDate" DATETIME,
    "amount" REAL NOT NULL DEFAULT 0,
    "gst" REAL NOT NULL DEFAULT 0,
    "poMatchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VendorInvoice_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentStock" REAL NOT NULL DEFAULT 0,
    "threshold" REAL NOT NULL DEFAULT 0,
    "consumptionLog" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serialNo" TEXT,
    "location" TEXT,
    "purchaseDate" DATETIME,
    "cost" REAL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepairCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Repair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reportedBy" TEXT,
    "assignedTo" TEXT NOT NULL,
    "vendorId" TEXT,
    "cost" REAL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "photos" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "Repair_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "hourlyRate" REAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "MeetingRoom_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "bookedById" TEXT NOT NULL,
    "clientId" TEXT,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "durationHrs" REAL NOT NULL DEFAULT 0,
    "isChargeable" BOOLEAN NOT NULL DEFAULT false,
    "chargedAmount" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MeetingRoom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "baseAmount" REAL NOT NULL,
    "halfPriceLine" REAL NOT NULL DEFAULT 0,
    "meetingRoomLine" REAL NOT NULL DEFAULT 0,
    "gstAmount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ClientInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClientInvoice_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "raisedById" TEXT,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ticket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isAd" BOOLEAN NOT NULL DEFAULT false,
    "brand" TEXT,
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notice_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrerType" TEXT NOT NULL,
    "referrerId" TEXT,
    "referrerName" TEXT NOT NULL,
    "contact" TEXT,
    "prospectName" TEXT NOT NULL,
    "prospectPhone" TEXT,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "convertedClientId" TEXT,
    "feeAmount" REAL NOT NULL DEFAULT 0,
    "feePaid" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Referral_convertedClientId_fkey" FOREIGN KEY ("convertedClientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerId" TEXT,
    "category" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "gst" REAL NOT NULL DEFAULT 0,
    "tds" REAL NOT NULL DEFAULT 0,
    "payee" TEXT NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "attachment" TEXT,
    CONSTRAINT "Expense_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account" TEXT NOT NULL,
    "debit" REAL NOT NULL DEFAULT 0,
    "credit" REAL NOT NULL DEFAULT 0,
    "refType" TEXT NOT NULL,
    "refId" TEXT,
    "centerId" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "narration" TEXT
);

-- CreateTable
CREATE TABLE "AttendanceLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanliness" TEXT NOT NULL,
    "issuesNote" TEXT,
    "photos" TEXT,
    CONSTRAINT "AttendanceLog_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AttendanceLog_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "centerId" TEXT NOT NULL,
    "cabinId" TEXT,
    "number" TEXT NOT NULL,
    "zone" TEXT,
    "assignedClientId" TEXT,
    "occupied" BOOLEAN NOT NULL DEFAULT false,
    "partialOccupancy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Seat_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Seat_cabinId_fkey" FOREIGN KEY ("cabinId") REFERENCES "Cabin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_proposalId_key" ON "Client"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_clientId_key" ON "Contract"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RepairCategory_name_key" ON "RepairCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ClientInvoice_invoiceNo_key" ON "ClientInvoice"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_centerId_number_key" ON "Seat"("centerId", "number");
