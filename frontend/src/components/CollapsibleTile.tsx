import type { ReactNode } from 'react';

// The standard 24×24 line icon at the left of a tile's header.
export function TileIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="about-tile-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// A section that opens on a tap: a header button (icon, title, chevron), and
// its body only while open. How many may be open at once is the page's
// choice (one at a time, or several).
export function CollapsibleTile({
  id,
  open,
  onToggle,
  icon,
  title,
  className,
  bodyClassName,
  children,
}: {
  // The body's id, for the header's aria-controls.
  id: string;
  open: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  // Inside the header's title span: the title, and any hint or badge.
  title: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={['about-tile', className, open ? 'open' : null].filter(Boolean).join(' ')}>
      <button type="button" className="about-tile-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {icon}
        <span className="about-tile-title">{title}</span>
        <svg className="about-tile-chevron" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      {open && (
        <div className={['about-tile-body', bodyClassName].filter(Boolean).join(' ')} id={id}>
          {children}
        </div>
      )}
    </section>
  );
}
