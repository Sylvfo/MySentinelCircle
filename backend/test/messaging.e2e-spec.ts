import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AlertType, CircleType } from '@prisma/client';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
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
  type: string;
  senderId: string;
  conversationId: string;
}

describe('Messaging (e2e)', () => {
  let app: NestExpressApplication;
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

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    // No static /uploads folder, as in main.ts: message images are only
    // served through GET /messaging/messages/:id/image.
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

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
      .set('Authorization', `Bearer ${verifyBody.accessToken}`)
      .send({ firstName, password: 'password123' })
      .expect(201);
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

    it('keeps a 2,000-character message whole, and refuses a longer one', async () => {
      const { sentinel, conversationId } = await buildAlertWithConversation();
      const long = 'm'.repeat(2000);

      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({ body: `${long}x` })
        .expect(400);
      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({ body: long })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .expect(200);
      expect((listRes.body as MessageBody[])[0].body).toBe(long);
    });

    it('lets the companion write and read in the 1st circle room — they are seated there', async () => {
      const { companion, conversationId } = await buildAlertWithConversation();

      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(companion.accessToken))
        .send({ body: 'Je vais bien' })
        .expect(201);
      await request(app.getHttpServer())
        .get(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(companion.accessToken))
        .expect(200);
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

    it('keeps an alert chat writable 7 days after the alert, then read-only with its history', async () => {
      const { companion, sentinel, alert, conversationId } =
        await buildAlertWithConversation();
      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({ body: 'Avant la cloture' })
        .expect(201);

      // Stopped with a closing word: posted in the chat.
      await request(app.getHttpServer())
        .post(`/alert/${alert.id}/close`)
        .set('Authorization', auth(companion.accessToken))
        .send({ finalWord: 'Tout va bien, merci à toutes et tous.' })
        .expect(201);

      // Still open during the 7 days after the alert.
      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({ body: 'Super, merci' })
        .expect(201);

      // Those 7 days have passed.
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { closedAt: new Date(Date.now() - 1000) },
      });
      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .send({ body: 'Trop tard' })
        .expect(409);

      const listRes = await request(app.getHttpServer())
        .get(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .expect(200);
      expect((listRes.body as MessageBody[]).map((m) => m.body)).toEqual([
        'Avant la cloture',
        'Tout va bien, merci à toutes et tous.',
        'Super, merci',
      ]);
    });
  });

  // Smallest bytes that start like a real JPEG (the upload checks them).
  const JPEG_BYTES = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);

  describe('POST /messaging/conversations/:id/messages/image', () => {
    it('uploads an image, creates an IMAGE message, and serves it back to participants only', async () => {
      const { sentinel, conversationId } = await buildAlertWithConversation();

      const uploadRes = await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages/image`)
        .set('Authorization', auth(sentinel.accessToken))
        .attach('image', JPEG_BYTES, 'photo.jpg')
        .expect(201);
      const message = uploadRes.body as MessageBody;
      expect(message.type).toBe('IMAGE');
      expect(message.senderId).toBe(sentinel.userId);
      expect(message.body).toMatch(/\.jpg$/);

      const listRes = await request(app.getHttpServer())
        .get(`/messaging/conversations/${conversationId}/messages`)
        .set('Authorization', auth(sentinel.accessToken))
        .expect(200);
      expect(listRes.body as MessageBody[]).toHaveLength(1);

      // Served only to participants, never as a public file.
      await request(app.getHttpServer())
        .get(`/messaging/messages/${message.id}/image`)
        .set('Authorization', auth(sentinel.accessToken))
        .expect(200)
        .expect('Content-Type', /image\/jpeg/);
      await request(app.getHttpServer())
        .get(`/messaging/messages/${message.id}/image`)
        .expect(401);
      const stranger = await signupAccount('Eve');
      await request(app.getHttpServer())
        .get(`/messaging/messages/${message.id}/image`)
        .set('Authorization', auth(stranger.accessToken))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/uploads/messages/${message.body}`)
        .expect(404);
    });

    it('rejects a fake image — a .jpg name and type that are really a web page', async () => {
      const { sentinel, conversationId } = await buildAlertWithConversation();

      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages/image`)
        .set('Authorization', auth(sentinel.accessToken))
        .attach(
          'image',
          Buffer.from('<html><script>alert(1)</script></html>'),
          {
            filename: 'photo.jpg',
            contentType: 'image/jpeg',
          },
        )
        .expect(400);
    });

    it('rejects a non-image file', async () => {
      const { sentinel, conversationId } = await buildAlertWithConversation();

      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages/image`)
        .set('Authorization', auth(sentinel.accessToken))
        .attach('image', Buffer.from('not an image'), 'notes.txt')
        .expect(400);
    });

    it('rejects a stranger with no seat in the conversation', async () => {
      const { conversationId } = await buildAlertWithConversation();
      const stranger = await signupAccount('Eve');

      await request(app.getHttpServer())
        .post(`/messaging/conversations/${conversationId}/messages/image`)
        .set('Authorization', auth(stranger.accessToken))
        .attach('image', JPEG_BYTES, 'photo.jpg')
        .expect(403);
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
