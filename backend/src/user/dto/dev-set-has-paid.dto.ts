import { IsBoolean } from 'class-validator';

// TEMPORARY dev/test affordance — lets a user flip their own `hasPaid`
// flag directly, standing in for a real payment flow until one exists
// (see plan.txt ACCOUNTS & BILLING). Remove once a real payment provider
// sets `hasPaid` via its own webhook instead.
export class DevSetHasPaidDto {
  @IsBoolean()
  hasPaid: boolean;
}
