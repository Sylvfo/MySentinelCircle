import { IsPhoneNumber } from 'class-validator';

// Dev-only phone-only login (no password/OTP) — see AuthService.devLoginByPhone.
export class DevLoginDto {
  @IsPhoneNumber()
  phone: string;
}
