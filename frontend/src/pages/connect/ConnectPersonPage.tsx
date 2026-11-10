import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { inviteByCode, requestByCode, resolveConnectCode } from '../../api/connect';
import { useLoad } from '../../useLoad';
import { Loading } from '../../components/Loading';
import { PersonAvatar } from '../../components/PersonAvatar';
import { AddChoices } from '../../components/connect/AddChoices';

// Opened by a scanned QR code (in the app, or with the phone's camera).
export function ConnectPersonPage() {
  const { t } = useTranslation();
  const { code = '' } = useParams();
  const { data: person, loading, error } = useLoad(() => resolveConnectCode(code), [code]);
  if (loading) return <Loading />;
  if (!person) {
    return (
      <div className="connect-page">
        <p className="form-error">{error}</p>
        <Link to="/connect">{t('connect.title')}</Link>
      </div>
    );
  }
  return (
    <div className="connect-page">
      <div className="connect-person">
        <PersonAvatar
          userId={person.id}
          avatarPath={person.avatarPath}
          sentinelColor={null}
          companionColor={null}
          size={72}
        />
        <h1>
          {person.firstName} {person.lastName ?? ''}
        </h1>
      </div>
      <AddChoices
        name={person.firstName}
        onInvite={(circleId) => inviteByCode(code, circleId)}
        onRequest={() => requestByCode(code)}
      />
    </div>
  );
}
