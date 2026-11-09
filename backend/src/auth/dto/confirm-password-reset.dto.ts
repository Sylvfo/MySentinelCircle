import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../common/password';

export class ConfirmPasswordResetDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ minLength: 8, maxLength: PASSWORD_MAX_LENGTH })
  @MinLength(8)
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}
