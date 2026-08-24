import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserType, LinkInitiator } from '@prisma/client';
import { AppModule } from './../src/app.module';
import { OTP_SENDER } from './../src/auth/otp/otp-sender.interface';
import { PrismaService } from './../src/prisma/prisma.service';
import { testEmail, testPhone, testUsername } from './helpers/test-data';

describe('User (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sentOtps: { phone: string; code: string }[];

  beforeEach(async () => {
    sentOtps = [];

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OTP_SENDER)
      .useValue({
        send: async (phone: string, code: string) => {
          sentOtps.push({ phone, code });
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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
    return { accessToken: signupRes.body.accessToken as string, email };
  }

  it('completes an UNCOMPLETE profile with a phone, promoting it to ACCOUNT', async () => {
    const { accessToken } = await signupWithoutPhone();

    const meBefore = await request(app.getHttpServer())
      .get('/user/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meBefore.body.userType).toBe(UserType.UNCOMPLETE);
    expect(meBefore.body.phone).toBeNull();

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
    expect(meAfter.body.userType).toBe(UserType.ACCOUNT);
    expect(meAfter.body.phone).toBe(phone);
  });

  it('claims an existing ONLY_SMS Sentinel stub when adding its phone', async () => {
    const companion = await prisma.user.create({
      data: { firstName: 'Companion', phone: testPhone(), userType: UserType.ACCOUNT },
    });
    const circle = await prisma.circle.create({
      data: { label: 'Test Circle', userCompanionId: companion.id },
    });
    const stubPhone = testPhone();
    const stub = await prisma.user.create({
      data: { firstName: 'Stub', phone: stubPhone, userType: UserType.ONLY_SMS },
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

    const updatedLink = await prisma.linkSentinels.findUnique({ where: { id: link.id } });
    expect(updatedLink?.userSentinelId).not.toBe(stub.id);

    const updatedStub = await prisma.user.findUnique({ where: { id: stub.id } });
    expect(updatedStub?.phone).toBeNull();
    expect(updatedStub?.status).toBe('DELETED');
  });
});
