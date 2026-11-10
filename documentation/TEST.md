# TEST.md

Updated: 2026-11-11 01:00

## When tests run

| When | Command | What |
|---|---|---|
| While coding, manually | `npm run test` (in `backend/`) | Unit only, Prisma mocked, no DB touched |
| Before pushing, manually | `npm run test:e2e` (in `backend/`) | Resets + migrates `mysentinelcircle_test`, runs the e2e specs in band — never touches the dev DB. The reset is destructive: Claude runs it only with Sylvie's fresh, explicit consent (see `CLAUDE.md`) |
| On every push to `main`/`dev`, and every pull request | CI — `.github/workflows/backend-ci.yml` | `npm run lint` + `npm run test` + `npm run test:e2e`, against an ephemeral MariaDB created by GitHub Actions |
| Not enabled | Local Claude Code hook | No test hook in `.claude/settings.json` — tests run when asked |

## Current test list

### Unit — `backend/src/**/*.spec.ts` (668 tests, all passing on 2026-11-11)

**Alert**
- **`alert/alert.service.spec.ts`** (118) — `raiseAlert` (22: position in the message and SMS, someone on the spot, a raiser from an outer circle becomes a participant of their own circle, paid alerts, pauses, Lead rules), `closeAlert` (7, closing word), `claimLead` (6), `leaveAlert` (6, a Lead can leave only after another claimed), `requestCircle` (12, batches, travel circles and travellers, reply codes), `askQuestion` (3), `answerQuestion` (3), `respond` (7), `remindStaleCircleBatches` (4), `getOrCreateCircleChat` (7), `getMyParticipation` (2), `updateStatus` (5), `updateLabel` (4), `updateType` (7, watch-opened alerts only), `updateLocation` (4), `getAlert` (8), `listMyAlerts` (1), `listOpenQuestionsByPhone` (1), pause rules (9).
- **`alert/alert-replies.spec.ts`** (24) — question texts by gender and language, reply options, free answers.

**Auth**
- **`auth/auth.service.spec.ts`** (47) — `requestOtp` (4, cooldown), `loginPhone` (7, lockout after five failures), `loginEmail` (6), `loginGoogle` (5), `signupEmail` (3), `signupGoogle` (3), `linkGoogle` (2), `verifyOtp` (7), password reset (6), sign-in journal (4).
- **`auth/login-log.service.spec.ts`** (3) — one `LoginEvent` per attempt, IP cut short.

**Sentinel**
- **`sentinel/sentinel.service.spec.ts`** (103) — circles (list, update, delete → reserve), invite (8) and request (4), `respondToMembership` (5), `updateMembership` (10), circle move consent (4), remove/block (6), `endRelationship` (4), `canSendDirectMessage` (3), groups (35), death notice report/confirm/reject and the frozen account (14), SMS leave (2).
- **`sentinel/sms-inbound.service.spec.ts`** (28) — commands (STOP…), one or several pending requests, not understood, Watch Mode `OK`, reply codes (111/112, 211/212/213, `21 <text>`, 311/321).
- **`sentinel/phone-recovery.service.spec.ts`** (21) — request, two confirmations (one a Lead), reject, verify on the new number, expiry.
- **`sentinel/connect.service.spec.ts`** (7) — code created once, renewed, resolved (first name and photo only), own code refused, invite and request through a code.
- **`sentinel/security-score.spec.ts`** (13) — who counts (reachable, accepted, not in the reserve).

**Watch Mode**
- **`watch/watch.service.spec.ts`** (31) — `createTrip` (7), `startAllGood` (2), `validate` (10: as planned, elsewhere, missed step whose alert runs, next step / end of trip), `updateWatch` (5: delay applied to every step ahead, rename), `updateStep` (2), `endWatch` (2), `confirmBySms` (1), `getWatch` (1), `renameTravelCircle` (1).
- **`watch/watch.scheduler.spec.ts`** (14) — reminder at the deadline, alert at alert time, message in a running alert instead of a second one, All Good next deadline and pause (4), subscription reminders (2).
- **`watch/travel-circles.service.spec.ts`** (10) — `createCircle` (2), `addTraveller` (3), `endPlan` (2), `endOfTrip` (3).
- **`watch/watch-views.service.spec.ts`** (6) — what travel-circle members and the 1st circle may see, never logbook or GPS.
- **`watch/check-in-schedule.spec.ts`** (11) — wall-clock time in a zone ↔ UTC across DST, rhythms (daily, weekdays, every n days/weeks/months, the 31st in shorter months).

**User**
- **`user/user.service.spec.ts`** (69) — profile and `timeZone`, complete profile and default circles, passwords, add/verify phone (incl. step-up when changing it), step-up (password, Google, code), email change, plan and subscription year, death notice settings, avatar.
- **`user/account-deletion.service.spec.ts`** (14) — step-up required, refused while an alert concerns or is led by the person, anonymization keeping the row, positions and photos erased, watches ended, links and groups unwound, companions and Sentinels told.
- **`user/pause.service.spec.ts`** (6) — pause for me / for others.

**Messaging, notifications, realtime**
- **`messaging/messaging.service.spec.ts`** (32) — direct conversation, send text/image, image file access, alert chats list, conversations list, feedback inbox.
- **`notification/notification.service.spec.ts`** (9) — create (never for the actor), mark read, list and unread counts.
- **`realtime/realtime.gateway.spec.ts`** (4) — `handleConnection` joins `user:<id>` on a valid token, disconnects otherwise.

