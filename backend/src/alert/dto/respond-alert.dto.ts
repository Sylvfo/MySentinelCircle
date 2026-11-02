import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_ALERT_REPLY_LENGTH } from '../alert-replies';

// In-app alternative to an SMS reply, for an account-holding Sentinel who's
// been asked (any circle) during an alert. `questionId` is required for an
// outer circle; the 1st circle answers the alert itself.
export class RespondAlertDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ALERT_REPLY_LENGTH)
  reply: string;

  @IsOptional()
  @IsString()
  questionId?: string;
}
