import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { OTP_SENDER } from './../src/auth/otp/otp-sender.interface';
import { EMAIL_SENDER } from './../src/email/email-sender.interface';
import { testEmail, testPhone } from './helpers/test-data';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
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
        send: async (phone: string, code: string) => {
          sentOtps.push({ phone, code });
        },
      })
      .overrideProvider(EMAIL_SENDER)
      .useValue({
        send: async (to: string, subject: string, body: string) => {
          sentEmails.push({ to, subject, body });
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('signs up by phone, verifies the OTP, and logs back in via phone+OTP', async () => {
    const phone = testPhone();

    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup/phone')
      .send({ firstName: 'Ada', phone })
      .expect(201);
    const { userId } = signupRes.body;
    expect(userId).toBeDefined();
    expect(sentOtps).toHaveLength(1);

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ userId, code: sentOtps[0].code })
      .expect(201);
    expect(verifyRes.body.accessToken).toBeDefined();

    const loginRequestRes = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone })
      .expect(201);
    expect(loginRequestRes.body.userId).toBe(userId);
    expect(sentOtps).toHaveLength(2);

    const loginVerifyRes = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ userId, code: sentOtps[1].code })
      .expect(201);
    expect(loginVerifyRes.body.accessToken).toBeDefined();
  });

  it('rejects a second signup with an already-claimed phone', async () => {
    const phone = testPhone();

    await request(app.getHttpServer())
      .post('/auth/signup/phone')
      .send({ firstName: 'Ada', phone })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/signup/phone')
      .send({ firstName: 'Bea', phone })
      .expect(409);
  });

  it('signs up by email, verifies the phone via OTP, and logs in with the password', async () => {
    const phone = testPhone();
    const email = testEmail();
    const password = 'password123';

    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup/email')
      .send({ firstName: 'Ada', email, password, phone })
      .expect(201);
    const { userId } = signupRes.body;
    expect(sentOtps).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ userId, code: sentOtps[0].code })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(201);
    expect(loginRes.body.accessToken).toBeDefined();
  });

  it('resets a forgotten password end-to-end and logs in with the new one', async () => {
    const phone = testPhone();
    const email = testEmail();
    const password = 'password123';
    const newPassword = 'newpassword456';

    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup/email')
      .send({ firstName: 'Ada', email, password, phone })
      .expect(201);
    const { userId } = signupRes.body;
    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ userId, code: sentOtps[0].code })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/password-reset/request')
      .send({ email })
      .expect(201);
    expect(sentEmails).toHaveLength(1);
    const token = new URL(sentEmails[0].body).searchParams.get('token');
    expect(token).toBeTruthy();

    await request(app.getHttpServer())
      .post('/auth/password-reset/confirm')
      .send({ token, newPassword })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password: newPassword })
      .expect(201);

    // the old password must no longer work
    await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(401);
  });
});
