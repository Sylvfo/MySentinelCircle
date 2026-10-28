# TEST.md

Updated: 2026-10-28 13:51

## When tests run

| When | Command | What |
|---|---|---|
| While coding, manually | `npm run test` (in `backend/`) | Unit only, Prisma mocked, no DB touched |
| Before pushing, manually | `npm run test:e2e` (in `backend/`) | Resets + migrates `mysentinelcircle_test`, runs the e2e specs — never touches the dev DB |
| On every push/PR to `main`/`dev` | CI — `.github/workflows/backend-ci.yml` | `npm run lint` + `npm run test` + `npm run test:e2e`, against an ephemeral MariaDB DB created by GitHub Actions |
| Proposed, not yet enabled | Local Claude Code hook | Would rerun `npm run test` after Claude edits a file under `backend/src/**` — paste it yourself into `.claude/settings.json` (locked) if you want to enable it |

## Current test list

### Unit — `backend/src/**/*.spec.ts` (180 tests)

- **`app.controller.spec.ts`** (1 test) — checks `GET /` responds `"Hello World!"`.
- **`auth/auth.service.spec.ts`** (35 tests, `PrismaService`/`JwtService`/`ConfigService`/`OTP_SENDER`/`EMAIL_SENDER` mocked):
  - **`claimOrCreateByPhone`** (via `signupPhone`, 3 tests) — creates when no row exists, claims/upgrades an `ONLY_SMS` stub (same `id` kept), rejects 409 if already a real account.
  - **`signupGoogle`** (3 tests) — rejects 409 when the Google email or username is already taken; creates an `UNCOMPLETE` account (no phone) and returns a token on success.
  - **`signupEmail`** (4 tests) — rejects 409 if the email or username is already taken; success with a phone (creates account + sends OTP); success without a phone (`UNCOMPLETE` account, token returned immediately).
  - **`loginEmail`** (6 tests) — rejects when no account, no `passwordHash` (Google/phone-only account), wrong password, unverified phone; logs in an account with no phone at all even though `phoneVerifiedAt` is null; success (returns an `accessToken`).
  - **`loginGoogle`** (5 tests) — rejects on invalid Google token, no linked account, unverified phone; logs in an account with no phone at all; success (returns an `accessToken`).
  - **`linkGoogle`** (2 tests) — rejects when the Google identity is already linked to another user; links it to the caller on success.
  - **`verifyOtp`** (6 tests) — rejects when no pending OTP, too many attempts (≥5), expired code, wrong code (asserts the `otpAttempts` increment); succeeds on first verification (`phoneVerifiedAt` set) and succeeds when already verified (`phoneVerifiedAt` not overwritten).
  - **`requestPasswordReset`** (3 tests) — sends the email when the account has a `passwordHash`; does nothing (but returns the same generic message) when no account exists or the account has no `passwordHash`.
  - **`confirmPasswordReset`** (3 tests) — rejects when no account matches the token, when the token expired; success (password updated, token cleared).
- **`user/user.service.spec.ts`** (37 tests, `PrismaService`/`OTP_SENDER`/`EMAIL_SENDER` mocked):
  - **`updateProfile`** (4 tests) — rejects changing an already-set username or taking one in use; allows setting it when none yet; updates on success.
  - **`changePassword`** (3 tests) — rejects with no password set or a wrong current password; updates on success.
  - **`requestAddPhone`** (3 tests, + 2 more under "step-up required when changing an existing phone") — rejects a phone already claimed by a real account; sets the phone and sends an OTP when free; claims and anonymizes a passive `ONLY_SMS` stub; requires a fresh step-up to change an already-set phone, allowed once step-up is fresh.
  - **`verifyAddPhone`** (6 tests) — rejects no pending code / too many attempts / expired / wrong code (increments `otpAttempts`); promotes `UNCOMPLETE` to `ACCOUNT` on success; leaves `userType` alone if it wasn't `UNCOMPLETE`.
  - **`stepUpPassword`** (3 tests) — rejects no password set / wrong password; marks step-up verified on success.
  - **`stepUpGoogle`** (3 tests) — rejects no linked Google identity / token for a different identity; marks step-up verified on success.
  - **`stepUpCodeRequest`** (4 tests) — rejects the phone channel with no verified phone, the email channel with no email; sends a code to phone or email.
  - **`stepUpCodeVerify`** (3 tests) — rejects no pending code / wrong code (increments `otpAttempts`); marks step-up verified on success.
  - **`requestEmailChange`** (3 tests) — rejects stale step-up / an email already in use; stores the pending email and sends a confirmation link on success.
  - **`confirmEmailChange`** (3 tests) — rejects an unknown/expired token, an expired pending-email request; applies the pending email on success.
