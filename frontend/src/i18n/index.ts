import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from './locales/fr.json';
import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LANGUAGES,
    // _e: agreement with the reader (gender.ts readerEnding), inclusive by
    // default, set from the profile once it's loaded.
    interpolation: { escapeValue: false, defaultVariables: { _e: '.e' } },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;

// My own gender changes how texts addressed to me are written: update the
// default and re-render every translated text.
export function setReaderEnding(ending: string) {
  const vars = (i18n.options.interpolation ??= {}).defaultVariables ?? {};
  if (vars._e === ending) return;
  i18n.options.interpolation.defaultVariables = { ...vars, _e: ending };
  void i18n.changeLanguage(i18n.language);
}
