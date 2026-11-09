import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  // Reads the account on every request: a JWT outlives its account otherwise,
  // for up to 30 days after a deletion.
  // Also refuses a token issued before "sign me out everywhere" (or a
  // password reset): iat is in seconds, so a token from that very second
  // still passes.
  async validate(payload: { sub: string; iat?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true, sessionsValidAfter: true },
    });
    if (!user || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException();
    }
    const validAfter = user.sessionsValidAfter
      ? Math.floor(user.sessionsValidAfter.getTime() / 1000)
      : null;
    if (validAfter !== null && (payload.iat ?? 0) < validAfter) {
      throw new UnauthorizedException('Signed out');
    }
    return { userId: payload.sub };
  }
}
