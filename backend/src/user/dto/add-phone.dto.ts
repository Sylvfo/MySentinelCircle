import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber } from 'class-validator';

export class AddPhoneDto {
  @ApiProperty()
  @IsPhoneNumber()
  phone: string;
}
