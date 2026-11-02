import type { ReactNode } from 'react';

// Reusable card: formalizes the repeated .panel + title + row-actions
// pattern already used across pages into one component.
export function Tile({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`tile${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <div className="tile-header">
          {title && (typeof title === 'string' ? <h2>{title}</h2> : title)}
          {actions && <div className="tile-actions">{actions}</div>}
        </div>
      )}
      <div className="tile-body">{children}</div>
    </section>
  );
}
