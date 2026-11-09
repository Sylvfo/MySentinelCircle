import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../common/password';
import { NameFieldsDto } from '../../common/account-fields.dto';

export class CompleteProfileDto extends NameFieldsDto {
  @ApiProperty({ minLength: 8, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MinLength(8)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;

  @ApiProperty({ required: false, minLength: 3, maxLength: 30 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.]+$/)
  userName?: string;
}
