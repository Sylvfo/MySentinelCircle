# API

Updated: 2026-08-24 15:17

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
| GET | `/auth/me` | JWT | Current user's id/firstName/email/phone/phoneVerifiedAt/createdAt. |

## `user`

Skeleton — no routes yet.

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
| POST | `/sentinel/memberships/:id/accept` | Accept a pending invitation/request addressed to me. |
| POST | `/sentinel/memberships/:id/decline` | Decline a pending invitation/request addressed to me. |
| POST | `/sentinel/memberships/:id/leave` | Opt out of an active link, as the Sentinel. |
| PATCH | `/sentinel/memberships/:id` | Update a membership I own (Sentinel type, Lead-slot request, move to another circle). |
| DELETE | `/sentinel/memberships/:id` | Remove a Sentinel from one of my circles. |
| GET | `/sentinel/companions` | Reverse view — the people I watch over as a Sentinel. |

### `sentinel/sms` (sub-controller)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/sentinel/sms/inbound` | none (deliberately public — SMS provider webhook; needs provider signature verification in prod) | Handles inbound SMS replies (OUI/NON/STOP/etc.) to answer or leave a Sentinel link. |

## `alert`

Skeleton — no routes yet.

## `organization`

Skeleton — no routes yet.

## `messaging`

Skeleton — no routes yet.

## Regenerating this file

Run `/docu api`. Keep it route-by-route (method + path + short description) — conceptual/architectural detail belongs in `STACK_SCHEMA.md`.
