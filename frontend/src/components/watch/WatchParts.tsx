import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapChoice } from '../LinkifiedText';
import { coordsFromLink, formatDelay, sayDayAndTime, type StepDraft } from './watchFormat';

// On/off as a switch: a real button, its state in aria-pressed.
export function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className="switch-row" aria-pressed={on} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className="switch-track" aria-hidden="true" />
    </button>
  );
}

export function DelaySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (minutes: number) => void;
}) {
  const { t } = useTranslation();
  const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {all.map((m) => (
          <option key={m} value={m}>
            {formatDelay(m, t)}
          </option>
        ))}
      </select>
    </label>
  );
}

// Place (name, plus a pasted map link), day and time, and — outside a
// trip, whose delay is the whole trip's — the delay before the alert. No embedded map: a place is a name and,
// if given, a point anyone can open in their own maps app.
export function StepFields({
  value,
  onChange,
  delays,
}: {
  value: StepDraft;
  onChange: (v: StepDraft) => void;
  // A trip's delay is set once for the whole trip: none here then.
  delays?: number[];
}) {
  const { t, i18n } = useTranslation();
  const when = sayDayAndTime(value.day, value.time, i18n.language);
  const [pasting, setPasting] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState(false);
  const set = (patch: Partial<StepDraft>) => onChange({ ...value, ...patch });

  const applyPastedLink = () => {
    const coords = coordsFromLink(link);
    setLinkError(!coords);
    if (coords) {
      set(coords);
      setPasting(false);
      setLink('');
    }
  };

  return (
    <>
      <label>
        {t('watch.step.place')} *
        <input
          type="text"
          required
          maxLength={191}
          value={value.placeName}
          placeholder={t('watch.step.placePlaceholder')}
          onChange={(e) => set({ placeName: e.target.value })}
        />
      </label>
      <div className="row">
        <button type="button" className="watch-outline" aria-expanded={pasting} onClick={() => setPasting((p) => !p)}>
          {t('watch.step.pasteLink')}
        </button>
      </div>
      {pasting && (
        <div className="row">
          <input
            type="url"
            aria-label={t('watch.step.pasteLink')}
            value={link}
            placeholder="https://maps…"
            onChange={(e) => setLink(e.target.value)}
          />
          <button type="button" onClick={applyPastedLink}>
            {t('watch.step.useLink')}
          </button>
        </div>
      )}
      {linkError && <p className="form-error">{t('watch.step.linkNotUnderstood')}</p>}
      {value.latitude !== undefined && value.longitude !== undefined && (
        <p className="form-hint">
          {t('watch.step.pointSet')}{' '}
          <MapChoice lat={value.latitude.toFixed(5)} lng={value.longitude.toFixed(5)} />{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => set({ latitude: undefined, longitude: undefined })}
          >
            {t('watch.step.removePoint')}
          </button>
        </p>
      )}
      <div className="watch-grid-2">
        <label>
          {t('watch.step.day')} *
          <input type="date" required value={value.day} onChange={(e) => set({ day: e.target.value })} />
        </label>
        <label>
          {t('watch.step.time')} *
          <input type="time" required value={value.time} onChange={(e) => set({ time: e.target.value })} />
        </label>
      </div>
      {when && <p className="watch-when-summary">{when}</p>}
      {delays && (
        <DelaySelect
          label={t('watch.step.alertAfter')}
          value={value.delayMinutes}
          options={delays}
          onChange={(delayMinutes) => set({ delayMinutes })}
        />
      )}
    </>
  );
}

// "Que faire s'il y a un souci ?": read by the 1st circle once an alert opens.
export function InstructionsEditor({
  initial,
  placeholder,
  onSave,
  busy,
}: {
  initial: string;
  placeholder: string;
  onSave: (text: string) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial);
  return (
    <div className="watch-status-card">
      <label htmlFor="watch-instructions">{t('watch.instructions.label')}</label>
      <textarea
        id="watch-instructions"
        rows={4}
        maxLength={2000}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" disabled={busy || text === initial} onClick={() => onSave(text.trim())}>
        {t('common.save')}
      </button>
    </div>
  );
}
