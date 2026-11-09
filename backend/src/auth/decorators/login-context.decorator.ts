import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { LoginContext } from '../login-log.service';

// The caller's IP (the real one behind nginx: see "trust proxy" in main.ts)
// and browser, for the sign-in journal.
export const LoginCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): LoginContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return { ip: req.ip, userAgent: req.get('user-agent') ?? undefined };
  },
);
