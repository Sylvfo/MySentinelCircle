import { IsEmail, IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupEmailDto {
  // Mandatory prénom for every account (see plan.txt CIRCLES & PERMISSIONS).
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsPhoneNumber()
  phone: string;
}
