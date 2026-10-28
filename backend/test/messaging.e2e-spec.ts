import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AlertType, CircleType } from '@prisma/client';
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
}

interface AlertDetailBody extends AlertBody {
  conversations: { id: string; closedAt: string | null }[];
}

interface MessageBody {
  id: string;
  body: string;
  senderId: string;
  conversationId: string;
}

describe('Messaging (e2e)', () => {
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

  // Companion + one accepted 1st-circle Sentinel, with a raised alert (and
  // therefore a 1st-circle conversation) ready to message into.
  async function buildAlertWithConversation() {
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
    await request(app.getHttpServer())
      .post(`/sentinel/memberships/${(inviteRes.body as LinkBody).id}/accept`)
      .set('Authorization', auth(sentinel.accessToken))
      .send({})
      .expect(201);

    const alertRes = await request(app.getHttpServer())
      .post('/alert/raise')
      .set('Authorization', auth(companion.accessToken))
      .send({
        companionId: companion.userId,
        alertType: AlertType.BYCOMPANION,
        reason: 'x',
      })
      .expect(201);
    const alert = alertRes.body as AlertBody;

    const detailRes = await request(app.getHttpServer())
      .get(`/alert/${alert.id}`)
      .set('Authorization', auth(companion.accessToken))
      .expect(200);
    const conversationId = (detailRes.body as AlertDetailBody).conversations[0]
      .id;

    return { companion, sentinel, alert, conversationId };
  }

  describe('POST/GET /messaging/conversations/:id/messages', () => {
    it('lets a 1st-circle Sentinel send and read messages in the alert’s conversation', async () => {
      const { sentinel, conversationId } = await buildAlertWithConversation();

      const sendRes = await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({ body: 'Je suis en route' })
        .expect(201);
      expect((sendRes.body as MessageBody).senderId).toBe(sentinel.userId);

      const listRes = await request(app.getHttpServer())
        .get(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .expect(200);
      const messages = listRes.body as MessageBody[];
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe('Je suis en route');
    });

    it('rejects the companion — not a participant of the 1st-circle chat by design', async () => {
      const { companion, conversationId } = await buildAlertWithConversation();

      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(companion.accessToken))
        .send({ body: 'Allo ?' })
        .expect(403);
      await request(app.getHttpServer())
        .get(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(companion.accessToken))
        .expect(403);
    });

    it('rejects a stranger with no link to the companion at all', async () => {
      const { conversationId } = await buildAlertWithConversation();
      const stranger = await signupAccount('Eve');

      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(stranger.accessToken))
        .send({ body: 'Allo ?' })
        .expect(403);
    });

    it('rejects sending into a closed conversation, but still allows reading its history', async () => {
      const { companion, sentinel, alert, conversationId } =
        await buildAlertWithConversation();
      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({ body: 'Avant la cloture' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/close`)
        .set('Authorization', auth(companion.accessToken))
        .expect(201);

      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({ body: 'Apres la cloture' })
        .expect(409);

      const listRes = await request(app.getHttpServer())
        .get(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .expect(200);
      expect(listRes.body as MessageBody[]).toHaveLength(1);
    });
  });

  describe('GET /messaging/direct/:userId', () => {
    interface ConversationBody {
      id: string;
      closedAt: string | null;
    }

    // Companion + one accepted outer-circle (not 1st) Sentinel.
    async function buildOuterCircleLink() {
      const companion = await signupAccount('Lea');
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
      await request(app.getHttpServer())
        .post(`/sentinel/memberships/${(inviteRes.body as LinkBody).id}/accept`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({})
        .expect(201);
      return {
        companion,
        sentinel,
        circle,
        linkId: (inviteRes.body as LinkBody).id,
      };
    }

    it('lazily creates the direct conversation on first open, by default (no settings touched)', async () => {
      const { companion, sentinel } = await buildOuterCircleLink();

      const res = await request(app.getHttpServer())
        .get(`/messaging/direct/${sentinel.userId}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const conv = res.body as ConversationBody;
      expect(conv.closedAt).toBeNull();

      // Same conversation returned on a second open — not duplicated.
      const res2 = await request(app.getHttpServer())
        .get(`/messaging/direct/${sentinel.userId}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      expect((res2.body as ConversationBody).id).toBe(conv.id);

      // Either side can send/read — it's a normal Conversation from here.
      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conv.id}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({ body: 'Bien reçu' })
        .expect(201);
      const listRes = await request(app.getHttpServer())
        .get(`/messaging/conversations/${conv.id}/messages`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      expect(listRes.body as MessageBody[]).toHaveLength(1);
    });

    it('is always open for a 1st-circle Sentinel, even with allowMessagingByDefault off', async () => {
      const companion = await signupAccount('Ada');
      const sentinel = await signupAccount('Lead');
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
        .send({ phone: sentinel.phone, name: 'Lead' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/sentinel/memberships/${(inviteRes.body as LinkBody).id}/accept`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({})
        .expect(201);

      await request(app.getHttpServer())
        .patch('/user/me')
        .set('Authorization', auth(companion.accessToken))
        .send({ allowMessagingByDefault: false })
        .expect(200);

      await request(app.getHttpServer())
        .get(`/messaging/direct/${sentinel.userId}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
    });

    it('a circle-level restriction blocks it, and a per-individual override beats the circle', async () => {
      const { companion, sentinel, circle, linkId } =
        await buildOuterCircleLink();

      await request(app.getHttpServer())
        .patch(`/sentinel/circles/${circle.id}`)
        .set('Authorization', auth(companion.accessToken))
        .send({ canMessageMe: false })
        .expect(200);

      await request(app.getHttpServer())
        .get(`/messaging/direct/${sentinel.userId}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(403);

      // Per-individual override beats the circle's restriction.
      await request(app.getHttpServer())
        .patch(`/sentinel/memberships/${linkId}`)
        .set('Authorization', auth(companion.accessToken))
        .send({ canMessageMe: true })
        .expect(200);

      await request(app.getHttpServer())
        .get(`/messaging/direct/${sentinel.userId}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
    });

    it('rejects canMessageMe on the 1st circle — always reachable, no override', async () => {
      const companion = await signupAccount('Ada');
      const circlesRes = await request(app.getHttpServer())
        .get('/sentinel/circles')
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const firstCircle = (circlesRes.body as CircleBody[]).find(
        (c) => c.circleType === CircleType.FIRST,
      )!;

      await request(app.getHttpServer())
        .patch(`/sentinel/circles/${firstCircle.id}`)
        .set('Authorization', auth(companion.accessToken))
        .send({ canMessageMe: false })
        .expect(400);
    });

    it('turning messaging off after a conversation exists blocks further sends, but reading its history still works', async () => {
      const { companion, sentinel } = await buildOuterCircleLink();
      const convRes = await request(app.getHttpServer())
        .get(`/messaging/direct/${sentinel.userId}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
      const conversationId = (convRes.body as ConversationBody).id;
      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({ body: 'Avant blocage' })
        .expect(201);

      await request(app.getHttpServer())
        .patch('/user/me')
        .set('Authorization', auth(companion.accessToken))
        .send({ allowMessagingByDefault: false })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({ body: 'Apres blocage' })
        .expect(403);

      const listRes = await request(app.getHttpServer())
        .get(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .expect(200);
      expect(listRes.body as MessageBody[]).toHaveLength(1);
    });

    it('rejects when there is no accepted link between the two at all', async () => {
      const companion = await signupAccount('Ada');
      const stranger = await signupAccount('Eve');

      await request(app.getHttpServer())
        .get(`/messaging/direct/${stranger.userId}`)
        .set('Authorization', auth(companion.accessToken))
        .expect(403);
    });
  });
});
