import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePauseDto {
  // Nobody else may raise an alert about me (I still can).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  pausedForMe?: boolean;

  // I can't be asked to take part in any alert; turning it on takes me out
  // of every alert in progress.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  pausedForOthers?: boolean;
}
