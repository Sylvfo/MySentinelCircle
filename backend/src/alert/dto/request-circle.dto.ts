import { IsIn, IsString } from 'class-validator';
import { ALERT_QUESTION_KINDS } from '../alert-replies';
import type { AlertQuestionKind } from '../alert-replies';

// The 1st circle (or "Me") targets one specific outer circle with a preset
// question during an active alert — see plan.txt's escalation model.
export class RequestCircleDto {
  @IsString()
  circleId: string;

  @IsIn(ALERT_QUESTION_KINDS)
  questionKind: AlertQuestionKind;
}
