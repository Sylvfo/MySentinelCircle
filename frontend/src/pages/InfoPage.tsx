import { useTranslation } from 'react-i18next';
import { Tile } from '../components/Tile';

// What the app is, plus the privacy/security promises it actually keeps —
// every line here must match real backend behavior (see auth/user/alert
// services), never a planned feature.
export function InfoPage() {
  const { t } = useTranslation();
  const list = (key: string) => t(key, { returnObjects: true }) as string[];

  return (
    <div className="info-page">
      <h1>{t('info.title')}</h1>

      <Tile title={t('info.what.title')}>
        {list('info.what.body').map((p) => (
          <p key={p}>{p}</p>
        ))}
      </Tile>

      {(['how', 'privacy', 'security'] as const).map((section) => (
        <Tile key={section} title={t(`info.${section}.title`)}>
          <ul>
            {list(`info.${section}.items`).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Tile>
      ))}
    </div>
  );
}
