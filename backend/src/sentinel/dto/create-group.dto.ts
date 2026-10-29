import { IsString, MaxLength, MinLength } from 'class-validator';

// Creates a new group circle (e.g. a choir) — the caller becomes its first
// member, their own circle is the group's root (see SentinelService.createGroup).
export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;
}
