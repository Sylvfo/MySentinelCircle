import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { legalText, type LegalDoc } from './legalTexts';

// Public page (no login needed): reachable from the signup checkbox, the
// login page, Settings and the terms gate.
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const text = legalText(doc, i18n.language);

  return (
    <div className="legal-page">
      <div className="legal-top">
        <button type="button" className="legal-back" onClick={() => navigate(-1)}>
          ‹ {t('auth.back')}
        </button>
        <LanguageSwitcher />
      </div>
      <h1>{text.title}</h1>
      <p className="legal-updated">{text.updated}</p>
      {text.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs?.map((p) => <p key={p}>{p}</p>)}
          {section.items && (
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <LegalLinks />
    </div>
  );
}

// The three documents, side by side — footer of the auth pages and Settings.
export function LegalLinks() {
  const { t } = useTranslation();
  return (
    <nav className="legal-links" aria-label={t('legal.links')}>
      <Link to="/privacy">{t('legal.privacy')}</Link>
      <Link to="/terms">{t('legal.terms')}</Link>
      <Link to="/legal-notice">{t('legal.notice')}</Link>
    </nav>
  );
}
