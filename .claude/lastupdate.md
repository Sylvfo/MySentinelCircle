# Last update

**Date**: 2026-11-09
**Branch**: `check_front` (all work below is **uncommitted**)

## Done this session

Earlier parts (frontend/backend simplification, 191-char VARCHAR fix, security review, CSP note in
`deployment_plan.txt`, sign-in journal / sign out everywhere / admin page / `/health` / request
logs) are **committed** (`70464f5`, `0a992e7`).

Then started the MVP plan (`/home/syl/.claude/plans/eager-roaming-fox.md`, items 1–8, Sylvie said
"fais 1 à 6"; 7 = desktop mode and 8 = travel mode are for later):

- **Item 2 — freeze after a death**: done. `assertNotDeceased` on the companion in
  `getOwnedLink`, `getMyActiveLinkAsSentinel`, `respondToCircleMove` (`sentinel.service.ts`),
  which covers update/remove/block/leave/move. Specs added.
- **Item 3 — free MVP**: done then **reverted at Sylvie's request**. Paid plans stay as they
  were; she tests with the dev "compte payant" checkbox (`ALLOW_DEV_ROUTES`).
- **Schema** (applied + migrated by Sylvie: `20261109193821_language_contact_sharing_phone_recovery`):
  `User.language`, `User.alertContactSharing`, `User.phoneRecoveryRequestedAt`,
  `User.phoneRecoveryConfirmedById`.
- **Item 4 — SMS in the recipient's language**: done. `smsLang()` + an English branch for every
  builder in `sms/messages.ts` and `alert/alert-replies.ts` (French unchanged, plain ASCII).
  Callers pass the recipient's `language`; an SMS-only stub gets the inviter's language
  (`findOrCreateUserByPhone`). OTP sender takes a language. Front: `languageSync.ts` saves the
  app language on the account (mounted in `AppShell`). Spec: `sms/messages-en.spec.ts`.
- **Item 5 — contact details in alert chats**: done. `common/contact-details.ts`
  (`containsContactDetails`, 20-case spec). `messaging.service.ts` refuses phone numbers/emails in
  alert chats unless the sender is the companion or the companion turned on
  `alertContactSharing` (Settings → preferences toggle). Front maps the refusal in `ChatComposer`.
- **Item 6 — lost phone, vouched for by the 1st circle**: done.
  `sentinel/phone-recovery.service.ts` + controller + DTOs. Public
  `POST /auth/phone-recovery/request|verify`, signed-in
  `POST /sentinel/companions/:id/phone-recovery/confirm|reject`. Two different 1st-circle
  members confirm (at least one Lead), any one can refuse; then a code to the new number; verify
  changes the phone and signs out every device. Request lives 7 days; repeating the same request
  after approval resends a code; SMS login with the old number or adding a phone cancels it.
  `listCompanions` exposes `phoneRecovery` to the 1st circle. Front: `/recover-phone` page
  (`RecoverPhonePage.tsx`), link on `LoginPage`, "Téléphone perdu" block in `CompanionActions`,
  i18n fr/en. Spec: `phone-recovery.service.spec.ts` (21 tests). E2E (passing): new
  `describe('Lost phone …')` in `test/sentinel.e2e-spec.ts` (helper `acceptedFirstCircleLink`
  hoisted to the outer scope).

Backend: 564/564 unit tests, tsc + lint clean. Frontend: tsc, lint, build clean (only the old
`AuthContext` warning). E2E: 88/88 (incl. the 2 new lost-phone tests).

## Next steps (in order)

1. Commit (message already given to Sylvie, text only) — she commits herself.
2. Guided browser test with Sylvie: lost-phone flow, contact-details toggle + refusal in an alert
   chat, English SMS; and the older step-up / change email / change phone check.
   (GitHub issues: Sylvie said not needed.)
3. Later: **item 7** desktop mode (first add a "top menu" variant to the mockup
   https://claude.ai/artifact/98JZnhQqSmYqA3MtDoT5Qf so Sylvie can choose), **item 8** travel mode
   (framing session first).

## Known gaps in the new work

- Phone recovery shares the OTP fields with step-up: a step-up code sent during a pending recovery
  would make it look "approved". Edge case, accepted for now.
- The contact-details filter is a heuristic (regex): spelled-out numbers get through.

## Left to do / not yet addressed (carried over)

- **Dashboard's "Raise Alert" tile content** — waiting on Sylvie's clarification.
- **`MessagingMode.GROUP`** — still behaves like `INDIVIDUAL`, not exposed in the UI.
- **The 0–10 availability-reply scale** — not started.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`.
- Real SMS/email provider — console-only stubs; the inbound SMS webhook needs signature
  verification first (main security hole, deferred: "on verra tout sur les sms après").
- `organization` backend module — empty skeleton (out of MVP scope).
- `MessageType.SYSTEM` — unused.
- `npm audit`: backend's remaining 13 — judged not worth it.
- Before real users: see `deployment_plan.txt` (providers, legal texts, CSP/HSTS, TLS, backups,
  `NODE_ENV`, `ALLOW_DEV_ROUTES`, `ADMIN_EMAILS`, `/health` monitoring, data protection).

## Git

On `check_front`, ~46 changed/new files uncommitted (items 2, 4, 5, 6 + migration). Nothing pushed.
Never push; ask before committing (commit message = text only).
