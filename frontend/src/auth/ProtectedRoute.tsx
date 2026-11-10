import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { TermsGate } from '../components/TermsGate';
import { rememberAfterLogin } from './afterLogin';

export function ProtectedRoute() {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <p className="page-loading">Chargement…</p>;
  if (!isAuthenticated) {
    // A scanned QR link: back to it once signed in (AppShell).
    if (location.pathname.startsWith('/connect/')) rememberAfterLogin(location.pathname);
    return <Navigate to="/login" replace />;
  }
  if (user?.userType === 'ONLY_SMS') return <Navigate to="/a" replace />;

  return (
    <TermsGate>
      <Outlet />
    </TermsGate>
  );
}
