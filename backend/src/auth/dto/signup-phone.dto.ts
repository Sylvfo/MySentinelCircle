import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';

// Full, permanent "Me" account created from just a phone number — no email
// or Google credential required, ever. Login afterwards is always via
// /auth/otp/request + /auth/otp/verify (the phone+OTP flow).
export class SignupPhoneDto {
  // Mandatory prénom for every account (see plan.txt CIRCLES & PERMISSIONS).
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @ApiProperty()
  @IsPhoneNumber()
  phone: string;
}
