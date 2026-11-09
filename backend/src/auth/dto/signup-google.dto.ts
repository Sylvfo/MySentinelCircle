import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { SignupFieldsDto } from '../../common/account-fields.dto';

export class SignupGoogleDto extends SignupFieldsDto {
  // ID token from Google Sign-In on the client (web or React Native), not
  // an OAuth authorization code — verified server-side, no redirect flow.
  @ApiProperty()
  @IsString()
  idToken: string;
}
