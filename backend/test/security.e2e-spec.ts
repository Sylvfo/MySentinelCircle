import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { testEmail, testUsername } from './helpers/test-data';

interface LoginEventBody {
  method: string;
  success: boolean;
  ipPrefix: string | null;
}

// The sign-in journal, "sign me out everywhere", the uptime check and the
// admin page.
describe('Security and monitoring (e2e)', () => {
  let app: INestApplication<App>;
  const adminEmail = testEmail();

  beforeAll(async () => {
    process.env.ADMIN_EMAILS = adminEmail;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    delete process.env.ADMIN_EMAILS;
    await app.close();
  });

  async function signup(email = testEmail()) {
    const res = await request(app.getHttpServer())
      .post('/auth/signup/email')
      .send({
        firstName: 'Ada',
        userName: testUsername(),
        email,
        password: 'password123',
        acceptTerms: true,
      })
      .expect(201);
    return { email, token: (res.body as { accessToken: string }).accessToken };
  }

  it('shows me my sign-ins, the failed ones too', async () => {
    const { email, token } = await signup();
    await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({ email, password: 'password123' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/auth/logins')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const logins = res.body as LoginEventBody[];
    // Newest first: the success, the failure, then the signup itself.
    expect(logins.map((l) => [l.method, l.success])).toEqual([
      ['EMAIL_PASSWORD', true],
      ['EMAIL_PASSWORD', false],
      ['EMAIL_PASSWORD', true],
    ]);
  });

  it('signs me out of every device', async () => {
    const { token } = await signup();
    // A token from the very second of the sign-out still passes: wait one.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await request(app.getHttpServer())
      .post('/auth/logout-everywhere')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .get('/user/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('answers the uptime check without signing in', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('opens the admin page to admins only', async () => {
    const someone = await signup();
    await request(app.getHttpServer())
      .get('/user/admin/stats')
      .set('Authorization', `Bearer ${someone.token}`)
      .expect(403);

    const admin = await signup(adminEmail);
    const me = await request(app.getHttpServer())
      .get('/user/me')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect((me.body as { isAdmin: boolean }).isAdmin).toBe(true);

    const res = await request(app.getHttpServer())
      .get('/user/admin/stats')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    const stats = res.body as {
      accounts: { total: number; perWeek: unknown[] };
      activity: { activeToday: number };
      security: { failures24h: number };
    };
    expect(stats.accounts.total).toBeGreaterThanOrEqual(2);
    expect(stats.accounts.perWeek).toHaveLength(8);
    expect(stats.activity.activeToday).toBeGreaterThanOrEqual(2);
    expect(typeof stats.security.failures24h).toBe('number');
  });
});
