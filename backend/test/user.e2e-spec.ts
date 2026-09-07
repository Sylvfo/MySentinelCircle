import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserType, LinkInitiator } from '@prisma/client';
import { AppModule } from './../src/app.module';
import { OTP_SENDER } from './../src/auth/otp/otp-sender.interface';
import { EMAIL_SENDER } from './../src/email/email-sender.interface';
import { PrismaService } from './../src/prisma/prisma.service';
import { testEmail, testPhone, testUsername } from './helpers/test-data';

interface UserResponseBody {
  accessToken?: string;
  userId?: string;
  email?: string | null;
  phone?: string | null;
  userType?: UserType;
}

describe('User (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sentOtps: { phone: string; code: string }[];
  let sentEmails: { to: string; subject: string; body: string }[];

  beforeEach(async () => {
    sentOtps = [];
    sentEmails = [];

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
      .useValue({
        send: (to: string, subject: string, body: string) => {
          sentEmails.push({ to, subject, body });
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

  async function signupWithoutPhone() {
    const email = testEmail();
    const password = 'password123';
    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup/email')
      .send({ firstName: 'Ada', userName: testUsername(), email, password })
      .expect(201);
    const signupBody = signupRes.body as UserResponseBody;
    return { accessToken: signupBody.accessToken as string, email };
  }

  // Signs up with a password AND a phone (goes through OTP verify), so the
  // resulting account has both a step-up method (password) and an existing
  // phone/email — needed to exercise change-email/change-phone.
  async function signupWithPasswordAndPhone() {
    const email = testEmail();
    const password = 'password123';
    const phone = testPhone();
    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup/email')
      .send({
        firstName: 'Ada',
        userName: testUsername(),
        email,
        password,
        phone,
      })
      .expect(201);
    const signupBody = signupRes.body as UserResponseBody;
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        userId: signupBody.userId,
        code: sentOtps[sentOtps.length - 1].code,
      })
      .expect(201);
    const verifyBody = verifyRes.body as UserResponseBody;
    return {
      accessToken: verifyBody.accessToken as string,
      email,
      password,
      phone,
    };
  }

  it('completes an UNCOMPLETE profile with a phone, promoting it to ACCOUNT', async () => {
    const { accessToken } = await signupWithoutPhone();

    const meBefore = await request(app.getHttpServer())
      .get('/user/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const meBeforeBody = meBefore.body as UserResponseBody;
    expect(meBeforeBody.userType).toBe(UserType.UNCOMPLETE);
    expect(meBeforeBody.phone).toBeNull();

    const phone = testPhone();
    await request(app.getHttpServer())
      .post('/user/phone/request')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone })
      .expect(201);
    expect(sentOtps).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/user/phone/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: sentOtps[0].code })
      .expect(201);

    const meAfter = await request(app.getHttpServer())
      .get('/user/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const meAfterBody = meAfter.body as UserResponseBody;
    expect(meAfterBody.userType).toBe(UserType.ACCOUNT);
    expect(meAfterBody.phone).toBe(phone);
  });

  it('claims an existing ONLY_SMS Sentinel stub when adding its phone', async () => {
    const companion = await prisma.user.create({
      data: {
        firstName: 'Companion',
        phone: testPhone(),
        userType: UserType.ACCOUNT,
      },
    });
    const circle = await prisma.circle.create({
      data: { label: 'Test Circle', userCompanionId: companion.id },
    });
    const stubPhone = testPhone();
    const stub = await prisma.user.create({
      data: {
        firstName: 'Stub',
        phone: stubPhone,
        userType: UserType.ONLY_SMS,
      },
    });
    const link = await prisma.linkSentinels.create({
      data: {
        userSentinelId: stub.id,
        userCompanionId: companion.id,
        circleId: circle.id,
        initiatedBy: LinkInitiator.COMPANION,
      },
    });

    const { accessToken } = await signupWithoutPhone();

    await request(app.getHttpServer())
      .post('/user/phone/request')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: stubPhone })
      .expect(201);

    const updatedLink = await prisma.linkSentinels.findUnique({
      where: { id: link.id },
    });
    expect(updatedLink?.userSentinelId).not.toBe(stub.id);

    const updatedStub = await prisma.user.findUnique({
      where: { id: stub.id },
    });
    expect(updatedStub?.phone).toBeNull();
    expect(updatedStub?.status).toBe('DELETED');
  });

  it('requires a fresh step-up before changing an already-set phone', async () => {
    const { accessToken } = await signupWithPasswordAndPhone();
    const newPhone = testPhone();

    // no step-up done yet — rejected
    await request(app.getHttpServer())
      .post('/user/phone/request')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: newPhone })
      .expect(401);

    // step-up via password
    await request(app.getHttpServer())
      .post('/user/me/step-up/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'password123' })
      .expect(201);

    // now the phone change succeeds
    await request(app.getHttpServer())
      .post('/user/phone/request')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: newPhone })
      .expect(201);
  });

  it('changes the email end-to-end: step-up, request, and confirm via the link', async () => {
    const { accessToken } = await signupWithPasswordAndPhone();
    const newEmail = testEmail();

    // step-up via password
    await request(app.getHttpServer())
      .post('/user/me/step-up/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'password123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/user/me/change-email/request')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ newEmail })
      .expect(201);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe(newEmail);
    const token = new URL(sentEmails[0].body).searchParams.get('token');
    expect(token).toBeTruthy();

    // the email hasn't changed yet — only after confirming
    const meBefore = await request(app.getHttpServer())
      .get('/user/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const meBeforeBody = meBefore.body as UserResponseBody;
    expect(meBeforeBody.email).not.toBe(newEmail);

    // public route, no auth header needed
    await request(app.getHttpServer())
      .post('/user/confirm-email')
      .send({ token })
      .expect(201);

    const meAfter = await request(app.getHttpServer())
      .get('/user/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const meAfterBody = meAfter.body as UserResponseBody;
    expect(meAfterBody.email).toBe(newEmail);
  });
});
