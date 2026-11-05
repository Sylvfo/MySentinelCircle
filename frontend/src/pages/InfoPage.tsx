import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useUnreadCounts } from '../unreadCounts';

// What the app is, plus the privacy/security promises it actually keeps —
// every line here must match real backend behavior (see auth/user/alert
// services), never a planned feature.
//
// Two levels, so it never reads as one big block: a short intro, then
// compact tiles (same satin look as the Dashboard's) that unfold one at a
// time — first the essentials, then "Learn more" for the full detail.

type SectionKey = 'what' | 'how' | 'alert' | 'privacy' | 'security';

const ICONS: Record<SectionKey, ReactNode> = {
  what: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="16" x2="12" y2="11" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </>
  ),
  how: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="10" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 L22 20 H2 Z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  privacy: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11 V7.5 a4 4 0 0 1 8 0 V11" />
    </>
  ),
  security: <path d="M12 2 L20 5 V11 C20 16.5 16.5 20.5 12 22 C7.5 20.5 4 16.5 4 11 V5 Z" />,
};

const SECTIONS: SectionKey[] = ['what', 'how', 'alert', 'privacy', 'security'];

export function InfoPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [more, setMore] = useState(false);
  const { support: unreadReplies } = useUnreadCounts();
  const list = (key: string) => t(key, { returnObjects: true }) as string[];

  const toggle = (key: SectionKey) => {
    setMore(false);
    setOpen((current) => (current === key ? null : key));
  };

  return (
    <div className="info-page">
      <h1>{t('info.title')}</h1>
      <p className="info-intro">{t('info.intro')}</p>

      <div className="about-tiles">
        {SECTIONS.map((key) => {
          const isOpen = open === key;
          return (
            <section key={key} className={`about-tile${isOpen ? ' open' : ''}`}>
              <button
                type="button"
                className="about-tile-head"
                aria-expanded={isOpen}
                aria-controls={`about-${key}`}
                onClick={() => toggle(key)}
              >
                <svg
                  className="about-tile-icon"
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {ICONS[key]}
                </svg>
                <span className="about-tile-title">{t(`info.sections.${key}.title`)}</span>
                <svg className="about-tile-chevron" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
              {isOpen && (
                <div className="about-tile-body" id={`about-${key}`}>
                  <ul>
                    {list(`info.sections.${key}.summary`).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {more ? (
                    <ul className="about-tile-more">
                      {list(`info.sections.${key}.details`).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <button type="button" className="about-more-btn" onClick={() => setMore(true)}>
                      {t('info.learnMore')}
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* The user's thread with the team; the badge flags unread replies. */}
      <Link to="/feedback" className="about-tile about-feedback">
        <span className="about-tile-head static">
          <svg
            className="about-tile-icon"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="about-tile-title">
            {t('info.feedback.title')}
            <small>{unreadReplies > 0 ? t('info.feedback.newReply', { count: unreadReplies }) : t('info.feedback.hint')}</small>
          </span>
          {unreadReplies > 0 && <span className="notification-count inline">{unreadReplies}</span>}
          <svg className="about-tile-chevron right" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <polyline points="9 6 15 12 9 18" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
      </Link>
    </div>
  );
}
