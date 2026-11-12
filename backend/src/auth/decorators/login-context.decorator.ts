import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { LoginContext } from '../login-log.service';
import { clientIp } from '../../common/client-ip';

// The caller's real IP (see common/client-ip.ts) and browser, for the
// sign-in journal.
export const LoginCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): LoginContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return { ip: clientIp(req), userAgent: req.get('user-agent') ?? undefined };
  },
);
