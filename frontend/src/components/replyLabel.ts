import type { useTranslation } from 'react-i18next';
import { KNOWN_REPLY_CODES } from '../api/alert';

type Translate = ReturnType<typeof useTranslation>['t'];

// A stored reply is a code, or the person's own words for a free-text question
// and for replies older than the preset lists.
export function replyLabel(t: Translate, response: string): string {
  return KNOWN_REPLY_CODES.has(response) ? t(`alerts.replies.${response}`) : response;
}
