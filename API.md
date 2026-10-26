# API

Updated: 2026-10-26 16:49

Route-by-route reference, generated from `backend/src/*/*.controller.ts`. For the conceptual picture see `STACK_SCHEMA.md`; for entities/relations see `backend/prisma/DB_schema.md`.

All routes are relative to the backend origin (`http://localhost:3000` in host-mode dev, or same-origin through nginx at `https://localhost:4444` in Docker mode — see `STACK_SCHEMA.md`).

A live, interactive version of this reference (Swagger UI, generated from the same DTOs) is available at `/docs` in dev only (`NODE_ENV !== 'production'`) — e.g. `http://localhost:3000/docs` in host mode.

## `app` (root)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Health-check root route (`AppController`), returns a hello string. |

## `auth`

No global guard — each route is public except `/auth/me`. Every route below except `/auth/me` is throttled `@Throttle({ default: { limit: 5, ttl: 60_000 } })` (5 requests/min/IP) on top of the app-wide default (20 requests/min/IP, see `STACK_SCHEMA.md`) — the tighter limit targets brute-force on signup/login/OTP/password-reset.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup/email` | — | Create an account with email + password + phone; triggers an OTP send. |
| POST | `/auth/signup/google` | — | Create an account from a verified Google ID token + phone; triggers an OTP send. |
| POST | `/auth/signup/phone` | — | Create a full, permanent account from just a phone number — no email/Google ever required; triggers an OTP send. |
| POST | `/auth/login/email` | — | Email + password login; requires phone already verified. Returns a JWT. |
| POST | `/auth/login/google` | — | Google ID token login; requires phone already verified. Returns a JWT. |
| POST | `/auth/otp/request` | — | (Re)send an OTP to an existing account's phone — used mid-signup and as a phone+OTP login fast-path. |
| POST | `/auth/otp/verify` | — | Verify the OTP code; marks the phone verified and returns a JWT. |
| POST | `/auth/password-reset/request` | — | Request a password-reset email link. Always returns the same generic message, whether or not the account exists — never leaks account existence. |
| POST | `/auth/password-reset/confirm` | — | Confirm a password reset with the token from the email link; sets the new password. |
| POST | `/auth/link/google` | JWT | Attach a Google identity to the caller's own already-authenticated account (proof-of-ownership via JWT, not an unauthenticated "link by email match" route). |
| POST | `/auth/dev-login` | — | **Dev-only** — log in with just a phone number, no password/OTP. `AuthService.devLoginByPhone` refuses with 403 whenever `NODE_ENV === 'production'`, regardless of how the route is reached. For fast account-switching during development only. |

Note: `GET /auth/me` doesn't exist on `AuthController` — the current-user profile route lives on `user` as `GET /user/me` below.

## `user`

`@UseGuards(JwtAuthGuard)` at the controller level — every route below requires a JWT, except `/user/confirm-email` (separate `EmailConfirmationController`, deliberately unguarded: the user clicks an email link, not necessarily logged in on that device).

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/user/me` | JWT | Current user's profile. |
| PATCH | `/user/me` | JWT | Update profile fields. |
| POST | `/user/me/avatar` | JWT | Upload a profile avatar (multipart, jpg/png/webp, 5MB max). |
| POST | `/user/phone/request` | JWT, throttled | Request an OTP to add/verify a phone number on the account. |
| POST | `/user/phone/verify` | JWT, throttled | Verify the OTP from `phone/request`, completing the account. |
| POST | `/user/me/change-password` | JWT, throttled | Change password (requires current password). |
| POST | `/user/me/step-up/password` | JWT, throttled | Step-up re-authentication via password, before a sensitive action. |
| POST | `/user/me/step-up/google` | JWT, throttled | Step-up re-authentication via Google ID token. |
| POST | `/user/me/step-up/code/request` | JWT, throttled | Request an SMS/email code for step-up re-authentication. |
| POST | `/user/me/step-up/code/verify` | JWT, throttled | Verify the step-up code from `step-up/code/request`. |
| POST | `/user/me/change-email/request` | JWT, throttled | Request an email-change confirmation link to the new address. |
| POST | `/user/confirm-email` | none (email-link flow) | Confirm an email change with the token from `change-email/request`'s link. |

## `sentinel`

`@UseGuards(JwtAuthGuard)` at the controller level — every route below requires a JWT, except the SMS webhook.

