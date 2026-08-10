import { IsPhoneNumber, IsString } from 'class-validator';

// Inbound SMS reply webhook payload. In dev this is called by hand (or by a
// test); in prod it maps to the SMS provider's inbound webhook. Lets a
// Sentinel accept/decline an invitation by replying OUI / NON.
export class InboundSmsDto {
  @IsPhoneNumber()
  from: string;

  @IsString()
  body: string;
}
