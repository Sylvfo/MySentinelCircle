import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

// The caller's real IP. Through the Cloudflare tunnel used for remote tests,
// nginx only sees cloudflared, so every tester would share one IP; Cloudflare
// puts the real one in CF-Connecting-IP. Without the tunnel, req.ip (behind
// nginx, see "trust proxy" in main.ts).
// The header can be forged by anyone reaching nginx directly (local network):
// acceptable for tests, to revisit before real users (deployment_plan.txt).
export function clientIp(req: Request): string | undefined {
  return req.get('cf-connecting-ip') ?? req.ip;
}

// Rate limit per real client, not per proxy.
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(clientIp(req as Request) ?? '');
  }
}
