import { randomBytes, randomInt } from 'crypto';
import { isValidPhoneNumber } from 'libphonenumber-js/max';

/** Short unique suffix so parallel/sequential tests never collide on
 *  unique columns (phone, email) within the shared mysentinelcircle_test DB. */
export function uniqueSuffix(): string {
  return randomBytes(4).toString('hex');
}

// Not every +336XXXXXXXX digit combination falls in an allocated French
// mobile block — class-validator's @IsPhoneNumber() checks real allocation
// data (libphonenumber-js/max), so a naive random/timestamp suffix
// occasionally produces a string that looks valid but isn't. Retry until
// the generated number actually passes the same validator the app uses.
export function testPhone(): string {
  let phone: string;
  do {
    const suffix = randomInt(0, 1e8).toString().padStart(8, '0');
    phone = `+336${suffix}`;
  } while (!isValidPhoneNumber(phone));
  return phone;
}

export function testEmail(): string {
  return `test-${uniqueSuffix()}@example.test`;
}

export function testUsername(): string {
  return `test_${uniqueSuffix()}`;
}
