import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// What happens once the person is found — decided by the responsible Lead.
// FINE ends the alert; the others keep it open (CLOSING) until the 1st
// circle closes it, once the follow-up is done.
export const FOUND_FOLLOW_UPS = [
  'FINE',
  'PICKUP',
  'REPATRIATION',
  'CARE',
] as const;
export type FoundFollowUp = (typeof FOUND_FOLLOW_UPS)[number];

export class MarkFoundDto {
  @IsIn(FOUND_FOLLOW_UPS)
  followUp: FoundFollowUp;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
