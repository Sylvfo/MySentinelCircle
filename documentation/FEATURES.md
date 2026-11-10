# Features

Updated: 2026-11-11 01:05

## Project phases

The project as a whole moves through these macro phases, in order — the database is treated as the immutable foundation everything else builds on top of, not something casually reopened:

1. Plan
2. Database (build on top of it, don't modify once set)
3. Backend, with a light frontend alongside
4. Build out the modules and API routes
5. Security
6. Work on the frontend
7. Security (pass again, frontend-side)

## Product features

| Feature | State | Code evidence | Issues (traceability only) |
|---|---|---|---|
| Authentication | 🟣 testing | `backend/src/auth` (869 lines) + `auth.service.spec.ts` (47 tests) + `login-log.service.spec.ts` (3) + `auth.e2e-spec.ts` (9) — phone/email + password, SMS code, Google, lockout, login history, sign out everywhere | #13, #31 (open); #11, #14, #15, #47, #50 (closed) |
| User | 🟣 testing | `backend/src/user` (1857 lines) + `user.service.spec.ts` (69), `account-deletion.service.spec.ts` (14), `pause.service.spec.ts` (6) + `user.e2e-spec.ts` (8) — profile, language/time zone, step-up, plan and subscription, pause, account deletion, death notice | #31 (open); #26, #29, #48 (closed) |
| Sentinel / Circles | 🟣 testing | `backend/src/sentinel` (3746 lines) + `sentinel.service.spec.ts` (103), `sms-inbound.service.spec.ts` (28), `phone-recovery.service.spec.ts` (21), `connect.service.spec.ts` (7), `security-score.spec.ts` (13) + `sentinel.e2e-spec.ts` (20) — circles, links, groups, QR code connect, lost-phone recovery, death notices, inbound SMS with reply codes | #49 (open); #12 (closed) |
| Organizations | 🔵 todo | `backend/src/organization` — 17-line skeleton | #10 (open, no label) |
| Alert | 🟣 testing | `backend/src/alert` (2620 lines) + `alert.service.spec.ts` (118), `alert-replies.spec.ts` (24) + `alert.e2e-spec.ts` (33) — raise/close, lead claim/leave, outer-circle questions in batches (SMS reply codes or in-app), isolated chat with the 1st circle, status/label/location, requalifying a watch-opened alert, the raiser takes part in it | #18 (closed) |
| Messaging | 🟣 testing | `backend/src/messaging` (632 lines) + `messaging.service.spec.ts` (32) + `messaging.e2e-spec.ts` (11) — direct channel between linked people, alert chats (contact details filtered), text + image, feedback thread, `message:new` push | #19 (closed) |
| Notifications | 🟣 testing | `backend/src/notification` (240 lines) + `notification.service.spec.ts` (9) — persisted inbox, unread counts, `notification:new` push, console `PushSender` stub; frontend bell | #7 (closed) |
| Watch Mode (trip, All Good Check) | 🟣 testing | `backend/src/watch` (2663 lines) + 5 specs (72 tests: `watch.service`, `watch.scheduler`, `travel-circles.service`, `watch-views.service`, `check-in-schedule`) + `test/watch.e2e-spec.ts` (3 scenarios, not run yet) — trips with steps and an All Good Check on a rhythm, per-minute scheduler (reminder, then a linked alert), OK / 311 / 321 by SMS, travel circles and end-of-trip choices, what others may see, history; frontend `pages/watch/` | none — no GitHub issue tracks it |
| Test lab (remote testers) | 🟠 constructing | `backend/src/lab` (445 lines), no spec — four phones per tester, SMS copies (`LabSms`), advance time, reset, feedback with screenshot (`LabFeedback`, Admin page); frontend `pages/lab/`. Dev only (`ALLOW_DEV_ROUTES`) | none — no GitHub issue tracks it |
| Admin & privacy | 🟣 testing | `backend/src/admin` (233 lines, no unit spec — only its guard, in `security.e2e-spec.ts`), `backend/src/privacy` (250 lines) + `retention.service.spec.ts` (10), `backend/src/support` (60 lines) + `support.service.spec.ts` (4) — anonymous stats, retention purges, feedback inbox | none |
| Internationalization (i18n) | 🟠 constructing | cross-cutting (frontend `i18n/locales`), no single backend module to evaluate — carried over | #16 (open, no label) |
| Infrastructure & Architecture | 🟢 locked | hand-set by Sylvie, not code-derived (see Legend) | #8, #9 — both closed (stack decisions + MariaDB/Docker/nginx/HTTPS all working end-to-end) |

**A feature's state is derived from the actual code** (skeleton → `todo`/`backlog`, real implementation → `constructing`, implementation + a meaningful test spec → `testing`), per the `docu` skill's `features` target — not from the GitHub issue label, which drifts. `locked`/`prod` stay a manual call only Sylvie makes. The Issues column is kept for traceability (what's tracked, open vs closed) — it no longer drives the State column.

## Tooling / process (not product features)

Issues about how we work with Claude and keep the project's own documentation in shape, not about the product itself:

- #3 Setup Claude in project (closed)
- #4 Set up Claude loop, hooks, verification skills
- #5 Update plan (`state:todo`)
- #6 Schémas (documentation upkeep) (closed)
- #17 Divers (misc open points from `plan.txt`)
- #20 Procedure plan (closed)
- #24 sms-like-programm (NoSMSNow dev tool — built and tested; now closed)
- #25 Testings — this session's whole test-infra + auth-coverage work (isolated `mysentinelcircle_test` DB, unit + e2e specs, CI) lived under this issue; now closed on GitHub.

> **Methodology change (2026-10-21)**: starting this sync, feature state is derived from the code (per module, under `backend/src/`), not from the GitHub issue label — see the `docu` skill's `features` target. The label-derived history up to the 2026-09-09 sync is superseded.
>
> **2026-11-11 sync** (all rows re-derived from the code on branch `travel_mode_auto_check`): Watch Mode, the test lab and admin/privacy have no GitHub issue — Sylvie may want to open some for traceability. New issues placed: #47 (forgot password) and #50 (Google login, new email) under Authentication, #48 (delete account) under User, #49 (allow sending a mobile phone — open; the schema has `LinkSentinels.canSendPhone` but nothing reads it yet) under Sentinel. #7 (Notifications) and #29 (delete user) are now closed, matching the code.
>
> **No label/code mismatches needing a relabel**: the closed issues still carrying `state:*` labels (#3, #6, #8, #11, #12, #14, #15) are closed, so their labels no longer matter; #5 (`state:todo`) is a process issue.
>
> **Issues column also carries forward from the previous sync**: #29 ("delete user") was open but untracked in this file before 2026-09-09 — now under User. #31 ("auth/user to do later") spans both Authentication and User.

## Legend

| Label | Color | Meaning |
|---|---|---|
| `state:backlog` | ⚪  | Worth doing eventually, not a priority right now. |
| `state:todo` | 🔵 | Planned, not started yet. |
| `state:planning` | 🟡 | Need/scope being framed (PRD, alignment with `plan.txt`), or being broken into testable slices. |
| `state:constructing` | 🟠  | Actively being coded. |
| `state:testing` | 🟣  | Code exists, being tested and secured. |
| `state:locked` | 🟢 | Tested and secured — only touch this module after asking Sylvie first, even in an otherwise permissive session. |
| `state:prod` | 🟢  | Live in production. |

