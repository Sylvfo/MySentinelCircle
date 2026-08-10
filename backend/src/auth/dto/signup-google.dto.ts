import { IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupGoogleDto {
  // Mandatory prénom for every account (see plan.txt CIRCLES & PERMISSIONS).
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  // ID token from Google Sign-In on the client (web or React Native), not
  // an OAuth authorization code — verified server-side, no redirect flow.
  @IsString()
  idToken: string;

  @IsPhoneNumber()
  phone: string;
}
