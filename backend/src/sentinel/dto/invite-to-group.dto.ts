import { IsString } from 'class-validator';

// Only a user the inviter is already Sentinel/Companion-connected to can be
// invited — see SentinelService.inviteToGroup.
export class InviteToGroupDto {
  @IsString()
  targetUserId: string;
}
