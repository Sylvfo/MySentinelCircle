import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { OTP_SENDER } from './../src/auth/otp/otp-sender.interface';
import { EMAIL_SENDER } from './../src/email/email-sender.interface';
import { testEmail, testPhone, testUsername } from './helpers/test-data';

interface AuthResponseBody {
  accessToken?: string;
  userId?: string;
  email?: string | null;
  phone?: string | null;
}

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
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates an account from a new number and recognizes it afterwards', async () => {
    const phone = testPhone();

    const firstRes = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone })
      .expect(201);
    const firstBody = firstRes.body as AuthResponseBody;
    expect(firstBody.userId).toBeDefined();
    expect(sentOtps).toHaveLength(1);

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ userId: firstBody.userId, code: sentOtps[0].code })
      .expect(201);
    const accessToken = (verifyRes.body as AuthResponseBody).accessToken;

    await request(app.getHttpServer())
      .post('/user/me/complete-profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Ada', password: 'password123' })
      .expect(201);
    const meRes = await request(app.getHttpServer())
      .get('/user/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((meRes.body as { userType: string }).userType).toBe('ACCOUNT');

    const secondRes = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone })
      .expect(201);
    expect((secondRes.body as AuthResponseBody).userId).toBe(firstBody.userId);
  });

  it('logs in with phone and password, and locks after five failures', async () => {
    const phone = testPhone();
    const firstRes = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone })
      .expect(201);
    const { userId } = firstRes.body as AuthResponseBody;
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ userId, code: sentOtps[0].code })
      .expect(201);
    const accessToken = (verifyRes.body as AuthResponseBody).accessToken;

    // the password is mandatory, and an account gets one only this way
    await request(app.getHttpServer())
      .post('/user/me/complete-profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Ada' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/user/me/complete-profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Ada', password: 'password123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login/phone')
      .send({ phone, password: 'password123' })
      .expect(201);

    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/auth/login/phone')
        .send({ phone, password: 'wrong-password' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/auth/login/phone')
      .send({ phone, password: 'password123' })
      .expect(401);
  });

  it('answers an unknown number like a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login/phone')
      .send({ phone: testPhone(), password: 'password123' })
      .expect(401);
  });

  it('sends no second code inside the cooldown', async () => {
    const phone = testPhone();
    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone })
        .expect(201);
    }
    expect(sentOtps).toHaveLength(1);
  });

  it('signs up by email, verifies the phone via OTP, and logs in with the password', async () => {
    const phone = testPhone();
    const email = testEmail();
    const password = 'password123';

    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup/email')
      .send({
        firstName: 'Ada',
        userName: testUsername(),
        email,
        password,
        acceptTerms: true,
      })
      .expect(201);
    const { accessToken } = signupRes.body as AuthResponseBody;
    expect(sentOtps).toHaveLength(0);

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

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(201);
    const loginBody = loginRes.body as AuthResponseBody;
    expect(loginBody.accessToken).toBeDefined();
  });

  it('rejects a password longer than 128 characters (hashing it would slow the server)', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup/email')
      .send({
        firstName: 'Ada',
        userName: testUsername(),
        email: testEmail(),
        password: 'a'.repeat(129),
        acceptTerms: true,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({ email: testEmail(), password: 'a'.repeat(129) })
      .expect(400);
  });

  it('refuses a signup without the terms of use accepted', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup/email')
      .send({
        firstName: 'Ada',
        userName: testUsername(),
        email: testEmail(),
        password: 'password123',
      })
      .expect(400);
  });

  it('signs up by email with no phone, gets an access token immediately, and can call a protected route', async () => {
    const email = testEmail();
    const userName = testUsername();
    const password = 'password123';

    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup/email')
      .send({ firstName: 'Ada', userName, email, password, acceptTerms: true })
      .expect(201);
    const signupBody = signupRes.body as AuthResponseBody;
    expect(signupBody.accessToken).toBeDefined();
    expect(sentOtps).toHaveLength(0);

    const meRes = await request(app.getHttpServer())
      .get('/user/me')
      .set('Authorization', `Bearer ${signupBody.accessToken}`)
      .expect(200);
    const meBody = meRes.body as AuthResponseBody;
    expect(meBody.email).toBe(email);
    expect(meBody.phone).toBeNull();

    // logging back in works too, despite phoneVerifiedAt never being set
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password })
      .expect(201);
    const loginBody = loginRes.body as AuthResponseBody;
    expect(loginBody.accessToken).toBeDefined();
  });

  it('resets a forgotten password end-to-end and logs in with the new one', async () => {
    const email = testEmail();
    const password = 'password123';
    const newPassword = 'newpassword456';

    await request(app.getHttpServer())
      .post('/auth/signup/email')
      .send({
        firstName: 'Ada',
        userName: testUsername(),
        email,
        password,
        acceptTerms: true,
      })
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
