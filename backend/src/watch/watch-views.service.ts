import { Injectable } from '@nestjs/common';
import {
  AlertParticipantStatus,
  AlertStatus,
  CircleType,
  LinkStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RUNNING_ALERT, RUNNING_WATCH } from '../common/running-alert';
import { parseSchedule } from './check-in-schedule';
import { currentCheckpoint, isPending, modeOf, watchType } from './watch-rules';

// Why this viewer may know about someone's watch, before any alert:
// - TRAVEL_CIRCLE: they travel with them (in a travel circle, or an
//   existing Sentinel counted on the trip) — they see the itinerary and
//   whether each step was validated, never the logbook or positions;
// - FIRST_CIRCLE: the person switched on what their 1st circle may see.
// Outer circles never know. Once an alert opens, its 1st circle sees
// everything through getAlert.
export type WatchRole = 'TRAVEL_CIRCLE' | 'FIRST_CIRCLE';

@Injectable()
export class WatchViewsService {
  constructor(private readonly prisma: PrismaService) {}

  // The running watches of these people that the viewer may see.
  async viewsFor(viewerId: string, companionIds: string[]) {
    if (companionIds.length === 0) return [];
    const watches = await this.prisma.alert.findMany({
      where: { ...RUNNING_WATCH, userCompanionId: { in: companionIds } },
      include: { checkpoints: { orderBy: { expectedAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    if (watches.length === 0) return [];
    const myLinks = await this.prisma.linkSentinels.findMany({
      where: {
        userSentinelId: viewerId,
        userCompanionId: { in: companionIds },
        status: LinkStatus.ACCEPTED,
      },
      select: {
        userCompanionId: true,
        circle: { select: { circleType: true, tripId: true } },
      },
    });
    const counted = await this.prisma.alertParticipant.findMany({
      where: {
        alertId: { in: watches.map((w) => w.id) },
        status: { not: AlertParticipantStatus.CLOSED },
        userSentinels: { userSentinelId: viewerId },
      },
      select: { alertId: true },
    });
    const countedOn = new Set(counted.map((c) => c.alertId));
    const runningAlerts = await this.prisma.alert.findMany({
      where: {
        tripId: { in: watches.map((w) => w.id) },
        alertStatus: RUNNING_ALERT,
      },
      select: { id: true, tripId: true },
    });

    const views: ReturnType<typeof buildView>[] = [];
    for (const watch of watches) {
      const link = myLinks.find(
        (l) => l.userCompanionId === watch.userCompanionId,
      );
      const travelling =
        modeOf(watch.alertType) === 'TRIP' &&
        (link?.circle.tripId === watch.id || countedOn.has(watch.id));
      const firstCircle =
        link?.circle.circleType === CircleType.FIRST &&
        (watch.shareItineraryWithFirstCircle ||
          watch.shareValidationsWithFirstCircle);
      if (!travelling && !firstCircle) continue;
      views.push(
        buildView(
          watch,
          travelling ? 'TRAVEL_CIRCLE' : 'FIRST_CIRCLE',
          runningAlerts.filter((a) => a.tripId === watch.id).map((a) => a.id),
        ),
      );
    }
    return views;
  }

  // History: my own watches (each with the alerts it opened), and the
  // trips of others I was part of.
  async history(userId: string) {
    const mine = await this.prisma.alert.findMany({
      where: { userCompanionId: userId, alertStatus: AlertStatus.SENT },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        alertType: true,
        createdAt: true,
        closedAt: true,
        tripAlerts: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            label: true,
            alertType: true,
            alertStatus: true,
            launchedAt: true,
            closedAt: true,
          },
        },
      },
    });
    const withOthers = await this.prisma.alert.findMany({
      where: {
        alertStatus: AlertStatus.SENT,
        alertType: watchType('TRIP'),
        userCompanionId: { not: userId },
        OR: [
          {
            participants: {
              some: { userSentinels: { userSentinelId: userId } },
            },
          },
          {
            tripCircles: {
              some: { userSentinels: { some: { userSentinelId: userId } } },
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        createdAt: true,
        closedAt: true,
        userCompanion: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    return {
      mine: mine.map((w) => ({ ...w, mode: modeOf(w.alertType) })),
      withOthers,
    };
  }
}

function buildView(
  watch: {
    id: string;
    userCompanionId: string;
    label: string;
    alertType: Parameters<typeof modeOf>[0];
    checkInSchedule: string | null;
    shareItineraryWithFirstCircle: boolean;
    shareValidationsWithFirstCircle: boolean;
    checkpoints: {
      id: string;
      placeName: string | null;
      expectedAt: Date;
      alertAt: Date;
      validatedAt: Date | null;
      validatedPlace: string | null;
      missedAt: Date | null;
      openedAlertId: string | null;
    }[];
  },
  role: WatchRole,
  runningAlertIds: string[],
) {
  const mode = modeOf(watch.alertType);
  const travelling = role === 'TRAVEL_CIRCLE';
  const itinerary = travelling || watch.shareItineraryWithFirstCircle;
  const validations = travelling || watch.shareValidationsWithFirstCircle;
  const current = currentCheckpoint(watch.checkpoints, runningAlertIds);
  const lastValidated = watch.checkpoints
    .filter((c) => c.validatedAt)
    .sort((a, b) => b.validatedAt!.getTime() - a.validatedAt!.getTime())[0];
  return {
    watchId: watch.id,
    companionId: watch.userCompanionId,
    mode,
    role,
    label: watch.label,
    // "En voyage · Col du Lac".
    currentPlace:
      mode === 'TRIP' && itinerary ? (current?.placeName ?? null) : null,
    steps:
      mode === 'TRIP' && itinerary
        ? watch.checkpoints.map((c) => ({
            id: c.id,
            placeName: c.placeName,
            expectedAt: c.expectedAt,
            validatedAt: validations ? c.validatedAt : null,
            validatedPlace: validations ? c.validatedPlace : null,
          }))
        : [],
    // All Good: that it is on and its rhythm.
    schedule:
      mode === 'ALL_GOOD' && itinerary
        ? parseSchedule(watch.checkInSchedule)
        : null,
    nextDeadline:
      mode === 'ALL_GOOD' && itinerary
        ? (watch.checkpoints.find(isPending)?.expectedAt ?? null)
        : null,
    lastValidatedAt: validations ? (lastValidated?.validatedAt ?? null) : null,
  };
}
