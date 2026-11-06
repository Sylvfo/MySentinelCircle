import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// A small smiley picker next to the message field: a phone keyboard already
// has emojis, but a computer doesn't. A fixed short list, no library.
const EMOJIS = [
  '🙂', '😊', '😂', '😍', '😘', '😉', '😢', '😮',
  '😴', '🤔', '🙏', '👍', '👎', '👏', '💪', '👋',
  '❤️', '💙', '🎉', '🌸', '☀️', '🏠', '🚗', '✅',
];

export function EmojiButton({ onPick }: { onPick: (emoji: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="compose-attach">
      <button
        type="button"
        className="compose-icon-btn"
        aria-label={t('messages.emoji')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14.5 Q12 17.5 15.5 14.5" />
          <line x1="9" y1="9.5" x2="9" y2="10" />
          <line x1="15" y1="9.5" x2="15" y2="10" />
        </svg>
      </button>
      {open && (
        <div className="emoji-menu" role="menu">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              onClick={() => {
                onPick(e);
                setOpen(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
