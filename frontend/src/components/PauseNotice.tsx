import { useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { updatePause } from '../api/user';
import { Modal } from './Modal';

// Reminder that one of my pauses is on, linking to Settings where it's
// changed. `which` = the pause that matters on this page: My Circles shows
// pause for me, My Companions pause for others, the Dashboard both.
export function PauseNotice({ which }: { which: 'forMe' | 'forOthers' | 'both' }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const forMe = !!user?.pausedForMe && which !== 'forOthers';
  const forOthers = !!user?.pausedForOthers && which !== 'forMe';
  if (!forMe && !forOthers) return null;
  return (
    // Same words as the PausePill's explanation.
    <Link to="/settings" className="pause-notice">
      {forMe && <span>{t('pause.explain.forMe')}</span>}
      {forOthers && <span>{t('pause.explain.forOthers')}</span>}
    </Link>
  );
}

// "Paused" pill by a title, when that pause is on. Hover says why; a click
// opens a small window explaining it, with the switch to change it right
// there. Safe inside a link (Dashboard tiles): clicks never reach it.
export function PausePill({ which, small }: { which: 'forMe' | 'forOthers'; small?: boolean }) {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const key = which === 'forMe' ? 'pausedForMe' : 'pausedForOthers';
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user?.[key]) return null;

  const openModal = (e: MouseEvent) => {
    e.preventDefault();
    setValue(true);
    setError(null);
    setOpen(true);
  };
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updatePause({ [key]: value });
      await refreshUser();
      setOpen(false);
    } catch (err) {
      const m = err instanceof ApiError ? err.message : String(err);
      setError(m.startsWith('You are a Lead') ? t('pause.settings.leadBlocked') : m);
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="pause-pill-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`pause-pill${small ? ' small' : ''}`}
        title={t(`pause.explain.${which}`)}
        onClick={openModal}
      >
        {t('pause.pill')}
      </button>
      {open &&
        createPortal(
          <span onClick={(e) => e.stopPropagation()}>
            <Modal title={t(`pause.settings.${which}`)} onClose={() => setOpen(false)}>
              <p>{t(`pause.explain.${which}`)}</p>
              <label className="check">
                <input type="checkbox" checked={value} onChange={(e) => setValue(e.target.checked)} />
                {t('pause.modal.keep')}
              </label>
              <p className="form-hint">{t(`pause.settings.${which}Hint`)}</p>
              {error && <p className="form-error">{error}</p>}
              <div className="row">
                <button type="button" disabled={saving} onClick={() => void save()}>
                  {t('common.save')}
                </button>
                <Link to="/settings" onClick={() => setOpen(false)}>
                  {t('pause.modal.allSettings')}
                </Link>
              </div>
            </Modal>
          </span>,
          document.body,
        )}
    </span>
  );
}
