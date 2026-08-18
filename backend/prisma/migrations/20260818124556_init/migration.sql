-- CreateEnum
CREATE TYPE "SentinelType" AS ENUM ('ONLY_SMS', 'SENTINEL', 'LEAD', 'FIRSTCIRCLE', 'UNCOMPLETE');

-- CreateEnum
CREATE TYPE "SentinelStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'CONNECTED', 'DEAD');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('ONLY_SMS', 'ACCOUNT', 'PAID_ACCOUNT', 'ORGANISATION', 'DEAD');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REMOVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('SENT', 'LAUNCHED', 'ACTIVE', 'CLOSING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('BYCOMPANION', 'LITTLEWORRY', 'MISSING', 'INCIDENT', 'UNKNOWN', 'EMERGENCY', 'NOCONTACT');

-- CreateEnum
CREATE TYPE "CircleType" AS ENUM ('BASIC', 'FIRST', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "CircleAlertStatus" AS ENUM ('WAITINGFORANSWERS', 'ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "LinkInitiator" AS ENUM ('COMPANION', 'SENTINEL');

-- CreateEnum
CREATE TYPE "LeadSlot" AS ENUM ('LEAD_1', 'LEAD_2', 'LEAD_3');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DELETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessagePermission" AS ENUM ('YES', 'NO', 'ONEBYONE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "userName" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "phone" TEXT NOT NULL,
    "phoneVerifiedAt" TIMESTAMP(3),
    "isMajor" BOOLEAN NOT NULL DEFAULT true,
    "publicStatus" TEXT,
    "userType" "UserType" DEFAULT 'ONLY_SMS',
    "hasPaid" BOOLEAN NOT NULL DEFAULT false,
    "confirmedByOwner" BOOLEAN NOT NULL DEFAULT false,
    "generalGroupChatPermisson" "MessagePermission" NOT NULL DEFAULT 'NO',
    "generalIndividualChatPermisson" "MessagePermission" NOT NULL DEFAULT 'NO',
    "otpCodeHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkSentinels" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentinelType" "SentinelType" NOT NULL DEFAULT 'ONLY_SMS',
    "initiatedBy" "LinkInitiator" NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAsLead" BOOLEAN NOT NULL DEFAULT false,
    "is1Circle" BOOLEAN NOT NULL DEFAULT false,
    "leadSlot" "LeadSlot",
    "groupChat" BOOLEAN NOT NULL DEFAULT false,
    "chat" BOOLEAN NOT NULL DEFAULT false,
    "canSendPhone" BOOLEAN NOT NULL DEFAULT false,
    "conversationId" TEXT,
    "sentinelId" TEXT NOT NULL,
    "companionId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,

    CONSTRAINT "LinkSentinels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Circle" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "label" TEXT NOT NULL,
    "status" TEXT,
    "circleType" "CircleType" NOT NULL DEFAULT 'BASIC',
    "groupChat" BOOLEAN NOT NULL DEFAULT false,
    "canSendPhone" BOOLEAN NOT NULL DEFAULT false,
    "companionId" TEXT NOT NULL,

    CONSTRAINT "Circle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "label" TEXT NOT NULL,
    "alertById" TEXT,
    "leadById" TEXT,
    "closedById" TEXT,
    "messageAlert" TEXT NOT NULL,
    "alertStatus" "AlertStatus" NOT NULL DEFAULT 'SENT',
    "alertType" "AlertType" NOT NULL DEFAULT 'UNKNOWN',
    "firstCircleId" TEXT NOT NULL,
    "leadSentinel" TEXT,
    "statusByCompanion" TEXT,
    "statusByFirstCircle" TEXT,
    "companionId" TEXT NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleAlert" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "label" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "circleStatus" "CircleAlertStatus" NOT NULL DEFAULT 'INACTIVE',
    "generalGroupChatPermisson" "MessagePermission" NOT NULL DEFAULT 'NO',
    "generalIndividualChatPermisson" "MessagePermission" NOT NULL DEFAULT 'NO',
    "groupChat" BOOLEAN NOT NULL DEFAULT false,
    "canSendPhone" BOOLEAN NOT NULL DEFAULT false,
    "conversationId" TEXT,
    "wasContacted" BOOLEAN NOT NULL DEFAULT false,
    "contactedAt" TIMESTAMP(3),
    "sourceCircleId" TEXT NOT NULL,
    "companionId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,

    CONSTRAINT "CircleAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkSentinelAlert" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "userName" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "phoneVerifiedAt" TIMESTAMP(3),
    "isMajor" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT,
    "isPending" BOOLEAN NOT NULL DEFAULT true,
    "sentinelType" "SentinelType" NOT NULL,
    "is1Circle" BOOLEAN NOT NULL,
    "leadSlot" "LeadSlot",
    "generalGroupChatPermisson" "MessagePermission" NOT NULL DEFAULT 'NO',
    "generalIndividualChatPermisson" "MessagePermission" NOT NULL DEFAULT 'NO',
    "groupChat" BOOLEAN NOT NULL DEFAULT false,
    "chat" BOOLEAN NOT NULL DEFAULT false,
    "canSendPhone" BOOLEAN NOT NULL DEFAULT false,
    "conversationId" TEXT,
    "sentinelStatus" "SentinelStatus" NOT NULL DEFAULT 'INACTIVE',
    "contacted" BOOLEAN NOT NULL DEFAULT false,
    "contactedAt" TIMESTAMP(3),
    "contactedBy" TEXT,
    "contactedWhy" TEXT,
    "sourceLinkSentinelsId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "alertSentinelId" TEXT NOT NULL,
    "circleAlertId" TEXT NOT NULL,

    CONSTRAINT "LinkSentinelAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "body" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "senderId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_userName_key" ON "User"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "LinkSentinels_conversationId_key" ON "LinkSentinels"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkSentinels_sentinelId_companionId_key" ON "LinkSentinels"("sentinelId", "companionId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkSentinels_circleId_leadSlot_key" ON "LinkSentinels"("circleId", "leadSlot");

-- CreateIndex
CREATE UNIQUE INDEX "Circle_id_companionId_key" ON "Circle"("id", "companionId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_firstCircleId_key" ON "Alert"("firstCircleId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleAlert_conversationId_key" ON "CircleAlert"("conversationId");

-- CreateIndex
CREATE INDEX "CircleAlert_sourceCircleId_idx" ON "CircleAlert"("sourceCircleId");

-- CreateIndex
CREATE INDEX "CircleAlert_companionId_idx" ON "CircleAlert"("companionId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleAlert_alertId_sourceCircleId_key" ON "CircleAlert"("alertId", "sourceCircleId");

-- CreateIndex
CREATE UNIQUE INDEX "CircleAlert_id_alertId_key" ON "CircleAlert"("id", "alertId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkSentinelAlert_conversationId_key" ON "LinkSentinelAlert"("conversationId");

-- CreateIndex
CREATE INDEX "LinkSentinelAlert_sourceLinkSentinelsId_idx" ON "LinkSentinelAlert"("sourceLinkSentinelsId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkSentinelAlert_alertId_alertSentinelId_key" ON "LinkSentinelAlert"("alertId", "alertSentinelId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkSentinelAlert_id_alertId_key" ON "LinkSentinelAlert"("id", "alertId");

-- AddForeignKey
ALTER TABLE "LinkSentinels" ADD CONSTRAINT "LinkSentinels_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSentinels" ADD CONSTRAINT "LinkSentinels_circleId_companionId_fkey" FOREIGN KEY ("circleId", "companionId") REFERENCES "Circle"("id", "companionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSentinels" ADD CONSTRAINT "LinkSentinels_sentinelId_fkey" FOREIGN KEY ("sentinelId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSentinels" ADD CONSTRAINT "LinkSentinels_companionId_fkey" FOREIGN KEY ("companionId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Circle" ADD CONSTRAINT "Circle_companionId_fkey" FOREIGN KEY ("companionId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_alertById_fkey" FOREIGN KEY ("alertById") REFERENCES "LinkSentinelAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_leadById_fkey" FOREIGN KEY ("leadById") REFERENCES "LinkSentinelAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "LinkSentinelAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_firstCircleId_fkey" FOREIGN KEY ("firstCircleId") REFERENCES "CircleAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_companionId_fkey" FOREIGN KEY ("companionId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleAlert" ADD CONSTRAINT "CircleAlert_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleAlert" ADD CONSTRAINT "CircleAlert_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSentinelAlert" ADD CONSTRAINT "LinkSentinelAlert_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSentinelAlert" ADD CONSTRAINT "LinkSentinelAlert_circleAlertId_alertId_fkey" FOREIGN KEY ("circleAlertId", "alertId") REFERENCES "CircleAlert"("id", "alertId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSentinelAlert" ADD CONSTRAINT "LinkSentinelAlert_alertSentinelId_fkey" FOREIGN KEY ("alertSentinelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
