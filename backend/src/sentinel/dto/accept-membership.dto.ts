import { IsOptional, IsString } from 'class-validator';

// Required only when accepting a Sentinel-initiated request (the companion
// picks the real circle now, since the requester couldn't see it upfront).
// Ignored when accepting a Companion-initiated invite (circle was already
// chosen at invite time).
export class AcceptMembershipDto {
  @IsOptional()
  @IsString()
  circleId?: string;
}
