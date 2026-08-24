import { ApiProperty } from '@nestjs/swagger';
import { Length } from 'class-validator';

export class VerifyAddPhoneDto {
  @ApiProperty({ minLength: 6, maxLength: 6 })
  @Length(6, 6)
  code: string;
}
