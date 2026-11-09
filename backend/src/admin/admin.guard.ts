import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { isAdminEmail } from './admin-emails';

// After JwtAuthGuard: only the accounts listed in ADMIN_EMAILS get through.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ user?: { userId: string } }>();
    const userId = req.user?.userId;
    const user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        })
      : null;
    if (!isAdminEmail(this.config, user?.email)) {
      throw new ForbiddenException('Admins only');
    }
    return true;
  }
}
