// How texts speak about someone ("can you go and see her?"), chosen by the
// person themself in Settings. FEMALE / MALE pick the i18n variant
// `<key>_female` / `<key>_male`; NEUTRAL or nothing keeps the inclusive
// base text (vu.e, them) — i18next falls back to it when a variant is
// missing, so only texts that actually agree with the person need one.
export type Gender = 'FEMALE' | 'MALE' | 'NEUTRAL';

// Not set: the base text, whose French pronoun is "la" (Sylvie's rule,
// 2026-11-06: "le ou la, et la si ce n'est pas précisé"). NEUTRAL picks a
// `_neutral` variant that rephrases with the first name, where one exists.
export function genderContext(gender: Gender | null | undefined): 'female' | 'male' | 'neutral' | undefined {
  if (gender === 'FEMALE') return 'female';
  if (gender === 'MALE') return 'male';
  if (gender === 'NEUTRAL') return 'neutral';
  return undefined;
}

// Texts addressed to me ("tu seras prévenu{{_e}}") agree with my own
// gender: `{{_e}}` is a default i18n variable, "e" / "" / ".e". Set once
// the profile is loaded (AuthContext); inclusive ".e" until then.
export function readerEnding(gender: Gender | null | undefined): string {
  if (gender === 'FEMALE') return 'e';
  if (gender === 'MALE') return '';
  return '.e';
}
