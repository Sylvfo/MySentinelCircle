import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): { userId: string } => {
    return ctx
      .switchToHttp()
      .getRequest<Request & { user: { userId: string } }>().user;
  },
);
