// Circle colors, agreed with Sylvie via a Claude Design prototype before
// porting here: the 1st circle is always gold (Lead = a darker gold shade,
// since color alone can no longer mark the Lead inside an all-gold circle);
// every other circle cycles through a blue -> green-teal family, each paired
// with a pale "ring" tint (the ring itself stays light, avatars carry the
// strong color) and a light background tint for its own page.
export const PRIMARY_RING_COLOR = '#F7ECDC';
export const PRIMARY_AVATAR_COLOR = '#D9A066';
export const PRIMARY_LEAD_COLOR = '#B8822E';
export const PENDING_AVATAR_COLOR = '#9a9a9a';
export const PAGE_BG_COLOR = '#EAF4F2';

interface CirclePalette {
  color: string;
  ring: string;
}

const CIRCLE_PALETTE: CirclePalette[] = [
  { color: '#4A8FD1', ring: '#E1EDF9' }, // blue
  { color: '#2FA98C', ring: '#DCF1EB' }, // green-teal
  { color: '#3B9FB0', ring: '#DDF0F3' }, // blue-teal
  { color: '#C97B84', ring: '#F5E3E5' }, // fallback for a 5th+ circle
];

export function circlePalette(index: number): CirclePalette {
  return CIRCLE_PALETTE[index % CIRCLE_PALETTE.length];
}

// Kept for any other spot still using the old flat list.
export function circleColor(index: number): string {
  return circlePalette(index).color;
}
