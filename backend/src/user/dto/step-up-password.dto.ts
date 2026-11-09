import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../common/password';

export class StepUpPasswordDto {
  @ApiProperty({ maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
