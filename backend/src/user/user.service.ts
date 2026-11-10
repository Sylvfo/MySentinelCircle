import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import {
  checkOneTimeCode,
  newOneTimeCode,
  NO_ONE_TIME_CODE,
} from '../common/one-time-code';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { CircleType, LinkStatus, UserType, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOT_A_WATCH } from '../common/running-alert';
import { DEFAULT_CIRCLES } from '../sentinel/default-circles';
import { DELETED_ACCOUNT_LABEL } from './user-status.util';
import {
  DEATH_NOTICE_NEEDS_PURCHASE,
  FREE_ALERT_TRIAL_LIMIT,
  PAYMENT_NOT_AVAILABLE,
  addOneYear,
  hasDeathNotice,
  isSubscribed,
  paymentSimulated,
} from './plan.util';
import { CURRENT_TERMS_VERSION } from '../privacy/terms';
import { OTP_SENDER } from '../auth/otp/otp-sender.interface';
import type { OtpSender } from '../auth/otp/otp-sender.interface';
import { EMAIL_SENDER } from '../email/email-sender.interface';
import type { EmailSender } from '../email/email-sender.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { StepUpCodeRequestDto } from './dto/step-up-code-request.dto';
import { DevSetHasPaidDto } from './dto/dev-set-has-paid.dto';
import { UpdateDeathNoticeDto } from './dto/update-death-notice.dto';
import { SetDeathNoticeRecipientsDto } from './dto/set-death-notice-recipients.dto';
import { isAdminEmail } from '../admin/admin-emails';

const STEP_UP_TTL_MINUTES = 10;
const PENDING_EMAIL_TTL_MINUTES = 60;

export const AVATAR_DIR = join(process.cwd(), 'uploads', 'avatars');

const PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  userName: true,
  email: true,
  phone: true,
  phoneVerifiedAt: true,
  status: true,
  userType: true,
  isMajor: true,
  publicStatus: true,
  alertChatWithFirstCircle: true,
  pausedForMe: true,
  pausedForOthers: true,
  createdAt: true,
  updatedAt: true,
  avatarPath: true,
  passwordHash: true,
  googleId: true,
  paidUntil: true,
  termsVersion: true,
  gender: true,
  language: true,
  alertContactSharing: true,
} as const;

// Never return the raw hash/id — just whether they exist, so the frontend
// knows which credentials/step-up methods apply to this account.
function toProfileDto<
  T extends {
    passwordHash: string | null;
    googleId: string | null;
    termsVersion?: string | null;
    paidUntil?: Date | null;
  },
>(user: T) {
  const { passwordHash, googleId, ...rest } = user;
  return {
    ...rest,
    hasPassword: passwordHash !== null,
    hasGoogle: googleId !== null,
    // Subscription active right now (paidUntil in the future).
    hasPaid: isSubscribed({ paidUntil: user.paidUntil ?? null }),
    // False until the current terms + privacy policy are accepted: the app
    // asks for it before anything else (POST /user/me/accept-terms).
    termsUpToDate: user.termsVersion === CURRENT_TERMS_VERSION,
  };
}

