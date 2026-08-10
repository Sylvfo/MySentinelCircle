import { IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  userId: string;

  @Length(6, 6)
  code: string;
}
