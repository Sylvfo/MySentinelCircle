# Last update

**Date**: 2026-11-10
**Branch**: `check_front` (pushed, up to date with `origin/check_front`). Sylvie is about to open
a PR `check_front` → `dev`, then start a new branch for Watch Mode.

## Done this session

- **Watch Mode framed** (item 8 of the MVP plan, widened): two modes on one base — **Voyage**
  (itinerary of checkpoints) and **Check tout va bien** / All Good Check (regular self check-in).
  Every decision is in the plan **`/home/syl/.claude/plans/oui-on-peut-r-fl-chir-velvet-pinwheel.md`**
  (rewritten clean at the end of the session) — read it before coding.
- **Mockup validated**: https://claude.ai/artifact/EJdjTkdVEd3pAjtF6jPj6n (2 rows of phone
  screens: dashboard, raise alert + green tile, Mode veille, create trip, trip page, validate a
  step, All Good settings, companions, circles, person page; then opened travel alert, end of
  trip, SMS, history).
- **Schema, part 1** (Sylvie, in `schema.prisma`, committed in `aefa40d`, **not migrated**):
  `Alert.shareItineraryWithFirstCircle`, `Alert.shareValidationsWithFirstCircle`, `Alert.tripId`,
  model `TravelCheckpoint`.
- **"Vous" everywhere** (Sylvie's rule, saved in memory): 262 strings of `fr.json` converted
  (incl. imperatives, inclusive forms kept) + the email-change subject in `user.service.ts`.
  Frontend lint/build clean; backend `src/user` specs 88/88. Committed `aefa40d`.
- PR description for `check_front` → `dev` given to Sylvie (commits `2d498be` + `aefa40d`).

## Next steps (in order)

1. Sylvie: PR `check_front` → `dev`, new branch for Watch Mode.
2. Sylvie: add **schema part 2** (exact Prisma in the plan, "Schema" section: 3 `NotificationType`
   values, `User.timeZone`, `Circle.tripId`, `Alert.checkInSchedule`, `Alert.pausedUntil`,
   `TravelCheckpoint.validatedPlace`), then `npx prisma migrate dev --name watch_mode` and
   `docker restart mysentinelcircle-backend`.
3. Code, plan slice 2 first: shared "running alert" constant so a watch (`Alert` in `SENT`) never
   counts as a running alert. Then slices 3–8 (both modes together).
4. Still pending from last session: guided browser test (lost phone, contact-details toggle,
   English SMS, step-up / change email / change phone).
5. Later: item 7 desktop mode (mockup https://claude.ai/artifact/98JZnhQqSmYqA3MtDoT5Qf).

## Known gaps

- `schema.prisma` on `check_front` already holds the travel models without a migration: the PR
  carries a schema change that no migration creates yet (the next branch adds it).
- Phone recovery shares the OTP fields with step-up: a step-up code sent during a pending recovery
  would make it look "approved". Edge case, accepted for now.
- The contact-details filter is a heuristic (regex): spelled-out numbers get through.
- Watch Mode SMS replies ("OK") go through the inbound SMS webhook, still unsigned.

## Left to do / not yet addressed (carried over)

- **Dashboard's "Raise Alert" tile content** — waiting on Sylvie's clarification.
- **`MessagingMode.GROUP`** — still behaves like `INDIVIDUAL`, not exposed in the UI.
- **The 0–10 availability-reply scale** — not started.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`.
- Real SMS/email provider — console-only stubs; the inbound SMS webhook needs signature
  verification first (main security hole, deferred: "on verra tout sur les sms après").
- `organization` backend module — empty skeleton (out of MVP scope).
- `MessageType.SYSTEM` — unused (could carry Watch Mode posts in alert rooms).
- `npm audit`: backend's remaining 13 — judged not worth it.
- Before real users: see `deployment_plan.txt` (providers, legal texts, CSP/HSTS, TLS, backups,
  `NODE_ENV`, `ALLOW_DEV_ROUTES`, `ADMIN_EMAILS`, `/health` monitoring, data protection).

## Git

`check_front` pushed; only `.claude/lastupdate.md` changed since `aefa40d`.
Never push; ask before committing (commit message = text only).
