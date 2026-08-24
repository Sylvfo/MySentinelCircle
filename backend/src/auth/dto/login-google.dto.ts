import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginGoogleDto {
  @ApiProperty()
  @IsString()
  idToken: string;
}
