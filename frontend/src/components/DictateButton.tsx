import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Speak instead of typing: the browser's speech recognition turns what is
// said into text, added to the field (to read and fix before sending). No
// audio is kept by the app. Where the browser can't do it (Firefox), the
// button stays and says how to dictate anyway (the phone keyboard's mic).
// Note: Chrome sends the sound to Google's servers to recognise it — said
// in the privacy policy.

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const SPEECH_LANG: Record<string, string> = { fr: 'fr-FR', en: 'en-GB' };

// onText: each sentence once it's recognised, to add after what's written.
export function DictateButton({ onText }: { onText: (text: string) => void }) {
  const { t, i18n } = useTranslation();
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const Ctor = recognitionCtor();

  useEffect(() => () => recognition.current?.stop(), []);

  const toggle = () => {
    if (!Ctor) {
      setUnsupported(true);
      return;
    }
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = SPEECH_LANG[i18n.language.slice(0, 2)] ?? i18n.language;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) onText(result[0].transcript.trim());
      }
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    r.start();
    setListening(true);
  };

  return (
    <>
      <button
        type="button"
        className={`dictate-btn${listening ? ' listening' : ''}`}
        onClick={toggle}
        aria-pressed={listening}
        title={t(listening ? 'dictate.stop' : 'dictate.start')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11 a6.5 6.5 0 0 0 13 0 M12 17.5 V21 M8.5 21 H15.5" fill="none" />
        </svg>
        {t(listening ? 'dictate.listening' : 'dictate.start')}
      </button>
      {unsupported && <small className="dictate-unsupported">{t('dictate.unsupported')}</small>}
    </>
  );
}
