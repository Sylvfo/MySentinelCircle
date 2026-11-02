import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString } from 'class-validator';

export class LoginPhoneDto {
  @ApiProperty()
  @IsPhoneNumber()
  phone: string;

  @ApiProperty()
  @IsString()
  password: string;
}
