import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function ProtectedRoute() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) return <p className="page-loading">Chargement…</p>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.userType === 'ONLY_SMS') return <Navigate to="/a" replace />;

  return <Outlet />;
}
