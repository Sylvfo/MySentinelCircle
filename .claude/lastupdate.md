# Last update

**Date**: 2026-08-24
**Branch**: `auth-and-user` — Sylvie plans to create a new branch for `user` module work next session.

## Done this session

Long session, closing out the `auth` module end to end:

- **Testing infrastructure built from scratch**: isolated `mysentinelcircle_test` DB (`backend/scripts/create-test-db.sh`), Jest `globalSetup`/`globalTeardown` that safety-checks `DATABASE_URL` before running `prisma migrate reset`, `npm run test:e2e` now a single safe command, CI (`.github/workflows/backend-ci.yml`), `TEST.md` docs, new `/docu test` target added to `docu/SKILL.md`. Triggered by a real incident: an earlier manual `curl` test had reset the real dev account's password.
- **`auth.service.spec.ts` brought to full coverage** (36 tests): every branch of `signupEmail`, `loginEmail`, `loginGoogle`, `verifyOtp`, `requestPasswordReset`, `confirmPasswordReset`, `linkGoogle`, plus the pre-existing `claimOrCreateByPhone`/`signupGoogle` cases. `auth.e2e-spec.ts` covers phone+OTP, email+password, password-reset, and no-phone signup flows end to end (6 e2e tests total).
- **All docs regenerated** (`/docu all`): `API.md`, `backend/prisma/DB_schema.md`, `STACK_SCHEMA.md`, `FEATURES.md` (new GitHub issues #24/#25/#26 surfaced and added, #6/#15 found closed).
- **`FRONTEND_URL`, rate limiting (`@nestjs/throttler`), Swagger** (`@nestjs/swagger`, dev-only at `/docs`) — all implemented and verified.
- **Google Sign-In** — full flow both sides: `GoogleSignInButton` component (Google Identity Services, no client library), `signupGoogle`/`loginGoogle` wired on Login/Signup pages, plus a **link-existing-account flow**: signup-with-Google on an email that already has a password account redirects to `/login` with the pending Google credential in React Router state, auto-links via the new `POST /auth/link/google` (JWT-protected) after a successful password login.
- **Forgot/reset password**, frontend: new `ForgotPasswordPage`/`ResetPasswordPage`, wired to the already-existing backend endpoints.
- **Signup redesigned as 2 steps** for email+password and Google (phone-only signup untouched): step 1 is just the credential, step 2 asks firstName (mandatory), lastName (optional, addable later), username (**mandatory**, auto-suggested/editable, visible to other users), phone (**optional**, addable later, never shown to other users, no Sentinel access without it). An account created with no phone gets `userType: UNCOMPLETE` (new enum value, migration `20260824143321_add_uncomplete_usertype` — schema edited by Sylvie herself, migration run with her confirmation) instead of `ACCOUNT`, and logs in with no OTP step (nothing to verify) — required fixing `assertPhoneVerified` to only block login when a phone exists but isn't verified, not when there's no phone at all.
- **`plan.txt`** updated repeatedly: Auth section rewritten for phone-only accounts, then again for the optional-phone/mandatory-username decision (`UNCOMPLETE`, Sentinel-gating not yet enforced in code — documented as intent only); new **DEV-ONLY STUBS** section noting email/SMS sending only log to console, no real provider wired; race-condition note for `claimOrCreateByPhone`.
- `.claude/settings.json`'s `//`-comment JSON issue — fixed by Sylvie directly.
- `CLAUDE.md` now imports `etiquette.md` (Sylvie added the line) so her standing preferences load automatically every session, not just via Claude's own memory.
- `GOOGLE_CLIENT_ID` created and verified working (backend boots clean with it).

## Left to do / not yet addressed

- **`user` module** (`backend/src/user/`) — still a completely empty skeleton, no routes at all. Sylvie wants to start this next, **on a new branch**. First concrete need identified: an endpoint to let an `UNCOMPLETE` account add its phone later (promoting it to `ACCOUNT`) — nothing exists for this yet, not even a plan.
- No real account-settings page on the frontend at all (edit firstName/lastName/username/email, view/add phone).
- **Sentinel-gating** (`userType === ACCOUNT` / phone required before Sentinel actions) — explicitly not enforced in code, just documented in `plan.txt`. Will matter once `user` and `sentinel` both get built out.
- Phone-only account recovery gap (lost phone, no other credential) — still open, undesigned, noted in `plan.txt`.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`, not fixed.
- Real SMS/email provider — still console-only stubs, documented in `plan.txt`'s new DEV-ONLY STUBS section.
- `alert`/`organization`/`messaging` backend modules — still empty skeletons.
- GitHub issues #11/#14/#15/#25/#26 etc. not closed/commented to reflect this session's work — Claude cannot write to GitHub issues (`deny`-locked), Sylvie would need to do it herself.
- Google Sign-In's account-linking flow was implemented but Sylvie hit an unexplained failure partway through debugging it live (redirect + message worked, but the link itself didn't take — root cause not found, she moved on rather than keep debugging). Worth revisiting if it comes up again.

## Git — uncommitted at the time of this pause

- Modified: `.claude/*` (several skills, `lastupdate.md`, `preferencesSyl/etiquette.md`), `backend/prisma/schema.prisma`, `backend/src/auth/auth.service.ts`, `backend/src/auth/auth.service.spec.ts`, `backend/src/auth/dto/signup-email.dto.ts`, `backend/src/auth/dto/signup-google.dto.ts`, `backend/test/auth.e2e-spec.ts`, `backend/test/helpers/test-data.ts`, `frontend/src/api/auth.ts`, `frontend/src/pages/SignupPage.tsx`, `frontend/src/i18n/locales/{en,fr}.json`, `plan.txt`.
- New/untracked: `.github/`, `backend/prisma/migrations/20260824143321_add_uncomplete_usertype/`.
- Note: a fair amount of earlier-session work (test infra, Google Sign-In wiring, forgot/reset password pages, doc regen) was already committed by Sylvie herself mid-session — `git log` is the source of truth for what actually landed, this file only tracks what's pending right now.

Not committed/pushed — ask Sylvie before doing either.
