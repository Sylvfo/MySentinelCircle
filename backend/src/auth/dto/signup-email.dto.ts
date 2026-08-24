import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SignupEmailDto {
  // Mandatory prénom for every account (see plan.txt CIRCLES & PERMISSIONS).
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsPhoneNumber()
  phone: string;
}
