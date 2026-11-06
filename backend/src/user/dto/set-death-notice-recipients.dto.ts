import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class DeathNoticeRecipientInput {
  @ApiProperty()
  @IsString()
  linkId: string;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  personalMessage?: string;
}

// Full replacement of the companion's opted-in recipients — any of their
// own LinkSentinels rows not listed here is cleared back to not-notified.
export class SetDeathNoticeRecipientsDto {
  @ApiProperty({ type: [DeathNoticeRecipientInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeathNoticeRecipientInput)
  recipients: DeathNoticeRecipientInput[];
}
