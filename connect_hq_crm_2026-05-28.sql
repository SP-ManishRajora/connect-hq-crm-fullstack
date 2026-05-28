-- MySQL dump 10.13  Distrib 8.0.42, for Linux (x86_64)
--
-- Host: 127.0.0.1    Database: connect_hq_crm
-- ------------------------------------------------------
-- Server version	8.0.42-0ubuntu0.20.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `Asset`
--

DROP TABLE IF EXISTS `Asset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Asset` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `serialNo` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purchaseDate` datetime(3) DEFAULT NULL,
  `cost` double DEFAULT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OK',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Asset_centerId_fkey` (`centerId`),
  CONSTRAINT `Asset_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Asset`
--

LOCK TABLES `Asset` WRITE;
/*!40000 ALTER TABLE `Asset` DISABLE KEYS */;
/*!40000 ALTER TABLE `Asset` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `AttendanceLog`
--

DROP TABLE IF EXISTS `AttendanceLog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AttendanceLog` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reportedById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `cleanliness` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issuesNote` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photos` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `AttendanceLog_centerId_fkey` (`centerId`),
  KEY `AttendanceLog_reportedById_fkey` (`reportedById`),
  CONSTRAINT `AttendanceLog_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AttendanceLog_reportedById_fkey` FOREIGN KEY (`reportedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `AttendanceLog`
--

LOCK TABLES `AttendanceLog` WRITE;
/*!40000 ALTER TABLE `AttendanceLog` DISABLE KEYS */;
/*!40000 ALTER TABLE `AttendanceLog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Booking`
--

DROP TABLE IF EXISTS `Booking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Booking` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `roomId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bookedById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clientId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `startTime` datetime(3) NOT NULL,
  `endTime` datetime(3) NOT NULL,
  `notes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CONFIRMED',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `chargedAmount` double NOT NULL DEFAULT '0',
  `durationHrs` double NOT NULL DEFAULT '0',
  `isChargeable` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `Booking_roomId_fkey` (`roomId`),
  KEY `Booking_centerId_fkey` (`centerId`),
  KEY `Booking_clientId_fkey` (`clientId`),
  KEY `Booking_bookedById_fkey` (`bookedById`),
  CONSTRAINT `Booking_bookedById_fkey` FOREIGN KEY (`bookedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Booking_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Booking_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Booking_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `MeetingRoom` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Booking`
--

LOCK TABLES `Booking` WRITE;
/*!40000 ALTER TABLE `Booking` DISABLE KEYS */;
/*!40000 ALTER TABLE `Booking` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Cabin`
--

DROP TABLE IF EXISTS `Cabin`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Cabin` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `capacity` int NOT NULL,
  `photos` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Cabin_centerId_fkey` (`centerId`),
  CONSTRAINT `Cabin_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Cabin`
--

LOCK TABLES `Cabin` WRITE;
/*!40000 ALTER TABLE `Cabin` DISABLE KEYS */;
/*!40000 ALTER TABLE `Cabin` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Center`
--

DROP TABLE IF EXISTS `Center`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Center` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `totalSeats` int NOT NULL DEFAULT '0',
  `mapImagePath` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `commonAreaPhotos` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Center`
--

LOCK TABLES `Center` WRITE;
/*!40000 ALTER TABLE `Center` DISABLE KEYS */;
/*!40000 ALTER TABLE `Center` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Client`
--

DROP TABLE IF EXISTS `Client`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Client` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `companyName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contactName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `proposalId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `startDate` datetime(3) DEFAULT NULL,
  `specialAgreement` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentToOps` tinyint(1) NOT NULL DEFAULT '0',
  `cmConfirmed` tinyint(1) NOT NULL DEFAULT '0',
  `clientConfirmed` tinyint(1) NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `cabinId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `occupiedSeats` int NOT NULL DEFAULT '0',
  `picUserId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `totalCabinSeats` int NOT NULL DEFAULT '0',
  `unusedSeatLastReminderAt` datetime(3) DEFAULT NULL,
  `unusedSeatReminderSent` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `Client_proposalId_key` (`proposalId`),
  KEY `Client_centerId_fkey` (`centerId`),
  KEY `Client_cabinId_fkey` (`cabinId`),
  KEY `Client_picUserId_fkey` (`picUserId`),
  CONSTRAINT `Client_cabinId_fkey` FOREIGN KEY (`cabinId`) REFERENCES `Cabin` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Client_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Client_picUserId_fkey` FOREIGN KEY (`picUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Client_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Proposal` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Client`
--

LOCK TABLES `Client` WRITE;
/*!40000 ALTER TABLE `Client` DISABLE KEYS */;
/*!40000 ALTER TABLE `Client` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ClientInvoice`
--

DROP TABLE IF EXISTS `ClientInvoice`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ClientInvoice` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clientId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invoiceNo` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `periodStart` datetime(3) NOT NULL,
  `periodEnd` datetime(3) NOT NULL,
  `baseAmount` double NOT NULL,
  `gstAmount` double NOT NULL DEFAULT '0',
  `totalAmount` double NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ISSUED',
  `issuedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `paidAt` datetime(3) DEFAULT NULL,
  `emailSent` tinyint(1) NOT NULL DEFAULT '0',
  `halfPriceLine` double NOT NULL DEFAULT '0',
  `meetingRoomLine` double NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ClientInvoice_invoiceNo_key` (`invoiceNo`),
  KEY `ClientInvoice_clientId_fkey` (`clientId`),
  KEY `ClientInvoice_centerId_fkey` (`centerId`),
  CONSTRAINT `ClientInvoice_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ClientInvoice_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ClientInvoice`
--

LOCK TABLES `ClientInvoice` WRITE;
/*!40000 ALTER TABLE `ClientInvoice` DISABLE KEYS */;
/*!40000 ALTER TABLE `ClientInvoice` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Comment`
--

DROP TABLE IF EXISTS `Comment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Comment` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `leadId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `authorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Comment_leadId_fkey` (`leadId`),
  KEY `Comment_authorId_fkey` (`authorId`),
  CONSTRAINT `Comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Comment_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Comment`
--

LOCK TABLES `Comment` WRITE;
/*!40000 ALTER TABLE `Comment` DISABLE KEYS */;
/*!40000 ALTER TABLE `Comment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Contract`
--

DROP TABLE IF EXISTS `Contract`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Contract` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clientId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `startDate` datetime(3) NOT NULL,
  `endDate` datetime(3) DEFAULT NULL,
  `monthlyRent` double NOT NULL,
  `securityDeposit` double NOT NULL,
  `incrementPct` double NOT NULL,
  `revisionDate` datetime(3) NOT NULL,
  `reminderSent` tinyint(1) NOT NULL DEFAULT '0',
  `filePath` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ocrParsedJson` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Contract_clientId_key` (`clientId`),
  CONSTRAINT `Contract_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Contract`
--

LOCK TABLES `Contract` WRITE;
/*!40000 ALTER TABLE `Contract` DISABLE KEYS */;
/*!40000 ALTER TABLE `Contract` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Expense`
--

DROP TABLE IF EXISTS `Expense`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Expense` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` double NOT NULL,
  `gst` double NOT NULL DEFAULT '0',
  `tds` double NOT NULL DEFAULT '0',
  `payee` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `paymentMode` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `notes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `Expense_centerId_fkey` (`centerId`),
  CONSTRAINT `Expense_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Expense`
--

LOCK TABLES `Expense` WRITE;
/*!40000 ALTER TABLE `Expense` DISABLE KEYS */;
/*!40000 ALTER TABLE `Expense` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Feedback`
--

DROP TABLE IF EXISTS `Feedback`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Feedback` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clientId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rating` int NOT NULL,
  `body` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Feedback_clientId_fkey` (`clientId`),
  CONSTRAINT `Feedback_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Feedback`
--

LOCK TABLES `Feedback` WRITE;
/*!40000 ALTER TABLE `Feedback` DISABLE KEYS */;
/*!40000 ALTER TABLE `Feedback` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `InventoryItem`
--

DROP TABLE IF EXISTS `InventoryItem`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `InventoryItem` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `currentStock` double NOT NULL DEFAULT '0',
  `threshold` double NOT NULL DEFAULT '0',
  `consumptionLog` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `InventoryItem_centerId_fkey` (`centerId`),
  CONSTRAINT `InventoryItem_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `InventoryItem`
--

LOCK TABLES `InventoryItem` WRITE;
/*!40000 ALTER TABLE `InventoryItem` DISABLE KEYS */;
/*!40000 ALTER TABLE `InventoryItem` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Lead`
--

DROP TABLE IF EXISTS `Lead`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Lead` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `seatsNeeded` int DEFAULT NULL,
  `budget` double DEFAULT NULL,
  `notes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NEW',
  `ownerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `Lead_centerId_fkey` (`centerId`),
  KEY `Lead_ownerId_fkey` (`ownerId`),
  CONSTRAINT `Lead_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Lead_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Lead`
--

LOCK TABLES `Lead` WRITE;
/*!40000 ALTER TABLE `Lead` DISABLE KEYS */;
/*!40000 ALTER TABLE `Lead` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LedgerEntry`
--

DROP TABLE IF EXISTS `LedgerEntry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `LedgerEntry` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `debit` double NOT NULL DEFAULT '0',
  `credit` double NOT NULL DEFAULT '0',
  `refType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `refId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `narration` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LedgerEntry`
--

LOCK TABLES `LedgerEntry` WRITE;
/*!40000 ALTER TABLE `LedgerEntry` DISABLE KEYS */;
/*!40000 ALTER TABLE `LedgerEntry` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `MeetingRoom`
--

DROP TABLE IF EXISTS `MeetingRoom`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `MeetingRoom` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `capacity` int NOT NULL,
  `hourlyRate` double NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `MeetingRoom_centerId_fkey` (`centerId`),
  CONSTRAINT `MeetingRoom_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `MeetingRoom`
--

LOCK TABLES `MeetingRoom` WRITE;
/*!40000 ALTER TABLE `MeetingRoom` DISABLE KEYS */;
/*!40000 ALTER TABLE `MeetingRoom` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Notice`
--

DROP TABLE IF EXISTS `Notice`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Notice` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `isAd` tinyint(1) NOT NULL DEFAULT '0',
  `brand` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `startDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endDate` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Notice_centerId_fkey` (`centerId`),
  CONSTRAINT `Notice_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Notice`
--

LOCK TABLES `Notice` WRITE;
/*!40000 ALTER TABLE `Notice` DISABLE KEYS */;
/*!40000 ALTER TABLE `Notice` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Proposal`
--

DROP TABLE IF EXISTS `Proposal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Proposal` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `leadId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `seats` int NOT NULL,
  `rentPerSeat` double NOT NULL,
  `securityDeposit` double NOT NULL,
  `lockInMonths` int NOT NULL,
  `customisations` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `imagesJson` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `belowThreshold` tinyint(1) NOT NULL DEFAULT '0',
  `approverNotes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `approvedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAt` datetime(3) DEFAULT NULL,
  `acceptedAt` datetime(3) DEFAULT NULL,
  `acceptanceFile` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `cabinId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `Proposal_leadId_fkey` (`leadId`),
  KEY `Proposal_centerId_fkey` (`centerId`),
  KEY `Proposal_approvedById_fkey` (`approvedById`),
  KEY `Proposal_createdById_fkey` (`createdById`),
  KEY `Proposal_cabinId_fkey` (`cabinId`),
  CONSTRAINT `Proposal_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Proposal_cabinId_fkey` FOREIGN KEY (`cabinId`) REFERENCES `Cabin` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Proposal_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Proposal_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Proposal_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Proposal`
--

LOCK TABLES `Proposal` WRITE;
/*!40000 ALTER TABLE `Proposal` DISABLE KEYS */;
/*!40000 ALTER TABLE `Proposal` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `PurchaseOrder`
--

DROP TABLE IF EXISTS `PurchaseOrder`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `PurchaseOrder` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `prId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vendorId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issuedById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemsJson` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `totalAmount` double NOT NULL,
  `isRecurring` tinyint(1) NOT NULL DEFAULT '0',
  `recurrence` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `piFile` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoiceFile` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paymentStatus` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UNPAID',
  `deliveryConfirmed` tinyint(1) NOT NULL DEFAULT '0',
  `deliveryNotes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deliveryPhotos` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `poNumber` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `PurchaseOrder_poNumber_key` (`poNumber`),
  KEY `PurchaseOrder_prId_fkey` (`prId`),
  KEY `PurchaseOrder_vendorId_fkey` (`vendorId`),
  KEY `PurchaseOrder_centerId_fkey` (`centerId`),
  KEY `PurchaseOrder_issuedById_fkey` (`issuedById`),
  CONSTRAINT `PurchaseOrder_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PurchaseOrder_issuedById_fkey` FOREIGN KEY (`issuedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PurchaseOrder_prId_fkey` FOREIGN KEY (`prId`) REFERENCES `PurchaseRequest` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PurchaseOrder_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `PurchaseOrder`
--

LOCK TABLES `PurchaseOrder` WRITE;
/*!40000 ALTER TABLE `PurchaseOrder` DISABLE KEYS */;
/*!40000 ALTER TABLE `PurchaseOrder` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `PurchaseRequest`
--

DROP TABLE IF EXISTS `PurchaseRequest`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `PurchaseRequest` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `raisedById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemsJson` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `PurchaseRequest_centerId_fkey` (`centerId`),
  KEY `PurchaseRequest_raisedById_fkey` (`raisedById`),
  CONSTRAINT `PurchaseRequest_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PurchaseRequest_raisedById_fkey` FOREIGN KEY (`raisedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `PurchaseRequest`
--

LOCK TABLES `PurchaseRequest` WRITE;
/*!40000 ALTER TABLE `PurchaseRequest` DISABLE KEYS */;
/*!40000 ALTER TABLE `PurchaseRequest` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Referral`
--

DROP TABLE IF EXISTS `Referral`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Referral` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `referrerType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `referrerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referrerName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prospectName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `prospectPhone` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `converted` tinyint(1) NOT NULL DEFAULT '0',
  `convertedClientId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `feeAmount` double NOT NULL DEFAULT '0',
  `feePaid` tinyint(1) NOT NULL DEFAULT '0',
  `notes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Referral_referrerId_fkey` (`referrerId`),
  KEY `Referral_convertedClientId_fkey` (`convertedClientId`),
  CONSTRAINT `Referral_convertedClientId_fkey` FOREIGN KEY (`convertedClientId`) REFERENCES `Client` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Referral_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `Client` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Referral`
--

LOCK TABLES `Referral` WRITE;
/*!40000 ALTER TABLE `Referral` DISABLE KEYS */;
/*!40000 ALTER TABLE `Referral` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Repair`
--

DROP TABLE IF EXISTS `Repair`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Repair` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reportedBy` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assignedTo` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vendorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost` double DEFAULT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `photos` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `Repair_centerId_fkey` (`centerId`),
  CONSTRAINT `Repair_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Repair`
--

LOCK TABLES `Repair` WRITE;
/*!40000 ALTER TABLE `Repair` DISABLE KEYS */;
/*!40000 ALTER TABLE `Repair` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `RepairCategory`
--

DROP TABLE IF EXISTS `RepairCategory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `RepairCategory` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `RepairCategory_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `RepairCategory`
--

LOCK TABLES `RepairCategory` WRITE;
/*!40000 ALTER TABLE `RepairCategory` DISABLE KEYS */;
/*!40000 ALTER TABLE `RepairCategory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Seat`
--

DROP TABLE IF EXISTS `Seat`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Seat` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `number` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assignedClientId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `occupied` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `cabinId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `partialOccupancy` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `Seat_centerId_number_key` (`centerId`,`number`),
  KEY `Seat_cabinId_fkey` (`cabinId`),
  CONSTRAINT `Seat_cabinId_fkey` FOREIGN KEY (`cabinId`) REFERENCES `Cabin` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Seat_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Seat`
--

LOCK TABLES `Seat` WRITE;
/*!40000 ALTER TABLE `Seat` DISABLE KEYS */;
/*!40000 ALTER TABLE `Seat` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Sop`
--

DROP TABLE IF EXISTS `Sop`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Sop` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileUrl` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Sop`
--

LOCK TABLES `Sop` WRITE;
/*!40000 ALTER TABLE `Sop` DISABLE KEYS */;
/*!40000 ALTER TABLE `Sop` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Ticket`
--

DROP TABLE IF EXISTS `Ticket`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Ticket` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clientId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `raisedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Ticket_clientId_fkey` (`clientId`),
  KEY `Ticket_raisedById_fkey` (`raisedById`),
  CONSTRAINT `Ticket_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Ticket_raisedById_fkey` FOREIGN KEY (`raisedById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Ticket`
--

LOCK TABLES `Ticket` WRITE;
/*!40000 ALTER TABLE `Ticket` DISABLE KEYS */;
/*!40000 ALTER TABLE `Ticket` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `User`
--

DROP TABLE IF EXISTS `User`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `User` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `emp_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `passwordHash` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `centerId` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employerClientId` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aadhaar` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pan` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `designation` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `deletedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `User_email_key` (`email`),
  UNIQUE KEY `User_emp_id_key` (`emp_id`),
  KEY `User_centerId_fkey` (`centerId`),
  KEY `User_employerClientId_fkey` (`employerClientId`),
  CONSTRAINT `User_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `User_employerClientId_fkey` FOREIGN KEY (`employerClientId`) REFERENCES `Client` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `User`
--

LOCK TABLES `User` WRITE;
/*!40000 ALTER TABLE `User` DISABLE KEYS */;
INSERT INTO `User` VALUES ('1','cmpo0sk2e000aljc9sry1612h','rehan.ahmad@connecthq.co.in','Rehan Ahmad','$2a$10$jY3dU1KC/fsEzzNTMJSHG.KRHtXBY41C85lUjT24yduSOTteHVexa','OWNER',NULL,NULL,NULL,NULL,NULL,'8588006245',1,NULL,'2026-05-27 12:08:09.110','2026-05-27 12:08:09.110'),('10','usr_004','priya.verma@example.com','Priya Verma','$2a$10$jY3dU1KC/fsEzzNTMJSHG.KRHtXBY41C85lUjT24yduSOTteHVexa','SUPERVISOR',NULL,NULL,'456745674567','DEABC4567J','Operations Supervisor','9876543213',1,NULL,'2026-05-27 11:31:01.000','2026-05-27 11:31:01.000'),('12','EMP001','manishrajora@spares-pazari.com','Manish Rajora','$2a$10$PZECXNItGP6KJkndMJ1TD.D4OdXdNDqGUVcv0mPe.YMHSezVG.FoO','ADMIN',NULL,NULL,NULL,NULL,NULL,'123456789',1,NULL,'2026-05-26 07:07:23.850','2026-05-26 07:07:23.850'),('13','EMP002','dj@spares-pazari.com','cdj','$2a$10$jY3dU1KC/fsEzzNTMJSHG.KRHtXBY41C85lUjT24yduSOTteHVexa','OWNER',NULL,NULL,NULL,NULL,NULL,'45678912300',1,NULL,'2026-05-27 07:22:03.274','2026-05-27 07:22:03.274'),('14','EMP003','admin@erp.com','admin','$2a$10$7UTZ3oUEFhKVNdDA2uK.juGc7eJPGT1lFsQdjCCnpEy/4euwncqvu','OWNER',NULL,NULL,NULL,NULL,NULL,'7894561322',1,NULL,'2026-05-27 11:15:35.293','2026-05-27 11:15:35.293'),('2','cmpo0ybig000cljc9g2xpmo93','cm001@connecthq.co.in','Madhav Khatri','$2a$10$jY3dU1KC/fsEzzNTMJSHG.KRHtXBY41C85lUjT24yduSOTteHVexa','CENTER_MANAGER',NULL,NULL,NULL,NULL,NULL,'7678657542',1,NULL,'2026-05-27 12:12:37.960','2026-05-27 12:12:37.960'),('3','cmpo102dc000eljc98msmfswz','sales@connecthq.co.in','Gorripati Eswari','$2a$10$jY3dU1KC/fsEzzNTMJSHG.KRHtXBY41C85lUjT24yduSOTteHVexa','SALES',NULL,NULL,NULL,NULL,NULL,' 6300907795',1,NULL,'2026-05-27 12:13:59.424','2026-05-27 12:13:59.424'),('4','cmpo12wzu000gljc9dqe0adp4','cm002@connecthq.co.in','Deeksha Sagar','$2a$10$jY3dU1KC/fsEzzNTMJSHG.KRHtXBY41C85lUjT24yduSOTteHVexa','CENTER_MANAGER',NULL,NULL,NULL,NULL,NULL,'93154 08389',1,NULL,'2026-05-27 12:16:12.426','2026-05-27 12:16:12.426'),('5','cmpo14nil000iljc9jv35w047','cm003@connecthq.co.in',' Khushboo Rastogi','$2a$10$jY3dU1KC/fsEzzNTMJSHG.KRHtXBY41C85lUjT24yduSOTteHVexa','CENTER_MANAGER',NULL,NULL,NULL,NULL,NULL,'8585947193',1,NULL,'2026-05-27 12:17:33.454','2026-05-27 12:17:33.454'),('6','cmpo1646o000kljc9hrir5yl6','sales01@connecthq.co.in','Shailendra Singh','$2a$10$jY3dU1KC/fsEzzNTMJSHG.KRHtXBY41C85lUjT24yduSOTteHVexa','SALES',NULL,NULL,NULL,NULL,NULL,'9667255248',1,'2026-05-27 12:44:14.843','2026-05-27 12:18:41.712','2026-05-27 12:44:14.844'),('7','usr_001','john.doe@example.com','John Doe','$2a$10$jY3dU1KC/fsEzzNTMJSHG.KRHtXBY41C85lUjT24yduSOTteHVexa','ADMIN',NULL,NULL,'123412341234','ABCDE1234F','System Admin','9876543210',1,NULL,'2026-05-27 11:31:01.000','2026-05-27 11:31:01.000'),('8','usr_002','jane.smith@example.com','Jane Smith','$2a$10$jY3dU1KC/fsEzzNTMJSHG.KRHtXBY41C85lUjT24yduSOTteHVexa','MANAGER',NULL,NULL,'234523452345','BCDEA2345G','HR Manager','9876543211',1,NULL,'2026-05-27 11:31:01.000','2026-05-27 11:31:01.000'),('9','usr_003','rohit.sharma@example.com','Rohit Sharma','$2a$10$jY3dU1KC/fsEzzNTMJSHG.KRHtXBY41C85lUjT24yduSOTteHVexa','EMPLOYEE',NULL,NULL,'345634563456','CDEAB3456H','Software Engineer','9876543212',1,NULL,'2026-05-27 11:31:01.000','2026-05-27 11:31:01.000');
/*!40000 ALTER TABLE `User` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Vendor`
--

DROP TABLE IF EXISTS `Vendor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Vendor` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gstin` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `panNumber` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bankDetails` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `rateCardJson` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `blacklistRemarks` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blacklisted` tinyint(1) NOT NULL DEFAULT '0',
  `deletedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Vendor`
--

LOCK TABLES `Vendor` WRITE;
/*!40000 ALTER TABLE `Vendor` DISABLE KEYS */;
/*!40000 ALTER TABLE `Vendor` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `VendorInvoice`
--

DROP TABLE IF EXISTS `VendorInvoice`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `VendorInvoice` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vendorId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `poId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `filePath` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ocrJson` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoiceNo` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoiceDate` datetime(3) DEFAULT NULL,
  `amount` double NOT NULL DEFAULT '0',
  `gst` double NOT NULL DEFAULT '0',
  `poMatchStatus` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UNMATCHED',
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `approvedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remarks` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `VendorInvoice_vendorId_fkey` (`vendorId`),
  KEY `VendorInvoice_poId_fkey` (`poId`),
  CONSTRAINT `VendorInvoice_poId_fkey` FOREIGN KEY (`poId`) REFERENCES `PurchaseOrder` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `VendorInvoice_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `VendorInvoice`
--

LOCK TABLES `VendorInvoice` WRITE;
/*!40000 ALTER TABLE `VendorInvoice` DISABLE KEYS */;
/*!40000 ALTER TABLE `VendorInvoice` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Visitor`
--

DROP TABLE IF EXISTS `Visitor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Visitor` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aadhaar` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pan` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kycVerified` tinyint(1) NOT NULL DEFAULT '0',
  `digilockerRef` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tourTaken` tinyint(1) NOT NULL DEFAULT '0',
  `tourDate` datetime(3) DEFAULT NULL,
  `leadId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `centerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Visitor_leadId_fkey` (`leadId`),
  KEY `Visitor_centerId_fkey` (`centerId`),
  CONSTRAINT `Visitor_centerId_fkey` FOREIGN KEY (`centerId`) REFERENCES `Center` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Visitor_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Visitor`
--

LOCK TABLES `Visitor` WRITE;
/*!40000 ALTER TABLE `Visitor` DISABLE KEYS */;
/*!40000 ALTER TABLE `Visitor` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `_prisma_migrations`
--

DROP TABLE IF EXISTS `_prisma_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `checksum` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logs` text COLLATE utf8mb4_unicode_ci,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `_prisma_migrations`
--

LOCK TABLES `_prisma_migrations` WRITE;
/*!40000 ALTER TABLE `_prisma_migrations` DISABLE KEYS */;
INSERT INTO `_prisma_migrations` VALUES ('99380a6a-1b6f-40bc-8e52-2cf6804ed2e4','ec577bcaa659d7b0097fac358c4263b25f557b341b3ae7cb6eb641d600035998','2026-05-28 02:36:20.296','0_init','',NULL,'2026-05-28 02:36:20.296',0);
/*!40000 ALTER TABLE `_prisma_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'connect_hq_crm'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-28  8:11:47
