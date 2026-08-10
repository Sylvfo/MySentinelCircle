import { IsPhoneNumber } from 'class-validator';

// A registered user asks to become a Sentinel for the "Me" reachable at this
// phone number. The target "Me" approves/declines from the app.
export class RequestSentinelDto {
  @IsPhoneNumber()
  targetPhone: string;
}
