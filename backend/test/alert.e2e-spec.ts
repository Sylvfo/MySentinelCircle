import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AlertStatus, AlertType, CircleType } from '@prisma/client';
import { AppModule } from './../src/app.module';
import { OTP_SENDER } from './../src/auth/otp/otp-sender.interface';
import { EMAIL_SENDER } from './../src/email/email-sender.interface';
import { SMS_SENDER } from './../src/sms/sms-sender.interface';
import { testPhone } from './helpers/test-data';

interface AuthResponseBody {
  accessToken?: string;
  userId?: string;
}

interface CircleBody {
  id: string;
  circleType: CircleType;
}

interface LinkBody {
  id: string;
}

interface AlertBody {
  id: string;
  label: string;
  messageAlert: string;
  statusByCompanion: string | null;
  statusByFirstCircle: string | null;
  alertStatus: AlertStatus;
  alertType: AlertType;
  userCompanionId: string;
  firstCircleId: string;
  launchedById: string | null;
  closedById: string | null;
}

interface AlertParticipantBody {
  id: string;
  status: string;
  isLead: boolean;
  circleId: string;
  circleName: string;
  response: string | null;
  canSendPhoneAtAlert: boolean | null;
  canMessageOwnCircleAtAlert: boolean | null;
  userSentinelsId: string;
  requestedBy: { id: string; firstName: string } | null;
  userSentinels: {
    userSentinelId: string;
    leadSlot: string | null;
    linkAsSentinel: { id: string; firstName: string };
  };
}

interface AlertMessageBody {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; firstName: string };
}

interface AlertDetailBody extends AlertBody {
  userCompanion: {
    id: string;
    firstName: string;
    myCircles: { id: string; label: string }[];
  };
  statusUpdatedBy: { id: string; firstName: string } | null;
  labelUpdatedBy: { id: string; firstName: string } | null;
  participants: AlertParticipantBody[];
  conversations: {
    id: string;
    closedAt: string | null;
    messages: AlertMessageBody[];
  }[];
}

