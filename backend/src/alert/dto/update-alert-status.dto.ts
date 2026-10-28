import { IsString, MinLength } from 'class-validator';

// Updates Alert.statusByCompanion or .statusByFirstCircle (whichever side
// the caller is on) — a free-text progress note, independent of the
// alert's own lifecycle status. Settable regardless of alertStatus,
// including after the alert is RESOLVED (unlike the 1st-circle chat).
export class UpdateAlertStatusDto {
  @IsString()
  @MinLength(1)
  message: string;
}
