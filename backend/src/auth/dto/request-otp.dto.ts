import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty()
  @IsPhoneNumber()
  phone: string;
}
