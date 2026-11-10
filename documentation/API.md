# API

Updated: 2026-11-11 00:26

Route-by-route reference, generated from `backend/src/**/*.controller.ts`. For the conceptual picture see `STACK_SCHEMA.md`; for entities/relations see `backend/prisma/DB_schema.md`.

All routes are relative to the backend origin (`http://localhost:3000` in host-mode dev, or same-origin through nginx at `https://localhost:4444` in Docker mode — see `STACK_SCHEMA.md`). nginx only forwards known module prefixes, which is why newer routes live under an existing one (`/user/admin`, `/user/lab`, `/alert/watch`, `/sentinel/connect`).

A live, interactive version of this reference (Swagger UI, generated from the same DTOs) is available at `/docs` in dev only (`NODE_ENV !== 'production'`) — e.g. `http://localhost:3000/docs` in host mode.

**Rate limit**: app-wide 100 requests/min/IP (`ThrottlerModule`, `trust proxy 1` behind nginx). Sign-in, signup, OTP, password and step-up routes are tighter at 20/min (`@Throttle`), phone recovery at 5–10/min. `@SkipThrottle()`: `/health`, avatars, message images, and the test lab.

## `app` (root)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Root route (`AppController`), returns a hello string. |

## `health`

| Method | Path | Description |
|---|---|---|
| GET | `/health` | For the outside uptime check: `{ status: 'ok' }` when the backend and its database answer, 503 `{ status: 'down' }` otherwise. Says nothing else about the server. Not throttled. |

## `auth`

