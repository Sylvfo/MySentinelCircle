import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, errorText } from '../../api/client';
import {
  getLabToken,
  labAdvance,
  labLogin,
  labMe,
  labReply,
  labReset,
  labSmsAll,
  sendLabFeedback,
  setLabToken,
  type LabPhone,
  type LabSms,
} from '../../api/lab';
import { useLoad } from '../../useLoad';
import { useAction } from '../../useAction';

// The phones' own size: the app inside lays out as on this phone.
const PHONE_W = 374;
const PHONE_H = 917;
const SCENARIOS = ['alert', 'trip', 'allGood', 'qr', 'free'] as const;
const GOOD_TAGS = ['ok', 'idea', 'want'] as const;
const BAD_TAGS = ['broken', 'lost', 'odd'] as const;

// The test lab (dev only): one phone to discover the app, or four side by
// side (three with the app, one SMS only), each with its SMS below;
// scenarios and the testers' opinions on the left.
export function LabPage() {
  const { t } = useTranslation();
  const [signedIn, setSignedIn] = useState(() => !!getLabToken());
  const { data, error } = useLoad(
    () =>
      signedIn
        ? labMe().catch((err) => {
            // Really signed out (not a passing error): back to the login.
            if (err instanceof ApiError && err.status === 401) {
              setLabToken(null);
              setSignedIn(false);
            }
            throw err;
          })
        : Promise.resolve(null),
    [signedIn],
  );
  const sms = useAllSms(signedIn);
  const [four, setFour] = useState(false);
  const scale = usePhoneScale(four ? 4 : 1);

  if (!signedIn) return <LabLogin onDone={() => setSignedIn(true)} />;
  if (!data) return error ? <p className="form-error lab-error">{error}</p> : null;
  const phones = data.phones;

  const shown = four ? phones : phones.filter((p) => p.app).slice(0, 1);

  return (
    <div className="lab">
      <header className="lab-header">
        <strong>{t('lab.title')}</strong>
        <span>
          {data.testerName} · {t('lab.notReal')}{' '}
          <button
            type="button"
            className="lab-logout"
            onClick={() => {
              setLabToken(null);
              setSignedIn(false);
            }}
          >
            {t('lab.logout')}
          </button>
        </span>
      </header>
      <div className="lab-body">
        <Feedback />
        <div className="lab-main">
          <div className="lab-phones">
            {shown.map((p) => (
              <Phone key={p.phone} phone={p} scale={scale} messages={sms.byPhone[p.phone] ?? []} onSent={sms.reload} />
            ))}
          </div>
          <Controls four={four} onToggle={() => setFour(!four)} />
        </div>
      </div>
    </div>
  );
}

function Phone({
  phone,
  scale,
  messages,
  onSent,
}: {
  phone: LabPhone;
  scale: number;
  messages: LabSms[];
  onSent: () => Promise<void>;
}) {
  return (
    <div className="lab-phone">
      <strong className="lab-phone-name">{phone.name}</strong>
      {phone.app && (
        <div className="lab-screen" style={{ width: PHONE_W * scale, height: PHONE_H * scale }}>
          <iframe
            title={phone.name}
            name={`lab-${phone.name}`}
            src={`/lab/frame?phone=${encodeURIComponent(phone.phone)}`}
            width={PHONE_W}
            height={PHONE_H}
            style={{ transform: `scale(${scale})` }}
          />
        </div>
      )}
      <SmsScreen phone={phone} tall={!phone.app} width={PHONE_W * scale} messages={messages} onSent={onSent} />
    </div>
  );
}

