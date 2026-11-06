import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Two ways to invite someone into a group (see SentinelService.inviteToGroup):
// - targetUserId: someone the inviter is already connected to (picked from
//   their contacts);
// - phone + name: anyone, with or without an account (no account: they get
//   an SMS asking them to create one with this number).
export class InviteToGroupDto {
  @ValidateIf((dto: InviteToGroupDto) => !dto.phone)
  @IsString()
  targetUserId?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  // Prénom is mandatory with a phone, as for a circle invitation.
  @ValidateIf((dto: InviteToGroupDto) => !!dto.phone)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
}