| Method | Path | Description |
|---|---|---|
| POST | `/sentinel/circles` | Create a new ("other") circle. |
| GET | `/sentinel/circles` | List my circles (1st circle first) with their Sentinels. |
| PATCH | `/sentinel/circles/:id` | Update a circle I own (label). |
| DELETE | `/sentinel/circles/:id` | Close a circle I own (not the 1st circle, must be empty). |
| POST | `/sentinel/circles/:id/invite` | Invite someone by phone into one of my circles as a Sentinel. |
| POST | `/sentinel/requests` | Request to become the Sentinel of the "Me" at a given phone number. |
| GET | `/sentinel/requests` | Incoming Sentinel requests awaiting my approval. |
| GET | `/sentinel/invitations` | Invitations addressed to me (I'm the invited Sentinel), awaiting my answer. |
| POST | `/sentinel/memberships/:id/accept` | Accept a pending invitation/request addressed to me (picks the real target circle, via `circleId`). |
| POST | `/sentinel/memberships/:id/decline` | Decline a pending invitation/request addressed to me. |
| POST | `/sentinel/memberships/:id/leave` | Opt out of an active link, as the Sentinel. |
| POST | `/sentinel/memberships/:id/circle-move/accept` | As the Sentinel, accept a proposed move into "Me"'s 1st circle. |
| POST | `/sentinel/memberships/:id/circle-move/decline` | As the Sentinel, decline a proposed move into "Me"'s 1st circle. |
| PATCH | `/sentinel/memberships/:id` | Update a membership I own — Sentinel type, Lead-slot request, messaging settings (`canMessageOwnCircle`/`firstCircleMessagingMode`), or move to another circle (moves into the 1st circle instead propose and require the Sentinel's consent). Only an `ACCEPTED` membership can be updated. |
| DELETE | `/sentinel/memberships/:id` | Remove a Sentinel from one of my circles (marks `REMOVED`, never hard-deleted). |
| POST | `/sentinel/memberships/:id/block` | "Me" only — permanently block a link (never reactivatable afterward), unlike decline/remove. |
| GET | `/sentinel/companions` | Reverse view — the people I watch over as a Sentinel. |

### `sentinel/sms` (sub-controller)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/sentinel/sms/inbound` | none (deliberately public — SMS provider webhook; needs provider signature verification in prod) | Handles inbound SMS replies (OUI/NON/STOP/etc.) to answer or leave a Sentinel link. |

## `alert`

`@UseGuards(JwtAuthGuard)` at the controller level — every route requires a JWT. Covers: raise/close/read an alert, outer-circle escalation (a targeted yes/no request to one specific outer circle, by SMS or in-app), and the SMS reply webhook fallback it plugs into on `sentinel`. Still missing: Organization-raised alerts, Lead handoff, the 0–10 availability-reply scale, and the "request a chat with the 1st circle" mechanic — see `plan.txt`'s Alert lifecycle for the full spec. Note: unlike every other module, `alert` has no route on its bare collection root (`raise`/`mine` instead of `POST`/`GET /alert`) — `nginx/nginx.conf`'s reverse-proxy `location` blocks all require a trailing path segment, and this is the only module whose natural REST routes would otherwise sit exactly on that root.

| Method | Path | Description |
|---|---|---|
| POST | `/alert/raise` | Raise an alert (`companionId`, `alertType`, `reason`) — by "Me" for themself, or by any of their accepted Sentinels (any circle, not just the 1st — per `plan.txt`, an outer-circle Sentinel's only alert power is to raise the initial one). Creates the `Alert` + one `AlertParticipant` per accepted 1st-circle `LinkSentinels` (freezing their messaging/lead permissions — raising always notifies the 1st circle, regardless of which circle the raiser is in), opens the 1st-circle group `Conversation`, and SMS-notifies every 1st-circle participant plus the companion (if raised by a Sentinel). Rejects (409) if the companion already has a non-resolved alert, or if their 1st circle doesn't exist yet or has no accepted Lead Sentinel (per `plan.txt`: the 1st circle must always keep ≥1 Lead Sentinel — without one, nobody is in charge to drive the alert). |
| POST | `/alert/:id/close` | Close an alert — by "Me" or by an accepted 1st-circle Sentinel. Resolves the `Alert`, closes its `AlertParticipant`s and `Conversation`, and SMS-notifies every participant plus the companion (if closed by the circle). Rejects (409) if already resolved. |
| POST | `/alert/:id/request-circle` | "Me" or an accepted 1st-circle Sentinel targets one specific outer circle (`circleId`, must be a `BASIC` circle of this companion) with a yes/no `question` during a non-resolved alert. Fans out an `AlertParticipant` per accepted Sentinel of that circle (upserted on re-request, so asking again just resets them to `WAITING` rather than erroring) and SMS-notifies each. Bumps the alert from `LAUNCHED` to `ACTIVE` (and sets `activatedAt`) the first time any circle is requested. Rejects (400) if the circle isn't a valid outer circle for this companion or has no accepted Sentinel, (409) if the alert is already resolved. |
| POST | `/alert/:id/respond` | In-app alternative to an SMS OUI/NON reply — any account-holding participant (any circle, not just outer) who's still `CONTACTED` and awaiting an answer can respond (`accepted: boolean`). Returns the updated `AlertParticipant`, not the full alert (an outer-circle Sentinel isn't allowed to view that). Rejects (403) if the caller has no pending request on this alert. |
| GET | `/alert/mine` | List my alerts (as companion or as a participant Sentinel of *any* circle — includes alerts where I was only solicited via `request-circle`), newest first. |
| GET | `/alert/:id/my-participation` | Lightweight counterpart to `GET /alert/:id`, reachable by a participant of *any* circle (not just the 1st): the alert's name (`label`), the raise reason (`messageAlert`), both status notes (below), the companion's name, and my own participation (`status`/`response`/`circleName`) — just enough to make sense of and answer my own ask, without learning who else was contacted or how they answered. Rejects (403) if I have no participation on this alert at all. |
| PATCH | `/alert/:id/status` | Sets a free-text progress note (`message`) — `Alert.statusByCompanion` if the caller is the companion, `Alert.statusByFirstCircle` if an accepted 1st-circle Sentinel (two separate fields, not one shared one — whoever writes each side owns it; `statusByFirstCircle` additionally records *who* last wrote it via `statusUpdatedBy`/`statusUpdatedAt`, since several 1st-circle Sentinels could). Independent of `alertStatus`: deliberately stays writable after the alert is `RESOLVED` too (unlike the 1st-circle chat, which locks once its `Conversation` closes). Rejects (403) for anyone else. |
| PATCH | `/alert/:id/label` | Sets `Alert.label` (`label`) — the alert's name. Any accepted 1st-circle Sentinel can set it (not the companion); records who via `labelUpdatedBy`/`labelUpdatedAt`. Visible to every contacted Sentinel of any circle, via `GET /alert/:id` or `GET /alert/:id/my-participation`. Rejects (403) for the companion or an outer-circle Sentinel. |
| GET | `/alert/:id` | Get one alert with the companion's name and their other `BASIC` circles (`userCompanion`, for picking an escalation target), who last wrote the status/label (`statusUpdatedBy`/`labelUpdatedBy`), its full participants roster (each with `requestedBy` — who triggered contacting that Sentinel, whether via `raise` or `request-circle`), and its 1st-circle `Conversation` with the full embedded message history (`conversations[].messages`) — this is the companion's read path for the chat, since they're deliberately never a `ConversationParticipant` of it (see `messaging` below) but still need to see everything that happened. "Me" or a 1st-circle participant Sentinel only; an outer-circle participant gets 403 here and should use `my-participation` above instead (it's listed by `GET /alert/mine` same as everyone else, so the frontend must expect and handle this 403). |

**SMS reply routing**: inbound SMS replies for the whole app go through the one webhook at `sentinel/sms/inbound` below (a real SMS provider gives one inbound URL per phone number, not one per module). `SentinelService.handleInboundSms` tries its own sentinel-link-domain matches first (pending invite/request, then a 1st-circle move proposal), then delegates to `AlertService.tryHandleInboundSms` for a live alert ask, and only then falls back to its own blanket "NON/STOP means leave" rule. That ordering matters: a Sentinel replying `NON` to an alert question must never be misread as asking to be removed.

## `organization`

Skeleton — no routes yet.

## `messaging`

`@UseGuards(JwtAuthGuard)` at the controller level — every route requires a JWT. MVP slice only: send/list messages in an existing `Conversation` (currently only created by `alert`'s 1st-circle chat) — no conversation-creation route of its own yet, no WebSocket (clients poll `GET`). The companion is deliberately never a `ConversationParticipant` of the 1st-circle chat, so both routes below 403 them — they read the same message history read-only through `alert`'s `GET /alert/:id` instead (`conversations[].messages`).

| Method | Path | Description |
|---|---|---|
| POST | `/messaging/conversations/:id/messages` | Send a message — caller must be an active (non-left) participant of an open (non-closed) conversation. |
| GET | `/messaging/conversations/:id/messages` | List a conversation's messages, oldest first — caller must be an active participant (conversation may be closed). |

## Regenerating this file

Run `/docu api`. Keep it route-by-route (method + path + short description) — conceptual/architectural detail belongs in `STACK_SCHEMA.md`.
