import { IsString, MinLength } from 'class-validator';

// The 1st circle (or "Me") targets one specific outer circle with a yes/no
// question during an active alert — see plan.txt's escalation model.
export class RequestCircleDto {
  @IsString()
  circleId: string;

  @IsString()
  @MinLength(1)
  question: string;
}
