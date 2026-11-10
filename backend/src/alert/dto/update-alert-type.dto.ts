import { IsIn } from 'class-validator';
import { AlertType } from '@prisma/client';

// What an alert opened by a missed Watch Mode deadline can be: its own
// type (TRAVEL for a trip, NOCONTACT for an All Good Check), or, once the
// 1st circle knows more, a disappearance or an emergency.
export const REQUALIFIED_ALERT_TYPES: AlertType[] = [
  AlertType.MISSING,
  AlertType.EMERGENCY,
];

export class UpdateAlertTypeDto {
  @IsIn([AlertType.TRAVEL, AlertType.NOCONTACT, ...REQUALIFIED_ALERT_TYPES])
  alertType: AlertType;
}
