import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CircleStatus,
  CircleType,
  LinkStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_SENDER } from '../sms/sms-sender.interface';
import type { SmsSender } from '../sms/sms-sender.interface';
import {
  phoneRecoveryCodeSms,
  phoneRecoveryOldNumberSms,
  phoneRecoveryRefusedSms,
  phoneRecoveryRequestedSms,
  smsLang,
} from '../sms/messages';
import {
  checkOneTimeCode,
  newOneTimeCode,
  NO_ONE_TIME_CODE,
} from '../common/one-time-code';
import { userLabel } from './sentinel-helpers';

// A request waits this long for its two confirmations and its code.
export const PHONE_RECOVERY_DAYS = 7;

// Same answer whether or not the number has an account: never reveals who
// is registered.
const REQUEST_ANSWER = {
  message:
    'If this number has an account, its 1st circle has been asked to confirm',
};

const NO_PENDING = 'No pending code';

// The new number as stored while a recovery waits (User.pendingPhone), or
// null when there's no live request.
export function pendingRecoveryPhone(
  user: {
    pendingPhone: string | null;
    phoneRecoveryRequestedAt: Date | null;
  },
  now = new Date(),
): string | null {
  const since = user.phoneRecoveryRequestedAt;
  if (!since || !user.pendingPhone) return null;
  const expired =
    now.getTime() - since.getTime() > PHONE_RECOVERY_DAYS * 86_400_000;
  return expired ? null : user.pendingPhone;
}

// Lost phone, for an account with no other way in: the person asks from
// the sign-in page (old number + new one), two people of their 1st circle
// confirm it's really them (at least one a Lead), then a code sent to the
// new number finishes it. Their old devices are signed out. Signing in by
// SMS code with the old number cancels the request (they still have it).
@Injectable()
export class PhoneRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  async request(phone: string, newPhone: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (
      user?.userType !== UserType.ACCOUNT ||
      user.status !== UserStatus.ACTIVE ||
      phone === newPhone
    ) {
      return REQUEST_ANSWER;
    }
    // One live request at a time: a repeat doesn't ask the 1st circle again.
    // Once both confirmed, it sends a fresh code (the first one may have
    // expired).
    if (pendingRecoveryPhone(user) === newPhone) {
      if (user.otpCodeHash) await this.sendCode(user.id, newPhone, user);
      return REQUEST_ANSWER;
    }

    const members = await this.firstCircleMembers(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        pendingPhone: newPhone,
        phoneRecoveryRequestedAt: new Date(),
        phoneRecoveryConfirmedById: null,
        ...NO_ONE_TIME_CODE,
      },
    });

    const label = userLabel(user);
    await Promise.allSettled([
      ...members
        .filter((m) => m.phone)
        .map((m) =>
          this.sms.send(
            m.phone as string,
            phoneRecoveryRequestedSms(label, smsLang(m.language)),
          ),
        ),
      this.sms.send(phone, phoneRecoveryOldNumberSms(smsLang(user.language))),
    ]);
    return REQUEST_ANSWER;
  }

  // A 1st-circle Sentinel vouches for the person. The second one (two
  // different people, at least one a Lead) sends the code.
  async confirm(callerId: string, companionId: string) {
    const { companion, newPhone, members } = await this.pendingRequest(
      callerId,
      companionId,
    );
    const firstId = companion.phoneRecoveryConfirmedById;
    if (firstId === callerId) {
      throw new ConflictException('You already confirmed');
    }
    if (companion.otpCodeHash) {
      throw new ConflictException('Already confirmed, the code was sent');
    }
    if (!firstId) {
      await this.prisma.user.update({
        where: { id: companionId },
        data: { phoneRecoveryConfirmedById: callerId },
      });
      return { confirmations: 1 };
    }

    const isLead = (id: string) =>
      members.some((m) => m.userId === id && m.isLead);
    if (!isLead(firstId) && !isLead(callerId)) {
      throw new ForbiddenException('A Lead Sentinel must confirm too');
    }
    const taken = await this.prisma.user.findUnique({
      where: { phone: newPhone },
      select: { id: true },
    });
    if (taken && taken.id !== companionId) {
      throw new ConflictException('This number already has an account');
    }

    await this.sendCode(companionId, newPhone, companion);
    return { confirmations: 2 };
  }

  private async sendCode(
    userId: string,
    newPhone: string,
    user: { language: string | null },
  ) {
    const { code, fields } = await newOneTimeCode();
    await this.prisma.user.update({ where: { id: userId }, data: fields });
    await this.sms.send(
      newPhone,
      phoneRecoveryCodeSms(code, smsLang(user.language)),
    );
  }

  // Any 1st-circle Sentinel may say it isn't them: the request ends.
  async reject(callerId: string, companionId: string) {
    const { companion, newPhone } = await this.pendingRequest(
      callerId,
      companionId,
    );
    await this.prisma.user.update({
      where: { id: companionId },
      data: {
        pendingPhone: null,
        phoneRecoveryRequestedAt: null,
        phoneRecoveryConfirmedById: null,
        ...NO_ONE_TIME_CODE,
      },
    });
    await this.sms.send(
      newPhone,
      phoneRecoveryRefusedSms(smsLang(companion.language)),
    );
    return { rejected: true };
  }

  // The code received on the new number: the number changes, every device
  // still signed in with the old one is signed out.
  async verify(newPhone: string, code: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        pendingPhone: newPhone,
        phoneRecoveryRequestedAt: { not: null },
      },
    });
    if (!user || !pendingRecoveryPhone(user)) {
      throw new UnauthorizedException(NO_PENDING);
    }
    await checkOneTimeCode(this.prisma, user, code, NO_PENDING);

    const taken = await this.prisma.user.findUnique({
      where: { phone: newPhone },
      select: { id: true },
    });
    if (taken && taken.id !== user.id) {
      throw new ConflictException('This number already has an account');
    }
    const now = new Date();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        phone: newPhone,
        phoneVerifiedAt: now,
        pendingPhone: null,
        phoneRecoveryRequestedAt: null,
        phoneRecoveryConfirmedById: null,
        ...NO_ONE_TIME_CODE,
        sessionsValidAfter: now,
        loginAttempts: 0,
        loginLockedUntil: null,
      },
    });
    return { message: 'Phone number changed' };
  }

  // The live request about `companionId`, if the caller may answer it.
  private async pendingRequest(callerId: string, companionId: string) {
    const companion = await this.prisma.user.findUnique({
      where: { id: companionId },
    });
    const newPhone = companion && pendingRecoveryPhone(companion);
    if (!companion || !newPhone) {
      throw new NotFoundException('No pending phone change for this person');
    }
    const members = await this.firstCircleMembers(companionId);
    if (!members.some((m) => m.userId === callerId)) {
      throw new ForbiddenException('Only their 1st circle can answer');
    }
    return { companion, newPhone, members };
  }

  // The accepted Sentinels of the person's 1st circle.
  private async firstCircleMembers(companionId: string) {
    const links = await this.prisma.linkSentinels.findMany({
      where: {
        userCompanionId: companionId,
        status: LinkStatus.ACCEPTED,
        circle: { circleType: CircleType.FIRST, status: CircleStatus.ACTIVE },
      },
      select: {
        userSentinelId: true,
        leadSlot: true,
        linkAsSentinel: { select: { phone: true, language: true } },
      },
    });
    return links.map((l) => ({
      userId: l.userSentinelId,
      isLead: l.leadSlot !== null,
      phone: l.linkAsSentinel.phone,
      language: l.linkAsSentinel.language,
    }));
  }
}
