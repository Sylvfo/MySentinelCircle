import { ArrayMinSize, IsArray, IsIn, IsString } from 'class-validator';
import { ALERT_QUESTION_KINDS } from '../alert-replies';
import type { AlertQuestionKind } from '../alert-replies';

// A follow-up question to outer-circle Sentinels already contacted.
export class AskQuestionDto {
  @IsIn(ALERT_QUESTION_KINDS)
  questionKind: AlertQuestionKind;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  participantIds: string[];
}
