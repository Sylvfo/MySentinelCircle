import { ConfigService } from '@nestjs/config';

// The admin accounts: the emails listed in ADMIN_EMAILS (backend/.env),
// separated by commas. No role in the database: whoever runs the server
// decides, and nobody can grant it from the app.
export function isAdminEmail(
  config: ConfigService,
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  const admins = (config.get<string>('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}
