import { IsEmail, IsPhoneNumber, MinLength } from 'class-validator';

export class SignupEmailDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsPhoneNumber()
  phone: string;
}
