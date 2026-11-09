import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { sendImageMessage, sendMessage } from '../api/messaging';
import { EmojiButton } from './EmojiButton';
import { useAction } from '../useAction';

// The "+" button and its menu (a photo now, the GPS position later). It
// only opens the menu: the caller owns the hidden file input.
export function AttachMenu({ disabled, onPickPhoto }: { disabled?: boolean; onPickPhoto: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="compose-attach">
      <button
        type="button"
        className="compose-icon-btn"
        aria-label={t('conversation.attach')}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      {open && (
        <div className="compose-attach-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onPickPhoto();
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="8.5" cy="10" r="1.6" />
              <path d="M21 16 L15.5 11 L6 19" />
            </svg>
            {t('conversation.attachPhoto')}
          </button>
        </div>
      )}
    </div>
  );
}

// The messaging-app composer used by every chat: "+" menu, text field,
// emoji, paper-plane send. Sends text or a photo to the conversation, then
// lets the caller reload its messages.
export function ChatComposer({
  conversationId,
  inputId,
  onSent,
  onError,
}: {
  conversationId: string;
  inputId: string;
  onSent: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const { busy: sending, run } = useAction({ onError });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const send = (action: () => Promise<unknown>) =>
    run(async () => {
      await action();
      await onSent();
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void send(async () => {
      await sendMessage(conversationId, text);
      setDraft('');
    });
  };

  const submitImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void send(() => sendImageMessage(conversationId, file));
  };

  return (
    <form className="conversation-compose" autoComplete="off" onSubmit={submit}>
      <AttachMenu disabled={sending} onPickPhoto={() => fileInputRef.current?.click()} />
      <input
        id={inputId} maxLength={2000}
        autoComplete="off"
        className="compose-input"
        placeholder={t('alerts.detail.messagePlaceholder')}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <EmojiButton onPick={(emoji) => setDraft((d) => d + emoji)} />
      <button
        type="submit"
        className="compose-icon-btn compose-send"
        aria-label={t('alerts.detail.send')}
        disabled={sending || !draft.trim()}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M3 11.2 L20.5 3.5 C21.2 3.2 21.8 3.8 21.5 4.5 L13.8 22 C13.5 22.7 12.5 22.6 12.3 21.9 L10.4 14.6 L3.1 12.7 C2.4 12.5 2.3 11.5 3 11.2 Z" />
        </svg>
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" hidden disabled={sending} onChange={submitImage} />
    </form>
  );
}
