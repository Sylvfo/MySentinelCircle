import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { clearToken, getToken, setToken } from '../api/client';
import { fetchMe, type Me } from '../api/user';
import { createSocket } from '../realtime/socket';

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  isAuthenticated: boolean;
  socket: Socket | null;
  applyToken: (token: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  // One socket for the whole logged-in session, independent of route —
  // reconnects only on an actual login/logout transition (keyed on the
  // user's id), not on every profile refetch. The cleanup below runs on
  // every such transition (and on unmount), so it's the single place
  // that tears the connection down.
  useEffect(() => {
    if (!user) return;
    const token = getToken();
    if (!token) return;

    const s = createSocket(token);
    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const refreshUser = async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      const me = await fetchMe();
      setUser(me);
    } catch {
      clearToken();
      setUser(null);
    }
  };

  useEffect(() => {
    void refreshUser().finally(() => setLoading(false));
  }, []);

  const applyToken = async (token: string) => {
    setToken(token);
    await refreshUser();
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated: !!user, socket, applyToken, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
