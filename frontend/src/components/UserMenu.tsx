import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

// Your own name in the nav: opens a small menu (Settings / Log out). The menu
// is position: fixed from the button's on-screen spot, because the mobile
// nav bar scrolls horizontally and would clip an absolutely placed dropdown.
export function UserMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Closes on navigation, outside click, Escape, and scroll/resize (the
  // fixed position would otherwise drift away from the button).
  useEffect(() => setAnchor(null), [pathname]);
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [anchor]);

  if (!user) return null;

  const toggle = () => setAnchor((cur) => (cur ? null : (buttonRef.current?.getBoundingClientRect() ?? null)));

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="user-name"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={toggle}
      >
        {user.firstName}
      </button>
      {anchor && (
        <div
          ref={menuRef}
          className="user-menu"
          role="menu"
          style={{ top: anchor.bottom + 6, right: window.innerWidth - anchor.right }}
        >
          <Link to="/settings" role="menuitem">
            {t('nav.settings')}
          </Link>
          <button type="button" role="menuitem" onClick={logout}>
            {t('nav.logout')}
          </button>
        </div>
      )}
    </>
  );
}
