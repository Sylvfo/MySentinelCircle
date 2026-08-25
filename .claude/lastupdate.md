# Last update

**Date**: 2026-08-24
**Branch**: `auth-and-user`

## Done this session

Closed out the 5-slice plan for changing an *existing* email/password/phone (saved at `/home/syl/.claude/plans/on-continue-la-r-flexion-fluffy-candy.md`) — all 5 tranches now implemented, backend + frontend:

- **Tranche A — change password**: `POST /user/me/change-password`, frontend form in a `Modal`. Done in an earlier part of this session.
- **Tranche B — `Modal` component**: `frontend/src/components/Modal.tsx`, reused by all the flows below. Done earlier.
- **Tranche C — generic "step-up" identity re-verification**: answers "what if I lost my phone" — prove it's still you via *any* credential the account already has (password, Google re-auth, or a code to whichever channel — phone or email — is still accessible), not the specific one being changed. Backend: `stepUpVerifiedAt` on `User` (10-min TTL), 4 endpoints (`me/step-up/password`, `/google`, `/code/request`, `/code/verify`). Frontend: new `frontend/src/components/StepUp.tsx` (`StepUpPanel`), picks the available method from `me.hasPassword`/`hasGoogle`/verified phone/email.
- **Tranche D — change email**: fresh step-up required, then a confirmation link sent to the *new* address (`pendingEmail`/`pendingEmailTokenHash`/`pendingEmailExpiresAt` on `User`, 60-min TTL) — email only changes once clicked. New public route `POST /user/confirm-email` (separate `EmailConfirmationController`, no guard — same reasoning as password-reset). Frontend: `ChangeEmailFlow` in `SettingsPage.tsx` + new public page `frontend/src/pages/ConfirmEmailChangePage.tsx` at route `/confirm-email?token=...`.
- **Tranche E — change an already-set phone**: no new backend route — `requestAddPhone` now calls `assertStepUpFresh` when the caller already has a phone (skipped for a first-time add on an `UNCOMPLETE` account, since there's no "old" channel to prove there). Frontend: `ChangePhoneFlow` (step-up, then reuses the existing `AddPhonePanel`), triggered by a new "change phone" button next to the phone display in `SettingsPage.tsx`.
- **Schema migration** `20260824181400_add_stepup_and_pending_email` — written by hand (not via `prisma migrate dev`, which fails non-interactively on the unique-constraint prompt for `pendingEmailTokenHash`) and applied via `migrate deploy`; confirmed already applied to both `mysentinelcircle_test` and the dev DB.
- **`api/user.ts`**: `Me.hasGoogle` added, plus `stepUpPassword`/`stepUpGoogle`/`stepUpCodeRequest`/`stepUpCodeVerify`/`requestEmailChange`/`confirmEmailChange`.
- **i18n**: `settings.changePhone`, `settings.changeEmail.*`, `settings.stepUp.*` added to both `en.json`/`fr.json`.

**Fixed a real bug surfaced by a fresh e2e run** (not a regression from this session's work): `test/helpers/test-data.ts`'s `testPhone()` generated `+336XXXXXXXX` from a timestamp, and some digit combinations aren't in an actually-allocated French mobile block — `class-validator`'s `@IsPhoneNumber()` checks real allocation data (`libphonenumber-js/max`), so these "valid-looking" numbers were rejected. Since tests run back-to-back, nearby timestamps landed in the same invalid block, causing a correlated wave of failures across `auth.e2e-spec.ts`/`user.e2e-spec.ts`. Fixed: `testPhone()` now generates a random suffix and retries until it passes the same validator the app uses. Also fixed a real (separate, already-known) regression: `auth.e2e-spec.ts` still called the removed `GET /auth/me` — updated to `GET /user/me`.

**Verified**: 73 backend unit tests + 10 e2e tests all green (`npm run test`, `npm run test:e2e`). Frontend `tsc --noEmit` and `npm run lint` both clean. Partial manual curl smoke-test of the new endpoints against the Docker dev stack (signup → step-up via password → email-change request) confirmed working up to the point of an unrelated tool interruption; **not yet clicked through in an actual browser** — no browser tool was available this session, so the modals/flows in `SettingsPage.tsx` haven't been visually confirmed end-to-end. Also had to restart the Docker `backend` container mid-session for the usual `nest --watch` `EADDRINUSE` hot-reload crash.

## Left to do / not yet addressed

- **Browser smoke test of tranches C/D/E frontend** — step-up panel (all 4 methods), change-email flow incl. the `/confirm-email` link, change-phone flow. Not yet done, should happen before considering this fully closed.
- **Sentinel-gating** (`userType === ACCOUNT`/phone required before Sentinel actions) — still just documented intent in `plan.txt`, no code guard.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`, not fixed.
- Real SMS/email provider — still console-only stubs.
- `alert`/`organization`/`messaging` backend modules — still empty skeletons.
- GitHub issues (#11/#14/#15/#24/#25/#26) not closed/commented — Claude can't write to GitHub issues (`deny`-locked), Sylvie would need to do it herself if she considers any of them done.
- `npm audit`: 3 high-severity transitive vulnerabilities via `prisma`/`deepmerge-ts`, fix would downgrade `prisma` to 6.12.0 (breaking) — flagged, not touched.

## Git — uncommitted at the time of this pause

- Modified: `.claude/settings.json`, `backend/prisma/schema.prisma`, `backend/src/user/user.controller.ts`/`user.module.ts`/`user.service.ts`/`user.service.spec.ts`, `backend/test/auth.e2e-spec.ts`/`helpers/test-data.ts`/`user.e2e-spec.ts`, `frontend/src/App.tsx`, `frontend/src/api/user.ts`, `frontend/src/i18n/locales/{en,fr}.json`, `frontend/src/pages/SettingsPage.tsx`.
- New/untracked: `backend/prisma/migrations/20260824181400_add_stepup_and_pending_email/`, `backend/src/user/dto/{change-email-request,change-password,confirm-email-change,step-up-code-request,step-up-code-verify,step-up-google,step-up-password}.dto.ts`, `backend/src/user/email-confirmation.controller.ts`, `frontend/src/components/{Modal,StepUp}.tsx`, `frontend/src/pages/ConfirmEmailChangePage.tsx`.

Not committed/pushed — ask Sylvie before doing either.