// The SMS this number got, and a field to answer like from a phone.
function SmsScreen({
  phone,
  tall,
  width,
  messages,
  onSent,
}: {
  phone: LabPhone;
  tall: boolean;
  width: number;
  messages: LabSms[];
  onSent: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [reply, setReply] = useState('');
  const { busy, error, run } = useAction();

  return (
    <div className={`lab-sms${tall ? ' tall' : ''}`} style={{ width: Math.max(width, 260) }}>
      <span className="lab-sms-title">{t('lab.smsTitle', { phone: phone.phone })}</span>
      <div className="lab-sms-list">
        {messages.map((m) => (
          <p key={m.id} className={m.direction === 'IN' ? 'in' : 'out'}>
            {m.body}
          </p>
        ))}
      </div>
      <form
        className="lab-sms-reply"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await labReply(phone.phone, reply.trim());
            setReply('');
            await onSent();
          });
        }}
      >
        <input aria-label={t('lab.reply')} placeholder={t('lab.reply')} value={reply} onChange={(e) => setReply(e.target.value)} />
        <button type="submit" disabled={busy || !reply.trim()}>
          {t('lab.send')}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function Controls({ four, onToggle }: { four: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  return (
    <div className="lab-controls">
      <button type="button" className="lab-toggle" onClick={onToggle}>
        {four ? t('lab.showOne') : t('lab.showFour')}
      </button>
      <button
        type="button"
        className="lab-advance"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await labAdvance(2);
            setDone(t('lab.advanced'));
          })
        }
      >
        {t('lab.advance')}
      </button>
      <button
        type="button"
        className="lab-reset"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await labReset();
            setDone(t('lab.wasReset'));
          })
        }
      >
        {t('lab.reset')}
      </button>
      {done && <span className="lab-done">{done}</span>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

// Scenarios, and what the tester thinks of the one they tried.
function Feedback() {
  const { t } = useTranslation();
  const [scenario, setScenario] = useState<string>(SCENARIOS[0]);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [shot, setShot] = useState<Blob | null>(null);
  const [sent, setSent] = useState(false);
  const { busy, error, setError, run } = useAction();
  const toggle = (tag: string) => setTags(tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag]);

  return (
    <aside className="lab-aside">
      <section className="lab-card">
        <h2>{t('lab.scenarios')}</h2>
        {SCENARIOS.map((s) => (
          <button
            key={s}
            type="button"
            className="lab-scenario"
            aria-pressed={scenario === s}
            onClick={() => {
              setScenario(s);
              setSent(false);
            }}
          >
            {t(`lab.scenario.${s}`)}
          </button>
        ))}
      </section>
      <section className="lab-card">
        <h2>{t('lab.opinion')}</h2>
        <div className="lab-tags">
          {[...GOOD_TAGS, ...BAD_TAGS].map((tag) => (
            <button
              key={tag}
              type="button"
              className={`lab-tag ${(GOOD_TAGS as readonly string[]).includes(tag) ? 'good' : 'bad'}`}
              aria-pressed={tags.includes(tag)}
              onClick={() => toggle(tag)}
            >
              {t(`lab.tags.${tag}`)}
            </button>
          ))}
        </div>
        <label htmlFor="lab-text">{t('lab.aWord')}</label>
        <textarea id="lab-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <button
          type="button"
          className="lab-shot"
          onClick={() =>
            void captureScreen()
              .then(setShot)
              .catch((err) => setError(errorText(err, t('lab.shotFailed'))))
          }
        >
          {shot ? t('lab.shotTaken') : t('lab.shot')}
        </button>
        {sent && <p className="lab-done">{t('lab.thanks')}</p>}
        {error && <p className="form-error">{error}</p>}
        <button
          type="button"
          className="lab-send"
          disabled={busy || (tags.length === 0 && !text.trim())}
          onClick={() =>
            void run(async () => {
              await sendLabFeedback({ scenario, tags, text, screenshot: shot });
              setTags([]);
              setText('');
              setShot(null);
              setSent(true);
            })
          }
        >
          {t('lab.send')}
        </button>
      </section>
    </aside>
  );
}

// The lab's own sign-in: the tester's account (Zaza, Wiwil…).
function LabLogin({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();
  return (
    <form
      className="lab-tester"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const { labToken } = await labLogin(identifier, password);
          setLabToken(labToken);
          onDone();
        });
      }}
    >
      <h1>{t('lab.title')}</h1>
      <label>
        {t('lab.identifier')}
        <input value={identifier} autoComplete="username" onChange={(e) => setIdentifier(e.target.value)} />
      </label>
      <label>
        {t('lab.password')}
        <input
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={busy || !identifier.trim() || !password}>
        {t('lab.start')}
      </button>
    </form>
  );
}

// Every test phone's SMS in one request, every 3 seconds.
function useAllSms(signedIn: boolean) {
  const [byPhone, setByPhone] = useState<Record<string, LabSms[]>>({});
  const reload = async () => {
    try {
      setByPhone(await labSmsAll());
    } catch {
      // A passing error: the next round catches up.
    }
  };
  useEffect(() => {
    if (!signedIn) return;
    void reload();
    const timer = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);
  return { byPhone, reload };
}

// The phones fit the window's height (and width with four), never larger
// than their real size.
function usePhoneScale(count: number): number {
  const compute = () => {
    const byHeight = (window.innerHeight - 420) / PHONE_H;
    const byWidth = ((window.innerWidth - 400) / count - 24) / PHONE_W;
    return Math.max(0.3, Math.min(1, byHeight, byWidth));
  };
  const [scale, setScale] = useState(compute);
  useEffect(() => {
    const onResize = () => setScale(compute());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
  return scale;
}

// A picture of the lab tab, with the person's permission (the browser asks
// which tab to share). Nothing leaves the browser until "Envoyer".
async function captureScreen(): Promise<Blob | null> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    preferCurrentTab: true,
  } as DisplayMediaStreamOptions);
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
