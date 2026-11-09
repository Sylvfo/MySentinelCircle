import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { GenderSelect } from './GenderSelect';
import type { Gender } from '../gender';
import { useAction } from '../useAction';

export function EditableTextField({
  label,
  value: initialValue,
  onSave,
  onSaved,
  onError,
  hint,
  required,
  minLength,
  maxLength,
}: {
  label: string;
  value: string;
  onSave: (value: string) => Promise<unknown>;
  onSaved: () => void;
  onError: (m: string) => void;
  hint?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const { busy: submitting, run } = useAction({ onError });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave(value.trim());
      onSaved();
    });
  };

  return (
    <form className="row" onSubmit={submit}>
      <label>
        {label}
        <input
          value={value}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button type="submit" disabled={submitting}>
        {t('common.save')}
      </button>
      {hint && <p className="muted" style={{ fontSize: '0.85rem' }}>{hint}</p>}
    </form>
  );
}

// How texts speak about me ("can you go and see her?"). Only I set it.
export function GenderField({
  value: initialValue,
  onSave,
  onSaved,
  onError,
}: {
  value: Gender | null;
  onSave: (value: Gender | null) => Promise<unknown>;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<string>(initialValue ?? '');
  const { busy: submitting, run } = useAction({ onError });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave(value === '' ? null : (value as Gender));
      onSaved();
    });
  };

  return (
    <form onSubmit={submit}>
      <label>
        {t('gender.label')}
        <div className="row">
          <GenderSelect value={value} onChange={setValue} />
          <button type="submit" disabled={submitting || value === (initialValue ?? '')}>
            {t('common.save')}
          </button>
        </div>
      </label>
      <p className="form-hint">{t('gender.hint')}</p>
    </form>
  );
}

export function EditableToggle({
  label,
  value: initialValue,
  onSave,
  onSaved,
  onError,
}: {
  label: string;
  value: boolean;
  onSave: (value: boolean) => Promise<unknown>;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const { busy: submitting, run } = useAction({ onError });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await onSave(value);
      onSaved();
    });
  };

  return (
    <form className="row" onSubmit={submit}>
      <label className="check">
        <input type="checkbox" checked={value} onChange={(e) => setValue(e.target.checked)} />
        {label}
      </label>
      <button type="submit" disabled={submitting}>
        {t('common.save')}
      </button>
    </form>
  );
}
