-- Replace numeric tier with an isPrimary flag: exactly one "1st circle" per
-- owner. Backfill by marking each owner's earliest circle as primary.
ALTER TABLE "Circle" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Circle" c SET "isPrimary" = true
WHERE c.id = (
  SELECT c2.id FROM "Circle" c2
  WHERE c2."ownerId" = c."ownerId"
  ORDER BY c2."createdAt" ASC, c2.id ASC
  LIMIT 1
);

ALTER TABLE "Circle" DROP COLUMN "tier";
