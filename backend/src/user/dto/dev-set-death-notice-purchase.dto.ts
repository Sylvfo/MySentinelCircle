import { IsBoolean } from 'class-validator';

// TEMPORARY dev/test affordance, like DevSetHasPaidDto: stands in for the
// one-time death notice purchase until a payment provider exists.
export class DevSetDeathNoticePurchaseDto {
  @IsBoolean()
  purchased: boolean;
}
