import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { LabSmsDirection } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AlertService } from '../alert/alert.service';
import { RUNNING_ALERT } from '../common/running-alert';
import { SmsInboundService } from '../sentinel/sms-inbound.service';
import { WatchScheduler } from '../watch/watch.scheduler';

export interface LabPhone {
  phone: string;
  name: string;
  // false: no account, SMS only.
  app: boolean;
}

// Each tester's own four phones (demo accounts from prisma/seed.ts,
// seedLabTesters), keyed by the tester's account phone. The groups never
// share a phone, and Zaza's and Wiwil's are never linked to each other.
export const LAB_SETS: Record<string, LabPhone[]> = {
  // Sylvie
  '+41791112233': [
    { phone: '+41791112233', name: 'Léa', app: true },
    { phone: '+41799990105', name: 'Sam', app: true },
    { phone: '+41781667788', name: 'Mathis', app: true },
    { phone: '+41799990006', name: 'Paul', app: false },
  ],
  // Zaza
  '+41799990001': [
    { phone: '+41799990001', name: 'Zaza', app: true },
    { phone: '+41761445566', name: 'Gabriel', app: true },
    { phone: '+41799990021', name: 'Nicole', app: true },
    { phone: '+41761889900', name: 'Arthur', app: false },
  ],
  // Wiwil
  '+41799990101': [
    { phone: '+41799990101', name: 'Wiwil', app: true },
    { phone: '+41799990102', name: 'Bernard', app: true },
    { phone: '+41799990121', name: 'Jean-Paul', app: true },
    { phone: '+41799990104', name: 'Marcel', app: false },
  ],
};

const HOUR_MS = 3_600_000;

// The test lab (/lab): each tester signs in with their own account and gets
// their own four phones, their SMS, scenarios and a place for their opinion.
// Only where ALLOW_DEV_ROUTES is on — never in production.
@Injectable()
export class LabService {
  // "Avancer le temps", per tester: how far ahead their group's Watch Mode
  // deadlines are run. In memory on purpose: a restart starts from now.
  private readonly offsetMs = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly alerts: AlertService,
    private readonly smsInbound: SmsInboundService,
    private readonly scheduler: WatchScheduler,
  ) {}

  assertEnabled() {
    if (this.config.get('ALLOW_DEV_ROUTES') !== 'true') {
      throw new NotFoundException();
    }
  }

  // The lab's own sign-in: a tester's account (user name, email or phone)
  // and password. Returns a lab token, good for the lab routes only.
  async login(identifier: string, password: string) {
    this.assertEnabled();
    const id = identifier.trim();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ userName: id }, { email: id }, { phone: id }] },
      select: { id: true, firstName: true, phone: true, passwordHash: true },
    });
    const ok =
      user?.passwordHash &&
      user.phone &&
      LAB_SETS[user.phone] &&
      (await bcrypt.compare(password, user.passwordHash));
    if (!user || !ok) throw new UnauthorizedException('Wrong sign-in');
    return {
      labToken: this.jwt.sign({ sub: user.id, lab: user.phone }),
      testerName: user.firstName,
      phones: LAB_SETS[user.phone!],
    };
  }

  // Who is testing, from the lab token (the X-Lab-Token header).
  async tester(labToken: string | undefined) {
    this.assertEnabled();
    let payload: { sub: string; lab?: string };
    try {
      payload = this.jwt.verify(labToken ?? '');
    } catch {
      throw new UnauthorizedException('Sign in to the lab');
    }
    const phones = payload.lab ? LAB_SETS[payload.lab] : undefined;
    if (!phones) throw new UnauthorizedException('Sign in to the lab');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: payload.sub },
      select: { firstName: true },
    });
    return { id: payload.sub, key: payload.lab!, name: user.firstName, phones };
  }

  private assertMine(
    tester: { phones: LabPhone[] },
    phone: string,
    needsApp = false,
  ) {
    const lab = tester.phones.find((p) => p.phone === phone);
    if (!lab || (needsApp && !lab.app)) {
      throw new ForbiddenException('Not one of your test phones');
    }
  }

  // One of the tester's phones with the app: signed in as its account.
  async loginAs(labToken: string | undefined, phone: string) {
    const tester = await this.tester(labToken);
    this.assertMine(tester, phone, true);
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Run the demo seed first');
    return { accessToken: this.jwt.sign({ sub: user.id }) };
  }

  async sms(labToken: string | undefined, phone: string) {
    const tester = await this.tester(labToken);
    this.assertMine(tester, phone);
    return this.prisma.labSms.findMany({
      where: { phone },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  }

  // Every test phone's SMS at once: one request for the four screens.
  async smsAll(labToken: string | undefined) {
    const tester = await this.tester(labToken);
    const rows = await this.prisma.labSms.findMany({
      where: { phone: { in: tester.phones.map((p) => p.phone) } },
      orderBy: { createdAt: 'asc' },
    });
    const byPhone: Record<string, typeof rows> = {};
    for (const p of tester.phones) byPhone[p.phone] = [];
    for (const row of rows) byPhone[row.phone].push(row);
    for (const phone of Object.keys(byPhone)) {
      byPhone[phone] = byPhone[phone].slice(-50);
    }
    return byPhone;
  }

  // A reply typed on a test phone: the same way in as a real SMS.
  async reply(labToken: string | undefined, phone: string, body: string) {
    const tester = await this.tester(labToken);
    this.assertMine(tester, phone);
    await this.prisma.labSms.create({
      data: { phone, body, direction: LabSmsDirection.IN },
    });
    return this.smsInbound.handle(phone, body);
  }

  // "Avancer le temps": the tester's group's Watch Mode deadlines run as if
  // it were later. Other testers' groups are not touched.
  async advance(labToken: string | undefined, hours: number) {
    const tester = await this.tester(labToken);
    const offset = (this.offsetMs.get(tester.key) ?? 0) + hours * HOUR_MS;
    this.offsetMs.set(tester.key, offset);
    const owners = await this.prisma.user.findMany({
      where: { phone: { in: tester.phones.map((p) => p.phone) } },
      select: { id: true },
    });
    await this.scheduler.runDeadlines(
      new Date(Date.now() + offset),
      owners.map((o) => o.id),
    );
    return { offsetHours: offset / HOUR_MS };
  }

  // "Remettre à zéro": every alert in progress about someone of the
  // tester's group stops, as if they pressed "Arrêter l'alerte". Links stay.
  async reset(labToken: string | undefined) {
    const tester = await this.tester(labToken);
    const running = await this.prisma.alert.findMany({
      where: {
        alertStatus: RUNNING_ALERT,
        userCompanion: { phone: { in: tester.phones.map((p) => p.phone) } },
      },
      select: { id: true, userCompanionId: true },
    });
    for (const alert of running) {
      await this.alerts.closeAlert(alert.userCompanionId, alert.id);
    }
    return { closed: running.length };
  }

  async feedback(
    labToken: string | undefined,
    data: {
      scenario: string;
      tags: string;
      text?: string;
      screenshotPath?: string;
    },
  ) {
    const tester = await this.tester(labToken);
    return this.prisma.labFeedback.create({
      data: { ...data, testerName: tester.name },
    });
  }

  // Admin page: every opinion, newest first.
  listFeedback() {
    return this.prisma.labFeedback.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findFeedback(id: string) {
    const row = await this.prisma.labFeedback.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  markRead(id: string) {
    return this.prisma.labFeedback.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
}
