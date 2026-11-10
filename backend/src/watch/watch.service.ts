import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertStatus,
  CircleStatus,
  CircleType,
  MessageType,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AlertService } from '../alert/alert.service';
import { RUNNING_ALERT, RUNNING_WATCH } from '../common/running-alert';
import { assertNotDeceased } from '../user/user-status.util';
import { WATCH_NEEDS_SUBSCRIPTION, isSubscribed } from '../user/plan.util';
import {
  CheckInSchedule,
  nextCheckIn,
  parseSchedule,
} from './check-in-schedule';
import { timeZoneOrDefault } from './zoned-time';
import {
  ALL_GOOD_LABEL,
  WatchMode,
  currentCheckpoint,
  delayMs,
  isPending,
  modeOf,
  pauseReason,
  travelCircleLabel,
  watchType,
} from './watch-rules';
import { TravelCircleService } from './travel-circles.service';
import {
  CheckInScheduleDto,
  CreateTripDto,
  EndWatchDto,
  StartAllGoodDto,
  TripStepDto,
  UpdateTripStepDto,
  UpdateWatchDto,
  ValidateWatchDto,
} from './dto/watch.dto';

const MINUTE_MS = 60_000;

const WITH_CHECKPOINTS = {
  checkpoints: { orderBy: { expectedAt: 'asc' } },
} satisfies Prisma.AlertInclude;

type WatchWithCheckpoints = Prisma.AlertGetPayload<{
  include: typeof WITH_CHECKPOINTS;
}>;

