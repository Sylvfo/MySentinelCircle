import { IsOptional, IsString } from 'class-validator';

// One more year of subscription: for myself (no forUserId) or offered to
// someone I'm linked with.
export class AddSubscriptionYearDto {
  @IsOptional()
  @IsString()
  forUserId?: string;
}