**SMS, privacy, common**
- **`sms/messages.spec.ts`** (28) and **`sms/messages-en.spec.ts`** (6) — every SMS text, plain ASCII and ≤160 characters, in French and English.
- **`sms/sms-reply-code.spec.ts`** (4) — `replyCode`, `freeSlot`, `parseReplyCode`.
- **`sms/sms-reply-target.spec.ts`** (13) — which request a name-prefixed reply targets (accents ignored, ambiguous names → no target).
- **`privacy/retention.service.spec.ts`** (10) — positions (alerts and watches), notifications, unclaimed stand-in users.
- **`common/contact-details.spec.ts`** (20) — phone numbers and emails filtered in alert chats.
- **`common/image-upload.spec.ts`** (7) — the file's bytes decide (a fake image is deleted and refused), renamed with the right extension.
- **`common/log-redact.spec.ts`** (5) — phone numbers and emails masked in production logs.
- **`support/support.service.spec.ts`** (4) — the feedback inbox account.
- **`app.controller.spec.ts`** (1) — `GET /`.

### E2e — `backend/test/**/*.e2e-spec.ts` (89 tests)

Real HTTP requests against a real Nest app and the `mysentinelcircle_test` database; SMS/OTP/email senders intercepted (`overrideProvider`) to read the real codes. Last full run: before Watch Mode, SMS reply codes and the lab — **`watch.e2e-spec.ts` has never been run**, and the reply-code change hasn't been run in e2e.

- **`alert.e2e-spec.ts`** (33) — raise (10: by the person, by a 1st-circle Sentinel, by an outer-circle Sentinel, refused without link / 1st circle / Lead / with a Lead alone, second alert refused, everyone seated in the room, account deletion refused while it runs), long texts (1), close (4), list (1), request-circle (7: SMS replies in full incl. a change of mind and a further question, `NON` never read as leaving, in-app answer, refusals), my-participation (2), circle-chat (1), status (3), label (3), attribution and history (1).
- **`auth.e2e-spec.ts`** (9) — account from a new number, phone + password with lockout, unknown number answered like a wrong password, OTP cooldown, email signup, 128-character password limit, terms required, email without phone, password reset.
- **`user.e2e-spec.ts`** (8) — complete a profile, claim an SMS-only stub only once the code is verified, keep an invited Sentinel's links, account deletion, a code sent elsewhere can't validate, phone kept until the new one is verified, step-up before a phone change, email change.
- **`sentinel.e2e-spec.ts`** (20) — default circles, security score, circle deletion → reserve, invite / request flows, SMS-only people kept out of the 1st circle, remove / block / last Lead, 1st-circle move consent, alert chat setting per circle (refused on the 1st circle), inbound SMS (OUI, NON, STOP, unknown), lost phone (two confirmations, same answer for an unknown number).
- **`messaging.e2e-spec.ts`** (11) — alert room send/read, 2,000-character limit, the person writes in their room, stranger refused, chat writable 7 days after the alert then read-only, images (real upload, fake image refused, non-image refused, stranger refused), direct conversation (lazy creation, refused without a link).
- **`security.e2e-spec.ts`** (4) — my sign-ins, sign out everywhere, `/health` without sign-in, admin page for admins only.
- **`watch.e2e-spec.ts`** (3) — subscription required; a whole trip (reminder, `OK` by SMS, a missed step opens an alert, end); an All Good Check (each "all good" plans the next deadline).
- **`app.e2e-spec.ts`** (1) — `GET /`.

## Where to see results

- **Locally**: in the terminal (output of `npm run test` / `npm run test:e2e`).
- **In CI**: GitHub repo's **Actions** tab → **backend-ci** workflow → **test** job.

## Tests still to write

- **Run the e2e suite** (needs Sylvie's consent for the test-DB reset): `watch.e2e-spec.ts` is new, and alert/sentinel e2e were last run before the SMS reply codes and the raiser-as-participant change.
- **`lab`** — no unit tests at all: `LabService` (login and lab token, a tester only reaches their own set, `smsAll`, `reply` going through `SmsInboundService`, `advance` with the per-tester offset, `reset` closing only running alerts) and `ConsoleSmsSender`'s `LabSms` copy.
- **`admin`** — `AdminService.stats` has no unit test (only the guard, in `security.e2e-spec.ts`).
- **`WatchController`** — routes only exercised by the 3 e2e tests: `addStep`, travellers add/remove, `GET /alert/watch/of/:companionId` and `history` have no e2e.
- **`connect`** — no e2e (QR code invite/request over HTTP).
- **`sentinel` gaps** — `moveSelfToReserve` (Sentinel puts themself in the reserve) has no dedicated test; `listCompanions` with `watches` / `circle.trip` isn't asserted.
- **`alert` gaps** — null-phone edge cases (a participant or companion with no `phone`) and a partial SMS failure (`Promise.allSettled` with one rejected send) aren't exercised; escalating two outer circles in sequence on the same alert isn't covered; Organization-raised alerts and the 0–10 availability scale don't exist yet.
- **`realtime`** — only `handleConnection` is tested; the actual `emit` has no automated test (no Socket.IO e2e harness) — covered by caller-side mock assertions only.
- **Frontend** — no automated tests (lint + build only).
- **`organization`** — empty skeleton, nothing to test.

## Test infra (reference)

- Test DB: `mysentinelcircle_test`, created once via `bash backend/scripts/create-test-db.sh` (or `make db-test-init`) — uses root credentials, never rerun automatically.
- Local config: `backend/.env.test` (gitignored) — create it from `backend/.env.test.example`.
- `npm run test:e2e` (`test/global-setup.js`) first checks that `DATABASE_URL` points at `mysentinelcircle_test` (refuses otherwise), then resets the schema (`prisma migrate reset --force`) before running the specs in band.
- Each test creates its own data (unique phone/email via `backend/test/helpers/test-data.ts`) — no shared fixtures.
