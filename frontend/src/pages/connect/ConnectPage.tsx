import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import qrcode from 'qrcode-generator';
import { codeFromScan, connectLink, getMyConnectCode, renewConnectCode } from '../../api/connect';
import { inviteSentinel, requestToBeSentinel } from '../../api/sentinel';
import { useLoad } from '../../useLoad';
import { useAction } from '../../useAction';
import { Loading } from '../../components/Loading';
import { AddChoices } from '../../components/connect/AddChoices';
import { QrScanner } from '../../components/connect/QrScanner';

type Tab = 'mine' | 'scan' | 'phone';

// Code QR: my code, scan someone's, or type their number.
export function ConnectPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('mine');
  const tabs: Tab[] = ['mine', 'scan', 'phone'];
  return (
    <div className="connect-page">
      <h1>{t('connect.title')}</h1>
      <div className="connect-tabs" role="tablist">
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`connect.tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'mine' && <MyCode />}
      {tab === 'scan' && <Scan />}
      {tab === 'phone' && <ByPhone />}
    </div>
  );
}

function MyCode() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useLoad(getMyConnectCode);
  const { busy, run } = useAction();
  if (loading) return <Loading />;
  if (!data) return <p className="form-error">{error}</p>;
  const qr = qrcode(0, 'M');
  qr.addData(connectLink(data.code));
  qr.make();
  return (
    <div className="connect-mine">
      <img className="qr-image" src={qr.createDataURL(8, 2)} alt={t('connect.myCodeAlt')} />
      <button
        type="button"
        className="ghost"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await renewConnectCode();
            await reload();
          })
        }
      >
        {t('connect.renew')}
      </button>
    </div>
  );
}

function Scan() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [wrong, setWrong] = useState(false);
  return (
    <div className="connect-scan">
      <QrScanner
        onRead={(text) => {
          const code = codeFromScan(text);
          if (code) navigate(`/connect/${code}`);
          else setWrong(true);
        }}
      />
      {wrong && <p className="form-error">{t('connect.scan.notOurs')}</p>}
    </div>
  );
}

function ByPhone() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [ready, setReady] = useState(false);
  if (ready) {
    return (
      <AddChoices
        name={name.trim()}
        onInvite={(circleId) => inviteSentinel(circleId, { phone: phone.trim(), name: name.trim() })}
        onRequest={() => requestToBeSentinel(phone.trim())}
      />
    );
  }
  return (
    <form
      className="connect-phone"
      onSubmit={(e) => {
        e.preventDefault();
        setReady(true);
      }}
    >
      <label>
        {t('connect.phone')}
        <input type="tel" required value={phone} placeholder="+41…" onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label>
        {t('connect.name')}
        <input type="text" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="submit" disabled={!phone.trim() || !name.trim()}>
        {t('connect.next')}
      </button>
    </form>
  );
}
