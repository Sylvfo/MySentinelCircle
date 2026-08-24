import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class RequestPasswordResetDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}