describe('Alert (e2e)', () => {
  let app: INestApplication<App>;
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

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function signupAccount(firstName: string) {
    const phone = testPhone();
    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup/phone')
      .send({ firstName, phone })
      .expect(201);
    const signupBody = signupRes.body as AuthResponseBody;
    const code = sentOtps[sentOtps.length - 1].code;
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ userId: signupBody.userId, code })
      .expect(201);
    const verifyBody = verifyRes.body as AuthResponseBody;
    return {
      accessToken: verifyBody.accessToken as string,
      userId: signupBody.userId as string,
      phone,
    };
  }

  function auth(token: string) {
    return `Bearer ${token}`;
  }

  // Builds a companion with `count` accepted Sentinels in their 1st circle.
  async function buildFirstCircle(
    companionToken: string,
    count: number,
    { leadCount = 1 }: { leadCount?: number } = {},
  ) {
    const circlesRes = await request(app.getHttpServer())
      .get('/sentinel/circles')
      .set('Authorization', auth(companionToken))
      .expect(200);
    const firstCircle = (circlesRes.body as CircleBody[]).find(
      (c) => c.circleType === CircleType.FIRST,
    )!;

    const sentinels: {
      accessToken: string;
      userId: string;
      phone: string;
      linkId: string;
    }[] = [];
    for (let i = 0; i < count; i++) {
      const sentinel = await signupAccount(`Sentinel${i}`);
      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${firstCircle.id}/invite`)
        .set('Authorization', auth(companionToken))
        .send({
          phone: sentinel.phone,
          name: `Sentinel${i}`,
          requestedAsLead: i < leadCount,
        })
        .expect(201);
      const link = inviteRes.body as LinkBody;
      await request(app.getHttpServer())
        .post(`/sentinel/memberships/${link.id}/accept`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({})
        .expect(201);
      sentinels.push({ ...sentinel, linkId: link.id });
    }
    return { firstCircle, sentinels };
  }

  // Builds a companion-owned outer ("other") circle with `count` accepted
  // Sentinels — used to test outer-circle escalation.
  async function buildOuterCircle(
    companionToken: string,
    label: string,
    count: number,
  ) {
    const circleRes = await request(app.getHttpServer())
      .post('/sentinel/circles')
      .set('Authorization', auth(companionToken))
      .send({ label })
      .expect(201);
    const circle = circleRes.body as CircleBody;

    const sentinels: { accessToken: string; userId: string; phone: string }[] =
      [];
    for (let i = 0; i < count; i++) {
      const sentinel = await signupAccount(`${label}${i}`);
      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${circle.id}/invite`)
        .set('Authorization', auth(companionToken))
        .send({ phone: sentinel.phone, name: `${label}${i}` })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/sentinel/memberships/${(inviteRes.body as LinkBody).id}/accept`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({})
        .expect(201);
      sentinels.push(sentinel);
    }
    return { circle, sentinels };
  }

  describe('POST /alert (raise)', () => {
    it('raises an alert for the companion themself, notifies the 1st circle, and opens its conversation', async () => {
      const companion = await signupAccount('Ada');
      const { sentinels } = await buildFirstCircle(companion.accessToken, 2);
      sentSms.length = 0; // ignore invite/accept notifications

      const res = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'Besoin d’aide',
        })
        .expect(201);
      const alert = res.body as AlertBody;
      expect(alert.alertStatus).toBe(AlertStatus.LAUNCHED);
      expect(alert.launchedById).toBe(companion.userId);

      // One SMS per 1st-circle Sentinel, none to the companion (they raised it themself).
      expect(sentSms).toHaveLength(2);
      expect(sentSms.map((s) => s.phone).sort()).toEqual(
        sentinels.map((s) => s.phone).sort(),
      );

      const detailRes = await request(app.getHttpServer())
        .get(`/alert/${alert.id}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const detail = detailRes.body as AlertDetailBody;
      expect(detail.participants).toHaveLength(2);
      expect(detail.participants.map((p) => p.isLead).sort()).toEqual([
        false,
        true,
      ]);
      expect(detail.conversations).toHaveLength(1);
      expect(detail.conversations[0].closedAt).toBeNull();
    });

    it('lets an accepted 1st-circle Sentinel raise it on the companion’s behalf, and also notifies the companion', async () => {
      const companion = await signupAccount('Ada');
      const { sentinels } = await buildFirstCircle(companion.accessToken, 1);
      sentSms.length = 0;

      await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(sentinels[0].accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.NOCONTACT,
          reason: 'Sans nouvelles depuis 2 jours',
        })
        .expect(201);

      // The circle + the companion.
      expect(sentSms).toHaveLength(2);
      expect(sentSms.map((s) => s.phone).sort()).toEqual(
        [sentinels[0].phone, companion.phone].sort(),
      );
    });

    it('lets an accepted outer-circle Sentinel raise it too — it still notifies the 1st circle', async () => {
      const companion = await signupAccount('Ada');
      const { sentinels } = await buildFirstCircle(companion.accessToken, 1);
      const outerSentinel = await signupAccount('Zoe');

      const circleRes = await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .send({ label: 'Travail' })
        .expect(201);
      const workCircle = circleRes.body as CircleBody;
      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${workCircle.id}/invite`)
        .set('Authorization', auth(companion.accessToken))
        .send({ phone: outerSentinel.phone, name: 'Zoe' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/sentinel/memberships/${(inviteRes.body as LinkBody).id}/accept`)
        .set('Authorization', auth(outerSentinel.accessToken))
        .send({})
        .expect(201);
      sentSms.length = 0;

      const res = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(outerSentinel.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.MISSING,
          reason: 'Pas vu au travail depuis 3 jours',
        })
        .expect(201);
      expect((res.body as AlertBody).launchedById).toBe(outerSentinel.userId);

      // Notifies the 1st circle (not the "Travail" circle itself) + the companion.
      expect(sentSms.map((s) => s.phone).sort()).toEqual(
        [sentinels[0].phone, companion.phone].sort(),
      );
    });

    it('rejects a caller who is neither the companion nor an accepted Sentinel of theirs', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1); // a Lead Sentinel, so this tests authorization, not the lead rule
      const stranger = await signupAccount('Eve');

      await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(stranger.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(403);
    });

    it('rejects raising when the companion has no 1st circle yet', async () => {
      const companion = await signupAccount('Ada');
      // Never called GET /sentinel/circles — the 1st circle doesn't exist yet.

      await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(409);
    });

    it('rejects raising when the 1st circle exists but has no Lead Sentinel', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 0); // provisions the 1st circle, no members

      await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(409);
    });

    it('rejects raising a second alert while one is already active', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);

      await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'y',
        })
        .expect(409);
    });
  });

  describe('POST /alert/:id/close', () => {
    async function raiseAlert(companion: {
      accessToken: string;
      userId: string;
    }) {
      const res = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(201);
      return res.body as AlertBody;
    }

    it('closes the alert when the companion closes it themself', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);
      const alert = await raiseAlert(companion);

      const res = await request(app.getHttpServer())
        .post(`/alert/${alert.id}/close`)
        .set('Authorization', auth(companion.accessToken))
        .expect(201);
      expect((res.body as AlertBody).alertStatus).toBe(AlertStatus.RESOLVED);

      const detailRes = await request(app.getHttpServer())
        .get(`/alert/${alert.id}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const detail = detailRes.body as AlertDetailBody;
      expect(detail.conversations[0].closedAt).not.toBeNull();
    });

    it('closes the alert when an accepted 1st-circle Sentinel closes it', async () => {
      const companion = await signupAccount('Ada');
      const { sentinels } = await buildFirstCircle(companion.accessToken, 1);
      const alert = await raiseAlert(companion);

      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/close`)
        .set('Authorization', auth(sentinels[0].accessToken))
        .expect(201);
    });

    it('rejects closing for a non-participant', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);
      const alert = await raiseAlert(companion);
      const stranger = await signupAccount('Eve');

      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/close`)
        .set('Authorization', auth(stranger.accessToken))
        .expect(403);
    });

    it('rejects closing an already-resolved alert', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);
      const alert = await raiseAlert(companion);
      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/close`)
        .set('Authorization', auth(companion.accessToken))
        .expect(201);

      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/close`)
        .set('Authorization', auth(companion.accessToken))
        .expect(409);
    });
  });

  describe('GET /alert', () => {
    it('lists the companion’s alerts, newest first', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);

      const first = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'first',
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/alert/${(first.body as AlertBody).id}/close`)
        .set('Authorization', auth(companion.accessToken))
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'second',
        })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get('/alert/mine')
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const ids = (listRes.body as AlertBody[]).map((a) => a.id);
      expect(ids).toEqual([
        (second.body as AlertBody).id,
        (first.body as AlertBody).id,
      ]);
    });
  });

  describe('POST /alert/:id/request-circle', () => {
    it('asks a specific outer circle, notifies its Sentinels, and activates the alert', async () => {
      const companion = await signupAccount('Lea');
      await buildFirstCircle(companion.accessToken, 1);
      const { circle: outerCircle, sentinels: outerSentinels } =
        await buildOuterCircle(companion.accessToken, 'Voisins', 2);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.MISSING,
          reason: 'Introuvable',
        })
        .expect(201);
      const alert = raiseRes.body as AlertBody;
      sentSms.length = 0;

      const detailRes = await request(app.getHttpServer())
        .post(`/alert/${alert.id}/request-circle`)
        .set('Authorization', auth(companion.accessToken))
        .send({ circleId: outerCircle.id, question: 'Est-elle chez vous ?' })
        .expect(201);
      const detail = detailRes.body as AlertDetailBody;

      expect(detail.alertStatus).toBe(AlertStatus.ACTIVE);
      expect(sentSms.map((s) => s.phone).sort()).toEqual(
        outerSentinels.map((s) => s.phone).sort(),
      );
      const outerParticipants = detail.participants.filter(
        (p) => p.circleId === outerCircle.id,
      );
      expect(outerParticipants).toHaveLength(2);
      expect(outerParticipants.every((p) => p.status === 'CONTACTED')).toBe(
        true,
      );
    });

    it('records an outer-circle Sentinel’s SMS OUI/NON reply, without it being misread as "leave the circle"', async () => {
      const companion = await signupAccount('Noah');
      await buildFirstCircle(companion.accessToken, 1);
      const { circle: outerCircle, sentinels: outerSentinels } =
        await buildOuterCircle(companion.accessToken, 'Sport', 1);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.MISSING,
          reason: 'Introuvable',
        })
        .expect(201);
      const alert = raiseRes.body as AlertBody;
      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/request-circle`)
        .set('Authorization', auth(companion.accessToken))
        .send({ circleId: outerCircle.id, question: 'Est-il chez vous ?' })
        .expect(201);
      sentSms.length = 0;

      await request(app.getHttpServer())
        .post('/sentinel/sms/inbound')
        .send({ from: outerSentinels[0].phone, body: 'NON' })
        .expect(201);

      // An acknowledgement, not a "you've been removed" notice.
      expect(sentSms).toHaveLength(1);
      expect(sentSms[0].phone).toBe(outerSentinels[0].phone);

      const detailRes = await request(app.getHttpServer())
        .get(`/alert/${alert.id}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const detail = detailRes.body as AlertDetailBody;
      const participant = detail.participants.find(
        (p) => p.circleId === outerCircle.id,
      )!;
      expect(participant.status).toBe('RESPONDED');
      expect(participant.response).toBe('NON');

      // The Sentinel must still be an active member of the circle — a NON
      // meant for the alert question must never be read as "remove me".
      // Checked from the companion's side: GET /sentinel/circles lists "my
      // circles", so it must be called as the companion, not the Sentinel.
      const circlesRes = await request(app.getHttpServer())
        .get('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      type CircleWithMembers = CircleBody & {
        userSentinels: { userSentinelId: string; status: string }[];
      };
      const circles = circlesRes.body as CircleWithMembers[];
      const target = circles.find((c) => c.id === outerCircle.id)!;
      expect(
        target.userSentinels.some(
          (m) =>
            m.userSentinelId === outerSentinels[0].userId &&
            m.status === 'ACCEPTED',
        ),
      ).toBe(true);
    });

    it('lets an account-holding Sentinel respond in-app instead of by SMS', async () => {
      const companion = await signupAccount('Thomas');
      await buildFirstCircle(companion.accessToken, 1);
      const { circle: outerCircle, sentinels: outerSentinels } =
        await buildOuterCircle(companion.accessToken, 'Etudes', 1);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.MISSING,
          reason: 'Introuvable',
        })
        .expect(201);
      const alert = raiseRes.body as AlertBody;
      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/request-circle`)
        .set('Authorization', auth(companion.accessToken))
        .send({ circleId: outerCircle.id, question: 'Est-il chez vous ?' })
        .expect(201);

      // respond() returns the updated participant directly, not the full
      // getAlert() detail — an outer-circle Sentinel isn't allowed to view
      // that (only "Me" or the 1st circle are).
      const respondRes = await request(app.getHttpServer())
        .post(`/alert/${alert.id}/respond`)
        .set('Authorization', auth(outerSentinels[0].accessToken))
        .send({ accepted: true })
        .expect(201);
      const participant = respondRes.body as AlertParticipantBody;
      expect(participant.status).toBe('RESPONDED');
      expect(participant.response).toBe('OUI');

      const detailRes = await request(app.getHttpServer())
        .get(`/alert/${alert.id}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const detail = detailRes.body as AlertDetailBody;
      const updated = detail.participants.find(
        (p) => p.circleId === outerCircle.id,
      )!;
      expect(updated.status).toBe('RESPONDED');
      expect(updated.response).toBe('OUI');
    });

    it('rejects responding when the caller has no pending request on this alert', async () => {
      const companion = await signupAccount('Emma');
      await buildFirstCircle(companion.accessToken, 1);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(201);
      const stranger = await signupAccount('Eve');

      await request(app.getHttpServer())
        .post(`/alert/${(raiseRes.body as AlertBody).id}/respond`)
        .set('Authorization', auth(stranger.accessToken))
        .send({ accepted: true })
        .expect(403);
    });

    it('rejects targeting a circle that is not this companion’s outer circle', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(201);
      const other = await signupAccount('Mallory');
      const { circle: othersCircle } = await buildOuterCircle(
        other.accessToken,
        'PasLeMienCercle',
        1,
      );

      await request(app.getHttpServer())
        .post(`/alert/${(raiseRes.body as AlertBody).id}/request-circle`)
        .set('Authorization', auth(companion.accessToken))
        .send({ circleId: othersCircle.id, question: 'x' })
        .expect(400);
    });

    it('rejects a caller who is neither the companion nor an accepted 1st-circle Sentinel', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);
      const { circle: outerCircle } = await buildOuterCircle(
        companion.accessToken,
        'Travail',
        1,
      );
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(201);
      const stranger = await signupAccount('Eve');

      await request(app.getHttpServer())
        .post(`/alert/${(raiseRes.body as AlertBody).id}/request-circle`)
        .set('Authorization', auth(stranger.accessToken))
        .send({ circleId: outerCircle.id, question: 'x' })
        .expect(403);
    });
  });

  describe('GET /alert/:id/my-participation', () => {
    it('lets a solicited outer-circle Sentinel see their own participation, where GET /alert/:id itself 403s them', async () => {
      const companion = await signupAccount('Lea');
      await buildFirstCircle(companion.accessToken, 1);
      const { circle: outerCircle, sentinels: outerSentinels } =
        await buildOuterCircle(companion.accessToken, 'Voisins', 1);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.MISSING,
          reason: 'Introuvable',
        })
        .expect(201);
      const alert = raiseRes.body as AlertBody;
      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/request-circle`)
        .set('Authorization', auth(companion.accessToken))
        .send({ circleId: outerCircle.id, question: 'Est-elle chez vous ?' })
        .expect(201);

      // The full alert is off-limits to them...
      await request(app.getHttpServer())
        .get(`/alert/${alert.id}`)
        .set('Authorization', auth(outerSentinels[0].accessToken))
        .expect(403);

      // ...but their own participation (and just enough context to act on
      // it) is reachable.
      const res = await request(app.getHttpServer())
        .get(`/alert/${alert.id}/my-participation`)
        .set('Authorization', auth(outerSentinels[0].accessToken))
        .expect(200);
      interface MyParticipationBody {
        status: string;
        circleName: string;
        alert: { messageAlert: string; userCompanion: { firstName: string } };
      }
      const body = res.body as MyParticipationBody;
      expect(body.status).toBe('CONTACTED');
      expect(body.circleName).toBe('Voisins');
      expect(body.alert.messageAlert).toBe('Introuvable');
      expect(body.alert.userCompanion.firstName).toBe('Lea');
    });

    it('rejects a caller with no participation on this alert', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(201);
      const stranger = await signupAccount('Eve');

      await request(app.getHttpServer())
        .get(`/alert/${(raiseRes.body as AlertBody).id}/my-participation`)
        .set('Authorization', auth(stranger.accessToken))
        .expect(403);
    });
  });

  describe('PATCH /alert/:id/status', () => {
    it('lets the companion and a 1st-circle Sentinel each write their own status note, both visible to an outer-circle Sentinel', async () => {
      const companion = await signupAccount('Lea');
      const { sentinels } = await buildFirstCircle(companion.accessToken, 1);
      const { circle: outerCircle, sentinels: outerSentinels } =
        await buildOuterCircle(companion.accessToken, 'Voisins', 1);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.MISSING,
          reason: 'Introuvable',
        })
        .expect(201);
      const alert = raiseRes.body as AlertBody;
      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/request-circle`)
        .set('Authorization', auth(companion.accessToken))
        .send({ circleId: outerCircle.id, question: 'Est-elle chez vous ?' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/alert/${alert.id}/status`)
        .set('Authorization', auth(companion.accessToken))
        .send({ message: 'Je vais bien, merci' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/alert/${alert.id}/status`)
        .set('Authorization', auth(sentinels[0].accessToken))
        .send({ message: 'On la cherche encore' })
        .expect(200);

      const detailRes = await request(app.getHttpServer())
        .get(`/alert/${alert.id}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const detail = detailRes.body as AlertDetailBody;
      expect(detail.statusByCompanion).toBe('Je vais bien, merci');
      expect(detail.statusByFirstCircle).toBe('On la cherche encore');
      expect(detail.statusUpdatedBy?.id).toBe(sentinels[0].userId);

      // An outer-circle Sentinel can't see the full alert, but does see
      // both status notes through the lightweight endpoint — not who else
      // was contacted or what they answered.
      interface MyParticipationBody {
        alert: {
          label: string;
          statusByCompanion: string | null;
          statusByFirstCircle: string | null;
        };
      }
      const myPartRes = await request(app.getHttpServer())
        .get(`/alert/${alert.id}/my-participation`)
        .set('Authorization', auth(outerSentinels[0].accessToken))
        .expect(200);
      const myPart = myPartRes.body as MyParticipationBody;
      expect(myPart.alert.statusByCompanion).toBe('Je vais bien, merci');
      expect(myPart.alert.statusByFirstCircle).toBe('On la cherche encore');
    });

    it('stays writable by the companion and the 1st circle after the alert is closed', async () => {
      const companion = await signupAccount('Ada');
      const { sentinels } = await buildFirstCircle(companion.accessToken, 1);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(201);
      const alert = raiseRes.body as AlertBody;
      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/close`)
        .set('Authorization', auth(companion.accessToken))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/alert/${alert.id}/status`)
        .set('Authorization', auth(companion.accessToken))
        .send({ message: 'Tout est rentré dans l’ordre' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/alert/${alert.id}/status`)
        .set('Authorization', auth(sentinels[0].accessToken))
        .send({ message: 'Merci à tous' })
        .expect(200);
    });

    it('rejects a caller who is neither the companion nor an accepted 1st-circle Sentinel', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(201);
      const stranger = await signupAccount('Eve');

      await request(app.getHttpServer())
        .patch(`/alert/${(raiseRes.body as AlertBody).id}/status`)
        .set('Authorization', auth(stranger.accessToken))
        .send({ message: 'x' })
        .expect(403);
    });
  });

  describe('PATCH /alert/:id/label', () => {
    it('lets any accepted 1st-circle Sentinel rename the alert, visible to every contacted Sentinel', async () => {
      const companion = await signupAccount('Lea');
      const { sentinels } = await buildFirstCircle(companion.accessToken, 2, {
        leadCount: 1,
      });
      const { circle: outerCircle, sentinels: outerSentinels } =
        await buildOuterCircle(companion.accessToken, 'Voisins', 1);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.MISSING,
          reason: 'Introuvable',
        })
        .expect(201);
      const alert = raiseRes.body as AlertBody;
      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/request-circle`)
        .set('Authorization', auth(companion.accessToken))
        .send({ circleId: outerCircle.id, question: 'Est-elle chez vous ?' })
        .expect(201);

      // sentinels[1] is not the Lead (leadCount: 1) — still allowed, any
      // accepted 1st-circle Sentinel can rename.
      await request(app.getHttpServer())
        .patch(`/alert/${alert.id}/label`)
        .set('Authorization', auth(sentinels[1].accessToken))
        .send({ label: 'Recherche de Lea' })
        .expect(200);

      const detailRes = await request(app.getHttpServer())
        .get(`/alert/${alert.id}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      expect((detailRes.body as AlertBody).label).toBe('Recherche de Lea');

      interface MyParticipationBody {
        alert: { label: string };
      }
      const myPartRes = await request(app.getHttpServer())
        .get(`/alert/${alert.id}/my-participation`)
        .set('Authorization', auth(outerSentinels[0].accessToken))
        .expect(200);
      expect((myPartRes.body as MyParticipationBody).alert.label).toBe(
        'Recherche de Lea',
      );
    });

    it('rejects an outer-circle Sentinel', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);
      const { sentinels: outerSentinels } = await buildOuterCircle(
        companion.accessToken,
        'Travail',
        1,
      );
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/alert/${(raiseRes.body as AlertBody).id}/label`)
        .set('Authorization', auth(outerSentinels[0].accessToken))
        .send({ label: 'x' })
        .expect(403);
    });

    it('rejects the companion — only the 1st circle can rename', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/alert/${(raiseRes.body as AlertBody).id}/label`)
        .set('Authorization', auth(companion.accessToken))
        .send({ label: 'x' })
        .expect(403);
    });
  });

  describe('GET /alert/:id — attribution and message history', () => {
    it('shows who requested each circle, and lets the companion read the 1st-circle chat without being a participant of it', async () => {
      const companion = await signupAccount('Lea');
      const { sentinels } = await buildFirstCircle(companion.accessToken, 1);
      const { circle: outerCircle } = await buildOuterCircle(
        companion.accessToken,
        'Voisins',
        1,
      );
      const raiseRes = await request(app.getHttpServer())
        .post('/alert/raise')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.MISSING,
          reason: 'Introuvable',
        })
        .expect(201);
      const alert = raiseRes.body as AlertBody;

      // The companion raised it themself — requestedBy on the 1st-circle
      // participant is the companion.
      let detailRes = await request(app.getHttpServer())
        .get(`/alert/${alert.id}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      let detail = detailRes.body as AlertDetailBody;
      expect(detail.participants[0].requestedBy?.id).toBe(companion.userId);

      // A 1st-circle Sentinel triggers the outer-circle request —
      // requestedBy on that participant is the Sentinel, not the companion.
      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/request-circle`)
        .set('Authorization', auth(sentinels[0].accessToken))
        .send({ circleId: outerCircle.id, question: 'Est-elle chez vous ?' })
        .expect(201);

      detailRes = await request(app.getHttpServer())
        .get(`/alert/${alert.id}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      detail = detailRes.body as AlertDetailBody;
      const outerParticipant = detail.participants.find(
        (p) => p.circleId === outerCircle.id,
      )!;
      expect(outerParticipant.requestedBy?.id).toBe(sentinels[0].userId);

      // A 1st-circle Sentinel sends a message in the alert's conversation.
      const conversationId = detail.conversations[0].id;
      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinels[0].accessToken))
        .send({ body: 'On est sur place.' })
        .expect(201);

      // The companion isn't a participant of that conversation (by design)
      // and still gets 403 calling messaging directly...
      await request(app.getHttpServer())
        .get(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(companion.accessToken))
        .expect(403);

      // ...but reads the full message history as part of the alert detail.
      detailRes = await request(app.getHttpServer())
        .get(`/alert/${alert.id}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      detail = detailRes.body as AlertDetailBody;
      const messages = detail.conversations[0].messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe('On est sur place.');
      expect(messages[0].sender.id).toBe(sentinels[0].userId);
    });
  });
});
