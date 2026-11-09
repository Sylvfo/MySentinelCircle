import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../common/password';

export class LoginPhoneDto {
  @ApiProperty()
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({ maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