@Injectable()
export class UserService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSender,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {
    this.googleClient = new OAuth2Client(this.config.get('GOOGLE_CLIENT_ID'));
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    return (
      user && {
        ...toProfileDto(user),
        isAdmin: isAdminEmail(this.config, user.email),
      }
    );
  }

  // What my plan includes right now, for the Plans page and the upgrade
  // prompts. The rules themselves are enforced where each action happens.
  async getPlan(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { paidUntil: true, deathNoticePurchasedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const subscribed = isSubscribed(user);
    const alertsUsed = subscribed
      ? 0
      : await this.prisma.alert.count({
          where: { userCompanionId: userId, alertStatus: NOT_A_WATCH },
        });
    return {
      hasPaid: subscribed,
      // Kept after it ends, to say "your subscription ended on …".
      paidUntil: user.paidUntil,
      freeAlertLimit: FREE_ALERT_TRIAL_LIMIT,
      // null = unlimited (subscribed).
      freeAlertsLeft: subscribed
        ? null
        : Math.max(0, FREE_ALERT_TRIAL_LIMIT - alertsUsed),
      deathNotice: hasDeathNotice(user),
      deathNoticePurchased: user.deathNoticePurchasedAt !== null,
      groups: subscribed,
      // Whether the "pay" buttons work yet (simulated in dev).
      paymentAvailable: paymentSimulated(),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.userName) {
      const current = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { userName: true },
      });
      if (current?.userName) {
        throw new ConflictException('Username cannot be changed once set');
      }
      const taken = await this.prisma.user.findUnique({
        where: { userName: dto.userName },
      });
      if (taken && taken.id !== userId)
        throw new ConflictException('Username already taken');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: PROFILE_SELECT,
    });
    return toProfileDto(user);
  }

  // Turns a phone-verified ONLY_SMS row into a real account, keeping its id
  // so the LinkSentinels of an already-invited Sentinel still resolve.
  // Records that the person accepted the current terms + privacy policy.
  async acceptTerms(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        termsAcceptedAt: new Date(),
        termsVersion: CURRENT_TERMS_VERSION,
      },
    });
    return this.getProfile(userId);
  }

  async completeProfile(userId: string, dto: CompleteProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.userType !== UserType.ONLY_SMS || !user.phoneVerifiedAt) {
      throw new ForbiddenException('This account is already complete');
    }
    if (dto.userName) {
      const taken = await this.prisma.user.findUnique({
        where: { userName: dto.userName },
      });
      if (taken) throw new ConflictException('Username already taken');
    }
    // Someone may already have asked to watch over this person, which
    // creates the 1st circle: only one per account.
    const hasFirstCircle = await this.prisma.circle.count({
      where: { userCompanionId: userId, circleType: CircleType.FIRST },
    });
    const { password, ...profile } = dto;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...profile,
        passwordHash: await bcrypt.hash(password, 10),
        userType: UserType.ACCOUNT,
        myCircles: {
          create: DEFAULT_CIRCLES.filter(
            (c) => !hasFirstCircle || c.circleType !== CircleType.FIRST,
          ),
        },
      },
      select: PROFILE_SELECT,
    });
    return toProfileDto(updated);
  }

  // Phone can be added after signup for an account created without one
  // (UserType.UNCOMPLETE). The number only waits in pendingPhone here —
  // nothing changes until verifyAddPhone proves its owner holds it, so
  // `phone` stays usable and a stub can't be taken over by typing its number.
  // If the caller already has a phone (this is a CHANGE, not a first add),
  // a fresh step-up verification is required first — same as email change.
  async requestAddPhone(userId: string, phone: string) {
    const caller = await this.prisma.user.findUnique({ where: { id: userId } });
    if (caller?.phone) {
      this.assertStepUpFresh(caller);
    }

    const existing = await this.prisma.user.findUnique({ where: { phone } });

    if (
      existing &&
      existing.id !== userId &&
      existing.userType !== UserType.ONLY_SMS
    ) {
      throw new ConflictException('Phone already in use');
    }

    const { code, fields } = await newOneTimeCode();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pendingPhone: phone,
        ...fields,
        phoneRecoveryRequestedAt: null,
        phoneRecoveryConfirmedById: null,
      },
    });
    await this.otpSender.send(phone, code, caller?.language);
    return { message: 'Code sent' };
  }

  // If the verified phone belongs to a passive Sentinel-stub (ONLY_SMS,
  // created when someone invited that number before its owner had an
  // account), that stub is claimed into the caller's own account: its
  // LinkSentinels rows move onto the caller, and the stub row is anonymized
  // (never deleted, per the schema's historization rule).
  async verifyAddPhone(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pendingPhone) {
      throw new UnauthorizedException('No pending code');
    }
    await checkOneTimeCode(this.prisma, user, code, 'No pending code');

    const existing = await this.prisma.user.findUnique({
      where: { phone: user.pendingPhone },
    });
    if (
      existing &&
      existing.id !== userId &&
      existing.userType !== UserType.ONLY_SMS
    ) {
      throw new ConflictException('Phone already in use');
    }

    if (existing && existing.id !== userId) {
      await this.prisma.$transaction([
        this.prisma.linkSentinels.updateMany({
          where: { userSentinelId: existing.id },
          data: { userSentinelId: userId },
        }),
        this.prisma.user.update({
          where: { id: existing.id },
          // The name was typed by whoever invited this number: it goes too.
          data: {
            phone: null,
            firstName: DELETED_ACCOUNT_LABEL,
            status: UserStatus.DELETED,
            deletedAt: new Date(),
          },
        }),
      ]);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: user.pendingPhone,
        pendingPhone: null,
        ...NO_ONE_TIME_CODE,
        phoneVerifiedAt: new Date(),
        userType:
          user.userType === UserType.UNCOMPLETE
            ? UserType.ACCOUNT
            : user.userType,
      },
      select: PROFILE_SELECT,
    });
    return toProfileDto(updated);
  }

  // Requires the current password as proof — no separate "old channel"
  // verification needed, unlike email/phone changes, since the password
  // itself already is that proof.
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('This account has no password to change');
    }
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { message: 'Password updated' };
  }

  // Forgotten password, or first password on a phone account: the fresh
  // step-up from the SMS code stands in for the old password.
  async setPassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account not found');
    this.assertStepUpFresh(user);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        loginAttempts: 0,
        loginLockedUntil: null,
      },
    });
    return { message: 'Password updated' };
  }

  // --- Step-up identity re-verification ---------------------------------
  // Gate in front of changing email or an already-set phone: prove it's
  // still you via ANY credential the account already has, not necessarily
  // the specific one being changed. This is what answers "I lost my old
  // phone" — use password, Google, or a code to whichever channel (phone
  // or email) is still accessible instead of the one that's gone.

  async stepUpPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash)
      throw new UnauthorizedException('This account has no password');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Incorrect password');
    await this.markStepUpVerified(userId);
    return { message: 'Identity verified' };
  }

  async stepUpGoogle(userId: string, idToken: string) {
    const { googleId } = await this.verifyGoogleIdToken(idToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.googleId || user.googleId !== googleId) {
      throw new UnauthorizedException(
        'Google identity does not match this account',
      );
    }
    await this.markStepUpVerified(userId);
    return { message: 'Identity verified' };
  }

  // Shares the OTP fields with add-phone, so pendingPhone is cleared: a code
  // sent to another channel must never validate the pending number.
  async stepUpCodeRequest(userId: string, dto: StepUpCodeRequestDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const phone = user?.phoneVerifiedAt ? user.phone : null;
    const email = user?.email ?? null;
    if (dto.channel === 'phone' && !phone) {
      throw new UnauthorizedException('No verified phone on this account');
    }
    if (dto.channel === 'email' && !email) {
      throw new UnauthorizedException('No email on this account');
    }

    const { code, fields } = await newOneTimeCode();
    await this.prisma.user.update({
      where: { id: userId },
      data: { ...fields, pendingPhone: null },
    });
    if (dto.channel === 'phone' && phone) {
      await this.otpSender.send(phone, code, user?.language);
    } else if (email) {
      await this.emailSender.send(email, 'Code de vérification', code);
    }
    return { message: 'Code sent' };
  }

  async stepUpCodeVerify(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('No pending code');
    await checkOneTimeCode(this.prisma, user, code, 'No pending code');
    await this.prisma.user.update({
      where: { id: userId },
      data: NO_ONE_TIME_CODE,
    });
    await this.markStepUpVerified(userId);
    return { message: 'Identity verified' };
  }

  private async markStepUpVerified(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { stepUpVerifiedAt: new Date() },
    });
  }

  // Throws unless step-up was completed in the last STEP_UP_TTL_MINUTES —
  // called before any sensitive change (email, or a phone that's already set).
  assertStepUpFresh(user: { stepUpVerifiedAt: Date | null }) {
    const freshEnough =
      user.stepUpVerifiedAt &&
      user.stepUpVerifiedAt >
        new Date(Date.now() - STEP_UP_TTL_MINUTES * 60_000);
    if (!freshEnough) {
      throw new UnauthorizedException('Please re-verify your identity first');
    }
  }

  private async verifyGoogleIdToken(
    idToken: string,
  ): Promise<{ googleId: string }> {
    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: this.config.get('GOOGLE_CLIENT_ID'),
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) throw new UnauthorizedException('Invalid Google token');
    return { googleId: payload.sub };
  }

  // --- Change email -------------------------------------------------------
  // Requires a fresh step-up (proof it's still the account owner) before
  // even starting — then a link sent to the NEW address confirms ownership
  // of it. The change only applies once that link is clicked.

  async requestEmailChange(userId: string, newEmail: string) {
    const caller = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!caller) throw new UnauthorizedException('Account not found');
    this.assertStepUpFresh(caller);

    const taken = await this.prisma.user.findUnique({
      where: { email: newEmail },
    });
    if (taken && taken.id !== userId)
      throw new ConflictException('Email already in use');

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pendingEmail: newEmail,
        pendingEmailTokenHash: tokenHash,
        pendingEmailExpiresAt: new Date(
          Date.now() + PENDING_EMAIL_TTL_MINUTES * 60_000,
        ),
      },
    });
    const link = `${this.config.get('FRONTEND_URL')}/confirm-email?token=${rawToken}`;
    await this.emailSender.send(
      newEmail,
      'Confirmez votre nouvelle adresse email',
      link,
    );
    return { message: 'Confirmation link sent to the new email' };
  }

  // Public (no auth) — the user clicks a link from their email client,
  // possibly on a different device than the one that requested the change.
  async confirmEmailChange(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findUnique({
      where: { pendingEmailTokenHash: tokenHash },
    });
    if (
      !user?.pendingEmail ||
      !user.pendingEmailExpiresAt ||
      user.pendingEmailExpiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired confirmation link');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.pendingEmail,
        pendingEmail: null,
        pendingEmailTokenHash: null,
        pendingEmailExpiresAt: null,
      },
    });
    return { message: 'Email updated' };
  }

  // One photo per user, never accumulated: the previous file (if any, and
  // if different from the new one) is removed once the new one is saved.
  async setAvatar(userId: string, filename: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarPath: true },
    });
    if (user?.avatarPath && user.avatarPath !== filename) {
      await unlink(join(AVATAR_DIR, user.avatarPath)).catch(() => {});
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarPath: filename },
      select: PROFILE_SELECT,
    });
    return toProfileDto(updated);
  }

  async removeAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarPath: true },
    });
    if (user?.avatarPath) {
      await unlink(join(AVATAR_DIR, user.avatarPath)).catch(() => {});
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarPath: null },
      select: PROFILE_SELECT,
    });
    return toProfileDto(updated);
  }

  // A profile photo is private: only its owner, the people linked to them
  // (an ACCEPTED LinkSentinels in either direction), and their co-members of
  // a 1st circle (both ACCEPTED in the same companion's FIRST circle — they
  // handle alerts together) can see it. Everyone else gets the same 404 as
  // "no photo", so its existence isn't revealed.
  async getAvatarFile(callerId: string, targetId: string): Promise<string> {
    if (callerId !== targetId) {
      const link = await this.prisma.linkSentinels.findFirst({
        where: {
          status: LinkStatus.ACCEPTED,
          OR: [
            { userSentinelId: callerId, circle: { userCompanionId: targetId } },
            { userSentinelId: targetId, circle: { userCompanionId: callerId } },
            {
              userSentinelId: targetId,
              circle: {
                circleType: CircleType.FIRST,
                userSentinels: {
                  some: {
                    userSentinelId: callerId,
                    status: LinkStatus.ACCEPTED,
                  },
                },
              },
            },
          ],
        },
        select: { id: true },
      });
      if (!link) throw new NotFoundException('No photo');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { avatarPath: true },
    });
    if (!target?.avatarPath) throw new NotFoundException('No photo');
    return join(AVATAR_DIR, target.avatarPath);
  }

  // TEMPORARY dev/test affordance — stands in for a real payment provider
  // (see plan.txt ACCOUNTS & BILLING). Remove once one is wired in. Closed
  // unless ALLOW_DEV_ROUTES is explicitly "true".
  async devSetHasPaid(userId: string, dto: DevSetHasPaidDto) {
    if (this.config.get('ALLOW_DEV_ROUTES') !== 'true') {
      throw new ForbiddenException('Dev routes are disabled');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { paidUntil: dto.hasPaid ? addOneYear(null) : null },
      select: PROFILE_SELECT,
    });
    return toProfileDto(updated);
  }

  // --- Death notice (prepared while alive) --------------------------------
  // The announcement + who's opted in, read straight off User/LinkSentinels
  // — no separate table (see CLAUDE.md/plan.txt on this feature's design).
  // Report/confirm/reject live in SentinelService instead: eligibility there
  // is entirely about Sentinel/circle membership, not self-management.

  // One more year of subscription, for myself or offered to someone I'm
  // linked with (either direction, accepted link). Simulated payment until
  // a real provider exists; later, its webhook will call the same thing.
  async addSubscriptionYear(callerId: string, forUserId: string) {
    if (!paymentSimulated()) {
      throw new ForbiddenException(PAYMENT_NOT_AVAILABLE);
    }
    if (forUserId !== callerId) {
      const link = await this.prisma.linkSentinels.findFirst({
        where: {
          status: LinkStatus.ACCEPTED,
          OR: [
            { userSentinelId: callerId, userCompanionId: forUserId },
            { userSentinelId: forUserId, userCompanionId: callerId },
          ],
        },
        select: { id: true },
      });
      if (!link) {
        throw new ForbiddenException(
          'You can only offer a subscription to someone you are linked with',
        );
      }
    }
    const target = await this.prisma.user.findUnique({
      where: { id: forUserId },
      select: { paidUntil: true, status: true },
    });
    if (!target || target.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('User not found');
    }
    const updated = await this.prisma.user.update({
      where: { id: forUserId },
      data: { paidUntil: addOneYear(target.paidUntil) },
      select: { paidUntil: true },
    });
    return { userId: forUserId, paidUntil: updated.paidUntil };
  }

  // Preparing the death notice is paid (subscription or one-time
  // purchase). Sending one already prepared is never blocked: it happens
  // after the death, whatever the plan has become.
  private async assertHasDeathNotice(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { paidUntil: true, deathNoticePurchasedAt: true },
    });
    if (!user || !hasDeathNotice(user)) {
      throw new ForbiddenException(DEATH_NOTICE_NEEDS_PURCHASE);
    }
  }

  // TEMPORARY dev/test affordance, like devSetHasPaid: stands in for the
  // one-time purchase until a payment provider exists.
  async devSetDeathNoticePurchased(userId: string, purchased: boolean) {
    if (this.config.get('ALLOW_DEV_ROUTES') !== 'true') {
      throw new ForbiddenException('Dev routes are disabled');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { deathNoticePurchasedAt: purchased ? new Date() : null },
    });
    return this.getPlan(userId);
  }

  async getMyDeathNotice(userId: string) {
    const [user, links] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { deathAnnouncementMessage: true },
      }),
      this.prisma.linkSentinels.findMany({
        where: { userCompanionId: userId, status: LinkStatus.ACCEPTED },
        include: {
          linkAsSentinel: { select: { firstName: true, phone: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      announcementMessage: user?.deathAnnouncementMessage ?? '',
      recipients: links.map((l) => ({
        linkId: l.id,
        sentinelLabel:
          l.linkAsSentinel.firstName ?? l.linkAsSentinel.phone ?? 'Sentinel',
        notifyOnDeath: l.notifyOnDeath,
        personalMessage: l.deathPersonalMessage,
      })),
    };
  }

  async updateMyDeathNotice(userId: string, dto: UpdateDeathNoticeDto) {
    await this.assertHasDeathNotice(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { deathAnnouncementMessage: dto.announcementMessage },
    });
    return { announcementMessage: dto.announcementMessage };
  }

  // Full replacement, same semantics as the rest of this feature's data —
  // any of the caller's own LinkSentinels rows left out of `dto.recipients`
  // is cleared back to not-notified.
  async setDeathNoticeRecipients(
    userId: string,
    dto: SetDeathNoticeRecipientsDto,
  ) {
    await this.assertHasDeathNotice(userId);
    const linkIds = dto.recipients.map((r) => r.linkId);
    if (linkIds.length > 0) {
      const owned = await this.prisma.linkSentinels.count({
        where: { id: { in: linkIds }, userCompanionId: userId },
      });
      if (owned !== new Set(linkIds).size) {
        throw new ForbiddenException('One of these Sentinels is not yours');
      }
    }
    await this.prisma.$transaction([
      this.prisma.linkSentinels.updateMany({
        where: { userCompanionId: userId, id: { notIn: linkIds } },
        data: { notifyOnDeath: false, deathPersonalMessage: null },
      }),
      ...dto.recipients.map((r) =>
        this.prisma.linkSentinels.update({
          where: { id: r.linkId },
          data: {
            notifyOnDeath: true,
            deathPersonalMessage: r.personalMessage ?? null,
          },
        }),
      ),
    ]);
    return this.getMyDeathNotice(userId);
  }
}
