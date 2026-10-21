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
  alertStatus: AlertStatus;
  alertType: AlertType;
  userCompanionId: string;
  firstCircleId: string;
  launchedById: string | null;
  closedById: string | null;
}

interface AlertDetailBody extends AlertBody {
  participants: {
    id: string;
    status: string;
    isLead: boolean;
    circleName: string;
    canSendPhoneAtAlert: boolean | null;
    canMessageOwnCircleAtAlert: boolean | null;
    userSentinelsId: string;
    userSentinels: { userSentinelId: string; leadSlot: string | null };
  }[];
  conversations: { id: string; closedAt: string | null }[];
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

  describe('POST /alert (raise)', () => {
    it('raises an alert for the companion themself, notifies the 1st circle, and opens its conversation', async () => {
      const companion = await signupAccount('Ada');
      const { sentinels } = await buildFirstCircle(companion.accessToken, 2);
      sentSms.length = 0; // ignore invite/accept notifications

      const res = await request(app.getHttpServer())
        .post('/alert')
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
        .post('/alert')
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

    it('rejects a caller who is neither the companion nor an accepted 1st-circle Sentinel', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 0); // provisions the 1st circle, no members
      const stranger = await signupAccount('Eve');

      await request(app.getHttpServer())
        .post('/alert')
        .set('Authorization', auth(stranger.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(403);
    });

    it('rejects raising a second alert while one is already active', async () => {
      const companion = await signupAccount('Ada');
      await buildFirstCircle(companion.accessToken, 1);

      await request(app.getHttpServer())
        .post('/alert')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'x',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/alert')
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
        .post('/alert')
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
        .post('/alert')
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
        .post('/alert')
        .set('Authorization', auth(companion.accessToken))
        .send({
          companionId: companion.userId,
          alertType: AlertType.BYCOMPANION,
          reason: 'second',
        })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get('/alert')
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const ids = (listRes.body as AlertBody[]).map((a) => a.id);
      expect(ids).toEqual([
        (second.body as AlertBody).id,
        (first.body as AlertBody).id,
      ]);
    });
  });
});
