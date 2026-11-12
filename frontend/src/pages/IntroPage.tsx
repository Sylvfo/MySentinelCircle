import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type Language } from '../i18n';

interface Slide {
  title?: string;
  // First screen: bigger, bold lines instead of a title.
  lead?: string[];
  lines?: string[];
}

// Each language named in itself, so anyone finds theirs.
const LANGUAGE_NAMES: Record<Language, string> = { fr: 'Français', en: 'English' };

// A few screens shown right after signing in, explaining what the app is
// for: first the language, then the slides. Always skippable: people sign
// in often, sometimes on several accounts. Can be seen again from the
// Information page.
export function IntroPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  // Reopened from the Information page: back there when done.
  const back = (useLocation().state as { back?: string } | null)?.back;
  // 0: the language screen, then one per slide.
  const [index, setIndex] = useState(0);
  const slides = t('intro.slides', { returnObjects: true }) as Slide[];
  const count = slides.length + 1;
  const slide = index > 0 ? slides[index - 1] : null;
  const last = index === count - 1;
  const current = i18n.resolvedLanguage ?? 'fr';

  // The account's language follows (useLanguageSync, in AppShell).
  const done = () => navigate(back ?? '/dashboard', { replace: true });

  return (
    <div className="intro-page">
      <div className="intro-card">
        <button
          type="button"
          className="intro-skip"
          onClick={done}
          style={last ? { visibility: 'hidden' } : undefined}
        >
          {t('intro.skip')}
        </button>
        <div className="intro-body">
          {slide ? (
            <>
              {slide.title && <h1>{slide.title}</h1>}
              {slide.lead?.map((line) => (
                <p key={line} className="intro-lead">
                  {line}
                </p>
              ))}
              {slide.lines?.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </>
          ) : (
            <>
              <h1>{t('intro.language')}</h1>
              <div className="intro-languages">
                {SUPPORTED_LANGUAGES.map((lng) => (
                  <button
                    key={lng}
                    type="button"
                    className={lng === current ? 'on' : undefined}
                    aria-pressed={lng === current}
                    onClick={() => void i18n.changeLanguage(lng)}
                  >
                    {LANGUAGE_NAMES[lng]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="intro-dots" aria-hidden="true">
          {Array.from({ length: count }, (_, i) => (
            <span key={i} className={i === index ? 'on' : undefined} />
          ))}
        </div>
        <div className="intro-nav">
          <button
            type="button"
            className="intro-prev"
            onClick={() => setIndex(index - 1)}
            style={index === 0 ? { visibility: 'hidden' } : undefined}
          >
            {t('intro.previous')}
          </button>
          <button
            type="button"
            className="intro-next"
            onClick={() => (last ? done() : setIndex(index + 1))}
          >
            {last ? t('intro.start') : t('intro.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
