import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class StepUpCodeRequestDto {
  @ApiProperty({ enum: ['phone', 'email'] })
  @IsIn(['phone', 'email'])
  channel: 'phone' | 'email';
}
