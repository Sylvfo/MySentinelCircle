import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { fetchMessageImageBlob } from '../api/messaging';
import { LinkifiedText } from './LinkifiedText';
import type { Message } from '../api/messaging';

// WhatsApp-like bubbles: my messages on the right (dark blue), the others'
// on the left (white), oldest at the top. Consecutive messages from the same
// person form a run: only its first bubble has the little tail — and, in a
// group chat, the sender's first name (each person in their own color). A
// "Today / Yesterday / date" line marks each new day.

type BubbleMessage = Pick<Message, 'id' | 'body' | 'type' | 'senderId' | 'createdAt'>;

// Readable on white, one per person (picked from their id so it stays put).
const NAME_COLORS = ['#a0661f', '#2d7a8a', '#7a4fb0', '#b3261e', '#2f6b2f', '#1f4e8c', '#9c3d72'];
function nameColor(id: string): string {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

const dayKey = (iso: string) => new Date(iso).toDateString();

export function MessageBubbles({
  messages,
  myId,
  nameOf,
}: {
  messages: BubbleMessage[];
  myId: string | undefined;
  // Group chats only: who sent it. Left out in a 1:1 conversation, where
  // the name would only repeat the header.
  nameOf?: (senderId: string) => string;
}) {
  const { t } = useTranslation();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const dayLabel = (iso: string) => {
    const key = dayKey(iso);
    if (key === today) return t('messages.today');
    if (key === yesterday) return t('messages.yesterday');
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <ol className="bubbles">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
        const startsRun = newDay || prev.senderId !== m.senderId;
        const mine = m.senderId === myId;
        return (
          <li key={m.id} className="bubble-row">
            {newDay && <span className="bubble-day">{dayLabel(m.createdAt)}</span>}
            <div className={`bubble ${mine ? 'mine' : 'theirs'}${startsRun ? ' tail' : ''}`}>
              {startsRun && !mine && nameOf && (
                <span className="bubble-name" style={{ color: nameColor(m.senderId) }}>
                  {nameOf(m.senderId)}
                </span>
              )}
              {m.type === 'IMAGE' ? (
                <MessageImage messageId={m.id} />
              ) : (
                <LinkifiedText text={m.body} />
              )}
              <time dateTime={m.createdAt}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Images in messages are private: fetched with my token, then shown from a
// blob URL (cached for the session — an image message never changes).
const imageCache = new Map<string, Promise<string | null>>();

function MessageImage({ messageId }: { messageId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let entry = imageCache.get(messageId);
    if (!entry) {
      entry = fetchMessageImageBlob(messageId)
        .then((blob) => URL.createObjectURL(blob))
        .catch(() => null);
      imageCache.set(messageId, entry);
    }
    let alive = true;
    void entry.then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [messageId]);
  return url ? <img src={url} alt="" className="bubble-image" /> : <span className="bubble-image placeholder" aria-hidden="true" />;
}
