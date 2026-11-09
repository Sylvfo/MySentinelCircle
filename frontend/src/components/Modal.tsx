import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Native <dialog> instead of an ARIA-roled div stack — gets modal
// semantics, focus handling, and Escape-to-close from the browser instead
// of us re-implementing them (and matches the standard advice to prefer
// native interactive elements over custom role/tabIndex/keydown wiring).
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal-dialog"
      aria-label={title}
      // No onClose: the effect's own cleanup calls dialog.close(), which
      // would fire it — under StrictMode's dev mount/unmount/remount that
      // closed every modal right after opening. Escape (onCancel), a click
      // outside and the ✕ button are the user's ways out.
      onCancel={onClose}
      onClick={(e) => {
        // Only the dialog's own box (its padding/backdrop area), not the
        // .panel content inside it, should count as "click outside".
        if (e.target === ref.current) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="panel" style={{ minWidth: 320, maxWidth: '90vw' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{title}</h2>
          <button type="button" className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

// "Are you sure?" in the app's own box rather than the browser's
// window.confirm, which some in-app browsers show badly. The confirm button
// repeats the action's own label ("Leave group"), Cancel closes.
export function ConfirmModal({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal title={t('common.confirm')} onClose={onCancel}>
      <p>{message}</p>
      <div className="row">
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </Modal>
  );
}
