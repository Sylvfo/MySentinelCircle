import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SentinelService } from './sentinel.service';

// 12 url-safe characters (72 random bits): not guessable, short in a QR.
const newCode = () => randomBytes(9).toString('base64url');

// Adding someone without typing their number: each person has a personal
// code (User.connectCode) shown as a QR code. Scanning it leads to the same
// two requests as by phone — "they watch over me" (an invitation into one
// of my circles) and "I watch over them" (a request) — which the other
// person accepts as usual. The number itself never travels.
@Injectable()
export class ConnectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sentinel: SentinelService,
  ) {}

  // My code, created the first time it is asked for.
  async myCode(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { connectCode: true },
    });
    return { code: user.connectCode ?? (await this.renew(userId)).code };
  }

  // A new code: the QR codes shared before stop working.
  async renew(userId: string) {
    const code = newCode();
    await this.prisma.user.update({
      where: { id: userId },
      data: { connectCode: code },
    });
    return { code };
  }

  // Who the code belongs to: first name and photo only.
  async resolve(userId: string, code: string) {
    const person = await this.findByCode(code);
    if (person.id === userId) {
      throw new BadRequestException('This is your own code');
    }
    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      avatarPath: person.avatarPath,
    };
  }

  // "They watch over me": an invitation into one of my circles.
  async invite(userId: string, code: string, circleId: string) {
    const person = await this.withPhone(userId, code);
    return this.sentinel.inviteSentinel(userId, circleId, {
      phone: person.phone,
      name: person.firstName,
    });
  }

  // "I watch over them": a request they approve.
  async request(userId: string, code: string) {
    const person = await this.withPhone(userId, code);
    return this.sentinel.requestToBeSentinel(userId, {
      targetPhone: person.phone,
    });
  }

  private async withPhone(userId: string, code: string) {
    const person = await this.findByCode(code);
    if (person.id === userId) {
      throw new BadRequestException('This is your own code');
    }
    if (!person.phone) {
      throw new BadRequestException('This person has no phone number yet');
    }
    return { ...person, phone: person.phone };
  }

  private async findByCode(code: string) {
    const person = await this.prisma.user.findFirst({
      where: { connectCode: code, status: UserStatus.ACTIVE },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarPath: true,
        phone: true,
      },
    });
    if (!person) throw new NotFoundException('Unknown code');
    return person;
  }
}
