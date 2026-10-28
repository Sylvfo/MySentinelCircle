import { IsBoolean } from 'class-validator';

// In-app alternative to an SMS OUI/NON reply, for an account-holding
// Sentinel who's been asked (any circle, not just outer) during an alert.
export class RespondAlertDto {
  @IsBoolean()
  accepted: boolean;
}
