import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { CircleType, LinkStatus, MessagingMode } from '@prisma/client';
import { AppModule } from './../src/app.module';
import { OTP_SENDER } from './../src/auth/otp/otp-sender.interface';
import { EMAIL_SENDER } from './../src/email/email-sender.interface';
import { SMS_SENDER } from './../src/sms/sms-sender.interface';
import { PrismaService } from './../src/prisma/prisma.service';
import { testPhone } from './helpers/test-data';

interface AuthResponseBody {
  accessToken?: string;
  userId?: string;
}

interface CircleBody {
  id: string;
  circleType: CircleType;
  label: string;
}

interface LinkBody {
  id: string;
  status: LinkStatus;
  circleId: string;
  leadSlot: string | null;
  canMessageOwnCircle?: boolean;
  firstCircleMessagingMode?: MessagingMode;
}

describe('Sentinel (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
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
    prisma = moduleFixture.get(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  // Full, verified account via phone+OTP signup — used for both companions
  // and account-holding Sentinels throughout this spec.
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

  describe('Circles', () => {
    it('always exposes the 1st and reserve circles, sorted FIRST -> BASIC -> RESERVED', async () => {
      const { accessToken } = await signupAccount('Ada');

      await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(accessToken))
        .send({ label: 'Voisins' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/sentinel/circles')
        .set('Authorization', auth(accessToken))
        .expect(200);
      const circles = res.body as CircleBody[];
      expect(circles.map((c) => c.circleType)).toEqual([
        CircleType.FIRST,
        CircleType.BASIC,
        CircleType.RESERVED,
      ]);
    });

    it('cannot delete the 1st or reserve circle', async () => {
      const { accessToken } = await signupAccount('Ada');
      const res = await request(app.getHttpServer())
        .get('/sentinel/circles')
        .set('Authorization', auth(accessToken))
        .expect(200);
      const circles = res.body as CircleBody[];
      const first = circles.find((c) => c.circleType === CircleType.FIRST)!;
      const reserve = circles.find(
        (c) => c.circleType === CircleType.RESERVED,
      )!;

      await request(app.getHttpServer())
        .delete(`/sentinel/circles/${first.id}`)
        .set('Authorization', auth(accessToken))
        .expect(409);
      await request(app.getHttpServer())
        .delete(`/sentinel/circles/${reserve.id}`)
        .set('Authorization', auth(accessToken))
        .expect(409);
    });

    it('relocates active Sentinels to the reserve circle when their circle is deleted', async () => {
      const { accessToken, userId } = await signupAccount('Ada');
      const sentinelPhone = testPhone();

      const circleRes = await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(accessToken))
        .send({ label: 'Travail' })
        .expect(201);
      const circle = circleRes.body as CircleBody;

      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${circle.id}/invite`)
        .set('Authorization', auth(accessToken))
        .send({ phone: sentinelPhone, name: 'Bob' })
        .expect(201);
      const link = inviteRes.body as LinkBody;

      await request(app.getHttpServer())
        .post('/sentinel/sms/inbound')
        .send({ from: sentinelPhone, body: 'OUI' })
        .expect(201);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/sentinel/circles/${circle.id}`)
        .set('Authorization', auth(accessToken))
        .expect(200);
      expect(deleteRes.body).toEqual({ deleted: true, movedToReserve: 1 });

      const updated = await prisma.linkSentinels.findUnique({
        where: { id: link.id },
      });
      const reserve = await prisma.circle.findFirst({
        where: { userCompanionId: userId, circleType: CircleType.RESERVED },
      });
      expect(updated?.circleId).toBe(reserve?.id);
    });
  });

  describe('Invite flow (Companion -> Sentinel)', () => {
    it('invites an account-holding Sentinel, who accepts from the app', async () => {
      const companion = await signupAccount('Ada');
      const sentinel = await signupAccount('Bob');

      const circlesRes = await request(app.getHttpServer())
        .get('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const firstCircle = (circlesRes.body as CircleBody[]).find(
        (c) => c.circleType === CircleType.FIRST,
      )!;

      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${firstCircle.id}/invite`)
        .set('Authorization', auth(companion.accessToken))
        .send({ phone: sentinel.phone, name: 'Bob' })
        .expect(201);
      const link = inviteRes.body as LinkBody;
      expect(link.status).toBe(LinkStatus.PENDING);
      expect(link.leadSlot).toBe('LEAD_1'); // first Sentinel of an empty 1st circle
      expect(sentSms).toHaveLength(1);

      const myInvitationsRes = await request(app.getHttpServer())
        .get('/sentinel/invitations')
        .set('Authorization', auth(sentinel.accessToken))
        .expect(200);
      expect(myInvitationsRes.body as LinkBody[]).toHaveLength(1);

      const acceptRes = await request(app.getHttpServer())
        .post(`/sentinel/memberships/${link.id}/accept`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({})
        .expect(201);
      expect((acceptRes.body as LinkBody).status).toBe(LinkStatus.ACCEPTED);
      expect(sentSms).toHaveLength(2); // companion notified of the acceptance
    });

    it('rejects inviting a 1st-circle Sentinel with no account', async () => {
      const companion = await signupAccount('Ada');
      const circlesRes = await request(app.getHttpServer())
        .get('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const firstCircle = (circlesRes.body as CircleBody[]).find(
        (c) => c.circleType === CircleType.FIRST,
      )!;

      await request(app.getHttpServer())
        .post(`/sentinel/circles/${firstCircle.id}/invite`)
        .set('Authorization', auth(companion.accessToken))
        .send({ phone: testPhone(), name: 'Nobody' })
        .expect(400);
    });
  });

  describe('Request flow (Sentinel -> Companion)', () => {
    it('lets the companion choose the real circle at accept time', async () => {
      const companion = await signupAccount('Ada');
      const sentinel = await signupAccount('Bob');

      await request(app.getHttpServer())
        .post('/sentinel/requests')
        .set('Authorization', auth(sentinel.accessToken))
        .send({ targetPhone: companion.phone })
        .expect(201);

      const incomingRes = await request(app.getHttpServer())
        .get('/sentinel/requests')
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const incoming = incomingRes.body as LinkBody[];
      expect(incoming).toHaveLength(1);

      // Missing circleId is rejected for a Sentinel-initiated request.
      await request(app.getHttpServer())
        .post(`/sentinel/memberships/${incoming[0].id}/accept`)
        .set('Authorization', auth(companion.accessToken))
        .send({})
        .expect(400);

      const circleRes = await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .send({ label: 'Amis' })
        .expect(201);
      const circle = circleRes.body as CircleBody;

      const acceptRes = await request(app.getHttpServer())
        .post(`/sentinel/memberships/${incoming[0].id}/accept`)
        .set('Authorization', auth(companion.accessToken))
        .send({ circleId: circle.id })
        .expect(201);
      expect((acceptRes.body as LinkBody).circleId).toBe(circle.id);
    });
  });

  describe('Remove / Leave / Block', () => {
    // A bare phone (no account) can only join a non-1st-circle — accepted by
    // SMS, since it never has an app session.
    async function acceptedSmsLink(
      companionToken: string,
      sentinelPhone: string,
    ) {
      const circleRes = await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(companionToken))
        .send({ label: 'Voisins' })
        .expect(201);
      const circle = circleRes.body as CircleBody;
      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${circle.id}/invite`)
        .set('Authorization', auth(companionToken))
        .send({ phone: sentinelPhone, name: 'Bob' })
        .expect(201);
      const link = inviteRes.body as LinkBody;
      await request(app.getHttpServer())
        .post('/sentinel/sms/inbound')
        .send({ from: sentinelPhone, body: 'OUI' })
        .expect(201);
      return link;
    }

    // A 1st-circle Sentinel must have an account — accepted from the app.
    async function acceptedFirstCircleLink(
      companionToken: string,
      sentinelToken: string,
      sentinelPhone: string,
    ) {
      const circlesRes = await request(app.getHttpServer())
        .get('/sentinel/circles')
        .set('Authorization', auth(companionToken))
        .expect(200);
      const firstCircle = (circlesRes.body as CircleBody[]).find(
        (c) => c.circleType === CircleType.FIRST,
      )!;
      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${firstCircle.id}/invite`)
        .set('Authorization', auth(companionToken))
        .send({ phone: sentinelPhone, name: 'Bob' })
        .expect(201);
      const link = inviteRes.body as LinkBody;
      await request(app.getHttpServer())
        .post(`/sentinel/memberships/${link.id}/accept`)
        .set('Authorization', auth(sentinelToken))
        .send({})
        .expect(201);
      return link;
    }

    it('removes a Sentinel (companion side)', async () => {
      const companion = await signupAccount('Ada');
      const sentinelPhone = testPhone();
      const link = await acceptedSmsLink(companion.accessToken, sentinelPhone);

      await request(app.getHttpServer())
        .delete(`/sentinel/memberships/${link.id}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);

      const updated = await prisma.linkSentinels.findUnique({
        where: { id: link.id },
      });
      expect(updated?.status).toBe(LinkStatus.REMOVED);
    });

    it('blocks a Sentinel permanently — re-invite is rejected', async () => {
      const companion = await signupAccount('Ada');
      const sentinelPhone = testPhone();
      const link = await acceptedSmsLink(companion.accessToken, sentinelPhone);

      await request(app.getHttpServer())
        .post(`/sentinel/memberships/${link.id}/block`)
        .set('Authorization', auth(companion.accessToken))
        .expect(201);

      const circleRes = await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .send({ label: 'Autre cercle' })
        .expect(201);
      const circle = circleRes.body as CircleBody;
      await request(app.getHttpServer())
        .post(`/sentinel/circles/${circle.id}/invite`)
        .set('Authorization', auth(companion.accessToken))
        .send({ phone: sentinelPhone, name: 'Bob again' })
        .expect(403);
    });

    it('blocks removing the last Lead while other active members remain', async () => {
      const companion = await signupAccount('Ada');
      const sentinel1 = await signupAccount('Bob');
      const sentinel2 = await signupAccount('Carl');
      const lead = await acceptedFirstCircleLink(
        companion.accessToken,
        sentinel1.accessToken,
        sentinel1.phone,
      );
      // A second, non-lead Sentinel joins the same 1st circle.
      await acceptedFirstCircleLink(
        companion.accessToken,
        sentinel2.accessToken,
        sentinel2.phone,
      );

      await request(app.getHttpServer())
        .delete(`/sentinel/memberships/${lead.id}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(409);
    });
  });

  describe('Circle move — 1st-circle consent', () => {
    it('proposes instead of moving immediately, and requires the Sentinel to accept', async () => {
      const companion = await signupAccount('Ada');
      const sentinel = await signupAccount('Bob');

      const circlesRes = await request(app.getHttpServer())
        .get('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const bodyCircles = circlesRes.body as CircleBody[];
      const otherCircleRes = await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .send({ label: 'Voisins' })
        .expect(201);
      const otherCircle = otherCircleRes.body as CircleBody;
      const firstCircle = bodyCircles.find(
        (c) => c.circleType === CircleType.FIRST,
      )!;

      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${otherCircle.id}/invite`)
        .set('Authorization', auth(companion.accessToken))
        .send({ phone: sentinel.phone, name: 'Bob' })
        .expect(201);
      const link = inviteRes.body as LinkBody;
      await request(app.getHttpServer())
        .post(`/sentinel/memberships/${link.id}/accept`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({})
        .expect(201);

      const moveRes = await request(app.getHttpServer())
        .patch(`/sentinel/memberships/${link.id}`)
        .set('Authorization', auth(companion.accessToken))
        .send({ circleId: firstCircle.id })
        .expect(200);
      // Not moved yet — still in the original circle.
      expect((moveRes.body as LinkBody).circleId).toBe(otherCircle.id);

      await request(app.getHttpServer())
        .post(`/sentinel/memberships/${link.id}/circle-move/accept`)
        .set('Authorization', auth(sentinel.accessToken))
        .expect(201);

      const updated = await prisma.linkSentinels.findUnique({
        where: { id: link.id },
      });
      expect(updated?.circleId).toBe(firstCircle.id);
      expect(updated?.proposedCircleId).toBeNull();
    });
  });

  describe('Messaging settings', () => {
    it('updates canMessageOwnCircle/firstCircleMessagingMode for an account-holding Sentinel', async () => {
      const companion = await signupAccount('Ada');
      const sentinel = await signupAccount('Bob');
      const circleRes = await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .send({ label: 'Voisins' })
        .expect(201);
      const circle = circleRes.body as CircleBody;
      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${circle.id}/invite`)
        .set('Authorization', auth(companion.accessToken))
        .send({ phone: sentinel.phone, name: 'Bob' })
        .expect(201);
      const link = inviteRes.body as LinkBody;
      await request(app.getHttpServer())
        .post(`/sentinel/memberships/${link.id}/accept`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({})
        .expect(201);

      const updateRes = await request(app.getHttpServer())
        .patch(`/sentinel/memberships/${link.id}`)
        .set('Authorization', auth(companion.accessToken))
        .send({
          canMessageOwnCircle: false,
          firstCircleMessagingMode: MessagingMode.GROUP,
        })
        .expect(200);
      const updated = updateRes.body as LinkBody;
      expect(updated.canMessageOwnCircle).toBe(false);
      expect(updated.firstCircleMessagingMode).toBe(MessagingMode.GROUP);
    });

    it('rejects messaging settings on a Sentinel SMS link (no account)', async () => {
      const companion = await signupAccount('Ada');
      const sentinelPhone = testPhone();
      const circleRes = await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .send({ label: 'Voisins' })
        .expect(201);
      const circle = circleRes.body as CircleBody;
      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${circle.id}/invite`)
        .set('Authorization', auth(companion.accessToken))
        .send({ phone: sentinelPhone, name: 'Bob' })
        .expect(201);
      const link = inviteRes.body as LinkBody;
      await request(app.getHttpServer())
        .post('/sentinel/sms/inbound')
        .send({ from: sentinelPhone, body: 'OUI' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/sentinel/memberships/${link.id}`)
        .set('Authorization', auth(companion.accessToken))
        .send({ firstCircleMessagingMode: MessagingMode.INDIVIDUAL })
        .expect(400);
    });
  });

  describe('Inbound SMS (no account required)', () => {
    it('accepts an invitation by replying OUI', async () => {
      const companion = await signupAccount('Ada');
      const sentinelPhone = testPhone();
      const circleRes = await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .send({ label: 'Voisins' })
        .expect(201);
      const circle = circleRes.body as CircleBody;
      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${circle.id}/invite`)
        .set('Authorization', auth(companion.accessToken))
        .send({ phone: sentinelPhone, name: 'Bob' })
        .expect(201);
      const link = inviteRes.body as LinkBody;

      const smsRes = await request(app.getHttpServer())
        .post('/sentinel/sms/inbound')
        .send({ from: sentinelPhone, body: 'oui' })
        .expect(201);
      expect(smsRes.body).toEqual({ matched: true, action: 'accepted' });

      const updated = await prisma.linkSentinels.findUnique({
        where: { id: link.id },
      });
      expect(updated?.status).toBe(LinkStatus.ACCEPTED);
    });

    it('declines an invitation by replying NON', async () => {
      const companion = await signupAccount('Ada');
      const sentinelPhone = testPhone();
      const circleRes = await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .send({ label: 'Voisins' })
        .expect(201);
      const circle = circleRes.body as CircleBody;
      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${circle.id}/invite`)
        .set('Authorization', auth(companion.accessToken))
        .send({ phone: sentinelPhone, name: 'Bob' })
        .expect(201);
      const link = inviteRes.body as LinkBody;

      await request(app.getHttpServer())
        .post('/sentinel/sms/inbound')
        .send({ from: sentinelPhone, body: 'non' })
        .expect(201);

      const updated = await prisma.linkSentinels.findUnique({
        where: { id: link.id },
      });
      expect(updated?.status).toBe(LinkStatus.DECLINED);
    });

    it('opts an already-accepted Sentinel out via STOP', async () => {
      const companion = await signupAccount('Ada');
      const sentinelPhone = testPhone();
      const circleRes = await request(app.getHttpServer())
        .post('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .send({ label: 'Voisins' })
        .expect(201);
      const circle = circleRes.body as CircleBody;
      const inviteRes = await request(app.getHttpServer())
        .post(`/sentinel/circles/${circle.id}/invite`)
        .set('Authorization', auth(companion.accessToken))
        .send({ phone: sentinelPhone, name: 'Bob' })
        .expect(201);
      const link = inviteRes.body as LinkBody;
      await request(app.getHttpServer())
        .post('/sentinel/sms/inbound')
        .send({ from: sentinelPhone, body: 'OUI' })
        .expect(201);

      const stopRes = await request(app.getHttpServer())
        .post('/sentinel/sms/inbound')
        .send({ from: sentinelPhone, body: 'STOP' })
        .expect(201);
      expect(stopRes.body).toEqual({ matched: true, action: 'left' });

      const updated = await prisma.linkSentinels.findUnique({
        where: { id: link.id },
      });
      expect(updated?.status).toBe(LinkStatus.REMOVED);
    });

    it('returns matched: false for an unrecognized reply with no actionable link', async () => {
      const res = await request(app.getHttpServer())
        .post('/sentinel/sms/inbound')
        .send({ from: testPhone(), body: 'bonjour' })
        .expect(201);
      expect(res.body).toEqual({
        matched: false,
        reason: 'unrecognized_reply',
      });
    });
  });
});
