import { useTranslation } from 'react-i18next';

// Elle / Il / Neutre, or nothing (inclusive wording). '' = not set.
export function GenderSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const { t } = useTranslation();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('gender.options.none')}</option>
      <option value="FEMALE">{t('gender.options.FEMALE')}</option>
      <option value="MALE">{t('gender.options.MALE')}</option>
      <option value="NEUTRAL">{t('gender.options.NEUTRAL')}</option>
    </select>
  );
}
