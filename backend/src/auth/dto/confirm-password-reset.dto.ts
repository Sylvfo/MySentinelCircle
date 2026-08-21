import { IsString, MinLength } from 'class-validator';

export class ConfirmPasswordResetDto {
  @IsString()
  token: string;

  @MinLength(8)
  newPassword: string;
}
