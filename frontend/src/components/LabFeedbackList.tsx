import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL, getToken } from '../api/client';
import { listLabFeedback, markLabFeedbackRead, type LabFeedback } from '../api/lab';
import { useLoad } from '../useLoad';

// Admin page: what the testers of the lab thought, newest first, each with
// its screenshot. Shows nothing where the lab doesn't exist.
export function LabFeedbackList() {
  const { t, i18n } = useTranslation();
  const { data: rows, reload } = useLoad(() => listLabFeedback().catch(() => [] as LabFeedback[]));
  if (!rows || rows.length === 0) return null;
  return (
    <section className="admin-section lab-feedback">
      <h2>{t('lab.admin.title')}</h2>
      {rows.map((f) => (
        <article key={f.id} className={f.readAt ? 'read' : ''}>
          <p>
            <strong>{f.testerName}</strong> · {t(`lab.scenario.${f.scenario}`, { defaultValue: f.scenario })} ·{' '}
            {new Date(f.createdAt).toLocaleString(i18n.language)}
          </p>
          {f.tags && (
            <p className="lab-tags">
              {f.tags
                .split(',')
                .filter(Boolean)
                .map((tag) => (
                  <span key={tag} className="watch-pill inline">
                    {t(`lab.tags.${tag}`, { defaultValue: tag })}
                  </span>
                ))}
            </p>
          )}
          {f.text && <p>{f.text}</p>}
          {f.screenshotPath && <Screenshot id={f.id} />}
          {!f.readAt && (
            <button
              type="button"
              className="ghost"
              onClick={() => void markLabFeedbackRead(f.id).then(() => reload())}
            >
              {t('lab.admin.markRead')}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}

// Fetched with the admin's sign-in (an <img> can't send it), shown from
// memory; a click opens it full size.
function Screenshot({ id }: { id: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    const token = getToken();
    fetch(`${API_URL}/user/lab/admin/feedback/${id}/screenshot`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img className="lab-shot-thumb" src={url} alt={t('lab.admin.screenshot')} />
    </a>
  );
}