No global guard — each route is public unless marked JWT. Throttled 20 requests/min/IP.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup/email` | — | Create an account with email + password + phone; triggers an OTP send. |
| POST | `/auth/signup/google` | — | Create an account from a verified Google ID token + phone; triggers an OTP send. |
| POST | `/auth/login/email` | — | Email + password login; requires phone already verified. Returns a JWT. |
| POST | `/auth/login/phone` | — | Phone + password login. Returns a JWT. |
| POST | `/auth/login/google` | — | Google ID token login; requires phone already verified. Returns a JWT. |
| POST | `/auth/otp/request` | — | (Re)send an OTP to an account's phone — used mid-signup and as the phone + SMS-code sign-in. |
| POST | `/auth/otp/verify` | — | Verify the OTP code; marks the phone verified and returns a JWT. Signing in this way with the old number cancels a pending phone recovery. |
| POST | `/auth/password-reset/request` | — | Request a password-reset email link. Always the same generic answer — never leaks whether the account exists. |
| POST | `/auth/password-reset/confirm` | — | Confirm a password reset with the token from the email link; sets the new password. |
| POST | `/auth/link/google` | JWT | Attach a Google identity to the caller's own account (proof of ownership via JWT, never "link by email match"). |
| GET | `/auth/logins` | JWT | My last sign-in attempts (successful or not), for Settings. |
| POST | `/auth/logout-everywhere` | JWT | Every token issued until now stops working (`JwtStrategy` compares its date), this device's included. |
| POST | `/auth/phone-recovery/request` | — (5/min) | Lost phone: old number + new number. Two people of the 1st circle must confirm (see `sentinel` below). |
| POST | `/auth/phone-recovery/verify` | — (10/min) | The code received on the new number: the number changes, every device signed in with the old one is signed out. |

`GET /auth/me` doesn't exist — the current-user profile is `GET /user/me`.

## `user`

`@UseGuards(JwtAuthGuard)` at the controller level, except `/user/confirm-email` (separate `EmailConfirmationController`, unguarded: the user clicks an email link, not necessarily signed in on that device).

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/user/me` | JWT | Current user's profile. |
| PATCH | `/user/me` | JWT | Update profile fields: names, `isMajor`, `publicStatus`, `gender`, `language`, `timeZone` (IANA, checked; sent by the browser — All Good deadlines and SMS times follow it), `alertChatWithFirstCircle` (master switch: may my outer-circle Sentinels chat with my 1st circle during an alert), `alertContactSharing` (contact details allowed in my alert chats). |
| DELETE | `/user/me` | JWT, 20/min | Delete my account: anonymized, never hard-deleted; ends my watches and erases their GPS. |
| GET | `/user/me/plan` | JWT | What my plan includes right now (free / subscribed, until when), for the Plans page and the gold-star prompts. The rules are enforced where each action happens. |
| POST | `/user/me/subscription-year` | JWT | One more year of subscription, for myself or offered to someone I'm linked with (either direction). Simulated payment until a real provider exists. |
| POST | `/user/me/dev-has-paid` | JWT | Temporary dev/test stand-in for a payment provider. |
| POST | `/user/me/dev-death-notice-purchase` | JWT | Temporary dev/test stand-in for the death-notice one-time purchase. |
| POST | `/user/me/accept-terms` | JWT | Turns a phone-verified `ONLY_SMS` row into a real account (same id, so existing links still resolve) and records acceptance of the current terms + privacy policy. |
| PATCH | `/user/me/pause` | JWT | `pausedForMe` (nobody can raise an alert about me) / `pausedForOthers` (I'm not asked during others' alerts). |
| POST | `/user/me/complete-profile` | JWT | Finish an account started by phone: `password`, `userName?`. |
| POST | `/user/me/avatar` | JWT | Upload a profile photo (multipart, jpg/png/webp, 5MB max). |
| DELETE | `/user/me/avatar` | JWT | Remove my profile photo. |
| GET | `/user/:id/avatar` | JWT, not throttled | A private photo, served only to its owner and the people linked to them. |
| POST | `/user/phone/request` | JWT, 20/min | Request an OTP to add/verify a phone number. |
| POST | `/user/phone/verify` | JWT, 20/min | Verify the OTP from `phone/request`. |
| POST | `/user/me/set-password` | JWT, 20/min | Forgotten password, or first password on a phone account: a fresh step-up (SMS code) stands in for the old password. |
| POST | `/user/me/change-password` | JWT, 20/min | Change password (requires current password). |
| POST | `/user/me/step-up/password` | JWT, 20/min | Step-up re-authentication via password, before a sensitive action. |
| POST | `/user/me/step-up/google` | JWT, 20/min | Step-up via Google ID token. |
| POST | `/user/me/step-up/code/request` | JWT, 20/min | Request an SMS/email code for step-up. |
| POST | `/user/me/step-up/code/verify` | JWT, 20/min | Verify the step-up code. |
| POST | `/user/me/change-email/request` | JWT, 20/min | Request an email-change confirmation link to the new address. |
| POST | `/user/confirm-email` | none, 20/min | Confirm an email change with the token from the link. |
| GET | `/user/death-notice` | JWT | My death notice (message, recipients). |
| PATCH | `/user/death-notice` | JWT | Edit my death notice. |
| PATCH | `/user/death-notice/recipients` | JWT | Full replacement of who gets it: any of my links left out is cleared back to not-notified. |

### `user/admin`

`AdminController`, `JwtAuthGuard` + `AdminGuard` (`ADMIN_EMAILS`).

| Method | Path | Description |
|---|---|---|
| GET | `/user/admin/stats` | Counts only (accounts, activity, alerts…) — nothing that points at one person. |

### `user/lab` (test lab, dev only)

