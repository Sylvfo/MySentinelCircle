# Last update

**Date**: 2026-11-11 00:23
**Branch**: `travel_mode_auto_check`. Last commit `a44ffe1` (Watch Mode backend). Everything since
is **uncommitted** (≈89 files: watch frontend, QR connect, SMS reply codes, test lab, raiser fix).
Never commit or push yourself — commit message as text only, when asked.

## Done this session

- **Watch Mode (Voyage + Check tout va bien)**: schema part 2 + migration `watch_mode`, plan
  slices 2–8. Backend `src/watch/` (trips, All Good, scheduler, travel circles, views), shared
  filters `common/running-alert.ts`. Frontend `pages/watch/*`, `components/watch/*`, many UX rounds
  (gold star + subscription popup for paid features, no helper notes).
- **QR code "add someone"** (`User.connectCode`, migration `connect_code`): `sentinel/connect/*`,
  `pages/connect/*`, scan with `jsqr`, draw with `qrcode-generator`. Menu: Code QR, Paramètres,
  (Admin), Langue, Mode nuit, Déconnexion.
- **SMS reply codes** (migration `sms_reply_codes`): `<category><slot><choice>` — 111/112
  invitation, 211/212/213 alert question ("21 texte" free answer), 311 trip / 321 All Good.
  `src/sms/sms-reply-code.ts`. SMS stay plain ASCII ≤160 chars.
- **Test lab** `/lab` (migration `test_lab`, only with `ALLOW_DEV_ROUTES=true`): one or four phone
  frames, SMS screen under each, "advance time", reset (closes running alerts only), feedback with
  screenshot → Admin page. Sets per tester in `src/lab/lab.service.ts` (`LAB_SETS`); seed
  `seedLabTesters` (Zaza = mom, Wiwil = dad, never linked; password `TestPass1234!`).
  Fixed "not signed in every other refresh": lab routes `@SkipThrottle()`, one poll
  `GET /user/lab/sms/all` every 3 s, login form only on 401.
- **Raiser of an alert about someone else** (Sylvie's call, 2026-11-11): becomes an
  `AlertParticipant` of their own circle (CONTACTED) → sees it in their alerts and history
  (`AlertService.addRaiserAsParticipant`). Not in the 1st-circle room; isolated chat if allowed.
- Docs updated: `plan.txt`, `documentation/API.md`, `FEATURES.md`, `backend/prisma/DB_schema.md`.
- Unit specs pass (alert 118/118 after the last change); frontend lint + build clean.

## Next steps (in order)

1. Sylvie: commit this branch's work (ask Claude for the message).
2. **Tunnel for the parents' remote test** (~45–60 min): Cloudflare account + domain, named tunnel
   + Cloudflare Access (email PIN), open only during tests, through nginx. Claude's side: vite
   `allowedHosts`, `trust proxy` / `CF-Connecting-IP` so the rate limit isn't shared by every
   tester. Don't use the quick anonymous tunnel.
3. Run e2e (needs Sylvie's fresh explicit consent — resets the test DB): `test/watch.e2e-spec.ts`
   never run; reply codes and lab never run in e2e either.
4. Front, planned "for tomorrow": connections map (artifact), folds for long pages, toggle style
   (switch vs pills), All Good single 1st-circle checkbox (asked, unanswered), remove notes on the
   other watch pages, companion trip view page, Google Maps button idea.
5. Not written yet: lab module unit specs; `/docu stack` and `/docu test` (STACK_SCHEMA.md,
   TEST.md) for watch/connect/lab.
6. Still pending: guided browser test (lost phone, contact-details toggle, English SMS, step-up /
   change email / change phone).
7. Later: item 7 desktop mode (mockup https://claude.ai/artifact/98JZnhQqSmYqA3MtDoT5Qf).

## Known gaps

- Phone recovery shares the OTP fields with step-up (edge case, accepted).
- Contact-details filter is a regex heuristic: spelled-out numbers get through.
- Inbound SMS webhook (now also reply codes and Watch Mode "OK") still unsigned.
- Lab time offset ("advance") is in memory: lost on a backend restart.

## Left to do / not yet addressed (carried over)

- **Dashboard's "Raise Alert" tile content** — waiting on Sylvie's clarification.
- **`MessagingMode.GROUP`** — still behaves like `INDIVIDUAL`, not exposed in the UI.
- **The 0–10 availability-reply scale** — not started.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`.
- Real SMS/email provider — console-only stubs; inbound SMS webhook needs signature verification
  first (main security hole, deferred).
- `organization` backend module — empty skeleton (out of MVP scope).
- `MessageType.SYSTEM` — unused (could carry Watch Mode posts in alert rooms).
- `npm audit`: backend's remaining 13 — judged not worth it.
- Before real users: see `deployment_plan.txt` (providers, legal texts, CSP/HSTS, TLS, backups,
  `NODE_ENV`, `ALLOW_DEV_ROUTES`, `ADMIN_EMAILS`, `/health` monitoring, data protection).
