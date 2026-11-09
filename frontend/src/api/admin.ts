import { apiGet } from './client';

// The admin page's numbers (GET /user/admin/stats): counts only, nothing
// that points at one person.
export interface AdminStats {
  generatedAt: string;
  accounts: {
    total: number;
    incomplete: number;
    smsOnly: number;
    deleted: number;
    new7d: number;
    new30d: number;
    perWeek: { weekStart: string; count: number }[];
  };
  activity: { activeToday: number; active7d: number; active30d: number };
  alerts: { total: number; running: number; last30d: number };
  messages: { last30d: number };
  groups: { total: number };
  security: {
    logins24h: number;
    failures24h: number;
    lockedAccounts: number;
    targetedAccounts: number;
    suspiciousNetworks: { ipPrefix: string; failures: number }[];
  };
  server: { uptimeSeconds: number; version: string | null };
}

export const getAdminStats = () => apiGet<AdminStats>('/user/admin/stats');
