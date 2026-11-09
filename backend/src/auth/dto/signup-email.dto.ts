import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../common/password';
import { SignupFieldsDto } from '../../common/account-fields.dto';

export class SignupEmailDto extends SignupFieldsDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, maxLength: PASSWORD_MAX_LENGTH })
  @MinLength(8)
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
