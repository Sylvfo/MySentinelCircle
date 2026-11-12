import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useUnreadCounts } from '../unreadCounts';
import { SentinelIcon } from '../components/SentinelIcon';
import { MessageBadge } from '../components/CircleRing';
import { CompanionIcon } from '../components/CompanionIcon';
import { RelationIcons } from '../components/RelationIcons';
import {
  circlePalette,
  IN_ALERT_AVATAR_COLOR,
  PENDING_AVATAR_COLOR,
  PRIMARY_AVATAR_COLOR,
  PRIMARY_LEAD_COLOR,
} from '../theme';
import { LockShape, MessageBubbleShape } from '../components/icons';
import { CollapsibleTile, TileIcon } from '../components/CollapsibleTile';

// What the app is, plus the privacy/security promises it actually keeps —
// every line here must match real backend behavior (see auth/user/alert
// services), never a planned feature.
//
// Two levels, so it never reads as one big block: a short intro, then
// compact tiles (same satin look as the Dashboard's) that unfold one at a
// time — first the essentials, then "Learn more" for the full detail.

type SectionKey = 'what' | 'how' | 'symbols' | 'alert' | 'privacy' | 'security';

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
  symbols: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21 V17 A8 6 0 0 1 20 17 V21" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 L22 20 H2 Z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  privacy: <LockShape />,
  security: <path d="M12 2 L20 5 V11 C20 16.5 16.5 20.5 12 22 C7.5 20.5 4 16.5 4 11 V5 Z" />,
};

const SECTIONS: SectionKey[] = ['what', 'how', 'symbols', 'alert', 'privacy', 'security'];

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
      <Link to="/intro" state={{ back: '/info' }} className="info-see-intro">
        {t('info.seeIntro')}
      </Link>
      <p className="info-intro">{t('info.intro')}</p>

      <div className="about-tiles">
        {SECTIONS.map((key) => (
          <CollapsibleTile
            key={key}
            id={`about-${key}`}
            open={open === key}
            onToggle={() => toggle(key)}
            icon={<TileIcon>{ICONS[key]}</TileIcon>}
            title={t(`info.sections.${key}.title`)}
          >
            {key === 'symbols' ? (
              <SymbolsLegend />
            ) : (
              <>
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
              </>
            )}
          </CollapsibleTile>
        ))}
      </div>

      {/* The user's thread with the team; the badge flags unread replies. */}
      <Link to="/feedback" className="about-tile about-feedback">
        <span className="about-tile-head static">
          <TileIcon>
            <MessageBubbleShape />
          </TileIcon>
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

// What the people icons and rings mean — drawn with the app's own
// components and colors, so the legend can't drift from what's on screen.
function Ring({ color, double = false }: { color: string; double?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="none" stroke={color} strokeWidth="3" />
      {double && <circle cx="20" cy="20" r="11" fill="none" stroke={color} strokeWidth="3" />}
    </svg>
  );
}

function SymbolsLegend() {
  const { t } = useTranslation();
  const blue = circlePalette(0);
  const teal = circlePalette(1);
  const rows: { key: string; icon: ReactNode }[] = [
    {
      key: 'sentinel',
      icon: (
        <>
          <span style={{ color: blue.color }}>
            <SentinelIcon size={30} />
          </span>
          <span style={{ color: teal.color }}>
            <SentinelIcon size={30} />
          </span>
        </>
      ),
    },
    {
      key: 'firstCircle',
      icon: (
        <span style={{ color: PRIMARY_AVATAR_COLOR }}>
          <SentinelIcon size={30} />
        </span>
      ),
    },
    {
      key: 'lead',
      icon: (
        <span style={{ color: PRIMARY_LEAD_COLOR }}>
          <SentinelIcon size={30} />
        </span>
      ),
    },
    {
      key: 'pending',
      icon: (
        <span style={{ color: PENDING_AVATAR_COLOR }}>
          <SentinelIcon size={30} />
        </span>
      ),
    },
    {
      key: 'companion',
      icon: (
        <>
          <CompanionIcon size={32} color="hsl(232 62% 50%)" />
          <CompanionIcon size={32} color="hsl(270 62% 50%)" />
        </>
      ),
    },
    {
      key: 'companionGold',
      icon: (
        <>
          <CompanionIcon size={32} leadColor={PRIMARY_AVATAR_COLOR} />
          <CompanionIcon size={32} leadColor={PRIMARY_LEAD_COLOR} />
        </>
      ),
    },
    { key: 'both', icon: <RelationIcons sentinelColor={teal.color} companionColor="hsl(250 62% 50%)" size={30} /> },
    {
      key: 'inAlert',
      icon: (
        <span style={{ color: IN_ALERT_AVATAR_COLOR }}>
          <SentinelIcon size={30} />
        </span>
      ),
    },
    {
      key: 'ring',
      icon: (
        <>
          <Ring color={PRIMARY_AVATAR_COLOR} />
          <Ring color={blue.color} />
        </>
      ),
    },
    { key: 'groupRing', icon: <Ring color={teal.color} double /> },
    {
      key: 'alertChat',
      icon: (
        <>
          {[true, false].map((on) => (
            <span key={String(on)} className="symbols-badge" style={{ color: blue.color }}>
              <SentinelIcon size={30} />
              <MessageBadge on={on} />
            </span>
          ))}
        </>
      ),
    },
  ];
  return (
    <ul className="symbols-legend">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="symbols-icon">{r.icon}</span>
          <span>{t(`info.symbols.${r.key}`)}</span>
        </li>
      ))}
    </ul>
  );
}
