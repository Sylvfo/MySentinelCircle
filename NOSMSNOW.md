# NoSMSNow

A terminal stand-in for a real SMS/email provider (Twilio or similar), used
during dev so you can see outbound sends and simulate inbound replies
without any real phone number or provider account.

Lives in `nosmsnow/` (`server.js`), plain Node.js, zero dependencies.

## How it fits together

```
backend (ConsoleSmsSenderService, etc.)
   │  POST /send  (if NOSMSNOW_URL is set)
   ▼
NoSMSNow terminal  ──────────────────────────────
   │  prints every outbound SMS/OTP/email
   │
   │  you type: <phone> <message>
   ▼
POST {BACKEND_URL}/sentinel/sms/inbound
   │
   ▼
backend (treats it as a Sentinel-without-account replying by SMS)
```

- **Outbound** (backend → "phone"): every SMS/OTP/email send is always
  logged in the **backend's own terminal** (`ConsoleSmsSenderService`,
  `ConsoleOtpSenderService`, `ConsoleEmailSenderService`). If the backend's
  `NOSMSNOW_URL` env var is set, the same send is *also* forwarded to
  NoSMSNow, so it shows up a second time in the NoSMSNow terminal:
  ```
  [2026-10-21T10:03:12.000Z] SMS -> +41791234567: Your circle needs you...
  ```
- **Inbound** (simulated reply → backend): in the NoSMSNow terminal, type
  `<phone> <message>` and press Enter, e.g.:
  ```
  nosmsnow> +41791234567 OUI
  ```
  This POSTs `{ from, body }` to `{BACKEND_URL}/sentinel/sms/inbound`
  (`backend/src/sentinel/sentinel-sms.controller.ts`), the same endpoint a
  real SMS provider's webhook would call. The backend parses keywords
  (OUI/NON/STOP) — this is how a **Sentinel SMS** (no app account, reached
  purely by SMS) responds to an alert.

## Telling users apart

There's no per-user view — it's one shared terminal stream for everyone.
You distinguish who's who by the **phone number** printed on each line
(the `to` on outbound, the `from` you type on inbound). Match it against
`backend/test-users.local.md` or the DB to know which test account it is.

## Running it

```bash
cd nosmsnow
npm start          # or: node server.js
```

It listens on `NOSMSNOW_PORT` (default `4001`) and forwards inbound
webhooks to `BACKEND_URL` (default `http://localhost:3000`).

In `backend/.env`, set:
```
NOSMSNOW_URL="http://localhost:4001"
```
Leave it unset to skip NoSMSNow entirely — sends still log to the
backend's own terminal either way.

## Typical dev loop

1. `cd nosmsnow && npm start`
2. Start the backend normally (`npm run start:dev` in `backend/`).
3. Trigger something that sends an SMS (e.g. an alert launch, once that
   module exists) — watch it print in the NoSMSNow terminal.
4. Reply as the sentinel: `nosmsnow> <their phone> OUI`.
5. Watch the backend terminal / DB to confirm it processed the reply.