// Watch Mode: a trip (an itinerary of steps) or an All Good Check (a
// regular "all is well"). A watch is an Alert in SENT — watched, nobody
// told — whose deadlines are TravelCheckpoints; a missed one opens a
// separate, real alert (WatchScheduler). Only the person themself manages
// their watch; what others see of it is WatchViewsService.
@Injectable()
export class WatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertService,
    private readonly travel: TravelCircleService,
  ) {}

  // ---- Reads ------------------------------------------------------------

  // The person's running watches (a trip and/or an All Good Check).
  async listMine(userId: string) {
    const owner = await this.findOwner(userId);
    const watches = await this.prisma.alert.findMany({
      where: { userCompanionId: userId, ...RUNNING_WATCH },
      include: WITH_CHECKPOINTS,
      orderBy: { createdAt: 'asc' },
    });
    const onTrip = watches.some((w) => modeOf(w.alertType) === 'TRIP');
    const now = new Date();
    return Promise.all(watches.map((w) => this.present(w, owner, onTrip, now)));
  }

  async getWatch(userId: string, watchId: string) {
    const watch = await this.prisma.alert.findFirst({
      where: {
        id: watchId,
        userCompanionId: userId,
        alertStatus: AlertStatus.SENT,
      },
      include: WITH_CHECKPOINTS,
    });
    if (!watch) throw new NotFoundException('Watch not found');
    const owner = await this.findOwner(userId);
    const onTrip =
      modeOf(watch.alertType) === 'ALL_GOOD' && (await this.isOnTrip(userId));
    return this.present(watch, owner, onTrip, new Date());
  }

  // ---- Start -------------------------------------------------------------

  async createTrip(userId: string, dto: CreateTripDto) {
    const now = new Date();
    const { circleId } = await this.assertCanStart(userId, 'TRIP');
    const steps = [dto.firstStep, ...(dto.moreSteps ?? [])].map((step) =>
      stepData(step, now),
    );

    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.alert.create({
        data: {
          label: dto.name.trim(),
          messageAlert: dto.instructions?.trim() ?? '',
          alertStatus: AlertStatus.SENT,
          alertType: watchType('TRIP'),
          userCompanionId: userId,
          firstCircleId: circleId,
          shareItineraryWithFirstCircle:
            dto.shareItineraryWithFirstCircle ?? false,
          shareValidationsWithFirstCircle:
            dto.shareValidationsWithFirstCircle ?? false,
        },
      });
      for (const step of steps) {
        await tx.travelCheckpoint.create({
          data: { ...step, alertId: created.id },
        });
      }
      // The people who travel with them go here, if asked.
      if (dto.travelCircle) {
        await tx.circle.create({
          data: {
            label: travelCircleLabel(dto.name.trim(), false),
            circleType: CircleType.BASIC,
            userCompanionId: userId,
            tripId: created.id,
          },
        });
      }
      return created;
    });
    return this.getWatch(userId, trip.id);
  }

  async startAllGood(userId: string, dto: StartAllGoodDto) {
    const now = new Date();
    const { circleId, timeZone } = await this.assertCanStart(
      userId,
      'ALL_GOOD',
    );
    const schedule = toSchedule(dto.schedule);
    const expectedAt = nextCheckIn(schedule, now, timeZone);

    const watch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.alert.create({
        data: {
          label: ALL_GOOD_LABEL,
          messageAlert: dto.instructions?.trim() ?? '',
          alertStatus: AlertStatus.SENT,
          alertType: watchType('ALL_GOOD'),
          userCompanionId: userId,
          firstCircleId: circleId,
          checkInSchedule: JSON.stringify(schedule),
          shareItineraryWithFirstCircle:
            dto.shareItineraryWithFirstCircle ?? false,
          shareValidationsWithFirstCircle:
            dto.shareValidationsWithFirstCircle ?? false,
        },
      });
      await tx.travelCheckpoint.create({
        data: {
          alertId: created.id,
          expectedAt,
          alertAt: new Date(
            expectedAt.getTime() + dto.delayMinutes * MINUTE_MS,
          ),
        },
      });
      return created;
    });
    return this.getWatch(userId, watch.id);
  }

  // ---- Edit --------------------------------------------------------------

  async updateWatch(userId: string, watchId: string, dto: UpdateWatchDto) {
    const now = new Date();
    const watch = await this.findRunningOwnWatch(userId, watchId);
    const mode = modeOf(watch.alertType);
    const allGoodOnly =
      dto.schedule !== undefined || dto.pausedUntil !== undefined;
    if (mode === 'TRIP' && allGoodOnly) {
      throw new BadRequestException('Only for the All Good Check');
    }
    if (mode === 'ALL_GOOD' && dto.name !== undefined) {
      throw new BadRequestException('Only for a trip');
    }
    let pausedUntil: Date | null | undefined;
    if (dto.pausedUntil !== undefined) {
      pausedUntil = dto.pausedUntil === null ? null : new Date(dto.pausedUntil);
      if (pausedUntil && pausedUntil <= now) {
        throw new BadRequestException('A pause ends in the future');
      }
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.alert.update({
        where: { id: watch.id },
        data: {
          ...(dto.name !== undefined ? { label: dto.name.trim() } : {}),
          ...(dto.instructions !== undefined
            ? { messageAlert: dto.instructions.trim() }
            : {}),
          ...(dto.shareItineraryWithFirstCircle !== undefined
            ? {
                shareItineraryWithFirstCircle:
                  dto.shareItineraryWithFirstCircle,
              }
            : {}),
          ...(dto.shareValidationsWithFirstCircle !== undefined
            ? {
                shareValidationsWithFirstCircle:
                  dto.shareValidationsWithFirstCircle,
              }
            : {}),
          ...(dto.schedule
            ? { checkInSchedule: JSON.stringify(toSchedule(dto.schedule)) }
            : {}),
          ...(pausedUntil !== undefined ? { pausedUntil } : {}),
        },
      }),
    ];

    // A trip's delay is the whole trip's: every step still ahead moves.
    if (mode === 'TRIP' && dto.delayMinutes !== undefined) {
      const delay = dto.delayMinutes * MINUTE_MS;
      for (const step of watch.checkpoints.filter(isPending)) {
        ops.push(
          this.prisma.travelCheckpoint.update({
            where: { id: step.id },
            data: { alertAt: new Date(step.expectedAt.getTime() + delay) },
          }),
        );
      }
    }

    // A new rhythm or delay moves the next deadline right away.
    if (
      mode === 'ALL_GOOD' &&
      (dto.schedule || dto.delayMinutes !== undefined)
    ) {
      const pending = watch.checkpoints.find(isPending);
      const schedule = dto.schedule
        ? toSchedule(dto.schedule)
        : parseSchedule(watch.checkInSchedule);
      if (pending && schedule) {
        const delay =
          dto.delayMinutes !== undefined
            ? dto.delayMinutes * MINUTE_MS
            : delayMs(pending);
        let expectedAt = pending.expectedAt;
        if (dto.schedule) {
          const owner = await this.findOwner(userId);
          expectedAt = nextCheckIn(
            schedule,
            laterOf(now, lastValidatedDeadline(watch)),
            timeZoneOrDefault(owner.timeZone),
          );
        }
        ops.push(
          this.prisma.travelCheckpoint.update({
            where: { id: pending.id },
            data: {
              expectedAt,
              alertAt: new Date(expectedAt.getTime() + delay),
              ...(dto.schedule ? { remindedAt: null } : {}),
            },
          }),
        );
      }
    }
    // The trip's circles carry its name: they follow a rename.
    const newName = dto.name?.trim();
    if (mode === 'TRIP' && newName && newName !== watch.label) {
      const circles = await this.prisma.circle.findMany({
        where: { tripId: watch.id, status: CircleStatus.ACTIVE },
        select: { id: true, label: true },
      });
      for (const c of circles) {
        const renamed = renameTravelCircle(c.label, watch.label, newName);
        if (renamed !== c.label) {
          ops.push(
            this.prisma.circle.update({
              where: { id: c.id },
              data: { label: renamed },
            }),
          );
        }
      }
    }
    await this.prisma.$transaction(ops);
    return this.getWatch(userId, watch.id);
  }

  // "Terminer le voyage" / "Désactiver" — final. A running alert it opened
  // goes on: it is closed by whoever handles it. A trip: what becomes of
  // the people added for it (TravelCircleService.endOfTrip).
  async endWatch(userId: string, watchId: string, dto: EndWatchDto = {}) {
    const watch = await this.findRunningOwnWatch(userId, watchId);
    await this.closeWatch(watch.id, userId, dto);
    return this.getWatch(userId, watch.id);
  }

  async addStep(userId: string, watchId: string, dto: TripStepDto) {
    const watch = await this.findRunningOwnWatch(userId, watchId);
    assertTrip(watch);
    await this.prisma.travelCheckpoint.create({
      data: { ...stepData(dto, new Date()), alertId: watch.id },
    });
    return this.getWatch(userId, watch.id);
  }

  async updateStep(
    userId: string,
    watchId: string,
    checkpointId: string,
    dto: UpdateTripStepDto,
  ) {
    const now = new Date();
    const watch = await this.findRunningOwnWatch(userId, watchId);
    assertTrip(watch);
    const step = watch.checkpoints.find((c) => c.id === checkpointId);
    if (!step) throw new NotFoundException('Step not found');
    if (step.validatedAt) {
      throw new ConflictException('This step is already validated');
    }
    if (step.missedAt) {
      throw new ConflictException('This step was missed — plan a new one');
    }
    const expectedAt = dto.expectedAt
      ? new Date(dto.expectedAt)
      : step.expectedAt;
    const moved = expectedAt.getTime() !== step.expectedAt.getTime();
    if (moved && expectedAt <= now) {
      throw new BadRequestException('A step must be planned in the future');
    }
    const delay =
      dto.delayMinutes !== undefined
        ? dto.delayMinutes * MINUTE_MS
        : delayMs(step);
    await this.prisma.travelCheckpoint.update({
      where: { id: step.id },
      data: {
        ...(dto.placeName !== undefined
          ? { placeName: dto.placeName.trim() }
          : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        expectedAt,
        alertAt: new Date(expectedAt.getTime() + delay),
        // Moved: the reminder is for the new time.
        ...(moved ? { remindedAt: null } : {}),
      },
    });
    return this.getWatch(userId, watch.id);
  }

  // ---- Validate ------------------------------------------------------------

  async validate(userId: string, watchId: string, dto: ValidateWatchDto) {
    const watch = await this.findRunningOwnWatch(userId, watchId);
    await this.validateCurrent(watch, dto, { requireWhatNext: true });
    return this.getWatch(userId, watch.id);
  }

  // Shared with the "OK" SMS reply (plan, slice 6), which can't plan a
  // next step: requireWhatNext false.
  async validateCurrent(
    watch: WatchWithCheckpoints,
    dto: ValidateWatchDto,
    { requireWhatNext }: { requireWhatNext: boolean },
  ) {
    const now = new Date();
    const mode = modeOf(watch.alertType);
    const runningAlerts = await this.prisma.alert.findMany({
      where: { tripId: watch.id, alertStatus: RUNNING_ALERT },
      select: { id: true, conversations: { orderBy: { createdAt: 'asc' } } },
    });
    const current = currentCheckpoint(
      watch.checkpoints,
      runningAlerts.map((a) => a.id),
    );
    if (!current) throw new ConflictException('Nothing to validate');

    const elsewhere = mode === 'TRIP' && dto.kind === 'ELSEWHERE';
    if (elsewhere && !dto.place?.trim()) {
      throw new BadRequestException('Say where you are');
    }
    const stillAhead = watch.checkpoints.filter(
      (c) => c.id !== current.id && isPending(c),
    );
    let nextStep: ReturnType<typeof stepData> | null = null;
    if (mode === 'TRIP') {
      if (dto.nextStep && dto.endTrip) {
        throw new BadRequestException(
          'Either plan the next step or end the trip',
        );
      }
      if (
        requireWhatNext &&
        stillAhead.length === 0 &&
        !dto.nextStep &&
        !dto.endTrip
      ) {
        throw new BadRequestException(
          'Plan the next step, or say this was the last one',
        );
      }
      if (dto.nextStep) nextStep = stepData(dto.nextStep, now);
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.travelCheckpoint.update({
        where: { id: current.id },
        data: {
          validatedAt: now,
          validatedLatitude: dto.latitude ?? null,
          validatedLongitude: dto.longitude ?? null,
          validatedPlace: elsewhere ? dto.place!.trim() : null,
          validatedNote: dto.note?.trim() || null,
        },
      }),
    ];
    if (nextStep) {
      ops.push(
        this.prisma.travelCheckpoint.create({
          data: { ...nextStep, alertId: watch.id },
        }),
      );
    }
    if (mode === 'ALL_GOOD' && stillAhead.length === 0) {
      const next = await this.nextAllGoodCheckpoint(watch, current, now);
      if (next) ops.push(this.prisma.travelCheckpoint.create({ data: next }));
    }
    await this.prisma.$transaction(ops);
    if (mode === 'TRIP' && dto.endTrip) {
      await this.closeWatch(
        watch.id,
        watch.userCompanionId,
        dto.endChoices ?? {},
      );
    }

    // An alert this watch opened is running: its 1st circle reads the news
    // where they talk.
    const said =
      mode === 'TRIP'
        ? `✅ Tout va bien : étape « ${current.placeName ?? ''} » validée.`
        : '✅ Tout va bien : check validé.';
    for (const alert of runningAlerts) {
      const room = alert.conversations[0];
      if (room && !room.closedAt) {
        await this.prisma.message.create({
          data: {
            conversationId: room.id,
            senderId: watch.userCompanionId,
            type: MessageType.TEXT,
            body: said,
          },
        });
      }
      await this.alerts.notifyAlertParticipants(alert.id);
    }
  }

  // ---- Shared with the scheduler ------------------------------------------

  // The All Good deadline after this one, from the rhythm and the person's
  // zone; the delay is the previous one's.
  async nextAllGoodCheckpoint(
    watch: {
      id: string;
      checkInSchedule: string | null;
      userCompanionId: string;
    },
    previous: { expectedAt: Date; alertAt: Date },
    now: Date,
  ) {
    const schedule = parseSchedule(watch.checkInSchedule);
    if (!schedule) return null;
    const owner = await this.findOwner(watch.userCompanionId);
    const expectedAt = nextCheckIn(
      schedule,
      laterOf(now, previous.expectedAt),
      timeZoneOrDefault(owner.timeZone),
    );
    return {
      alertId: watch.id,
      expectedAt,
      alertAt: new Date(
        expectedAt.getTime() +
          (previous.alertAt.getTime() - previous.expectedAt.getTime()),
      ),
    };
  }

  // Ends a watch; for a trip, its people go where the person chose.
  async closeWatch(
    watchId: string,
    closedById: string | null,
    choices: EndWatchDto = {},
  ) {
    const now = new Date();
    const watch = await this.prisma.alert.findUniqueOrThrow({
      where: { id: watchId },
      select: { userCompanionId: true, alertType: true },
    });
    const plan =
      modeOf(watch.alertType) === 'TRIP'
        ? await this.travel.endPlan(watch.userCompanionId, watchId, choices)
        : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.alert.update({
        where: { id: watchId },
        data: { closedAt: now, closedById },
      });
      if (plan) {
        await this.travel.endOfTrip(
          tx,
          watch.userCompanionId,
          watchId,
          plan,
          now,
        );
      }
    });
  }

  // ---- "OK" by SMS ----------------------------------------------------------

  // What this number can confirm by SMS: its own watches whose current
  // deadline was already reminded (an "OK" before that would be a guess).
  async smsChecksByPhone(phone: string) {
    const owner = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (!owner) return [];
    const watches = await this.prisma.alert.findMany({
      where: { userCompanionId: owner.id, ...RUNNING_WATCH },
      include: WITH_CHECKPOINTS,
    });
    const checks: WatchWithCheckpoints[] = [];
    for (const watch of watches) {
      const running = await this.prisma.alert.findMany({
        where: { tripId: watch.id, alertStatus: RUNNING_ALERT },
        select: { id: true },
      });
      const current = currentCheckpoint(
        watch.checkpoints,
        running.map((a) => a.id),
      );
      if (current?.remindedAt) checks.push(watch);
    }
    return checks;
  }

  // "OK" = as planned, no position. A trip with no step left stays
  // watched without a deadline: the reply says to plan the next one.
  // Returns the deadline now ahead, for the acknowledgement.
  async confirmBySms(watch: WatchWithCheckpoints) {
    await this.validateCurrent(
      watch,
      { kind: 'AS_PLANNED' },
      { requireWhatNext: false },
    );
    const next = await this.prisma.travelCheckpoint.findFirst({
      where: { alertId: watch.id, validatedAt: null, missedAt: null },
      orderBy: { expectedAt: 'asc' },
    });
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: watch.userCompanionId },
      select: { timeZone: true, language: true },
    });
    return {
      mode: modeOf(watch.alertType),
      next,
      timeZone: timeZoneOrDefault(owner.timeZone),
      language: owner.language,
    };
  }

  // ---- Guards and helpers --------------------------------------------------

  // Same rule as raising an alert about yourself (a verified phone, a Lead
  // with a phone, not paused for others), plus a subscription, and one
  // watch per mode at a time.
  private async assertCanStart(userId: string, mode: WatchMode) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        userType: true,
        phone: true,
        phoneVerifiedAt: true,
        paidUntil: true,
        timeZone: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    assertNotDeceased(user, 'This account');
    if (user.userType === UserType.ONLY_SMS) {
      throw new ForbiddenException('Complete your profile first');
    }
    if (!isSubscribed(user)) {
      throw new ForbiddenException(WATCH_NEEDS_SUBSCRIPTION);
    }
    const existing = await this.prisma.alert.findFirst({
      where: {
        userCompanionId: userId,
        alertType: watchType(mode),
        ...RUNNING_WATCH,
      },
    });
    if (existing) {
      throw new ConflictException(
        mode === 'TRIP'
          ? 'A trip is already running'
          : 'The All Good Check is already on',
      );
    }
    const { circle, links } = await this.alerts.loadFirstCircleForAlert(userId);
    await this.alerts.assertAlertCanBeAnswered(userId, userId, user, links);
    return { circleId: circle.id, timeZone: timeZoneOrDefault(user.timeZone) };
  }

  private async findRunningOwnWatch(userId: string, watchId: string) {
    const watch = await this.prisma.alert.findFirst({
      where: {
        id: watchId,
        userCompanionId: userId,
        alertStatus: AlertStatus.SENT,
      },
      include: WITH_CHECKPOINTS,
    });
    if (!watch) throw new NotFoundException('Watch not found');
    if (watch.closedAt) throw new ConflictException('This watch is over');
    return watch;
  }

  private async findOwner(userId: string) {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { paidUntil: true, timeZone: true },
    });
    if (!owner) throw new NotFoundException('User not found');
    return owner;
  }

  private async isOnTrip(userId: string) {
    const trip = await this.prisma.alert.findFirst({
      where: {
        userCompanionId: userId,
        alertType: watchType('TRIP'),
        ...RUNNING_WATCH,
      },
      select: { id: true },
    });
    return trip !== null;
  }

  private async present(
    watch: WatchWithCheckpoints,
    owner: { paidUntil: Date | null },
    ownerOnTrip: boolean,
    now: Date,
  ) {
    const runningAlerts = await this.prisma.alert.findMany({
      where: { tripId: watch.id, alertStatus: RUNNING_ALERT },
      select: { id: true },
    });
    const current = watch.closedAt
      ? null
      : currentCheckpoint(
          watch.checkpoints,
          runningAlerts.map((a) => a.id),
        );
    return {
      ...watch,
      mode: modeOf(watch.alertType),
      schedule: parseSchedule(watch.checkInSchedule),
      pausedBecause: watch.closedAt
        ? null
        : pauseReason(watch, owner, ownerOnTrip, now),
      currentCheckpointId: current?.id ?? null,
      // Alerts this watch opened that are still running.
      runningAlertIds: runningAlerts.map((a) => a.id),
      travelCircles:
        modeOf(watch.alertType) === 'TRIP'
          ? await this.travel.peopleOf(watch.id, watch.userCompanionId)
          : [],
    };
  }
}

