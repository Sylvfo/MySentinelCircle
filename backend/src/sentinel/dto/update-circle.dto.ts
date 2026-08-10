import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCircleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label?: string;
}
