import { useTranslation } from 'react-i18next';

// Which circle, as a small pill in the circle's color, after "Théo is your
// Sentinel": "Lead", "1st circle", or the circle's own name.
export function CircleChip({
  relation,
  color,
}: {
  relation: { isLead: boolean; isFirstCircle: boolean; circle: string };
  color: string | null | undefined;
}) {
  const { t } = useTranslation();
  const label = relation.isLead
    ? t('conversation.chipLead')
    : relation.isFirstCircle
      ? t('conversation.chipFirstCircle')
      : relation.circle;
  if (!label) return null;
  return (
    <span className="circle-chip" style={{ borderColor: color ?? undefined, color: color ?? undefined }}>
      {label}
    </span>
  );
}
