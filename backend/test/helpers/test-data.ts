import { randomBytes } from 'crypto';

/** Short unique suffix so parallel/sequential tests never collide on
 *  unique columns (phone, email) within the shared mysentinelcircle_test DB. */
export function uniqueSuffix(): string {
  return randomBytes(4).toString('hex');
}

export function testPhone(): string {
  return `+336${Date.now().toString().slice(-8)}`;
}

export function testEmail(): string {
  return `test-${uniqueSuffix()}@example.test`;
}
