# TEST.md

Updated: 2026-08-24 15:06

## When tests run

| When | Command | What |
|---|---|---|
| While coding, manually | `npm run test` (in `backend/`) | Unit only, Prisma mocked, no DB touched |
| Before pushing, manually | `npm run test:e2e` (in `backend/`) | Resets + migrates `mysentinelcircle_test`, runs the e2e specs — never touches the dev DB |
| On every push/PR to `main`/`dev` | CI — `.github/workflows/backend-ci.yml` | `npm run lint` + `npm run test` + `npm run test:e2e`, against an ephemeral MariaDB DB created by GitHub Actions |
| Proposed, not yet enabled | Local Claude Code hook | Would rerun `npm run test` after Claude edits a file under `backend/src/**` — paste it yourself into `.claude/settings.json` (locked) if you want to enable it |

## Current test list

### Unit — `backend/src/**/*.spec.ts` (28 tests)

- **`app.controller.spec.ts`** (1 test) — checks `GET /` responds `"Hello World!"`.
- **`auth/auth.service.spec.ts`** (27 tests, `PrismaService`/`JwtService`/`ConfigService`/`OTP_SENDER`/`EMAIL_SENDER` mocked):
  - **`claimOrCreateByPhone`** (via `signupPhone`, 3 tests) — creates when no row exists, claims/upgrades an `ONLY_SMS` stub (same `id` kept), rejects 409 if already a real account.
  - **`signupGoogle`** (1 test) — rejects 409 when the Google email is already used by another account.
  - **`signupEmail`** (2 tests) — rejects 409 if the email is already taken; success (creates account + sends OTP).
  - **`loginEmail`** (5 tests) — rejects when no account, no `passwordHash` (Google/phone-only account), wrong password, unverified phone; success (returns an `accessToken`).
  - **`loginGoogle`** (4 tests) — rejects on invalid Google token, no linked account, unverified phone; success (returns an `accessToken`).
  - **`verifyOtp`** (6 tests) — rejects when no pending OTP, too many attempts (≥5), expired code, wrong code (asserts the `otpAttempts` increment); succeeds on first verification (`phoneVerifiedAt` set) and succeeds when already verified (`phoneVerifiedAt` not overwritten).
  - **`requestPasswordReset`** (3 tests) — sends the email when the account has a `passwordHash`; does nothing (but returns the same generic message) when no account exists or the account has no `passwordHash`.
  - **`confirmPasswordReset`** (3 tests) — rejects when no account matches the token, when the token expired; success (password updated, token cleared).

### E2e — `backend/test/**/*.e2e-spec.ts` (5 tests)

- **`app.e2e-spec.ts`** (1 test) — boots a real Nest instance (`AppModule`) against `mysentinelcircle_test`, checks `GET /` → 200 `"Hello World!"`.
- **`auth.e2e-spec.ts`** (4 tests, `OTP_SENDER`/`EMAIL_SENDER` intercepted via `overrideProvider` to capture the real code/link instead of parsing console output):
  - Phone signup → OTP verification → phone+OTP login again, end to end over real HTTP requests.
  - Rejects a second signup on an already-claimed phone with 409.
  - Email signup → OTP verification → login with the password.
  - Full password reset (request → confirm → login with the new password; the old password no longer works afterwards).

## Where to see results

- **Locally**: directly in the terminal (output of `npm run test` / `npm run test:e2e`).
- **In CI**: GitHub repo's **Actions** tab → **backend-ci** workflow → **test** job, one run per push/PR to `main`/`dev`.

## Tests still to write

- **`loginGoogle`/`signupGoogle` in e2e** — not covered (would need a real Google token, not easily simulated in e2e; the branching logic is already covered at the unit level via a mocked `verifyGoogleIdToken`).
- **`sentinel` module** (circles/memberships) — next priority once there's code to test (rules like "at least one Lead Sentinel per 1st circle", "one active `LinkSentinels` per pair").
- **`alert` / `organization` / `messaging`** — still empty skeletons, nothing to test until there's code.

`auth` coverage is now complete on both fronts: unit (the 6 previously-missing methods — `signupEmail`, `loginEmail`, `loginGoogle`, `verifyOtp`, `requestPasswordReset`, `confirmPasswordReset` — are all covered) and e2e (phone+OTP, email+password, and password-reset flows, end to end).

## Test infra (reference)

- Test DB: `mysentinelcircle_test`, created once via `bash backend/scripts/create-test-db.sh` (or `make db-test-init`) — uses root credentials, never rerun automatically.
- Local config: `backend/.env.test` (gitignored) — create it from `backend/.env.test.example`.
- `npm run test:e2e` first checks that `DATABASE_URL` points at `mysentinelcircle_test` (refuses otherwise), then resets the schema (`prisma migrate reset --force`) before running the specs.
- Each test must create its own data (unique phone/email via `backend/test/helpers/test-data.ts`) — no shared fixtures.