- **`sentinel/sentinel.service.spec.ts`** (46 tests, `PrismaService`/`SMS_SENDER`/`AlertService` mocked):
  - **`listCircles`** (1 test) — auto-creates the 1st and reserve circles if missing, sorted `FIRST → BASIC → RESERVED`.
  - **`inviteSentinel`** (6 tests) — rejects inviting directly into the reserve circle, into a closed circle, an `UNCOMPLETE` (no-phone) caller; requires an existing account for a 1st-circle Sentinel; rejects re-inviting a `BLOCKED` link; bootstraps the first Sentinel of an empty 1st circle as `LEAD_1`.
  - **`requestToBeSentinel`** (1 test) — rejects an `UNCOMPLETE` (no-phone) requester.
  - **`respondToMembership`** (4 tests) — requires a `circleId` to accept a Sentinel-initiated request; moves the link into the chosen circle on accept; rejects accepting directly into the reserve circle; ignores `circleId` for a Companion-initiated invite.
  - **`deleteCircle`** (3 tests) — cannot delete the 1st or reserve circle; relocates active Sentinels to the reserve circle instead of blocking deletion.
  - **`updateCircle`** (2 tests) — updates the label and `canMessageMe` on a `BASIC` circle; rejects setting `canMessageMe` on the 1st circle (400) — always reachable, no override.
  - **`updateMembership`** (10 tests) — moves an accepted link into the reserve circle and notifies the Sentinel; blocks moving a Lead away when it would strand the 1st circle; rejects moving into a closed circle; proposes (rather than moves) a move into the 1st circle; rejects updating a non-`ACCEPTED` link; updates alert-time messaging settings (`canMessageOwnCircle`/`firstCircleMessagingMode`) and the permanent-channel override (`canMessageMe`) for an account-holding Sentinel; rejects setting any of them on a Sentinel SMS link.
  - **`canSendDirectMessage`** (6 tests) — the cascade for the permanent Me<->Sentinel channel: no accepted link at all → `false`; always `true` on the 1st circle regardless of any setting; falls back to the companion-wide default when nothing more specific is set; the circle setting overrides the default; the per-individual setting overrides the circle; resolves direction-agnostically (the caller can be either side of the `LinkSentinels` row).
  - **`respondToCircleMove`** (4 tests) — accepts (moves into the proposed circle, clears the proposal) and declines (clears only the proposal); rejects a caller who isn't the Sentinel on the link; rejects when there's no pending proposal.
  - **`removeMembership`** (1 test) — blocks removing the last Lead while other active members remain.
  - **`blockMembership`** (5 tests) — blocks a `PENDING` or `ACCEPTED` link; rejects blocking an already-blocked link or someone else's link; blocks removing the last Lead while other active members remain.
  - **`handleInboundSms` — circle move proposal** (2 tests) — resolves a pending circle-move proposal via OUI/NON; a genuine fresh `PENDING` invite/request wins over an existing move proposal.
  - **`handleInboundSms` — alert escalation fallback** (2 tests) — defers to `AlertService.tryHandleInboundSms` when a live alert ask matches, *before* the blanket "NON/STOP means leave" fallback (so a Sentinel's `NON` to an alert question is never misread as asking to be removed); falls through to that fallback when no alert ask is pending.
- **`alert/alert.service.spec.ts`** (45 tests, `PrismaService`/`SMS_SENDER`/`REALTIME_NOTIFIER` mocked):
  - **`raiseAlert`** (6 tests) — the companion raising for themself (freezes `AlertParticipant`'s `...AtAlert` fields from `LinkSentinels`/`Circle`, opens the 1st-circle `Conversation`, SMS to the 1st circle only); any accepted Sentinel raising on the companion's behalf — not necessarily 1st-circle (SMS to the 1st circle **and** the companion); rejects a caller with no accepted link to the companion at all (403); rejects a companion who already has a non-resolved alert (409); rejects when the companion has no 1st circle yet (409); rejects when the 1st circle exists but has no accepted Lead Sentinel (409) — per `plan.txt`, the 1st circle must always keep ≥1 Lead Sentinel.
  - **`closeAlert`** (5 tests) — the companion closing it themself (SMS to the circle only); an accepted 1st-circle Sentinel closing it (SMS to the circle **and** the companion); rejects a non-participant caller (403); rejects closing an already-resolved alert (409); rejects a missing alert (404).
  - **`requestCircle`** (6 tests) — fans out an `AlertParticipant` per accepted Sentinel of the chosen outer (`BASIC`) circle and bumps `LAUNCHED` → `ACTIVE`/`activatedAt`; doesn't re-bump an already-`ACTIVE` alert; rejects a circle that isn't a `BASIC` circle of this companion (400); rejects a circle with no accepted Sentinel (400); rejects escalating an already-resolved alert (409); rejects a caller who is neither the companion nor an accepted 1st-circle Sentinel (403).
  - **`respond`** (2 tests) — records an in-app yes/no reply for a `CONTACTED` participant and returns the updated participant directly (not the full `getAlert()` detail, which an outer-circle Sentinel can't view); rejects a caller with no pending request on this alert (403).
  - **`getMyParticipation`** (2 tests) — returns the caller's own participation plus minimal alert context (companion name, the alert's name, the raise reason, and both status notes), for a participant of *any* circle, not just the 1st; rejects a caller with no participation on this alert at all (403).
  - **`getOrCreateCircleChat`** (7 tests) — creates an isolated `Conversation` (caller + the current 1st-circle `AlertParticipant` roster) when none exists yet; returns the existing one on re-request instead of creating a new one; rejects a 1st-circle member (403, they already have the main chat); rejects when `firstCircleMessagingModeAtAlert` is `NONE` (403); rejects a caller with no participation on this alert (403); rejects once the alert is resolved (409); rejects a missing alert (404).
  - **`updateStatus`** (5 tests) — sets `statusByCompanion` when the caller is the companion; sets `statusByFirstCircle` (and records who, via `statusUpdatedById`/`statusUpdatedAt`) when the caller is an accepted 1st-circle Sentinel — two separate fields, not one shared one; stays writable on an already-resolved alert; rejects a caller who is neither (403); rejects a missing alert (404).
  - **`updateLabel`** (4 tests) — lets any accepted 1st-circle Sentinel rename the alert (`label`), not just the Lead; rejects an outer-circle Sentinel (403); rejects the companion (403) — only the 1st circle renames; rejects a missing alert (404).
  - **`tryHandleInboundSms`** (3 tests) — records a matching OUI/NON reply against the most recent `CONTACTED` participant for that phone and sends an acknowledgement; returns `null` (not a "no match" object, so `SentinelService` can fall through) for an unrecognizable reply; returns `null` when no alert ask is pending for that phone.
  - **`getAlert`** (4 tests) — returns the alert (incl. the companion's name and their other `BASIC` circles via `userCompanion`, plus `statusUpdatedBy`/`labelUpdatedBy`, per-participant `requestedBy`, and embedded message history) for the companion and for an accepted 1st-circle Sentinel; rejects a non-participant caller (403); rejects a missing alert (404).
  - **`listMyAlerts`** (1 test) — queries alerts where the caller is the companion or a participant Sentinel, newest first.
- **`messaging/messaging.service.spec.ts`** (13 tests, `PrismaService`/`SentinelService`/`REALTIME_NOTIFIER` mocked):
  - **`getOrCreateDirectConversation`** (4 tests) — returns the existing 1:1 conversation between the two, if any; lazily creates it when none exists yet; rejects when `canSendDirectMessage()` says no (403); rejects messaging yourself (400).
  - **`sendMessage`** (5 tests) — creates a `TEXT` message for an active participant of an open alert-scoped conversation, with no direct-messaging permission re-check; for a direct (`alertId: null`) conversation, re-resolves `canSendDirectMessage()` against the other participant on every send, and rejects (403) once that resolves to `false`; rejects a non-participant (403); rejects sending into a closed conversation (409).
  - **`sendImageMessage`** (2 tests) — creates an `IMAGE` message whose `body` is the given filename, through the same shared `createMessage()` checks as `sendMessage` (participant/closed), confirming the `sendMessage`/`sendImageMessage` refactor didn't diverge behavior; rejects sending into a closed conversation, same as `sendMessage`.
  - **`listMessages`** (2 tests) — returns messages oldest-first for an active participant; rejects a non-participant (403).
- **`realtime/realtime.gateway.spec.ts`** (3 tests, `JwtService`/`ConfigService` mocked): `handleConnection` joins the `user:<id>` room on a valid token (same secret/payload shape as `JwtStrategy`); disconnects when no token is sent; disconnects when the token fails verification.

### E2e — `backend/test/**/*.e2e-spec.ts` (69 tests)

- **`app.e2e-spec.ts`** (1 test) — boots a real Nest instance (`AppModule`) against `mysentinelcircle_test`, checks `GET /` → 200 `"Hello World!"`.
- **`auth.e2e-spec.ts`** (5 tests, `OTP_SENDER`/`EMAIL_SENDER` intercepted via `overrideProvider` to capture the real code/link instead of parsing console output):
  - Phone signup → OTP verification → phone+OTP login again, end to end over real HTTP requests.
  - Rejects a second signup on an already-claimed phone with 409.
  - Email signup → OTP verification → login with the password.
  - Email signup with no phone → immediate access token → calls a protected route.
  - Full password reset (request → confirm → login with the new password; the old password no longer works afterwards).
- **`user.e2e-spec.ts`** (4 tests):
  - Completes an `UNCOMPLETE` profile with a phone, promoting it to `ACCOUNT`.
  - Claims an existing `ONLY_SMS` Sentinel stub when adding its phone.
  - Requires a fresh step-up before changing an already-set phone.
  - Changes the email end-to-end: step-up, request, and confirm via the link.
- **`sentinel.e2e-spec.ts`** (16 tests, `SMS_SENDER` intercepted to capture sent messages):
  - **Circles** (3 tests) — always exposes the 1st/reserve circles sorted `FIRST → BASIC → RESERVED`; cannot delete either; deleting a normal circle relocates its active Sentinels to the reserve circle.
  - **Invite flow** (2 tests) — an account-holding Sentinel is invited, appears in their invitations inbox, accepts from the app (first Sentinel of an empty 1st circle auto-becomes `LEAD_1`); a 1st-circle invite to someone with no account is rejected (400).
  - **Request flow** (1 test) — a Sentinel-initiated request requires the companion to pick a `circleId` at accept time (rejected without one), then lands in the chosen circle.
  - **Remove / Leave / Block** (3 tests) — companion-side removal (`REMOVED`); blocking a link permanently (re-invite rejected 403); removing the last Lead while other active members remain is rejected (409).
  - **Circle move — 1st-circle consent** (1 test) — moving an accepted Sentinel into the 1st circle proposes instead of moving immediately; only moves once the Sentinel accepts via `circle-move/accept`.
  - **Messaging settings** (2 tests) — `canMessageOwnCircle`/`firstCircleMessagingMode` update for an account-holding Sentinel; rejected (400) for a Sentinel SMS link.
  - **Inbound SMS** (4 tests) — accepts (`OUI`) and declines (`NON`) a pending invitation; `STOP` opts an already-accepted Sentinel out (`REMOVED`); an unrecognized reply with no actionable link returns `matched: false`.
- **`alert.e2e-spec.ts`** (30 tests, `SMS_SENDER` intercepted; built on a real 1st circle (and, for escalation, a real outer circle too) via the `sentinel` routes):
  - **`POST /alert/raise`** (7 tests) — the companion raises for themself (SMS to the circle only, `isLead` correct per participant); an accepted 1st-circle Sentinel raises on the companion's behalf (SMS to the circle **and** the companion); an accepted *outer*-circle Sentinel can raise too — it still only notifies the 1st circle (not the outer circle itself); rejects a caller with no accepted link to the companion at all, given a 1st circle with a Lead (403); rejects a second concurrent raise (409); rejects when the companion has no 1st circle yet (409); rejects when the 1st circle exists but has no Lead Sentinel (409).
  - **`POST /alert/:id/close`** (4 tests) — closed by the companion or by an accepted 1st-circle Sentinel; rejects a non-participant (403); rejects closing an already-resolved alert (409).
  - **`POST /alert/:id/request-circle`** (6 tests) — asks a specific outer circle, notifies its accepted Sentinels by SMS, and bumps the alert to `ACTIVE`; a Sentinel's SMS `NON` reply is recorded against the alert *and confirmed not to affect their circle membership* (still `ACCEPTED` afterward) — the regression test for the inbound-SMS precedence fix in `sentinel.service.ts`; an account-holding Sentinel can respond in-app instead (`POST /alert/:id/respond`, returns the updated participant, not the full alert); rejects responding with no pending request (403); rejects targeting a circle that isn't this companion's own outer circle (400); rejects a caller who is neither the companion nor an accepted 1st-circle Sentinel (403).
  - **`GET /alert/:id/my-participation`** (2 tests) — lets a solicited outer-circle Sentinel see their own participation and just enough alert context, where `GET /alert/:id` itself 403s them; rejects a caller with no participation on this alert at all (403).
  - **`GET /alert/:id/circle-chat`** (2 tests) — an authorized outer-circle Sentinel opens their own isolated chat with the 1st circle (re-requesting returns the same `Conversation`), visible and repliable by a 1st-circle Sentinel from the full `GET /alert/:id` (told apart from the main chat by `participants`), and closed automatically when the alert closes, with no dedicated close code path; rejects an outer-circle Sentinel whose link defaults to `firstCircleMessagingMode: NONE` (403).
  - **`PATCH /alert/:id/status`** (3 tests) — the companion and a 1st-circle Sentinel each write their own status note (`statusByCompanion`/`statusByFirstCircle`), both visible to an outer-circle Sentinel via `my-participation` (not who else was contacted or how they answered); stays writable by both after the alert is closed; rejects a caller who is neither (403).
  - **`PATCH /alert/:id/label`** (3 tests) — any accepted 1st-circle Sentinel (not just the Lead) renames the alert, visible to an outer-circle Sentinel via `my-participation`; rejects an outer-circle Sentinel (403); rejects the companion (403).
  - **`GET /alert/:id` — attribution and message history** (1 test) — `requestedBy` correctly shows the companion for a 1st-circle participant (raised themself) and the triggering 1st-circle Sentinel for an outer-circle participant (via `request-circle`); the companion reads a 1st-circle Sentinel's chat message through `GET /alert/:id`'s embedded `conversations[].messages`, while still getting 403 calling `messaging`'s routes on that conversation directly.
  - **`POST /alert/raise` — `canMessageOwnCircle` exclusion** (1 test) — a 1st-circle Sentinel with `canMessageOwnCircle: false` still gets an `AlertParticipant` row and the SMS notification on raise, but has no seat in the group chat (403 on `messaging`'s routes for that conversation) while an unrestricted Sentinel does.
  - **`GET /alert/mine`** (1 test) — lists the companion's alerts newest-first.
- **`messaging.e2e-spec.ts`** (13 tests, built on a real alert's 1st-circle conversation, or a real outer-circle `LinkSentinels` for the direct-channel tests):
  - **`POST`/`GET /messaging/conversations/:id/messages`** (4 tests) — a 1st-circle Sentinel sends and reads messages in the alert's conversation; the companion is rejected (403, by design — not a chat participant, see `alert`'s `GET /alert/:id` for their read path instead); a stranger with no link to the companion is rejected (403); sending into a closed (post-close) conversation is rejected (409) while reading its history still works.
  - **`POST /messaging/conversations/:id/messages/image`** (3 tests) — uploads a real (fake-content) image via `multipart/form-data`, creates a `type: IMAGE` message whose `body` is the stored filename, and confirms that file is actually served back at `GET /uploads/messages/:filename` with the right content type; rejects a non-image file (400, the `fileFilter` mimetype check); rejects the companion, same as the text route (403).
  - **`GET /messaging/direct/:userId`** (6 tests) — lazily creates the 1:1 conversation on first open and returns the same one on a second open, by default, no settings touched; always open for a 1st-circle Sentinel even with `allowMessagingByDefault: false`; a circle-level restriction blocks it, and a per-individual override beats the circle; rejects `canMessageMe` on the 1st circle (400); turning messaging off after a conversation exists blocks further sends but reading its history still works; rejects when there's no accepted link between the two at all (403).

## Where to see results

- **Locally**: directly in the terminal (output of `npm run test` / `npm run test:e2e`).
- **In CI**: GitHub repo's **Actions** tab → **backend-ci** workflow → **test** job, one run per push/PR to `main`/`dev`.

## Tests still to write

- **`loginGoogle`/`signupGoogle` in e2e** — not covered (would need a real Google token, not easily simulated in e2e; the branching logic is already covered at the unit level via a mocked `verifyGoogleIdToken`).
- **`auth.requestOtp`** — no dedicated unit test (only exercised indirectly through flows that call it); `verifyOtp` is fully covered.
- **`sentinel` module gaps** — `leaveMembershipAsSentinel` (Sentinel-side opt-out from the app, as opposed to SMS `STOP`) and `listCompanions` have no dedicated test yet, unit or e2e. `createCircle`/`listIncomingRequests`/`listMyInvitations` are exercised indirectly as setup steps inside the e2e specs, but have no test asserting their own output shape directly.
- **`user` module gaps** — `getProfile`, `setAvatar` have no dedicated tests (simple reads, lower risk).
- **`alert`/`messaging` gaps** — null-phone edge cases (a participant or companion with no `phone`, silently skipped rather than erroring) aren't explicitly exercised, nor is a partial-SMS-failure case (`Promise.allSettled` with one rejected send). Escalating more than one outer circle in sequence on the same alert (ask circle A, then circle B) isn't covered. `statusUpdatedBy`/`labelUpdatedBy`/`requestedBy` only track the latest writer, not a full revision history (Sylvie's deliberate call, not a gap to fill). `alert`'s Organization-raised alerts, Lead handoff, and the 0–10 availability-reply scale are still out of scope entirely (see `plan.txt`'s Alert lifecycle) — nothing to test until that code exists. `messaging` has no conversation-creation route for the 1st-circle alert chat (only `alert` creates that one); the direct channel's lazy-creation race (two simultaneous first-opens creating two `Conversation`s for the same pair — no unique constraint on the pair, by design, see `plan.txt`'s `claimOrCreateByPhone` precedent for the same accepted-gap pattern) isn't covered either.
- **`organization`** — still an empty skeleton, nothing to test until there's code.

All built-out modules now have both unit and e2e coverage: `auth` (35 unit + 5 e2e), `user` (37 unit + 4 e2e), `sentinel` (46 unit + 16 e2e), `alert` (45 unit + 30 e2e), `messaging` (13 unit + 13 e2e) — the e2e layer is what actually exercises the real HTTP routes, guards, and cross-module flows (e.g. an alert's `Conversation` created by `alert`, messaged into via `messaging`; an inbound SMS webhook routed from `sentinel` into `alert`; or `messaging`'s direct channel resolving its permission through an injected `SentinelService`) that unit tests mock around.

## Test infra (reference)

- Test DB: `mysentinelcircle_test`, created once via `bash backend/scripts/create-test-db.sh` (or `make db-test-init`) — uses root credentials, never rerun automatically.
- Local config: `backend/.env.test` (gitignored) — create it from `backend/.env.test.example`.
- `npm run test:e2e` first checks that `DATABASE_URL` points at `mysentinelcircle_test` (refuses otherwise), then resets the schema (`prisma migrate reset --force`) before running the specs.
- Each test must create its own data (unique phone/email via `backend/test/helpers/test-data.ts`) — no shared fixtures.