function assertTrip(watch: { alertType: WatchWithCheckpoints['alertType'] }) {
  if (modeOf(watch.alertType) !== 'TRIP') {
    throw new BadRequestException('Only for a trip');
  }
}

function stepData(dto: TripStepDto, now: Date) {
  const expectedAt = new Date(dto.expectedAt);
  if (expectedAt <= now) {
    throw new BadRequestException('A step must be planned in the future');
  }
  return {
    placeName: dto.placeName.trim(),
    expectedAt,
    alertAt: new Date(expectedAt.getTime() + dto.delayMinutes * MINUTE_MS),
    latitude: dto.latitude ?? null,
    longitude: dto.longitude ?? null,
  };
}

// Only the fields of its kind, days in order.
function toSchedule(dto: CheckInScheduleDto): CheckInSchedule {
  if (dto.kind === 'WEEKDAYS') {
    const days = [...new Set(dto.days ?? [])].sort((a, b) => a - b);
    return { kind: 'WEEKDAYS', days, before: dto.before };
  }
  if (dto.kind === 'EVERY') {
    return {
      kind: 'EVERY',
      every: dto.every!,
      unit: dto.unit!,
      from: dto.from!,
      before: dto.before,
    };
  }
  return { kind: 'DAILY', before: dto.before };
}

// "Col du Lac 2" -> "Lac Bleu 2", "Groupe Col du Lac" -> "Groupe Lac Bleu";
// a circle the person renamed themself is left alone.
export function renameTravelCircle(
  label: string,
  oldName: string,
  newName: string,
): string {
  for (const prefix of ['Groupe ', '']) {
    const base = `${prefix}${oldName}`;
    if (label === base) return `${prefix}${newName}`;
    const rest = label.slice(base.length);
    if (label.startsWith(base) && /^ \d+$/.test(rest)) {
      return `${prefix}${newName}${rest}`;
    }
  }
  return label;
}

function lastValidatedDeadline(watch: WatchWithCheckpoints): Date | null {
  const validated = watch.checkpoints.filter((c) => c.validatedAt);
  return validated.length ? validated[validated.length - 1].expectedAt : null;
}

function laterOf(a: Date, b: Date | null): Date {
  return b && b > a ? b : a;
}
