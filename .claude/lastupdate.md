# Last update

**Date**: 2026-10-28
**Branch**: `messages`

## Done this session

- **Alert↔messaging architecture clarified via a diagram artifact** (no code) — how SMS and in-app replies
  converge on the same `recordResponse()`, how `requestCircle` fans out and each reply lands independently,
  and why only `closeAlert()` is reachable from the companion/1st circle. Link saved in memory
  (`reference_alert_response_flow_diagram.md`).
- **Real-time WebSocket push** for new messages and alert changes — JWT-authenticated Socket.IO gateway
  (`backend/src/realtime/`), one room per user, a `REALTIME_NOTIFIER` interface `alert`/`messaging` inject
  (mirrors the `SmsSender` pattern) instead of depending on socket.io directly. Client just refetches over
  the existing REST endpoints on `message:new`/`alert:changed` — no second source of truth. Committed `07918b6`.
- **Isolated outer-circle-Sentinel↔1st-circle chat during an alert** (`GET /alert/:id/circle-chat`) — each
  requester gets their own isolated `Conversation`, gated by `firstCircleMessagingMode` (frozen per-alert, same
  pattern as the other alert-time settings). `CirclesPage` got the authorization toggle for it that didn't
  exist at all — a real gap only caught because Sylvie went looking for it in the browser.
  `AlertDetailPanel` now renders every conversation on an alert (main chat + N isolated ones), not just the
  first one — extracted a shared `ConversationThread` component for it.
- **Image messages** (`MessageType.IMAGE`, existed in the schema, nothing ever used it) — upload mirrors the
  existing avatar pattern (multer, 5MB, jpg/png/webp), stored under `uploads/messages/`, served back at
  `GET /uploads/messages/:filename`. Both chat UIs (alert conversations, Messages page) render and send them.
- **4 real bugs found and fixed via live Docker testing** (not just mocked specs): a stale `nest --watch`
  process (the documented EADDRINUSE race) kept serving pre-change code after a save; `MessagesPage`'s contact
  list rendered a mutual Sentinel/companion relationship twice with the same React key; `AlertDetailPanel`'s
  `message:new` listener reloaded the whole alert on *any* message anywhere, tripping the app-wide rate limit
  under heavy testing; **nginx was running a stale image entirely missing the already-committed
  `location /uploads/` block** — avatar uploads (not just this session's image messages) had silently never
  worked through nginx. Fixed by rebuilding the nginx image (no `nginx.conf` edit needed, Sylvie confirmed
  the rebuild in-turn per the infra procedure). Isolated-chat + image-messages + all 4 fixes committed and
  pushed as `8fe5d9d`; she's planning a PR from this branch (has the description text).
- `/docu all`: `backend/prisma/DB_schema.md` (added the `canMessageMe` cascade, entirely undocumented before),
  `STACK_SCHEMA.md` (was still saying real-time was "never built" — full rewrite of that section plus the
  `realtime` module), `TEST.md` (counts were already current; added 2 honest coverage-gap notes), `FEATURES.md`
  (refreshed counts; #12/#18/#19 all now closed on GitHub, no more label mismatches to flag). `API.md` and
  `PERMISSIONSCLAUDE.md` checked, no drift, left untouched. **Uncommitted** — see below.

## Left to do / not yet addressed

- **Browser smoke test of tranches C/D/E frontend** (step-up panel, change-email flow, change-phone flow) —
  still not done, unrelated to this session's work. (The alert/messaging frontend, by contrast, *has* now been
  thoroughly clicked through live by Sylvie this session — that's how all 4 bugs above were found.)
- **The 0–10 availability-reply scale** (recruiting someone into an active search, distinct from a plain
  yes/no sighting question) — still not started.
- **Self-service account deletion/closure** (GitHub issue #29) — still open, nothing started.
- `claimOrCreateByPhone` race condition — accepted gap, documented in `plan.txt`, not fixed.
- Real SMS/email provider — still console-only stubs (NoSMSNow is a dev-only proxy, see `NOSMSNOW.md`).
- `organization` backend module — still an empty skeleton; blocks the Organization↔1st-circle chat too.
- `MessageType.SYSTEM` — still unused (`IMAGE` is live now, `SYSTEM` isn't).
- `MessagingMode.GROUP` — still behaves identically to `INDIVIDUAL` (both just grant the isolated chat);
  deliberately not exposed as a distinct option in the UI until/unless it's meant to do something else.
- `npm audit`: grew to 21 vulnerabilities (8 low, 2 moderate, 9 high, 2 critical) via transitive deps — up
  from the 3 high-severity ones noted previously; not investigated, none introduced by anything added this
  session (checked at the time `socket.io`/`socket.io-client` were installed — clean).

## Git — uncommitted at the time of this pause

Only this turn's `/docu all` output: `FEATURES.md`, `STACK_SCHEMA.md`, `TEST.md`,
`backend/prisma/DB_schema.md` — modified, not yet staged or committed.

`HEAD` is `8fe5d9d`, already pushed (`origin/messages` is up to date). No PR open yet for this branch.

Not committed/pushed — ask Sylvie before doing either.
