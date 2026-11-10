import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { labLoginAs } from '../../api/lab';
import { errorText, setToken } from '../../api/client';

// Inside a test phone (iframe "lab-…"): signs in as its demo account, then
// opens the app as usual.
export function LabFramePage() {
  const [params] = useSearchParams();
  const phone = params.get('phone') ?? '';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    labLoginAs(phone)
      .then(({ accessToken }) => {
        setToken(accessToken);
        window.location.replace('/dashboard');
      })
      .catch((err) => setError(errorText(err)));
  }, [phone]);

  return <p className="page-loading">{error ?? '…'}</p>;
}
