import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAction } from '../useAction';
import { LanguageSwitcher } from './LanguageSwitcher';

// Pieces shared by the sign-in, sign-up and password pages.

// The language choice, top right of a page shown before signing in.
export function LanguageRow() {
  return (
    <div className="language-row">
      <LanguageSwitcher />
    </div>
  );
}

export function EmailField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <label>
      {label ?? t('auth.email')}
      <input type="email" required value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// A password being chosen: at least 8 characters, the backend's rule too.
export function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input type="password" required minLength={8} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// The "choose a new password" form, after a reset link or an SMS code.
export function NewPasswordForm({ onSubmit }: { onSubmit: (password: string) => Promise<unknown> }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction({ fallback: t('auth.errors.generic') });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => onSubmit(password));
      }}
    >
      <PasswordField label={t('auth.newPassword')} value={password} onChange={setPassword} />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={busy}>
        {t('auth.resetSubmit')}
      </button>
    </form>
  );
}