`LabController`, `@SkipThrottle()`. The routes exist only when `ALLOW_DEV_ROUTES=true` (`LabService.assertEnabled`). A tester signs in to the lab with their own account (`login`); every other tester route takes the returned lab token in the `X-Lab-Token` header and only reaches the phones of their own set (`LAB_SETS`, keyed by the tester's phone).

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/user/lab/login` | — | `identifier` + `password` of a tester account → `labToken`. |
| GET | `/user/lab/me` | lab token | `testerName` and the set's `phones` (name, number, `app` or SMS only). |
| POST | `/user/lab/login-as` | lab token | A normal JWT for one phone of the set, for its frame. |
| GET | `/user/lab/sms/all` | lab token | Every phone of the set → its last 50 SMS (in and out). What the lab page polls every 3 s. |
| GET | `/user/lab/sms` | lab token | One phone's SMS (`?phone=`). |
| POST | `/user/lab/sms` | lab token | Answer like from that phone (`phone`, `body`): stored, then handled by the inbound SMS logic. |
| POST | `/user/lab/advance` | lab token | Move the set's clock forward (`hours`, 1–240) and run the Watch Mode deadlines for its people. The offset is kept in memory. |
| POST | `/user/lab/reset` | lab token | Close every running alert about the set's people. Links are kept. |
| POST | `/user/lab/feedback` | lab token | The tester's opinion: `scenario`, `tags`, `text?`, `screenshot?` (multipart, jpg/png/webp, 8MB). |
| GET | `/user/lab/admin/feedback` | JWT + admin | Every opinion, newest first. |
| GET | `/user/lab/admin/feedback/:id/screenshot` | JWT + admin | Its screenshot. |
| POST | `/user/lab/admin/feedback/:id/read` | JWT + admin | Mark it read. |

## `sentinel`

`@UseGuards(JwtAuthGuard)` at the controller level, except the SMS webhook.

| Method | Path | Description |
|---|---|---|
| POST | `/sentinel/circles` | Create a new ("other") circle. |
| GET | `/sentinel/circles` | My circles (1st circle first) with their Sentinels; a travel circle carries its `trip`. |
| PATCH | `/sentinel/circles/:id` | Update a circle I own: `label`, `alertChatWithFirstCircle` (this circle may chat with the 1st circle during an alert, if my master switch allows it; rejected (400) on the 1st circle, which has its own room). |
| DELETE | `/sentinel/circles/:id` | Close a circle I own (not the 1st circle, must be empty). |
| GET | `/sentinel/security-score` | How many of my Sentinels can actually be reached now (no pending invitations, nobody in the reserve). |
| POST | `/sentinel/circles/:id/invite` | Invite someone by phone into one of my circles. The SMS carries the reply codes (111 yes / 112 no). |
| POST | `/sentinel/requests` | Ask to become the Sentinel of the person at a given phone number. |
| GET | `/sentinel/requests` | Requests from people who want to be my Sentinel, awaiting my approval. |
| GET | `/sentinel/invitations` | Invitations addressed to me, awaiting my answer. |
| POST | `/sentinel/memberships/:id/accept` | Accept a pending invitation/request addressed to me (`circleId`: the real target circle). |
| POST | `/sentinel/memberships/:id/decline` | Decline a pending invitation/request addressed to me. |
| POST | `/sentinel/memberships/:id/leave` | As the Sentinel, opt out of an active link (also doable by SMS). |
| POST | `/sentinel/memberships/:id/reserve` | As the Sentinel, put myself in the companion's reserve ("not available for now") without ending the link. Only the companion brings me back. Refused while I take part in an alert about them. |
| POST | `/sentinel/memberships/:id/circle-move/accept` | As the Sentinel, accept a proposed move into the 1st circle (also by SMS). |
| POST | `/sentinel/memberships/:id/circle-move/decline` | As the Sentinel, decline it. |
| PATCH | `/sentinel/memberships/:id` | Update a membership I own — `sentinelType`, `requestedAsLead`, `leadSlot`, `callOrder` (outer-circle call rank), or `circleId` (move; a move into the 1st circle is a proposal the Sentinel must accept). Only an `ACCEPTED` membership. |
| DELETE | `/sentinel/memberships/:id` | Remove a Sentinel from one of my circles (`REMOVED`, never hard-deleted). |
| POST | `/sentinel/memberships/:id/block` | "Me" only — end the link permanently (never reactivatable). |
| POST | `/sentinel/people/:userId/end` | End every link with this person, both directions (person page). |
| POST | `/sentinel/people/:userId/block` | Same, permanent: neither can ever invite the other again. |
| GET | `/sentinel/companions` | Reverse view — the people I watch over, with their circle (`circle.trip` for a travel circle) and their running `watches` I may see. |
| POST | `/sentinel/groups` | Create a group (`label`): a shared circle its members all belong to. Subscription only. |
| GET | `/sentinel/groups` | My groups. |
| GET | `/sentinel/groups/invitations` | Group invitations addressed to me. |
| POST | `/sentinel/groups/:rootId/invite` | Invite into a group: `targetUserId` (one of my contacts) or `phone` + `name` (anyone; no account → a stand-in user claimed at signup). |
| POST | `/sentinel/groups/invitations/:id/accept` | Accept a group invitation. |
| POST | `/sentinel/groups/invitations/:id/decline` | Decline it. |
| POST | `/sentinel/groups/:rootId/leave` | Leave a group (my own membership only). |
| DELETE | `/sentinel/groups/:rootId` | Founder only — close the whole group: every member's circle closes, every link it created unwinds. |
| POST | `/sentinel/companions/:companionId/death-notice/report` | Report this person's death. |
| POST | `/sentinel/companions/:companionId/death-notice/confirm` | Confirm a report (a second person) — the account freezes, the notice goes out. |
| POST | `/sentinel/companions/:companionId/death-notice/reject` | Say the report is wrong. |
| GET | `/sentinel/death-notices/mine` | Every death notice sent to me (the only place someone without an account can read one). |
| GET | `/sentinel/companions/:companionId/death-notice` | That person's notice — only for someone it was actually sent to. |
| POST | `/sentinel/companions/:companionId/phone-recovery/confirm` | As a 1st-circle Sentinel, vouch for the person's phone recovery. The second confirmation (two different people, at least one a Lead) sends the code to the new number. |
| POST | `/sentinel/companions/:companionId/phone-recovery/reject` | Say it isn't them: the request ends. |

### `sentinel/connect` (QR code)

`ConnectController`, `@UseGuards(JwtAuthGuard)`. Each person has a `connectCode` (12 characters); their QR code points to `/connect/<code>` in the app.

| Method | Path | Description |
|---|---|---|
| GET | `/sentinel/connect/mine` | My code (created on first call). |
| POST | `/sentinel/connect/mine/renew` | A new code: the QR codes shared before stop working. |
| GET | `/sentinel/connect/:code` | Who the code belongs to: first name and photo only. 404 for an unknown code, 400 for my own. |
| POST | `/sentinel/connect/:code/invite` | "They watch over me": an invitation into one of my circles (`circleId`). |
| POST | `/sentinel/connect/:code/request` | "I watch over them": a request they approve. |

### `sentinel/sms` (inbound SMS webhook)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/sentinel/sms/inbound` | none (deliberately public — SMS provider webhook; needs provider signature verification before prod) | Every inbound SMS. Reply codes are read first: `<category><slot><choice>` — `1x` invitation (111 yes / 112 no), `2x` alert question (211 yes / 212 later / 213 no, or `21 <text>`), `3x` watch (311 trip / 321 All Good). Then the older forms: name prefix, OUI/NON/STOP, `OK` to a Watch Mode reminder. |

**SMS reply routing**: one inbound URL for the whole app (a real SMS provider gives one per phone number, not one per module). `SmsInboundService` gathers what waits on that number (invitations, alert questions, watch deadlines); a reply code names exactly one of them. Without a code: a single pending request gets the answer, several get a list of codes back. A Sentinel replying `NON` to an alert question is never read as leaving the link.

## `alert`

`@UseGuards(JwtAuthGuard)` at the controller level. No route on the bare `/alert` root (`raise`/`mine` instead) — nginx's `location` blocks need a trailing path segment.

| Method | Path | Description |
|---|---|---|
| POST | `/alert/raise` | Raise an alert (`companionId`, `alertType`, `reason`, `location?`, `payForThisAlert?`) — by "Me" for themself or by any accepted Sentinel (any circle). Creates the `Alert`, one `AlertParticipant` per reachable 1st-circle Sentinel (Lead 1 responsible from the start), and the 1st-circle room; SMS + notifications. A raiser outside the 1st circle becomes a participant of their own circle (`CONTACTED`), so the alert shows in their alerts and history. `location`: the raiser's own position, or — for an assistance alert raised by someone on the spot — theirs, said as such. Rejects (409) if the person already has a running alert, or their 1st circle has no reachable Lead; (403) if paused or not allowed. |
| POST | `/alert/:id/close` | Close an alert — "Me" or a 1st-circle Sentinel. `finalWord?`: a few closing words, posted in every chat and in the end-of-alert SMS. |
| POST | `/alert/:id/claim-lead` | A Lead Sentinel takes active leadership (also from another Lead). "Current lead" = the Lead with the latest `leadAssignedAt`. |
| POST | `/alert/:id/leave` | Step out of an alert ("I can't help anymore"): participation `CLOSED`, no more notifications. A Lead may leave only once another Lead has claimed after them. |
| POST | `/alert/:id/request-circle` | "Me" or the 1st circle asks one outer circle (`circleId`: a `BASIC` circle, or a travel circle of a trip) a preset question (`questionKind`: `CAN_VISIT` / `LAST_NEWS` / `SEEMED_OK` / `WHERE_SEEN`…). Upserts an `AlertParticipant` per Sentinel, contacts the next batch, SMS with reply codes. A travel circle also brings the Sentinels counted on the trip. First request: `LAUNCHED` → `ACTIVE` (`activatedAt`). |
| POST | `/alert/:id/questions` | A further question (`questionKind`) to outer-circle Sentinels already contacted (`participantIds`), whatever they answered before. |
| POST | `/alert/:id/respond` | In-app answer (`reply`, `questionId?` — required for an outer circle; the 1st circle answers the alert itself). Answering again replaces the answer while the alert runs. Returns the participant row. |
| PATCH | `/alert/:id/status` | Free-text progress note (`message`) — `statusByCompanion` for the person, `statusByFirstCircle` (+ who) for the 1st circle. Stays writable after `RESOLVED`. |
| PATCH | `/alert/:id/location` | The person the alert is about shares an updated GPS position: the alert message's position line is replaced and the room gets it as a message. |
| PATCH | `/alert/:id/label` | The alert's name — 1st-circle Sentinels only (not the companion); records who. |
| PATCH | `/alert/:id/type` | Requalify an alert opened by a missed Watch Mode deadline (`alertType`): `MISSING`, `EMERGENCY`, or back to its watch's own type. 1st circle only; posted in the room. |
| GET | `/alert/mine` | My alerts (as the person, or as a participant of any circle), newest first, each with `myParticipation`. Never a watch. |
| GET | `/alert/:id/my-participation` | Light view for a participant of any circle: name, reason, status notes, the person's name, my own participation and questions — without who else was asked or how they answered. 403 with no participation. |
| GET | `/alert/:id/circle-chat` | Opens (or returns) the isolated chat between the calling outer-circle Sentinel and the 1st circle, if their circle allows it (`alertChatWithFirstCircleAtAlert`). 409 once resolved. |
| GET | `/alert/:id` | The full alert: person, outer circles (for escalation), participants with `requestedBy` and questions, every conversation with its messages, `timeline`, and `trip` for an alert a watch opened. "Me" or the 1st circle only — an outer-circle participant gets 403 and uses `my-participation`. |

**Watches are not alerts**: a watch (`Alert` in `SENT` for its whole life, see below) is never listed by `GET /alert/mine`, and every route above answers 404 for its id.

### `alert/watch` (Watch Mode)

`WatchController`, `@UseGuards(JwtAuthGuard)`. Mounted under `/alert/` because nginx only forwards known module prefixes; no route here is a single segment after `watch`, so none collides with `AlertController`'s `:id/<action>` routes. A watch is a trip (steps) or an All Good Check (a rhythm); only its owner manages it. Starting needs a subscription (403 `Watch Mode is part of the subscription`), a verified phone and a 1st circle that could drive an alert; one trip and one All Good Check at a time (409). Deadlines are handled by `WatchScheduler` (every minute), not by a route.

| Method | Path | Description |
|---|---|---|
| GET | `/alert/watch/mine` | My running watches, each with its checkpoints, `mode`, `schedule`, `pausedBecause` (`SUBSCRIPTION` / `MANUAL` / `TRIP`), `currentCheckpointId`, `runningAlertIds` and, for a trip, `travelCircles`. |
| GET | `/alert/watch/history` | `mine`: all my watches, each with the alerts it opened (`tripAlerts`); `withOthers`: the trips of others I was part of. |
| GET | `/alert/watch/of/:companionId` | That person's running watches as far as I may see them: travel-circle members (itinerary + validation status, never logbook or GPS), their 1st circle only if they share the trip; otherwise `[]`. |
| POST | `/alert/watch/trip` | Start a trip: `name`, `instructions?`, `firstStep` and `moreSteps?` (`placeName`, `expectedAt` in the future, `delayMinutes`, `latitude?`/`longitude?`), `travelCircle?` (named after the trip), sharing booleans. |
| POST | `/alert/watch/all-good` | Start an All Good Check: `schedule` (`DAILY` / `WEEKDAYS` days / `EVERY` n `DAY`·`WEEK`·`MONTH` from a date, `before` HH:MM), `delayMinutes`, `instructions?`, sharing booleans. First deadline in my time zone. |
| GET | `/alert/watch/:id/details` | One of my watches (running or ended), same shape as `mine`. |
| PATCH | `/alert/watch/:id/settings` | `name` (trip; its circles follow), `instructions`, sharing booleans, `delayMinutes` (a trip: every step ahead; All Good: the next deadline), `schedule` and `pausedUntil` (All Good; `null` resumes). |
| POST | `/alert/watch/:id/end` | End the watch. A trip: `forAll?` (`RESERVE` default / `END` / `KEEP`) and `perPerson?` decide what becomes of the people added for it; a travel group always closes. An alert it opened goes on. |
| POST | `/alert/watch/:id/steps` | Add a step to a trip. |
| PATCH | `/alert/watch/:id/steps/:stepId` | Edit a step still ahead (moving it re-arms the reminder). 409 once validated or missed. |
| POST | `/alert/watch/:id/validate` | Validate the current deadline: `kind` (`AS_PLANNED` / `ELSEWHERE` + `place`), `latitude?`/`longitude?`, `note?`. A trip with no step left needs `nextStep` or `endTrip`. All Good: plans the next deadline. Posted in the room of a running alert it opened. |
| POST | `/alert/watch/:id/circles` | New travel circle (`label?`, `group?`), named after the trip. |
| POST | `/alert/watch/:id/travellers` | Count one of my Sentinels on the trip (`linkId`, `circleId` of a travel circle); they keep their own circle. |
| POST | `/alert/watch/:id/travellers/:participantId/remove` | Stop counting them on the trip. |

## `organization`

Skeleton — no routes yet.

## `messaging`

`@UseGuards(JwtAuthGuard)` at the controller level. Kinds of `Conversation`: the 1st-circle alert room, an isolated outer-circle-Sentinel<->1st-circle alert chat, the permanent Me<->Sentinel channel (created lazily here), and the feedback thread with the team. Sending pushes a `message:new` WebSocket event (Socket.IO, `backend/src/realtime/`) — clients then `GET` the content. Alert chats filter contact details (phone numbers, emails) unless the person allowed them.

| Method | Path | Description |
|---|---|---|
| GET | `/messaging/mine` | Every direct conversation I'm in, with the other side's name, last message and unread count. |
| GET | `/messaging/alert-chats` | My alert chats (1st-circle rooms, isolated chats), for the Alerts section of Messages. |
| GET | `/messaging/support` | My own feedback thread (Give feedback page). |
| GET | `/messaging/direct/:userId` | The permanent Me<->Sentinel channel — finds or creates the 1:1 conversation. Allowed between two people with an accepted link (either direction); 403 otherwise, 400 for myself. |
| POST | `/messaging/conversations/:id/messages` | Send a `TEXT` message — active participant of an open conversation; a direct one re-checks the link on every send. |
| POST | `/messaging/conversations/:id/messages/image` | Same, multipart `image` (jpg/png/webp, 5MB): a `type: IMAGE` message, file under `uploads/messages/`. |
| GET | `/messaging/messages/:messageId/image` | That image — only for the conversation's participants, never as a public file. Not throttled. |
| GET | `/messaging/conversations/:id/messages` | A conversation's messages, oldest first — active participant (the conversation may be closed). |

## `notification`

`@UseGuards(JwtAuthGuard)` at the controller level. `@Global()` `NotificationService` is called from the other modules to store a row for the events worth a line in the inbox (alerts, messages, invitations, Watch Mode reminders and travel circles, subscription ending…). Never for the acting user themself. Pushes a bare `notification:new` WebSocket event.

| Method | Path | Description |
|---|---|---|
| GET | `/notification/mine` | My latest 50 notifications, newest first. |
| GET | `/notification/unread-count` | `{ count }` of unread notifications — the frontend's badge. |
| POST | `/notification/:id/read` | Mark one of my notifications read. |

## Regenerating this file

Run `/docu api`. Keep it route-by-route (method + path + short description) — conceptual/architectural detail belongs in `STACK_SCHEMA.md`.
