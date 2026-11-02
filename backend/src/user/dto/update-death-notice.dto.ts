import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

// Written by the companion themselves, while alive — the text read out to
// their Sentinels once a death is confirmed (see SentinelService.confirmDeath).
export class UpdateDeathNoticeDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  announcementMessage: string;
}
