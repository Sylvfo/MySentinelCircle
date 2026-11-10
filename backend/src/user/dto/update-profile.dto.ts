import { Gender } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false, minLength: 1, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiProperty({ required: false, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  // Can only be set once — rejected by the service if the account already
  // has a userName (immutable after that, unlike the other fields here).
  @ApiProperty({ required: false, minLength: 3, maxLength: 30 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.]+$/)
  userName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isMajor?: boolean;

  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  publicStatus?: string;

  // How texts speak about me ("can you go and see her?"). null = back to
  // inclusive wording. Only ever set by the person themself.
  @ApiProperty({ required: false, enum: Gender, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  // General switch: during an alert, may my Sentinels of other circles chat
  // with my 1st circle? Off = nobody; on = each circle decides
  // (Circle.alertChatWithFirstCircle).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  alertChatWithFirstCircle?: boolean;

  // The language of the SMS I receive ("fr" or "en"): the app's language,
  // sent by the frontend when it changes.
  @ApiProperty({ required: false, enum: ['fr', 'en'] })
  @IsOptional()
  @IsIn(['fr', 'en'])
  language?: 'fr' | 'en';

  // My time zone (IANA, e.g. "Europe/Zurich"), sent by the browser: the
  // All Good Check deadlines and the times in my SMS follow it.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  // May my Sentinels give each other a phone number or an email during an
  // alert about me? Off: such messages are refused in my alert chats.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  alertContactSharing?: boolean;
}
