-- Replace canEscalate with isReference on CircleMembership
ALTER TABLE "CircleMembership" DROP COLUMN "canEscalate";
ALTER TABLE "CircleMembership" ADD COLUMN "isReference" BOOLEAN NOT NULL DEFAULT false;

-- User.firstName: add nullable, backfill existing rows, then enforce NOT NULL
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
UPDATE "User" SET "firstName" = 'Prenom' WHERE "firstName" IS NULL;
ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL;

-- Contact.name: backfill nulls (fall back to phone) then enforce NOT NULL
UPDATE "Contact" SET "name" = "phone" WHERE "name" IS NULL;
ALTER TABLE "Contact" ALTER COLUMN "name" SET NOT NULL;
