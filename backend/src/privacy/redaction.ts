import { POSITION_LINE } from '../alert/alert.service';

// What stays in the history where a GPS position or a photo was, once it
// has been erased (account deletion, or the retention purge).
export const REMOVED_POSITION_TEXT = 'Position supprimée';
export const REMOVED_POSITION_MESSAGE = `📍 ${REMOVED_POSITION_TEXT}`;
export const REMOVED_PHOTO_TEXT = '📷 Photo supprimée';
// AlertService.updateLocation posts each position as "📍 Position …".
export const POSITION_MESSAGE_PREFIX = '📍 Position';

export function hasPosition(text: string): boolean {
  return POSITION_LINE.test(text);
}

// Every "Position partagée/mise à jour … : <map link>" line, replaced.
export function stripPositions(text: string): string {
  return text.replace(
    new RegExp(POSITION_LINE.source, 'gm'),
    REMOVED_POSITION_TEXT,
  );
}
