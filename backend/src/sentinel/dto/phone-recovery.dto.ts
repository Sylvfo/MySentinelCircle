import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString, Length } from 'class-validator';

// Lost phone: the number of the account, and the new one to move it to.
export class RequestPhoneRecoveryDto {
  @ApiProperty()
  @IsPhoneNumber()
  phone: string;

  @ApiProperty()
  @IsPhoneNumber()
  newPhone: string;
}

// The code received on the new number once the 1st circle confirmed.
export class VerifyPhoneRecoveryDto {
  @ApiProperty()
  @IsPhoneNumber()
  newPhone: string;

  @ApiProperty({ minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6)
  code: string;
}
