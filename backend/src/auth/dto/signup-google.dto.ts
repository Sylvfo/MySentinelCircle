import { IsPhoneNumber, IsString } from 'class-validator';

export class SignupGoogleDto {
  // ID token from Google Sign-In on the client (web or React Native), not
  // an OAuth authorization code — verified server-side, no redirect flow.
  @IsString()
  idToken: string;

  @IsPhoneNumber()
  phone: string;
}
