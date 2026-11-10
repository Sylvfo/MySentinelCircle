import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AlertStatus, AlertType, CircleType } from '@prisma/client';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { OTP_SENDER } from './../src/auth/otp/otp-sender.interface';
import { EMAIL_SENDER } from './../src/email/email-sender.interface';
import { SMS_SENDER } from './../src/sms/sms-sender.interface';
import { WatchScheduler } from './../src/watch/watch.scheduler';
import { testPhone } from './helpers/test-data';

interface AuthResponseBody {
  accessToken?: string;
  userId?: string;
}

interface CheckpointBody {
  id: string;
  placeName: string | null;
  expectedAt: string;
  alertAt: string;
  remindedAt: string | null;
  validatedAt: string | null;
  missedAt: string | null;
  openedAlertId: string | null;
}

interface WatchBody {
  id: string;
  mode: 'TRIP' | 'ALL_GOOD';
  label: string;
  alertStatus: AlertStatus;
  alertType: AlertType;
  closedAt: string | null;
  checkpoints: CheckpointBody[];
  currentCheckpointId: string | null;
  runningAlertIds: string[];
  travelCircles: { id: string; label: string; status: string }[];
}

const MIN = 60_000;
const HOUR = 60 * MIN;

// Watch Mode end to end: a trip from its creation to its end, the
// scheduler run at chosen times (never waiting for real deadlines), the
// "OK" SMS reply, the alert a missed step opens, and an All Good Check.
describe('Watch Mode (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let scheduler: WatchScheduler;
  let sentOtps: { phone: string; code: string }[];
  let sentSms: { phone: string; body: string }[];

  beforeEach(async () => {
    sentOtps = [];
    sentSms = [];
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OTP_SENDER)
      .useValue({
        send: (phone: string, code: string) => {
          sentOtps.push({ phone, code });
          return Promise.resolve();
        },
      })
      .overrideProvider(EMAIL_SENDER)
      .useValue({ send: () => Promise.resolve() })
      .overrideProvider(SMS_SENDER)
      .useValue({
        send: (phone: string, body: string) => {
          sentSms.push({ phone, body });
          return Promise.resolve();
        },
      })
      .compile();

    prisma = moduleFixture.get(PrismaService);
    scheduler = moduleFixture.get(WatchScheduler);
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const auth = (token: string) => `Bearer ${token}`;

  async function signupAccount(firstName: string) {
    const phone = testPhone();
    const signupRes = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone })
      .expect(201);
    const signupBody = signupRes.body as AuthResponseBody;
    const code = sentOtps[sentOtps.length - 1].code;
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ userId: signupBody.userId, code })
      .expect(201);
    const verifyBody = verifyRes.body as AuthResponseBody;
    await request(app.getHttpServer())
      .post('/user/me/complete-profile')
      .set('Authorization', auth(verifyBody.accessToken!))
      .send({ firstName, password: 'password123' })
      .expect(201);
    return {
      accessToken: verifyBody.accessToken!,
      userId: signupBody.userId!,
      phone,
    };
  }

  // A subscribed traveller whose 1st circle has one accepted Lead.
  async function travellerWithLead() {
    const traveller = await signupAccount('Lea');
    await prisma.user.update({
      where: { id: traveller.userId },
      data: { paidUntil: new Date('2999-01-01') },
    });
    const circlesRes = await request(app.getHttpServer())
      .get('/sentinel/circles')
      .set('Authorization', auth(traveller.accessToken))
      .expect(200);
    const firstCircle = (
      circlesRes.body as { id: string; circleType: CircleType }[]
    ).find((c) => c.circleType === CircleType.FIRST)!;
    const lead = await signupAccount('Gabriel');
    const inviteRes = await request(app.getHttpServer())
      .post(`/sentinel/circles/${firstCircle.id}/invite`)
      .set('Authorization', auth(traveller.accessToken))
      .send({ phone: lead.phone, name: 'Gabriel', requestedAsLead: true })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/sentinel/memberships/${(inviteRes.body as { id: string }).id}/accept`,
      )
      .set('Authorization', auth(lead.accessToken))
      .send({})
      .expect(201);
    return { traveller, lead };
  }

  const getWatch = async (token: string, id: string) =>
    (
      await request(app.getHttpServer())
        .get(`/alert/watch/${id}/details`)
        .set('Authorization', auth(token))
        .expect(200)
    ).body as WatchBody;

  it('needs a subscription to start a watch', async () => {
    const free = await signupAccount('Free');
    const res = await request(app.getHttpServer())
      .post('/alert/watch/trip')
      .set('Authorization', auth(free.accessToken))
      .send({
        name: 'Col du Lac',
        firstStep: {
          placeName: 'Parking',
          expectedAt: new Date(Date.now() + HOUR).toISOString(),
          delayMinutes: 60,
        },
      })
      .expect(403);
    expect((res.body as { message: string }).message).toBe(
      'Watch Mode is part of the subscription',
    );
  });

  it('runs a trip: reminder, OK by SMS, a missed step opens an alert, then the end', async () => {
    const { traveller, lead } = await travellerWithLead();
    const first = new Date(Date.now() + HOUR);
    const second = new Date(Date.now() + 3 * HOUR);

    const created = (
      await request(app.getHttpServer())
        .post('/alert/watch/trip')
        .set('Authorization', auth(traveller.accessToken))
        .send({
          name: 'Col du Lac',
          instructions: 'Appeler le refuge',
          firstStep: {
            placeName: 'Parking',
            expectedAt: first.toISOString(),
            delayMinutes: 60,
          },
          moreSteps: [
            {
              placeName: 'Refuge du Lac',
              expectedAt: second.toISOString(),
              delayMinutes: 60,
            },
          ],
          travelCircle: true,
        })
        .expect(201)
    ).body as WatchBody;

    expect(created).toMatchObject({
      mode: 'TRIP',
      alertStatus: AlertStatus.SENT,
      alertType: AlertType.TRAVEL,
      closedAt: null,
    });
    expect(created.checkpoints).toHaveLength(2);
    // The trip's own circle carries its name.
    expect(created.travelCircles.map((c) => c.label)).toEqual(['Col du Lac']);
    // One trip at a time.
    await request(app.getHttpServer())
      .post('/alert/watch/trip')
      .set('Authorization', auth(traveller.accessToken))
      .send({
        name: 'Encore',
        firstStep: {
          placeName: 'Ici',
          expectedAt: first.toISOString(),
          delayMinutes: 60,
        },
      })
      .expect(409);

    // A watch is never an alert: not listed, not reachable as one.
    const mine = (
      await request(app.getHttpServer())
        .get('/alert/mine')
        .set('Authorization', auth(traveller.accessToken))
        .expect(200)
    ).body as { id: string }[];
    expect(mine.some((a) => a.id === created.id)).toBe(false);
    await request(app.getHttpServer())
      .get(`/alert/${created.id}`)
      .set('Authorization', auth(traveller.accessToken))
      .expect(404);
    // Nothing is shared: the 1st circle doesn't see it before an alert.
    const seen = (
      await request(app.getHttpServer())
        .get(`/alert/watch/of/${traveller.userId}`)
        .set('Authorization', auth(lead.accessToken))
        .expect(200)
    ).body as unknown[];
    expect(seen).toEqual([]);

    // The first step's time: the traveller is reminded by SMS.
    await scheduler.runDeadlines(new Date(first.getTime() + MIN));
    const reminder = sentSms.find((s) => s.phone === traveller.phone);
    expect(reminder?.body).toContain('Parking');

    // "OK" by SMS validates it; the reply names the next step.
    sentSms = [];
    await request(app.getHttpServer())
      .post('/sentinel/sms/inbound')
      .send({ from: traveller.phone, body: 'OK' })
      .expect(201);
    let watch = await getWatch(traveller.accessToken, created.id);
    expect(watch.checkpoints[0].validatedAt).not.toBeNull();
    expect(sentSms[0].body).toContain('Prochaine etape : "Refuge du Lac"');

    // The second step goes unanswered: reminder, then a full delay later
    // an alert opens for the 1st circle, linked to the trip.
    await scheduler.runDeadlines(new Date(second.getTime() + MIN));
    sentSms = [];
    await scheduler.runDeadlines(new Date(second.getTime() + 62 * MIN));
    watch = await getWatch(traveller.accessToken, created.id);
    const missed = watch.checkpoints[1];
    expect(missed.missedAt).not.toBeNull();
    expect(missed.openedAlertId).not.toBeNull();
    expect(watch.runningAlertIds).toEqual([missed.openedAlertId]);
    const toLead = sentSms.find((s) => s.phone === lead.phone);
    expect(toLead?.body).toContain('Que faire : Appeler le refuge');

    // The 1st circle sees the alert with the whole trip, and may
    // requalify it.
    const alert = (
      await request(app.getHttpServer())
        .get(`/alert/${missed.openedAlertId}`)
        .set('Authorization', auth(lead.accessToken))
        .expect(200)
    ).body as {
      alertStatus: AlertStatus;
      alertType: AlertType;
      launchedById: string | null;
      trip: { id: string; checkpoints: unknown[] };
    };
    expect(alert).toMatchObject({
      alertStatus: AlertStatus.LAUNCHED,
      alertType: AlertType.TRAVEL,
      launchedById: null,
    });
    expect(alert.trip.id).toBe(created.id);
    expect(alert.trip.checkpoints).toHaveLength(2);
    await request(app.getHttpServer())
      .patch(`/alert/${missed.openedAlertId}/type`)
      .set('Authorization', auth(lead.accessToken))
      .send({ alertType: AlertType.EMERGENCY })
      .expect(200);
    // Never the other mode's type.
    await request(app.getHttpServer())
      .patch(`/alert/${missed.openedAlertId}/type`)
      .set('Authorization', auth(lead.accessToken))
      .send({ alertType: AlertType.NOCONTACT })
      .expect(400);

    // The traveller says all is well: it answers the missed step, and the
    // 1st circle reads it in the alert's room.
    await request(app.getHttpServer())
      .post(`/alert/watch/${created.id}/validate`)
      .set('Authorization', auth(traveller.accessToken))
      .send({ endTrip: true })
      .expect(201);
    const room = await prisma.conversation.findFirst({
      where: { alertId: missed.openedAlertId! },
      orderBy: { createdAt: 'asc' },
      include: { messages: true },
    });
    expect(room?.messages.map((m) => m.body)).toContainEqual(
      expect.stringContaining('Refuge du Lac'),
    );

    // The trip is over (its alert goes on until someone closes it); its
    // circle, nobody in it, is closed.
    watch = await getWatch(traveller.accessToken, created.id);
    expect(watch.closedAt).not.toBeNull();
    const circle = await prisma.circle.findFirst({
      where: { tripId: created.id },
    });
    expect(circle?.status).toBe('CLOSED');
    const history = (
      await request(app.getHttpServer())
        .get('/alert/watch/history')
        .set('Authorization', auth(traveller.accessToken))
        .expect(200)
    ).body as { mine: { id: string; tripAlerts: { id: string }[] }[] };
    expect(history.mine[0].id).toBe(created.id);
    expect(history.mine[0].tripAlerts.map((a) => a.id)).toEqual([
      missed.openedAlertId,
    ]);
  });

  it('runs an All Good Check: each "all good" plans the next deadline', async () => {
    const { traveller } = await travellerWithLead();
    const started = (
      await request(app.getHttpServer())
        .post('/alert/watch/all-good')
        .set('Authorization', auth(traveller.accessToken))
        .send({
          schedule: { kind: 'DAILY', before: '20:00' },
          delayMinutes: 240,
          shareItineraryWithFirstCircle: true,
          shareValidationsWithFirstCircle: true,
        })
        .expect(201)
    ).body as WatchBody;
    expect(started.mode).toBe('ALL_GOOD');
    expect(started.alertType).toBe(AlertType.NOCONTACT);
    expect(started.checkpoints).toHaveLength(1);
    const firstDeadline = new Date(started.checkpoints[0].expectedAt);

    const after = (
      await request(app.getHttpServer())
        .post(`/alert/watch/${started.id}/validate`)
        .set('Authorization', auth(traveller.accessToken))
        .send({})
        .expect(201)
    ).body as WatchBody;
    expect(after.checkpoints).toHaveLength(2);
    expect(after.checkpoints[0].validatedAt).not.toBeNull();
    // The next one, a day later (20:00 again in the person's zone).
    expect(
      new Date(after.checkpoints[1].expectedAt).getTime() -
        firstDeadline.getTime(),
    ).toBeGreaterThanOrEqual(23 * HOUR);

    // Paused by the person: its deadline is skipped, nobody reminded.
    await request(app.getHttpServer())
      .patch(`/alert/watch/${started.id}/settings`)
      .set('Authorization', auth(traveller.accessToken))
      .send({
        pausedUntil: new Date(Date.now() + 30 * 24 * HOUR).toISOString(),
      })
      .expect(200);
    sentSms = [];
    const due = new Date(after.checkpoints[1].expectedAt);
    await scheduler.runDeadlines(new Date(due.getTime() + MIN));
    expect(sentSms).toEqual([]);
    const moved = await getWatch(traveller.accessToken, started.id);
    expect(new Date(moved.checkpoints[1].expectedAt).getTime()).toBeGreaterThan(
      due.getTime(),
    );

    await request(app.getHttpServer())
      .post(`/alert/watch/${started.id}/end`)
      .set('Authorization', auth(traveller.accessToken))
      .send({})
      .expect(201);
  });
});
