import { IsOptional, IsString, MaxLength } from 'class-validator';

// Stopping an alert: an optional closing word ("All fine, thank you all"),
// which becomes the stopper's status note, is posted in the alert's chats
// and goes out in the end-of-alert SMS.
export class CloseAlertDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  finalWord?: string;
}
