import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Web links in a written text become clickable. A shared position's map
// link (Google Maps; OpenStreetMap on a few test alerts) becomes a big
// "See on the map" button, easy to tap on a phone, that lets each person
// pick their own maps app.
const MAP_LINK =
  /^https:\/\/(?:www\.openstreetmap\.org\/\?mlat=(-?[\d.]+)&mlon=(-?[\d.]+)|www\.google\.com\/maps(?:\/search\/\?api=1&query=|\?q=)(-?[\d.]+),(-?[\d.]+))/;

export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https:\/\/\S+)/g).map((part, i) => {
        if (!part.startsWith('https://')) return part;
        const m = MAP_LINK.exec(part);
        if (m) return <MapChoice key={i} lat={m[1] ?? m[3]} lng={m[2] ?? m[4]} />;
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        );
      })}
    </>
  );
}

// Official "open this place" links of each maps service: on a phone they
// open the app if it's installed, else the website — none needs a login.
export function MapChoice({ lat, lng }: { lat: string; lng: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const choices = [
    { key: 'google', href: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` },
    { key: 'apple', href: `https://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}` },
    { key: 'osm', href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` },
  ];
  const copy = () => {
    void navigator.clipboard
      ?.writeText(`${lat}, ${lng}`)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };
  return (
    <span className="map-choice">
      <button type="button" className="map-link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        📍 {t('alerts.location.openMap')}
      </button>
      {open && (
        <span className="map-choice-list">
          {choices.map((c) => (
            <a key={c.key} href={c.href} target="_blank" rel="noopener noreferrer">
              {t(`alerts.location.maps.${c.key}`)}
            </a>
          ))}
          <button type="button" onClick={copy}>
            {copied ? `✓ ${t('alerts.location.copied')}` : t('alerts.location.copy')}
          </button>
        </span>
      )}
    </span>
  );
}
