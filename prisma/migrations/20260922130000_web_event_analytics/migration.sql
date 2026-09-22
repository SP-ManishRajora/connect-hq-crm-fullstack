-- Website analytics: raw visitor activity from connecthq.co.in.
--
-- Self-hosted rather than read back from Google. GA4's Data API returns
-- aggregates only — it can say a campaign produced 40 enquiries, but never
-- which lead was which. These rows carry the same visitorId/sessionId the
-- enquiry form submits, so a booked deal traces back to the session, and the
-- ad click, that produced it.
--
-- TEXT vs VARCHAR(191): anything that holds a URL, a referrer or a gclid is
-- TEXT — query strings routinely exceed 191 characters. The campaign labels and
-- ids are short and need to be indexed, so they stay VARCHAR.
--
-- This will become the largest table in the database (one row per page view).
-- The indexes below are the ones the dashboard actually uses; resist adding
-- more, since each one is paid for on every insert.
CREATE TABLE `WebEvent` (
  `id`            VARCHAR(191) NOT NULL,
  `name`          VARCHAR(191) NOT NULL,

  `visitorId`     VARCHAR(191) NOT NULL,
  `sessionId`     VARCHAR(191) NOT NULL,

  `path`          TEXT         NOT NULL,
  `url`           TEXT         NULL,
  `title`         TEXT         NULL,
  `referrer`      TEXT         NULL,

  `gclid`         TEXT         NULL,
  `utmSource`     VARCHAR(191) NULL,
  `utmMedium`     VARCHAR(191) NULL,
  `utmCampaign`   VARCHAR(191) NULL,
  `utmTerm`       VARCHAR(191) NULL,
  `utmContent`    VARCHAR(191) NULL,

  `websiteLeadId` VARCHAR(191) NULL,

  `device`        VARCHAR(191) NULL,
  `browser`       VARCHAR(191) NULL,
  `os`            VARCHAR(191) NULL,
  `country`       VARCHAR(191) NULL,
  `ipPrefix`      VARCHAR(191) NULL,

  `meta`          TEXT         NULL,

  `occurredAt`    DATETIME(3)  NOT NULL,
  `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- "Page views per day", "phone taps this week".
CREATE INDEX `WebEvent_name_occurredAt_idx`      ON `WebEvent`(`name`, `occurredAt`);
-- "Traffic and enquiries by campaign over a range" — the dashboard's main query.
CREATE INDEX `WebEvent_utmCampaign_occurredAt_idx` ON `WebEvent`(`utmCampaign`, `occurredAt`);
-- One visitor's whole journey across sessions.
CREATE INDEX `WebEvent_visitorId_occurredAt_idx` ON `WebEvent`(`visitorId`, `occurredAt`);
-- Session rollups, and counting distinct sessions.
CREATE INDEX `WebEvent_sessionId_idx`            ON `WebEvent`(`sessionId`);
-- The join back to Lead: which session produced this enquiry.
CREATE INDEX `WebEvent_websiteLeadId_idx`        ON `WebEvent`(`websiteLeadId`);
-- Date-range scans that are not filtered by anything else, and retention pruning.
CREATE INDEX `WebEvent_occurredAt_idx`           ON `WebEvent`(`occurredAt`);
