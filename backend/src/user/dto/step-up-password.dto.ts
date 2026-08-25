import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class StepUpPasswordDto {
  @ApiProperty()
  @IsString()
  password: string;
}
