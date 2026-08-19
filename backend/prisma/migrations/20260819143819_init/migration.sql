-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('ONLY_SMS', 'ACCOUNT', 'PAID_ACCOUNT', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DELETED');

-- CreateEnum
CREATE TYPE "SentinelType" AS ENUM ('ONLY_SMS', 'SENTINEL', 'LEAD', 'FIRSTCIRCLE', 'UNCOMPLETE');

-- CreateEnum
CREATE TYPE "LinkInitiator" AS ENUM ('COMPANION', 'SENTINEL');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REMOVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CircleType" AS ENUM ('BASIC', 'FIRST', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "CircleStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeadSlot" AS ENUM ('LEAD_1', 'LEAD_2', 'LEAD_3');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('SENT', 'LAUNCHED', 'ACTIVE', 'CLOSING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('BYCOMPANION', 'LITTLEWORRY', 'MISSING', 'INCIDENT', 'UNKNOWN', 'EMERGENCY', 'NOCONTACT');

-- CreateEnum
CREATE TYPE "AlertParticipantStatus" AS ENUM ('WAITING', 'CONTACTED', 'RESPONDED', 'ACTIVE', 'DECLINED', 'UNAVAILABLE', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'SYSTEM');

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
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "isMajor" BOOLEAN NOT NULL DEFAULT true,
    "publicStatus" TEXT,
    "userType" "UserType" NOT NULL DEFAULT 'ONLY_SMS',
    "hasPaid" BOOLEAN NOT NULL DEFAULT false,
    "confirmedByOwner" BOOLEAN NOT NULL DEFAULT false,
    "otpCodeHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Circle" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "label" TEXT NOT NULL,
    "circleType" "CircleType" NOT NULL DEFAULT 'BASIC',
    "status" "CircleStatus" NOT NULL DEFAULT 'ACTIVE',
    "groupChat" BOOLEAN NOT NULL DEFAULT false,
    "canSendPhone" BOOLEAN NOT NULL DEFAULT false,
    "userCompanionId" TEXT NOT NULL,

    CONSTRAINT "Circle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkSentinels" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedBy" "LinkInitiator" NOT NULL,
    "sentinelType" "SentinelType" NOT NULL DEFAULT 'ONLY_SMS',
    "requestedAsLead" BOOLEAN NOT NULL DEFAULT false,
    "leadSlot" "LeadSlot",
    "groupChat" BOOLEAN NOT NULL DEFAULT false,
    "chat" BOOLEAN NOT NULL DEFAULT false,
    "canSendPhone" BOOLEAN NOT NULL DEFAULT false,
    "userSentinelId" TEXT NOT NULL,
    "userCompanionId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,

    CONSTRAINT "LinkSentinels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkSentinelsEvent" (
    "id" TEXT NOT NULL,
    "userSentinelsId" TEXT NOT NULL,
    "fromStatus" "LinkStatus",
    "toStatus" "LinkStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkSentinelsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "launchedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "closingAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "label" TEXT NOT NULL,
    "messageAlert" TEXT NOT NULL,
    "alertStatus" "AlertStatus" NOT NULL DEFAULT 'SENT',
    "alertType" "AlertType" NOT NULL DEFAULT 'UNKNOWN',
    "statusByCompanion" TEXT,
    "statusByFirstCircle" TEXT,
    "userCompanionId" TEXT NOT NULL,
    "firstCircleId" TEXT NOT NULL,
    "launchedById" TEXT,
    "closedById" TEXT,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertParticipant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "AlertParticipantStatus" NOT NULL DEFAULT 'WAITING',
    "contactedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "response" TEXT,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "leadAssignedAt" TIMESTAMP(3),
    "circleId" TEXT NOT NULL,
    "circleName" TEXT NOT NULL,
    "canSendPhoneAtAlert" BOOLEAN,
    "chatAtAlert" BOOLEAN,
    "groupChatAtAlert" BOOLEAN,
    "alertId" TEXT NOT NULL,
    "userSentinelsId" TEXT NOT NULL,

    CONSTRAINT "AlertParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "alertId" TEXT,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "body" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
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
CREATE INDEX "Circle_userCompanionId_status_idx" ON "Circle"("userCompanionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Circle_id_userCompanionId_key" ON "Circle"("id", "userCompanionId");

-- CreateIndex
CREATE INDEX "LinkSentinels_userCompanionId_status_idx" ON "LinkSentinels"("userCompanionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LinkSentinels_userSentinelId_userCompanionId_key" ON "LinkSentinels"("userSentinelId", "userCompanionId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkSentinels_circleId_leadSlot_key" ON "LinkSentinels"("circleId", "leadSlot");

-- CreateIndex
CREATE INDEX "LinkSentinelsEvent_userSentinelsId_occurredAt_idx" ON "LinkSentinelsEvent"("userSentinelsId", "occurredAt");

-- CreateIndex
CREATE INDEX "Alert_userCompanionId_createdAt_idx" ON "Alert"("userCompanionId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_alertStatus_idx" ON "Alert"("alertStatus");

-- CreateIndex
CREATE INDEX "AlertParticipant_alertId_status_idx" ON "AlertParticipant"("alertId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AlertParticipant_alertId_userSentinelsId_key" ON "AlertParticipant"("alertId", "userSentinelsId");

-- CreateIndex
CREATE INDEX "Conversation_alertId_idx" ON "Conversation"("alertId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_conversationId_userId_idx" ON "ConversationParticipant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Circle" ADD CONSTRAINT "Circle_userCompanionId_fkey" FOREIGN KEY ("userCompanionId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSentinels" ADD CONSTRAINT "LinkSentinels_userSentinelId_fkey" FOREIGN KEY ("userSentinelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSentinels" ADD CONSTRAINT "LinkSentinels_userCompanionId_fkey" FOREIGN KEY ("userCompanionId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSentinels" ADD CONSTRAINT "LinkSentinels_circleId_userCompanionId_fkey" FOREIGN KEY ("circleId", "userCompanionId") REFERENCES "Circle"("id", "userCompanionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSentinelsEvent" ADD CONSTRAINT "LinkSentinelsEvent_userSentinelsId_fkey" FOREIGN KEY ("userSentinelsId") REFERENCES "LinkSentinels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userCompanionId_fkey" FOREIGN KEY ("userCompanionId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_firstCircleId_fkey" FOREIGN KEY ("firstCircleId") REFERENCES "Circle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_launchedById_fkey" FOREIGN KEY ("launchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertParticipant" ADD CONSTRAINT "AlertParticipant_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertParticipant" ADD CONSTRAINT "AlertParticipant_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertParticipant" ADD CONSTRAINT "AlertParticipant_userSentinelsId_fkey" FOREIGN KEY ("userSentinelsId") REFERENCES "LinkSentinels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
